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
        // 恢復原生的 Google Forms 精美 radio 圓圈
        return `<label class="matrix-radio">
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

  // ── 【安全隔離對策】點擊選項時，背後 0 程式碼執行，徹底繞過 admin.js 炸彈 ──
  function attachRadioToggle() {
    // 💡 這裡就是關鍵！我們不再監聽 change 事件去呼叫任何 saveLocalRating()。
    // 這讓作答者在同一頁勾選分數時，背後絕對不會去執行 admin.js 的清空快取程序。

    // 輕量級實作：點選第二次可以取消勾選
    let lastCheckedRadio = null;
    form.addEventListener('mousedown', function (e) {
      const radio = e.target.closest('input[type="radio"]');
      if (!radio) return;
      lastCheckedRadio = radio.checked ? radio : null;
    });

    form.addEventListener('click', function (e) {
      const radio = e.target.closest('input[type="radio"]');
      if (!radio) return;
      if (lastCheckedRadio === radio) {
        radio.checked = false; // 取消選取
        lastCheckedRadio = null;
      }
    });
  }

  // ── 畫面值與答案物件轉換 ─────────────────────────────────────────────────

  function setFormValues(rating) {
    USE.ratingKeys().forEach(k => {
      const targetValue = String(rating[k] || '');
      const radios = form.querySelectorAll(`input[name="${CSS.escape(k)}"]`);
      radios.forEach(radio => {
        radio.checked = (radio.value === targetValue);
      });
    });
  }

  function readFormValues() {
    const out = {};
    USE.ratingKeys().forEach(k => {
      const checkedRadio = form.querySelector(`input[name="${CSS.escape(k)}"]:checked`);
      out[k] = checkedRadio ? Number(checkedRadio.value) : '';
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

  // ── 【Word 手動儲存】只有觸發此處時，才允許去執行 admin.js 寫入 ──

  function commitToLocal(targetIndex) {
    const values = readFormValues();
    const payload = makePayloadForImage(targetIndex, values);
    payload.action       = 'draftOnly';
    payload.updatedAt    = new Date().toISOString();
    
    const key = [task.strategy, task.dataset, task.model, task.images[targetIndex].id || task.images[targetIndex].fileId || task.images[targetIndex].filename || task.images[targetIndex].url].join('||');
    USE.saveLocalRating(reviewer, key, payload);
    USE.saveLocalProgress(reviewer, task, targetIndex, task.images.length);
  }

  // 只有按大按鈕時，才跑一次的 324 次全量掃描
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
        commitToLocal(current); // 跳轉前一次性打包這頁
        current = Number(btn.dataset.index);
        render();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });
  }

  // 點擊「儲存作答進度」大按鈕
  function saveCurrentDraft() {
    commitToLocal(current); // 只有此時才允許引爆/執行快取重置

    const total = task.images.length;
    const completed = USE.countCompleted(reviewer, task);
    
    progressText.textContent = `${completed} / ${total}`;
    progressBar.style.width  = total ? Math.round(completed * 100 / total) + '%' : '0%';

    USE.postToSheet({
      action: 'saveProgress', reviewer,
      strategy: task.strategy, dataset: task.dataset, model: task.model,
      displayModel: USE.displayModel(task.model),
      currentIndex: current, total, completed,
      completedStatus: completed >= total ? 'Completed' : 'In Progress'
    });
    renderActionButton();
    showHint('已儲存目前進度到雲端系統中。');
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

  // 點擊「確認完成並送出」大按鈕
  function finalizeAll() {
    commitToLocal(current);

    const missing = missingIndices();
    if (missing.length) {
      renderMissingPanel(missing);
      const completed = USE.countCompleted(reviewer, task);
      progressText.textContent = `${completed} / ${task.images.length}`;
      progressBar.style.width  = Math.round(completed * 100 / task.images.length) + '%';
      renderActionButton();
      USE.postToSheet({
        action: 'saveProgress', reviewer,
        strategy: task.strategy, dataset: task.dataset, model: task.model,
        displayModel: USE.displayModel(task.model),
        currentIndex: current, total: task.images.length,
        completed: completed,
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
    
    progressText.textContent = `${total} / ${total}`;
    progressBar.style.width  = '100%';
    renderActionButton();
    showHint(`確認完成：已送出 ${submitted} / ${total} 張正式作答紀錄。`);
  }

  // ── Rendering ─────────────────────────────────────────────────────────────

  function renderInitialProgress() {
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
    
    // 換頁或初始載入時，才讀取一次數值
    const key = USE.imageKey(task, img);
    setFormValues(USE.readRating(reviewer, key));
    
    // 換頁時維持按鈕固定字樣，不跑完備度大迴圈統計，徹底消滅任何卡頓機率
    finalSubmitBtn.textContent = '儲存作答進度'; 
    finalSubmitBtn.className = 'primary-button';
    showHint('');
  }

  // ── Navigation ────────────────────────────────────────────────────────────

  prevBtn.addEventListener('click', () => {
    if (current <= 0) return;
    commitToLocal(current); // 換頁時，一次性打包此頁
    current--;
    render();
  });

  nextBtn.addEventListener('click', () => {
    if (current >= task.images.length - 1) return;
    commitToLocal(current); // 換頁時，一次性打包此頁
    current++;
    render();
  });

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
    if (!task.images.length) throw new Error('此任務沒有影像');
    await USE.loadServerRatings(reviewer, task);
    const saved     = USE.readLocalProgress(reviewer, task);
    const suggested = USE.firstIncompleteIndex(reviewer, task);
    current = (saved && Number.isInteger(saved.currentIndex))
      ? Math.min(saved.currentIndex, task.images.length - 1)
      : suggested;
    
    renderInitialProgress();
    render();
  }).catch(err => {
    title.textContent = '載入失敗';
    subtitle.innerHTML = `<span class="error">${escapeHtml(err.message)}</span>`;
  });
})();
