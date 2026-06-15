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
        // 回歸最乾淨的標準 HTML 結構，不帶任何自訂點擊包裝
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

  function buildForm() {
    form.innerHTML = '';
    APP_CONFIG.ratingFields.forEach(f => form.appendChild(buildMatrixQuestion(f)));
    attachRadioToggle();
  }

  // ── 【極簡高效】純原生 Radio 變更事件 ──────────────────────────────────────────
  function attachRadioToggle() {
    // 徹底拋棄 click 攔截，改用瀏覽器效能最好的原生 change 事件（只在選項真正改變時觸發）
    form.addEventListener('change', function (e) {
      if (!e.target.matches('input[type="radio"]')) return;

      // 0毫秒極速寫入記憶體快取
      const values = readFormValues();
      const payload = makePayloadForImage(current, values);
      payload.action = 'draftOnly';
      USE.saveLocalRating(reviewer, currentRatingKey(), payload);
      
      // 點選分數時，絕對不呼叫任何大迴圈或按鈕更新，保持極致流暢
    });
  }

  // ── Rating data helpers ───────────────────────────────────────────────────

  function ratingKeyFor(index) { return USE.imageKey(task, task.images[index]); }
  function currentRatingKey()  { return ratingKeyFor(current); }
  function getCurrentRating()  { return USE.readRating(reviewer, currentRatingKey()); }

  function setFormValues(rating) {
    USE.ratingKeys().forEach(k => {
      const inputs = form.querySelectorAll(`input[name="${CSS.escape(k)}"]`);
      const targetValue = String(rating[k] || '');
      inputs.forEach(el => {
        el.checked = el.value === targetValue;
      });
    });
  }

  // ── 讀取目前的選項值 ────────────────────────────────────────────────────────
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

  function saveProgressLocalOnly() {
    USE.saveLocalProgress(reviewer, task, current, task.images.length);
  }

  // ── Missing-image helpers ─────────────────────────────────────────────────

  function missingIndices() {
    const missing = [];
    if (!task) return missing;
    for (let i = 0; i < task.images.length; i++) {
      const key = USE.imageKey(task, task.images[i]);
      const rating = USE.readRating(reviewer, key);
      if (!USE.isCompleteRating(rating)) {
        missing.push(i);
      }
    }
    return missing;
  }

  function allCompleteWithCurrentForm() {
    if (!task || task.images.length === 0) return false;
    return missingIndices().length === 0;
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
              第 ${i + 1} 張 ${escapeHtml(img.filename || img.id || '')}
            </button>`;
          }).join('')}
        </div>
      </section>`;
      
    missingPanel.querySelectorAll('.missing-jump').forEach(btn => {
      btn.addEventListener('click', () => {
        commitCurrentToLocal();
        current = Number(btn.dataset.index);
        render();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        showHint('已跳轉；請填完此頁後按「儲存作答進度」。');
      });
    });
  }

  // ── Core save / submit ────────────────────────────────────────────────────

  function commitCurrentToLocal() {
    const values  = readFormValues();
    const payload = makePayloadForImage(current, values);
    payload.action       = 'draftOnly';
    payload.updatedAt    = new Date().toISOString();
    USE.saveLocalRating(reviewer, currentRatingKey(), payload);
    saveProgressLocalOnly();
  }

  function saveCurrentDraft() {
    commitCurrentToLocal();
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
    renderActionButton(); // 點擊儲存進度大按鈕時，才更新按鈕文字
    showHint('已儲存作答進度；尚未寫入正式作答紀錄。');
  }

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

  function finalizeAll() {
    commitCurrentToLocal();

    const missing = missingIndices();
    if (missing.length) {
      renderMissingPanel(missing);
      renderProgressOnly();
      renderActionButton();
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
    imageMeta.textContent = `${current + 1} / ${total} ${img.filename || img.id || ''}`;
    image.src = img.url || img.path || '';
    image.alt = img.filename || 'Tripanel ultrasound image';
    prevBtn.disabled = current <= 0;
    nextBtn.disabled = current >= total - 1;
    setFormValues(getCurrentRating());
    renderProgressOnly();
    renderActionButton(); // 換頁時更新大按鈕狀態
    showHint('');
  }

  // ── Navigation ────────────────────────────────────────────────────────────

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
