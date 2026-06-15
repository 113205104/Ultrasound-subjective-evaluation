(function () {
  const params = new URLSearchParams(location.search);
  const defaultReviewer = (APP_CONFIG.reviewers && APP_CONFIG.reviewers[0]) || 'Reviewer1';
  const reviewer = params.get('reviewer') || defaultReviewer;
  const taskIndex = Number(params.get('task') || 0);
  let manifest = [], task = null, current = 0;

  // 用於在記憶體暫存目前這張圖尚未儲存的修改 (避免換頁被清空，按儲存才寫入快取/硬碟)
  const sessionMemoryCache = {};

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
        return `<label class="matrix-radio" data-name="${name}" data-value="${score}">
          <input id="${id}" type="radio" name="${name}" value="${score}"
            aria-label="${escapeHtml(field.label)} ${escapeHtml(row.label)} ${score}">
          <span class="matrix-radio-dot"></span>
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

  // ── 【極速 0 計算 UI】點擊純更換 CSS，記憶體暫存 ─────────────────
  function attachRadioToggle() {
    form.addEventListener('click', function (e) {
      const label = e.target.closest('.matrix-radio');
      if (!label) return;

      e.preventDefault();

      const name = label.dataset.name;
      const isAlreadyChecked = label.classList.contains('checked');
      const siblings = form.querySelectorAll(`.matrix-radio[data-name="${CSS.escape(name)}"]`);

      siblings.forEach(el => {
        el.classList.remove('checked');
        el.querySelector('input').checked = false;
      });

      if (isAlreadyChecked) {
        // 【取消作答】：點選已實心的按鈕直接變空心
      } else {
        // 【切換/選取】：變實心
        label.classList.add('checked');
        label.querySelector('input').checked = true;
      }

      // ⚡ 平常作答點擊時：絕對不碰 localStorage 讀寫，也不跑 324 遍大迴圈。
      // 只將目前畫面更改同步至極輕量的 sessionMemoryCache 記憶體變數，防換頁丟失。
      const key = currentRatingKey();
      sessionMemoryCache[key] = readFormValues();
    });
  }

  // ── 畫面值與答案物件轉換 ─────────────────────────────────────────────────

  function setFormValues(rating) {
    USE.ratingKeys().forEach(k => {
      const targetValue = String(rating[k] || '');
      const labels = form.querySelectorAll(`.matrix-radio[data-name="${CSS.escape(k)}"]`);
      
      labels.forEach(label => {
        const input = label.querySelector('input');
        const isTarget = input.value === targetValue;
        
        input.checked = isTarget;
        if (isTarget) {
          label.classList.add('checked');
        } else {
          label.classList.remove('checked');
        }
      });
    });
  }

  function readFormValues() {
    const out = {};
    USE.ratingKeys().forEach(k => {
      const checkedLabel = form.querySelector(`.matrix-radio[data-name="${CSS.escape(k)}"].checked`);
      out[k] = checkedLabel ? Number(checkedLabel.dataset.value) : '';
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

  // ── 【極致 Word 儲存系統】只有點擊這兩個大按鈕時，才執行一次性儲存與大迴圈計算 ──

  function commitCurrentToLocal() {
    const key = currentRatingKey();
    // 優先抓取記憶體中的臨時作答，如果沒有就去讀原本的紀錄
    const values = sessionMemoryCache[key] || readFormValues();
    const payload = makePayloadForImage(current, values);
    payload.action       = 'draftOnly';
    payload.updatedAt    = new Date().toISOString();
    USE.saveLocalRating(reviewer, key, payload);
    USE.saveLocalProgress(reviewer, task, current, task.images.length);
  }

  // 只有按「儲存」或「送出」按鈕才跑的 324 次大迴圈完備度檢查
  function missingIndices() {
    const missing = [];
    if (!task) return missing;
    for (let i = 0; i < task.images.length; i++) {
      const key = ratingKeyFor(i);
      // 先從記憶體暫存拿答案，拿不到才看本機持久快取
      const memRating = sessionMemoryCache[key];
      const rating = memRating !== undefined ? memRating : USE.readRating(reviewer, key);
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

  function renderActionButton() {
    if (!finalSubmitBtn || !task) return;
    if (allCompleteWithCurrentForm()) {
      finalSubmitBtn.textContent = '確認完成並送出';
    } else {
      finalSubmitBtn.textContent = '儲存作答進度';
    }
    finalSubmitBtn.className = 'primary-button';
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
        // 跳轉時只存在記憶體變數中，完全不存 LocalStorage
        const k = currentRatingKey();
        sessionMemoryCache[k] = readFormValues();
        
        current = Number(btn.dataset.index);
        render();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        showHint('已跳轉；請填完此頁後按「儲存作答進度」。');
      });
    });
  }

  // 大按鈕點擊：儲存作答進度
  function saveCurrentDraft() {
    // 只有在此時，才將當前頁面與所有變更「一次性」大量寫入 LocalStorage 快取
    Object.keys(sessionMemoryCache).forEach(k => {
      const idx = task.images.findIndex(img => [taskKey(task), img.id || img.fileId || img.filename || img.url].join('||') === k);
      if (idx !== -1) {
        const payload = makePayloadForImage(idx, sessionMemoryCache[k]);
        payload.action = 'draftOnly';
        USE.saveLocalRating(reviewer, k, payload);
      }
    });
    commitCurrentToLocal();

    const total = task.images.length;
    // 此時才執行全量迴圈統計
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
    showHint('已儲存目前進度到雲端系統中。');
  }

  function submitImageIfComplete(index) {
    const key     = ratingKeyFor(index);
    const memRating = sessionMemoryCache[key];
    const rating  = memRating !== undefined ? memRating : USE.readRating(reviewer, key);
    const payload = makePayloadForImage(index, rating || {});
    USE.saveLocalRating(reviewer, key, payload);
    if (USE.isCompleteRating(payload)) {
      USE.postToSheet(payload);
      return true;
    }
    return false;
  }

  // 大按鈕點擊：最終確認完成並送出
  function finalizeAll() {
    // 同步寫入 LocalStorage 快取
    Object.keys(sessionMemoryCache).forEach(k => {
      const idx = task.images.findIndex(img => [taskKey(task), img.id || img.fileId || img.filename || img.url].join('||') === k);
      if (idx !== -1) {
        const payload = makePayloadForImage(idx, sessionMemoryCache[k]);
        payload.action = 'draftOnly';
        USE.saveLocalRating(reviewer, k, payload);
      }
    });
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

  function taskKey(t) { return [t.strategy, t.dataset, t.model].join('||'); }
  function ratingKeyFor(index) { return USE.imageKey(task, task.images[index]); }
  function currentRatingKey()  { return ratingKeyFor(current); }
  
  function getCurrentRating()  { 
    const key = currentRatingKey();
    // 畫面渲染優先載入臨時記憶體內容，次之才查本機快取
    if (sessionMemoryCache[key] !== undefined) return sessionMemoryCache[key];
    return USE.readRating(reviewer, key); 
  }

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
    
    // 💡 換頁時：大按鈕只維持原本字樣，不跑大迴圈去重新計算 missingIndices()，徹底消除換頁卡頓。
    finalSubmitBtn.textContent = '儲存作答進度'; 
    finalSubmitBtn.className = 'primary-button';
    showHint('');
  }

  // ── Navigation ────────────────────────────────────────────────────────────

  prevBtn.addEventListener('click', () => {
    if (current <= 0) return;
    // 🚀【極速優化】：換頁時不寫入 LocalStorage 快取，只保存在記憶體變數中，反應速度為 0 毫秒
    sessionMemoryCache[currentRatingKey()] = readFormValues();
    current--;
    render();
  });

  nextBtn.addEventListener('click', () => {
    if (current >= task.images.length - 1) return;
    // 🚀【極速優化】：換頁時不寫入 LocalStorage 快取，只保存在記憶體變數中，反應速度為 0 毫秒
    sessionMemoryCache[currentRatingKey()] = readFormValues();
    current++;
    render();
  });

  if (finalSubmitBtn) {
    finalSubmitBtn.addEventListener('click', () => {
      // 只有在主動按下儲存/送出大按鈕時，才執行一次全量統計與寫入
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
    if (!task.images.length) throw new Error('此任務沒有影像');
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
