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

  // ── Helpers ──────────────────────────────────────────────────────────────

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"]/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  function showHint(message) {
    if (!saveHint) return;
    saveHint.hidden = !message;
    saveHint.textContent = message || '';
  }

  // ── Form building ─────────────────────────────────────────────────────────

  function buildMatrixQuestion(field) {
    const section = document.createElement('section');
    section.className = 'form-card question-card matrix-card';
    section.dataset.field = field.key;

    const scaleHeaders = APP_CONFIG.ratingScale
      .map(score => `<div class="matrix-col-head">${score}</div>`)
      .join('');

    const rows = APP_CONFIG.tripanelRows.map(row => {
      const cells = APP_CONFIG.ratingScale.map(score => {
        const name = `${field.key}_${row.key}`;
        const id   = `${name}_${score}`;
        return `<label class="matrix-radio" for="${id}">
          <input id="${id}" type="radio" name="${name}" value="${score}"
            aria-label="${escapeHtml(field.label)} ${escapeHtml(row.label)} ${score}">
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

  // ── Radio toggle (deselect on re-click) ───────────────────────────────────
  //
  // Strategy: track the "about to be clicked" radio via pointerdown so we know
  // if it was already checked *before* the browser's native click handler ran.
  // We suppress the native behaviour entirely and manage checked state manually.
  // This avoids all problems with label→input synthetic-click duplication.

  function buildForm() {
    form.innerHTML = '';
    APP_CONFIG.ratingFields.forEach(f => form.appendChild(buildMatrixQuestion(f)));
    attachRadioToggle();
  }

  function attachRadioToggle() {
    // Map: input element → was it checked at pointerdown time
    let pendingRadio    = null;
    let pendingChecked  = false;

    // pointerdown fires before the browser changes .checked
    form.addEventListener('pointerdown', function (e) {
      const input = resolveRadio(e.target);
      if (!input) { pendingRadio = null; return; }
      pendingRadio   = input;
      pendingChecked = input.checked;
    }, { capture: true });

    // click fires after browser would normally toggle the radio;
    // we prevent default so the browser never touches .checked, then apply our own logic.
    form.addEventListener('click', function (e) {
      const input = resolveRadio(e.target);
      if (!input) return;

      e.preventDefault();
      e.stopPropagation();

      const wasChecked = (input === pendingRadio) ? pendingChecked : input.checked;
      applyRadioToggle(input, wasChecked);

      pendingRadio   = null;
      pendingChecked = false;
    }, { capture: true });

    // Keyboard: Space / Enter on a focused radio
    form.addEventListener('keydown', function (e) {
      if (e.key !== ' ' && e.key !== 'Spacebar' && e.key !== 'Enter') return;
      if (!e.target.matches('input[type="radio"]')) return;
      e.preventDefault();
      e.stopPropagation();
      applyRadioToggle(e.target, e.target.checked);
    }, { capture: true });
  }

  // Return the radio input that was interacted with, regardless of whether the
  // user clicked the <input> itself or its wrapping <label>.
  function resolveRadio(target) {
    if (!target) return null;
    if (target.matches && target.matches('input[type="radio"]')) return target;
    const label = target.closest ? target.closest('label.matrix-radio') : null;
    return label ? label.querySelector('input[type="radio"]') : null;
  }

  // Deselect all siblings, then check this one — unless it was already checked
  // (= user clicked the same circle again → deselect / toggle off).
  function applyRadioToggle(input, wasChecked) {

  const name = input.name;

  // 只搜尋目前題組，不掃描整個 form
  const card = input.closest('.matrix-card') || form;

  card.querySelectorAll(
    `input[type="radio"][name="${CSS.escape(name)}"]`
  ).forEach(el => {
    if (el !== input) {
      el.checked = false;
    }
  });

  // 已選取再點一次 → 取消
  // 換選項 → 直接選取
  input.checked = !wasChecked;

}

  // ── Rating data helpers ───────────────────────────────────────────────────

  function ratingKeyFor(index) { return USE.imageKey(task, task.images[index]); }
  function currentRatingKey()  { return ratingKeyFor(current); }
  function getCurrentRating()  { return USE.readRating(reviewer, currentRatingKey()); }

  function setFormValues(rating) {
    USE.ratingKeys().forEach(k => {
      form.querySelectorAll(`input[name="${CSS.escape(k)}"]`).forEach(el => {
        el.checked = String(rating[k] || '') === el.value;
      });
    });
  }

  function readFormValues() {
    const out = {};
    USE.ratingKeys().forEach(k => {
      const checked = form.querySelector(`input[name="${CSS.escape(k)}"]:checked`);
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
      imageId: img.id || '', fileId: img.fileId || '',
      filename: img.filename || '', imageUrl: img.url || img.path || ''
    }, values);
  }

  // ── Local-only progress (no Sheet write) ──────────────────────────────────

  function saveProgressLocalOnly() {
    USE.saveLocalProgress(reviewer, task, current, task.images.length);
  }

  // ── Missing-image helpers ─────────────────────────────────────────────────

  function missingIndices(opts) {
    opts = opts || {};
    const missing = [];
    for (let i = 0; i < task.images.length; i++) {
      const key = USE.imageKey(task, task.images[i]);
      let rating = USE.readRating(reviewer, key);
      if (opts.includeCurrentForm && i === current) {
        rating = makePayloadForImage(i, readFormValues());
      }
      if (!USE.isCompleteRating(rating)) missing.push(i);
    }
    return missing;
  }

  function allCompleteWithCurrentForm() {
    return task && task.images.length > 0 &&
           missingIndices({ includeCurrentForm: true }).length === 0;
  }

  // ── Button rendering ──────────────────────────────────────────────────────

  function renderActionButton() {
    if (!finalSubmitBtn || !task) return;
    if (allCompleteWithCurrentForm()) {
      finalSubmitBtn.textContent = '確認完成並送出';
    } else {
      finalSubmitBtn.textContent = '儲存作答進度';
    }
    finalSubmitBtn.className = 'primary-button';
  }

  // ── Missing panel ─────────────────────────────────────────────────────────

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
        <p class="muted">點選下方項目可直接跳到漏題，補完後再按「確認完成並送出」。</p>
        <div class="missing-jump-list">
          ${missing.map(i => {
            const img = task.images[i] || {};
            return `<button type="button" class="ghost-button missing-jump" data-index="${i}">
              第 ${i + 1} 張　${escapeHtml(img.filename || img.id || '')}
            </button>`;
          }).join('')}
        </div>
      </section>`;
    missingPanel.querySelectorAll('.missing-jump').forEach(btn => {
      btn.addEventListener('click', () => {
        // Commit current page to localStorage before jumping
        commitCurrentToLocal();
        current = Number(btn.dataset.index);
        render();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        showHint('已跳轉；請填完此頁後按「儲存作答進度」。');
      });
    });
  }

  // ── Core save / submit ────────────────────────────────────────────────────

  // Persist the current page's answers to localStorage only (no Sheet).
  function commitCurrentToLocal() {
    const values  = readFormValues();
    const payload = makePayloadForImage(current, values);
    payload.action       = 'draftOnly';
    payload.updatedAt    = new Date().toISOString();
    USE.saveLocalRating(reviewer, currentRatingKey(), payload);
    saveProgressLocalOnly();
  }

  // "儲存作答進度" path: save current page to localStorage, write progress to Sheet.
  function saveCurrentDraft() {
    commitCurrentToLocal();
    // Write progress summary to Sheet (lightweight — just one row update)
    const total     = task.images.length;
    const completed = USE.countCompleted(reviewer, task);
    USE.postToSheet({
      action: 'saveProgress', reviewer,
      strategy: task.strategy, dataset: task.dataset, model: task.model,
      displayModel: USE.displayModel(task.model),
      currentIndex: current, total, completed,
      completedStatus: completed >= total ? 'Completed' : 'In Progress'
    });
    renderProgressOnly();
    renderActionButton();
    showHint('已儲存作答進度；尚未寫入正式作答紀錄。');
  }

  // Submit a single image's rating to Sheet (only if complete).
  function submitImageIfComplete(index) {
    const key     = USE.imageKey(task, task.images[index]);
    const rating  = USE.readRating(reviewer, key);
    const payload = makePayloadForImage(index, rating || {});
    USE.saveLocalRating(reviewer, key, payload);
    if (USE.isCompleteRating(payload)) {
      USE.postToSheet(payload);
      return true;
    }
    return false;
  }

  // "確認完成並送出" path.
  function finalizeAll() {
    // 1. Commit current page to localStorage first
    commitCurrentToLocal();

    // 2. Check for missing images (using localStorage state, NOT form)
    const missing = missingIndices(); // does not include current form re-read; already committed above
    if (missing.length) {
      renderMissingPanel(missing);
      renderProgressOnly();
      renderActionButton();
      // Write progress to Sheet so the reviewer's seat is recorded
      USE.postToSheet({
        action: 'saveProgress', reviewer,
        strategy: task.strategy, dataset: task.dataset, model: task.model,
        displayModel: USE.displayModel(task.model),
        currentIndex: current, total: task.images.length,
        completed: USE.countCompleted(reviewer, task),
        completedStatus: 'In Progress'
      });
      showHint(`尚有 ${missing.length} 張未完成，請補齊後再送出。`);
      return;
    }

    // 3. All complete — submit every image to Sheet
    renderMissingPanel([]);
    let submitted = 0;
    for (let i = 0; i < task.images.length; i++) {
      if (submitImageIfComplete(i)) submitted += 1;
    }
    const total = task.images.length;
    USE.saveLocalProgress(reviewer, task, current, total);
    USE.postToSheet({
      action: 'saveProgress', reviewer,
      strategy: task.strategy, dataset: task.dataset, model: task.model,
      displayModel: USE.displayModel(task.model),
      currentIndex: current, total, completed: total, completedStatus: 'Completed'
    });
    renderProgressOnly();
    renderActionButton();
    showHint(`確認完成：已送出 ${submitted} / ${total} 張正式作答紀錄。`);
  }

  // ── Rendering ─────────────────────────────────────────────────────────────

  function renderProgressOnly() {
    const total     = task.images.length;
    const completed = USE.countCompleted(reviewer, task);
    progressText.textContent = `${completed} / ${total}`;
    progressBar.style.width  = total ? Math.round(completed * 100 / total) + '%' : '0%';
  }

  function render() {
    const img   = task.images[current];
    const total = task.images.length;
    title.textContent    = USE.displayModel(task.model);
    subtitle.textContent = reviewer;
    imageMeta.textContent = `${current + 1} / ${total}　${img.filename || img.id || ''}`;
    image.src = img.url || img.path || '';
    image.alt = img.filename || 'Tripanel ultrasound image';
    prevBtn.disabled = current <= 0;
    nextBtn.disabled = current >= total - 1;
    setFormValues(getCurrentRating());
    renderProgressOnly();
    renderActionButton();
    // Clear the unsaved-change hint whenever we freshly load a page
    showHint('');
  }

  // ── Navigation (local only — no Sheet write) ──────────────────────────────

  prevBtn.addEventListener('click', () => {
    if (current <= 0) return;
    commitCurrentToLocal();
    current--;
    render();
  });

  nextBtn.addEventListener('click', () => {
    if (current >= task.images.length - 1) return;
    commitCurrentToLocal();
    current++;
    render();
  });

  // ── Save / Submit button ──────────────────────────────────────────────────

  if (finalSubmitBtn) {
    finalSubmitBtn.addEventListener('click', () => {
      if (allCompleteWithCurrentForm()) {
        finalizeAll();
      } else {
        saveCurrentDraft();
      }
    });
  }

  // ── Init ──────────────────────────────────────────────────────────────────

  buildForm();

  USE.loadManifest().then(async m => {
    manifest = m;
    task = manifest[taskIndex];
    if (!task) throw new Error('找不到指定任務');
    if (!task.images.length) throw new Error('此任務沒有影像，請確認 Google Drive 資料夾架構與檔名。');
    await USE.loadServerRatings(reviewer, task);
    const saved     = USE.readLocalProgress(reviewer, task);
    const suggested = USE.firstIncompleteIndex(reviewer, task);
    current = (saved && Number.isInteger(saved.currentIndex))
      ? Math.min(saved.currentIndex, task.images.length - 1)
      : suggested;
    render();
  }).catch(err => {
    title.textContent = '載入失敗';
    subtitle.innerHTML = `<span class="error">${escapeHtml(err.message)}</span>`;
  });
})();
