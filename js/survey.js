(function () {
  const params = new URLSearchParams(location.search);
  const defaultReviewer = (APP_CONFIG.reviewers && APP_CONFIG.reviewers[0]) || 'Reviewer1';
  const reviewer = params.get('reviewer') || defaultReviewer;
  const taskIndex = Number(params.get('task') || 0);
  let manifest = [], task = null, current = 0;

  // Values selected on screen but not yet saved. Keyed by image rating key.
  const draftMemory = {};

  const title = document.getElementById('taskTitle');
  const subtitle = document.getElementById('taskSubtitle');
  const progressText = document.getElementById('progressText');
  const progressBar = document.getElementById('progressBar');
  const imageMeta = document.getElementById('imageMeta');
  const image = document.getElementById('tripanelImage');
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  const finalSubmitBtn = document.getElementById('finalSubmitBtn');
  const saveHint = document.getElementById('saveHint');
  const missingPanel = document.getElementById('missingPanel');
  const form = document.getElementById('ratingForm');

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  function ensureRatingButtonStyles() {
    if (document.getElementById('ratingButtonRuntimeStyles')) return;
    const style = document.createElement('style');
    style.id = 'ratingButtonRuntimeStyles';
    style.textContent = `
      .rating-button {
        border: 0;
        background: transparent;
        width: 100%;
        min-height: 44px;
        padding: 0;
        appearance: none;
        -webkit-appearance: none;
        touch-action: manipulation;
        user-select: none;
      }
      .rating-button:focus-visible {
        outline: 2px solid var(--forms-purple);
        outline-offset: -2px;
        border-radius: 4px;
      }
      .rating-dot {
        width: 18px;
        height: 18px;
        border: 2px solid #5f6368;
        border-radius: 999px;
        background: #fff;
        display: inline-block;
        position: relative;
      }
      .rating-button.selected { background: #f7f3ff; }
      .rating-button.selected .rating-dot { border-color: var(--forms-purple); }
      .rating-button.selected .rating-dot::after {
        content: '';
        position: absolute;
        inset: 3px;
        border-radius: 999px;
        background: var(--forms-purple);
      }
      .save-hint { display: block; }
    `;
    document.head.appendChild(style);
  }

  function emptyRating() {
    const out = {};
    USE.ratingKeys().forEach(k => { out[k] = ''; });
    return out;
  }

  function cleanRatingValues(values) {
    const out = emptyRating();
    USE.ratingKeys().forEach(k => {
      const n = Number(values && values[k]);
      out[k] = n >= 1 && n <= 4 ? n : '';
    });
    return out;
  }

  function buildMatrixQuestion(field) {
    const section = document.createElement('section');
    section.className = 'form-card question-card matrix-card';
    section.dataset.field = field.key;
    const scaleHeaders = APP_CONFIG.ratingScale.map(score => `<div class="matrix-col-head">${score}</div>`).join('');
    const rows = APP_CONFIG.tripanelRows.map(row => {
      const cells = APP_CONFIG.ratingScale.map(score => {
        const name = `${field.key}_${row.key}`;
        return `<button type="button" class="matrix-radio rating-button" data-name="${escapeHtml(name)}" data-value="${score}" aria-pressed="false" aria-label="${escapeHtml(field.label)} ${escapeHtml(row.label)} ${score}">
          <span class="rating-dot" aria-hidden="true"></span>
        </button>`;
      }).join('');
      return `<div class="matrix-row-label">${escapeHtml(row.label)}</div>${cells}`;
    }).join('');
    section.innerHTML = `
      <h2>${escapeHtml(field.label)}</h2>
      <div class="matrix-grid" style="--scale-cols:${APP_CONFIG.ratingScale.length}">
        <div></div>${scaleHeaders}${rows}
      </div>`;
    return section;
  }

  function buildForm() {
    ensureRatingButtonStyles();
    form.innerHTML = '';
    APP_CONFIG.ratingFields.forEach(f => form.appendChild(buildMatrixQuestion(f)));

    // Do not use native radio inputs here. Rapid clicking on native radios can be
    // inconsistent across browsers because the browser mutates checked state before
    // custom toggle code runs. Buttons are deterministic: one pointerdown = one state change.
    form.addEventListener('pointerdown', function (event) {
      const btn = event.target.closest ? event.target.closest('.rating-button') : null;
      if (!btn || !form.contains(btn)) return;
      event.preventDefault();
      toggleScoreButton(btn);
    }, true);

    form.addEventListener('click', function (event) {
      const btn = event.target.closest ? event.target.closest('.rating-button') : null;
      if (!btn || !form.contains(btn)) return;
      event.preventDefault();
      event.stopPropagation();
    }, true);

    form.addEventListener('keydown', function (event) {
      if ((event.key !== ' ' && event.key !== 'Spacebar' && event.key !== 'Enter') ||
          !event.target.classList.contains('rating-button')) return;
      event.preventDefault();
      event.stopPropagation();
      toggleScoreButton(event.target);
    }, true);
  }

  function currentImage() { return task.images[current]; }
  function ratingKeyFor(index) { return USE.imageKey(task, task.images[index]); }
  function currentRatingKey() { return ratingKeyFor(current); }

  function savedRatingFor(index) {
    return cleanRatingValues(USE.readRating(reviewer, ratingKeyFor(index)));
  }

  function visibleRatingFor(index) {
    const key = ratingKeyFor(index);
    return cleanRatingValues(draftMemory[key] || USE.readRating(reviewer, key));
  }

  function setFormValues(rating) {
    const values = cleanRatingValues(rating);
    form.querySelectorAll('.rating-button').forEach(btn => {
      const name = btn.dataset.name;
      const value = Number(btn.dataset.value);
      const selected = Number(values[name]) === value;
      btn.classList.toggle('selected', selected);
      btn.setAttribute('aria-pressed', selected ? 'true' : 'false');
    });
  }

  function readFormValues() {
    const out = emptyRating();
    form.querySelectorAll('.rating-button.selected').forEach(btn => {
      out[btn.dataset.name] = Number(btn.dataset.value);
    });
    return out;
  }

  function toggleScoreButton(btn) {
    const name = btn.dataset.name;
    const value = Number(btn.dataset.value);
    const values = readFormValues();
    const wasSelected = Number(values[name]) === value;

    // One answer per row: clicking a different score changes it; clicking the same
    // score again clears that row.
    values[name] = wasSelected ? '' : value;
    draftMemory[currentRatingKey()] = values;
    setFormValues(values);
    updateActionButton();
    showHint('目前畫面已有變更，尚未按「儲存作答進度」前不會寫入作答進度。');
  }

  function makePayloadForImage(index, values) {
    const img = task.images[index];
    return Object.assign({
      action: 'saveRating', reviewer,
      strategy: task.strategy, dataset: task.dataset, model: task.model,
      displayModel: USE.displayModel(task.model),
      imageId: img.id || '', fileId: img.fileId || '', filename: img.filename || '', imageUrl: img.url || img.path || ''
    }, cleanRatingValues(values));
  }

  function countSavedCompleted() {
    let completed = 0;
    for (let i = 0; i < task.images.length; i++) {
      const payload = makePayloadForImage(i, savedRatingFor(i));
      if (USE.isCompleteRating(payload)) completed += 1;
    }
    return completed;
  }

  function saveProgressToLocalAndSheet() {
    const total = task.images.length;
    const completed = countSavedCompleted();
    USE.saveLocalProgress(reviewer, task, current, total);
    USE.postToSheet({
      action: 'saveProgress', reviewer,
      strategy: task.strategy, dataset: task.dataset, model: task.model,
      displayModel: USE.displayModel(task.model), currentIndex: current, total,
      completed, completedStatus: completed >= total ? 'Completed' : 'In Progress'
    });
  }

  function showHint(message) {
    if (!saveHint) return;
    saveHint.hidden = !message;
    saveHint.textContent = message || '';
  }

  function saveCurrentProgress() {
    const values = readFormValues();
    const payload = makePayloadForImage(current, values);
    payload.action = 'draftOnly';
    payload.updatedAt = new Date().toISOString();
    USE.saveLocalRating(reviewer, currentRatingKey(), payload);
    delete draftMemory[currentRatingKey()];
    saveProgressToLocalAndSheet();
    renderProgressOnly();
    updateActionButton();
    showHint(USE.isCompleteRating(payload) ? '已儲存此張完整作答進度。' : '已儲存此張目前作答進度；尚未完成的分數不會寫入正式紀錄。');
  }

  function submitImageIfComplete(index, options) {
    const opts = options || {};
    const values = index === current && opts.fromForm ? readFormValues() : savedRatingFor(index);
    const payload = makePayloadForImage(index, values || {});
    USE.saveLocalRating(reviewer, ratingKeyFor(index), payload);
    if (USE.isCompleteRating(payload)) {
      USE.postToSheet(payload);
      return true;
    }
    return false;
  }

  function missingIndices() {
    const missing = [];
    for (let i = 0; i < task.images.length; i++) {
      const values = i === current ? readFormValues() : savedRatingFor(i);
      if (!USE.isCompleteRating(makePayloadForImage(i, values))) missing.push(i);
    }
    return missing;
  }

  function renderMissingPanel(missing) {
    if (!missingPanel) return;
    if (!missing.length) {
      missingPanel.innerHTML = '';
      missingPanel.hidden = true;
      return;
    }
    missingPanel.hidden = false;
    missingPanel.innerHTML = `
      <section class="form-card question-card missing-card">
        <h2>尚有 ${missing.length} 張未完成</h2>
        <p class="muted">點選下方項目可直接跳到漏題，不必反覆按上一張/下一張。補完後請先按「儲存作答進度」。全部完成後按鈕會變成「確認完成並送出」。</p>
        <div class="missing-jump-list">
          ${missing.map(i => {
            const img = task.images[i] || {};
            return `<button type="button" class="ghost-button missing-jump" data-index="${i}">第 ${i + 1} 張　${escapeHtml(img.filename || img.id || '')}</button>`;
          }).join('')}
        </div>
      </section>`;
    missingPanel.querySelectorAll('.missing-jump').forEach(btn => {
      btn.addEventListener('click', () => {
        current = Number(btn.dataset.index);
        render();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });
  }

  function finalizeAll() {
    // If the current visible page is complete but not saved, save it first so the
    // final submit button is not blocked by a just-finished page.
    const currentPayload = makePayloadForImage(current, readFormValues());
    if (USE.isCompleteRating(currentPayload)) {
      USE.saveLocalRating(reviewer, currentRatingKey(), currentPayload);
      delete draftMemory[currentRatingKey()];
    }

    const missingBeforeSubmit = missingIndices();
    if (missingBeforeSubmit.length) {
      renderMissingPanel(missingBeforeSubmit);
      saveProgressToLocalAndSheet();
      renderProgressOnly();
      updateActionButton();
      showHint(`尚有 ${missingBeforeSubmit.length} 張未完成，請補齊並儲存後再送出。`);
      return;
    }

    renderMissingPanel([]);
    let submitted = 0;
    for (let i = 0; i < task.images.length; i++) {
      if (submitImageIfComplete(i, { fromForm: i === current })) submitted += 1;
    }
    const total = task.images.length;
    USE.saveLocalProgress(reviewer, task, current, total);
    USE.postToSheet({
      action: 'saveProgress', reviewer,
      strategy: task.strategy, dataset: task.dataset, model: task.model,
      displayModel: USE.displayModel(task.model), currentIndex: current, total,
      completed: total, completedStatus: 'Completed'
    });
    renderProgressOnly();
    updateActionButton();
    showHint(`確認完成：已送出 ${submitted} / ${total} 張正式作答紀錄。`);
  }

  function renderProgressOnly() {
    const total = task.images.length;
    const completed = countSavedCompleted();
    progressText.textContent = `${completed} / ${total}`;
    progressBar.style.width = total ? Math.round(completed * 100 / total) + '%' : '0%';
  }

  function allSavedComplete() {
    return task && task.images.length > 0 && countSavedCompleted() >= task.images.length;
  }

  function updateActionButton() {
    if (!finalSubmitBtn || !task) return;
    finalSubmitBtn.textContent = allSavedComplete() ? '確認完成並送出' : '儲存作答進度';
  }

  function handleMainAction() {
    if (allSavedComplete()) finalizeAll();
    else saveCurrentProgress();
  }

  function render() {
    const img = currentImage();
    const total = task.images.length;
    title.textContent = USE.displayModel(task.model);
    subtitle.textContent = `${reviewer}`;
    imageMeta.textContent = `${current + 1} / ${total}　${img.filename || img.id || ''}`;
    image.src = img.url || img.path || '';
    image.alt = img.filename || 'Tripanel ultrasound image';
    prevBtn.disabled = current <= 0;
    nextBtn.disabled = current >= total - 1;
    setFormValues(visibleRatingFor(current));
    renderProgressOnly();
    updateActionButton();
    showHint('');
  }

  prevBtn.addEventListener('click', () => {
    if (current > 0) { current--; render(); }
  });
  nextBtn.addEventListener('click', () => {
    if (current < task.images.length - 1) { current++; render(); }
  });
  if (finalSubmitBtn) finalSubmitBtn.addEventListener('click', handleMainAction);

  buildForm();
  USE.loadManifest().then(async m => {
    manifest = m; task = manifest[taskIndex];
    if (!task) throw new Error('找不到指定任務');
    if (!task.images.length) throw new Error('此任務沒有影像，請確認 Google Drive 資料夾架構與檔名。');
    await USE.loadServerRatings(reviewer, task);
    const saved = USE.readLocalProgress(reviewer, task);
    const suggested = USE.firstIncompleteIndex(reviewer, task);
    current = saved && Number.isInteger(saved.currentIndex) ? Math.min(saved.currentIndex, task.images.length - 1) : suggested;
    render();
  }).catch(err => {
    title.textContent = '載入失敗';
    subtitle.innerHTML = `<span class="error">${err.message}</span>`;
  });
})();
