(function () {
  const params = new URLSearchParams(location.search);
  const defaultReviewer = (APP_CONFIG.reviewers && APP_CONFIG.reviewers[0]) || 'Reviewer1';
  const reviewer = params.get('reviewer') || defaultReviewer;
  const taskIndex = Number(params.get('task') || 0);
  let manifest = [], task = null, current = 0;

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
    return String(s || '').replace(/[&<>\"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  function buildMatrixQuestion(field) {
    const section = document.createElement('section');
    section.className = 'form-card question-card matrix-card';
    section.dataset.field = field.key;
    const scaleHeaders = APP_CONFIG.ratingScale.map(score => `<div class="matrix-col-head">${score}</div>`).join('');
    const rows = APP_CONFIG.tripanelRows.map(row => {
      const cells = APP_CONFIG.ratingScale.map(score => {
        const name = `${field.key}_${row.key}`;
        const id = `${name}_${score}`;
        return `<label class="matrix-radio" for="${id}">
          <input id="${id}" type="radio" name="${name}" value="${score}" aria-label="${escapeHtml(field.label)} ${escapeHtml(row.label)} ${score}">
        </label>`;
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

  function findRadioFromEvent(event) {
    const target = event.target;
    if (!target) return null;
    if (target.matches && target.matches('input[type="radio"]')) return target;
    const label = target.closest ? target.closest('label.matrix-radio') : null;
    return label ? label.querySelector('input[type="radio"]') : null;
  }

  function buildForm() {
    form.innerHTML = '';
    APP_CONFIG.ratingFields.forEach(f => form.appendChild(buildMatrixQuestion(f)));

    // 手動控制矩陣 radio：
    // 1) 空心點一下 → 實心
    // 2) 同一顆實心再點一下 → 空心，取消該列作答
    // 3) 同列改選其他分數 → 舊分數立刻空心，新分數立刻實心
    // 不在 pointerdown preventDefault，避免部分瀏覽器/label 點擊被吃掉而造成卡頓或無反應。
    let pressedRadio = null;
    let pressedWasChecked = false;

    function radiosInSameRow(input) {
      return Array.prototype.filter.call(
        document.getElementsByName(input.name),
        el => form.contains(el) && el.type === 'radio'
      );
    }

    function applyToggle(input, wasChecked) {
      radiosInSameRow(input).forEach(el => { el.checked = false; });
      if (!wasChecked) input.checked = true;
      saveDraftOnly('', { syncSheet: false });
    }

    form.addEventListener('pointerdown', function (event) {
      const input = findRadioFromEvent(event);
      if (!input) return;
      pressedRadio = input;
      pressedWasChecked = input.checked;
    }, true);

    form.addEventListener('click', function (event) {
      const input = findRadioFromEvent(event);
      if (!input) return;

      event.preventDefault();
      event.stopPropagation();

      const wasChecked = (input === pressedRadio) ? pressedWasChecked : input.checked;
      applyToggle(input, wasChecked);

      pressedRadio = null;
      pressedWasChecked = false;
    }, true);

    form.addEventListener('keydown', function (event) {
      if ((event.key !== ' ' && event.key !== 'Spacebar' && event.key !== 'Enter') ||
          !event.target.matches('input[type="radio"]')) return;

      const input = event.target;
      const wasChecked = input.checked;

      event.preventDefault();
      event.stopPropagation();

      applyToggle(input, wasChecked);
    }, true);
  }

  function currentImage() { return task.images[current]; }
  function ratingKeyFor(index) { return USE.imageKey(task, task.images[index]); }
  function currentRatingKey() { return ratingKeyFor(current); }
  function getCurrentRating() { return USE.readRating(reviewer, currentRatingKey()); }

  function setFormValues(rating) {
    USE.ratingKeys().forEach(k => {
      document.querySelectorAll(`input[name="${k}"]`).forEach(el => { el.checked = String(rating[k] || '') === el.value; });
    });
  }

  function readFormValues() {
    const out = {};
    USE.ratingKeys().forEach(k => {
      const checked = document.querySelector(`input[name="${k}"]:checked`);
      out[k] = checked ? Number(checked.value) : '';
    });
    return out;
  }

  function makePayloadForImage(index, values) {
    const img = task.images[index];
    return Object.assign({
      action: 'saveRating', reviewer,
      strategy: task.strategy, dataset: task.dataset, model: task.model,
      displayModel: USE.displayModel(task.model),
      imageId: img.id || '', fileId: img.fileId || '', filename: img.filename || '', imageUrl: img.url || img.path || ''
    }, values);
  }

  function saveProgressToLocalAndSheet(options) {
    const opts = options || {};
    const total = task.images.length;
    const completed = USE.countCompleted(reviewer, task);
    USE.saveLocalProgress(reviewer, task, current, total);
    if (opts.syncSheet === false) return;
    USE.postToSheet({
      action: 'saveProgress', reviewer,
      strategy: task.strategy, dataset: task.dataset, model: task.model,
      displayModel: USE.displayModel(task.model), currentIndex: current, total,
      completed, completedStatus: completed >= total ? 'Completed' : 'In Progress'
    });
  }

  function showHint(message) {
    // Status hints are intentionally hidden from the UI to keep the form clean.
    if (saveHint) saveHint.textContent = '';
  }

  function saveDraftOnly(message, options) {
    const opts = options || {};
    const values = readFormValues();
    const payload = makePayloadForImage(current, values);
    payload.action = 'draftOnly';
    payload.updatedAt = new Date().toISOString();
    USE.saveLocalRating(reviewer, currentRatingKey(), payload);
    saveProgressToLocalAndSheet({ syncSheet: opts.syncSheet !== false });
    renderProgressOnly();
    showHint(message || '已暫存於此瀏覽器。');
  }

  function submitImageIfComplete(index, options) {
    const opts = options || {};
    let values;
    if (index === current && opts.fromForm) {
      values = readFormValues();
    } else {
      values = USE.readRating(reviewer, ratingKeyFor(index));
    }
    const payload = makePayloadForImage(index, values || {});
    USE.saveLocalRating(reviewer, ratingKeyFor(index), payload);
    if (USE.isCompleteRating(payload)) {
      USE.postToSheet(payload);
      return true;
    }
    return false;
  }

  function saveCurrentDraftAndSubmitIfComplete(messageIfComplete, messageIfIncomplete) {
    saveDraftOnly('', { syncSheet: false });
    const ok = submitImageIfComplete(current, { fromForm: true });
    saveProgressToLocalAndSheet();
    showHint(ok ? (messageIfComplete || '此張已寫入正式作答紀錄。') : (messageIfIncomplete || '此張尚未完成，已暫存但未寫入正式作答紀錄。'));
    return ok;
  }

  function missingIndices() {
    const missing = [];
    for (let i = 0; i < task.images.length; i++) {
      const key = USE.imageKey(task, task.images[i]);
      if (!USE.isCompleteRating(USE.readRating(reviewer, key))) missing.push(i);
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
        <p class="muted">點選下方項目可直接跳到漏題，不必反覆按上一張/下一張。補完後可直接按「確認完成並送出」。</p>
        <div class="missing-jump-list">
          ${missing.map(i => {
            const img = task.images[i] || {};
            return `<button type="button" class="ghost-button missing-jump" data-index="${i}">第 ${i + 1} 張　${escapeHtml(img.filename || img.id || '')}</button>`;
          }).join('')}
        </div>
      </section>`;
    missingPanel.querySelectorAll('.missing-jump').forEach(btn => {
      btn.addEventListener('click', () => {
        saveDraftOnly('已保留目前頁面的暫存狀態。');
        current = Number(btn.dataset.index);
        render();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });
  }

  function finalizeAll() {
    saveDraftOnly('', { syncSheet: false });
    const missingBeforeSubmit = missingIndices();
    if (missingBeforeSubmit.length) {
      renderMissingPanel(missingBeforeSubmit);
      showHint(`尚有 ${missingBeforeSubmit.length} 張未完成，請補齊後再送出。`);
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
    showHint(`確認完成：已送出 ${submitted} / ${total} 張正式作答紀錄。`);
  }

  function renderProgressOnly() {
    const total = task.images.length;
    const completed = USE.countCompleted(reviewer, task);
    progressText.textContent = `${completed} / ${total}`;
    progressBar.style.width = total ? Math.round(completed * 100 / total) + '%' : '0%';
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
    setFormValues(getCurrentRating());
    renderProgressOnly();
    saveProgressToLocalAndSheet({ syncSheet: false });
  }

  prevBtn.addEventListener('click', () => {
    saveDraftOnly('已保留目前頁面的暫存狀態。');
    if (current > 0) { current--; render(); }
  });
  nextBtn.addEventListener('click', () => {
    saveCurrentDraftAndSubmitIfComplete('此張已寫入正式作答紀錄，並移至下一張。', '此張尚未完成，已暫存但未寫入正式作答紀錄，並移至下一張。');
    if (current < task.images.length - 1) { current++; render(); }
  });
  if (finalSubmitBtn) finalSubmitBtn.addEventListener('click', finalizeAll);

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
