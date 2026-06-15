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

  // ── 徹底刪除二次點擊取消功能，維持原生單選效能 ──
  function attachRadioToggle() {
    // 此處不處理任何滑鼠點擊與即時暫存事件，勾選時 0 卡頓
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

  // ── 【重要修改】儲存當頁資料：同步寫入本機快取與雲端試算表 responses ──
  function saveAndSyncCurrentPage() {
    const values = readFormValues();
    const payload = makePayloadForImage(current, values);
    
    // 1. 寫入本地快取備份
    const key = [task.strategy, task.dataset, task.model, task.images[current].id || task.images[current].fileId || task.images[current].filename || task.images[current].url].join('||');
    USE.saveLocalRating(reviewer, key, payload);
    
    // 2. 即時發送給雲端試算表 responses (即使未填滿也寫入，方便後台統計)
    USE.postToSheet(payload);

    // 3. 更新進度表 (progress) 狀態
    updateCloudProgress();
  }

  // 同步更新雲端進度條紀錄
  function updateCloudProgress() {
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
  }

  // 全量掃描漏題
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
        <p class="muted">點選下方項目可直接跳到漏題，補完後點選下一張或最後送出。</p>
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
        saveAndSyncCurrentPage(); // 跳轉前存檔
        current = Number(btn.dataset.index);
        render();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });
  }

  // 最後一題的最終確認送出處理
  function handleFinalSubmit() {
    saveAndSyncCurrentPage(); // 先存最後一頁
    const missing = missingIndices();

    if (missing.length > 0) {
      renderMissingPanel(missing);
      showHint(`進度已儲存。但尚有 ${missing.length} 張未完成，請補齊後再送出。`);
    } else {
      renderMissingPanel([]);
      showHint(`🎉 恭喜！本項任務所有超音波影像已全部完成並成功送出！`);
      setTimeout(() => { location.href = 'index.html'; }, 2000);
    }
  }

  // ── Rendering ─────────────────────────────────────────────────────────────

  function render() {
    const img   = task.images[current];
    const total = task.images.length;
    title.textContent    = USE.displayModel(task.model);
    subtitle.textContent = reviewer;
    imageMeta.textContent = `${current + 1} / ${total} ${img.filename || img.id || ''}`;
    image.src = img.url || img.path || '';
    image.alt = img.filename || 'Tripanel ultrasound image';
    
    prevBtn.disabled = current <= 0;

    // ── 按鈕邏輯切換：只有在最後一頁，Next 按鈕才會隱藏，FinalSubmit 按鈕才會出現 ──
    if (current >= total - 1) {
      nextBtn.style.display = 'none';
      finalSubmitBtn.style.display = 'inline-block';
      finalSubmitBtn.textContent = '確認完成並送出';
    } else {
      nextBtn.style.display = 'inline-block';
      finalSubmitBtn.style.display = 'none';
    }
    
    // 讀取當前頁面的填寫歷史
    const key = USE.imageKey(task, img);
    setFormValues(USE.readRating(reviewer, key));
    showHint('');
  }

  // ── Navigation ────────────────────────────────────────────────────────────

  prevBtn.addEventListener('click', () => {
    if (current <= 0) return;
    saveAndSyncCurrentPage(); // 像 Word 同步存檔
    current--;
    render();
  });

  nextBtn.addEventListener('click', () => {
    if (current >= task.images.length - 1) return;
    saveAndSyncCurrentPage(); // 像 Word 同步存檔
    current++;
    render();
  });

  if (finalSubmitBtn) {
    finalSubmitBtn.addEventListener('click', handleFinalSubmit);
  }

  // ── Init ──────────────────────────────────────────────────────────────────

  buildForm();

  USE.loadManifest().then(async m => {
    manifest = m;
    task = manifest[taskIndex];
    if (!task) throw new Error('找不到指定任務');
    if (!task.images.length) throw new Error('此任務沒有影像');
    
    // 從伺服器下載最新的正式紀錄
    await USE.loadServerRatings(reviewer, task);
    
    // 【解決問題 1】捨棄 readLocalProgress 本機紀錄，初始頁面完全由伺服器推薦的未完成第一題（suggested）決定
    // 這樣在任何電腦登入，只要 Reviewer 相同，初始看到的畫面與進度位置就會一致！
    const suggested = USE.firstIncompleteIndex(reviewer, task);
    current = suggested >= 0 ? suggested : 0;
    
    // 初始化進度條 UI 顯示
    const total = task.images.length;
    const completed = USE.countCompleted(reviewer, task);
    progressText.textContent = `${completed} / ${total}`;
    progressBar.style.width  = total ? Math.round(completed * 100 / total) + '%' : '0%';
    
    render();
  }).catch(err => {
    title.textContent = '載入失敗';
    subtitle.innerHTML = `<span class="error">${escapeHtml(err.message)}</span>`;
  });
})();
