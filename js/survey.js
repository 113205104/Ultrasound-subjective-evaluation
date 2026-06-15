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

  // ── 【效能優化】移除二次點擊取消與任何 change 監聽，回歸原生單選鈕效能 ──
  function attachRadioToggle() {
    // 刪除原有的 mousedown 與 click 取消選取邏輯。
    // 當前點選時背後無任何運算，徹底消滅卡頓。
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

  // ── 【Word 式存檔】僅在切換頁面或手動點擊按鈕時，才將當前頁面資料寫入暫存 ──

  function commitToLocal(targetIndex) {
    const values = readFormValues();
    const payload = makePayloadForImage(targetIndex, values);
    payload.action       = 'draftOnly';
    payload.updatedAt    = new Date().toISOString();
    
    const key = [task.strategy, task.dataset, task.model, task.images[targetIndex].id || task.images[targetIndex].fileId || task.images[targetIndex].filename || task.images[targetIndex].url].join('||');
    USE.saveLocalRating(reviewer, key, payload);
    USE.saveLocalProgress(reviewer, task, targetIndex, task.images.length);
  }

  // 掃描所有題目的未完成清單（改為僅在提交或點擊特定按鈕時觸發）
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
        commitToLocal(current); // 跳轉前儲存當前頁面
        current = Number(btn.dataset.index);
        render();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });
  }

  // ── 【主動觸發：儲存與送出】 ──────────────────────────────────────────────

  function handleFinalSubmitAction() {
    // 1. 動作前，先儲存當前這張圖的最新填寫狀態 (如同 Word 存檔)
    commitToLocal(current);

    // 2. 執行全量掃描以判斷是否全部完成
    const missing = missingIndices();

    if (missing.length > 0) {
      // 有漏題 -> 執行【儲存目前進度到雲端】邏輯
      const total = task.images.length;
      const completed = USE.countCompleted(reviewer, task);
      
      progressText.textContent = `${completed} / ${total}`;
      progressBar.style.width  = total ? Math.round(completed * 100 / total) + '%' : '0%';

      USE.postToSheet({
        action: 'saveProgress', reviewer,
        strategy: task.strategy, dataset: task.dataset, model: task.model,
        displayModel: USE.displayModel(task.model),
        currentIndex: current, total, completed,
        completedStatus: 'In Progress'
      });

      renderMissingPanel(missing);
      showHint(`進度已儲存。但尚有 ${missing.length} 張未完成，請補齊後再送出。`);
    } else {
      // 全數完成 -> 執行【正式確認送出】邏輯
      renderMissingPanel([]);
      let submitted = 0;
      for (let i = 0; i < task.images.length; i++) {
        const key = USE.imageKey(task, task.images[i]);
        const rating = USE.readRating(reviewer, key);
        const payload = makePayloadForImage(i, rating || {});
        USE.saveLocalRating(reviewer, key, payload);
        if (USE.isCompleteRating(payload)) {
          USE.postToSheet(payload);
          submitted += 1;
        }
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
      showHint(`確認完成：已正式送出 ${submitted} / ${total} 張作答紀錄！`);
    }
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
    
    // 僅在換頁載入時，讀取一次該頁面的歷史填寫數值
    const key = USE.imageKey(task, img);
    setFormValues(USE.readRating(reviewer, key));
    
    // 按鈕文字固定為綜合功能鈕，不在此處計算完備度，完全省去迴圈消耗
    finalSubmitBtn.textContent = '確認完成並送出 / 儲存進度'; 
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
    // 整合為單一高效觸發入口
    finalSubmitBtn.addEventListener('click', handleFinalSubmitAction);
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
