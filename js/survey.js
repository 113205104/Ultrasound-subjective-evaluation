(function () {
  const params = new URLSearchParams(location.search);
  const defaultReviewer = (APP_CONFIG.reviewers && APP_CONFIG.reviewers[0]) || 'Reviewer1';
  const reviewer = params.get('reviewer') || defaultReviewer;
  const taskIndex = Number(params.get('task') || 0);
  let manifest = [], task = null, current = 0;

  // 核心草稿記憶體：暫存當前瀏覽器畫面的作答狀態，不論是否有填滿
  let localMemoryDraft = {}; 

  const title = document.getElementById('taskTitle');
  const subtitle = document.getElementById('taskSubtitle');
  const progressText = document.getElementById('progressText');
  const progressBar = document.getElementById('progressBar');
  const imageMeta = document.getElementById('imageMeta');
  const image = document.getElementById('tripanelImage');
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  const saveProgressBtn = document.getElementById('saveProgressBtn');
  const finalSubmitBtn = document.getElementById('finalSubmitBtn');
  const saveHint = document.getElementById('saveHint');
  const missingPanel = document.getElementById('missingPanel');
  const form = document.getElementById('ratingForm');

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

    const scaleHeaders = APP_CONFIG.ratingScale.map(score => `<div class="matrix-col-head">${score}</div>`).join('');
    const rows = APP_CONFIG.tripanelRows.map(row => {
      const cells = APP_CONFIG.ratingScale.map(score => {
        const name = `${field.key}_${row.key}`;
        const id   = `${name}_${score}`;
        return `<label class="matrix-radio"><input id="${id}" type="radio" name="${name}" value="${score}"></label>`;
      }).join('');
      return `<div class="matrix-row-label">${escapeHtml(row.label)}</div>${cells}`;
    }).join('');

    section.innerHTML = `<h2>${escapeHtml(field.label)}</h2><div class="matrix-grid" style="--scale-cols:${APP_CONFIG.ratingScale.length}"><div></div>${scaleHeaders}${rows}</div>`;
    return section;
  }

  function buildForm() {
    form.innerHTML = '';
    APP_CONFIG.ratingFields.forEach(f => form.appendChild(buildMatrixQuestion(f)));
    
    // 當使用者在畫面上勾選時，即時更新至記憶體，絕不拖慢操作速度
    form.addEventListener('change', () => {
      const currentValues = readFormValues();
      const imgKey = task.images[current].id || task.images[current].filename;
      localMemoryDraft[imgKey] = currentValues;
    });
  }

  // ── Value conversion ──────────────────────────────────────────────────────

  function setFormValues(rating) {
    USE.ratingKeys().forEach(k => {
      const targetValue = String(rating[k] || '');
      const radios = form.querySelectorAll(`input[name="${CSS.escape(k)}"]`);
      radios.forEach(radio => { radio.checked = (radio.value === targetValue); });
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

  // ── 【重要改善】強制作答與目前題號同步至雲端（不阻擋未完成項目） ──

  async function saveAllToCloud(isFinal = false) {
    showHint('正在同步作答進度與紀錄至雲端試算表...');
    
    // 將目前畫面最新值收進快取
    const currentValues = readFormValues();
    const currentImgKey = task.images[current].id || task.images[current].filename;
    localMemoryDraft[currentImgKey] = currentValues;

    let savedCount = 0;
    const promises = [];

    // 掃描全部任務影像
    task.images.forEach((img, idx) => {
      const imgKey = img.id || img.filename;
      if (localMemoryDraft[imgKey]) {
        const ratingData = localMemoryDraft[imgKey];
        
        // 移除 isCompleteRating 限制：不管是填 1 格還是 12 格，一律打包強推上傳雲端
        const payload = makePayloadForImage(idx, ratingData);
        
        const storageKey = [task.strategy, task.dataset, task.model, imgKey].join('||');
        USE.saveLocalRating(reviewer, storageKey, payload);
        
        promises.push(USE.postToSheet(payload));
        savedCount++;
      }
    });

    // 計算真正「填滿 12 格」的總數，以此為標準刷新 UI 進度條
    let completedCount = 0;
    task.images.forEach(img => {
      const imgKey = img.id || img.filename;
      const r = localMemoryDraft[imgKey];
      if (r) {
        const isAllFilled = USE.ratingKeys().every(k => r[k] !== undefined && r[k] !== '');
        if (isAllFilled) completedCount++;
      }
    });

    // 【改善不同電腦進度】直接將目前所在的 current 題號綁定 Reviewer 寫入雲端的 progress 表
    promises.push(USE.postToSheet({
      action: 'saveProgress', reviewer,
      strategy: task.strategy, dataset: task.dataset, model: task.model,
      displayModel: USE.displayModel(task.model),
      currentIndex: current, total: task.images.length, completed: completedCount,
      completedStatus: completedCount >= task.images.length ? 'Completed' : 'In Progress'
    }));

    await Promise.all(promises);

    progressText.textContent = `${completedCount} / ${task.images.length}`;
    progressBar.style.width  = Math.round(completedCount * 100 / task.images.length) + '%';

    if (!isFinal) {
      showHint(`💾 儲存成功！已將 ${savedCount} 筆作答更新至 responses（未選欄位在後台已保留空白）。`);
    }
  }

  // ── Missing scan ──────────────────────────────────────────────────────────

  function missingIndices() {
    const missing = [];
    if (!task) return missing;
    for (let i = 0; i < task.images.length; i++) {
      const imgKey = task.images[i].id || task.images[i].filename;
      const rating = localMemoryDraft[imgKey] || {};
      const isAllFilled = USE.ratingKeys().every(k => rating[k] !== undefined && rating[k] !== '');
      if (!isAllFilled) {
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
        <h2 style="color: #d32f2f;">⚠️ 尚有 ${missing.length} 張未完成</h2>
        <p class="muted">您可以點選下方按鈕直接跳至漏題補充分數，補完後請到最後一張點擊確認送出。</p>
        <div class="missing-jump-list">
          ${missing.map(i => `<button type="button" class="ghost-button missing-jump" data-index="${i}">第 ${i + 1} 張</button>`).join('')}
        </div>
      </section>`;
      
    missingPanel.querySelectorAll('.missing-jump').forEach(btn => {
      btn.addEventListener('click', () => {
        localMemoryDraft[task.images[current].id || task.images[current].filename] = readFormValues();
        current = Number(btn.dataset.index);
        render();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });
  }

  async function handleFinalSubmit() {
    await saveAllToCloud(true);
    const missing = missingIndices();

    if (missing.length > 0) {
      renderMissingPanel(missing);
      showHint(`雲端同步完成！但因尚有 ${missing.length} 張圖未填滿分數，請補齊後再行送出。`);
    } else {
      renderMissingPanel([]);
      showHint(`🎉 恭喜！本項任務已全部評分完畢並成功送出！`);
      setTimeout(() => { location.href = 'index.html'; }, 2000);
    }
  }

  // ── Rendering ─────────────────────────────────────────────────────────────

  function render() {
    const img   = task.images[current];
    const total = task.images.length;
    title.textContent     = USE.displayModel(task.model);
    subtitle.textContent  = reviewer;
    imageMeta.textContent = `${current + 1} / ${total} ${img.filename || img.id || ''}`;
    image.src             = img.url || img.path || '';
    
    prevBtn.disabled = current <= 0;
    nextBtn.disabled = current >= total - 1;

    // 當切換到最後一張影像時，右下角動態代換成確認送出
    if (current >= total - 1) {
      saveProgressBtn.style.display = 'none';
      finalSubmitBtn.style.display = 'inline-block';
    } else {
      saveProgressBtn.style.display = 'inline-block';
      finalSubmitBtn.style.display = 'none';
    }
    
    // 優先從本地記憶體草稿讀取，次之則用雲端初始化下載的歷史，保證換頁時不遺失剛點的內容
    const imgKey = img.id || img.filename;
    if (localMemoryDraft[imgKey]) {
      setFormValues(localMemoryDraft[imgKey]);
    } else {
      const serverKey = USE.imageKey(task, img);
      setFormValues(USE.readRating(reviewer, serverKey) || {});
    }
    showHint('');
  }

  // ── Navigation ────────────────────────────────────────────────────────────

  prevBtn.addEventListener('click', () => {
    if (current <= 0) return;
    localMemoryDraft[task.images[current].id || task.images[current].filename] = readFormValues();
    current--;
    render();
  });

  nextBtn.addEventListener('click', () => {
    if (current >= task.images.length - 1) return;
    localMemoryDraft[task.images[current].id || task.images[current].filename] = readFormValues();
    current++;
    render();
  });

  saveProgressBtn.addEventListener('click', () => saveAllToCloud(false));
  finalSubmitBtn.addEventListener('click', handleFinalSubmit);

  // ── Init ──────────────────────────────────────────────────────────────────

  buildForm();

  USE.loadManifest().then(async m => {
    manifest = m;
    task = manifest[taskIndex];
    
    // 1. 同步從遠端試算表完整拉取該 Reviewer 已作答的所有 responses 紀錄
    await USE.loadServerRatings(reviewer, task);
    
    // 2. 將已下載的紀錄填滿記憶體暫存
    task.images.forEach(img => {
      const skey = USE.imageKey(task, img);
      const serverRating = USE.readRating(reviewer, skey);
      if (serverRating) {
        localMemoryDraft[img.id || img.filename] = serverRating;
      }
    });

    // 3. 【核心改善不同電腦進度】讀取雲端 progress 所推薦回傳的最新位置 (而不是由本地 localStorage 綁定)
    const saved = USE.readLocalProgress(reviewer, task); 
    if (saved && Number.isInteger(saved.currentIndex)) {
      current = Math.min(saved.currentIndex, task.images.length - 1);
    } else {
      const suggested = USE.firstIncompleteIndex(reviewer, task);
      current = suggested >= 0 ? suggested : 0;
    }
    
    // 刷新進度條
    let completedCount = 0;
    task.images.forEach(img => {
      const imgKey = img.id || img.filename;
      const r = localMemoryDraft[imgKey];
      if (r) {
        const isAllFilled = USE.ratingKeys().every(k => r[k] !== undefined && r[k] !== '');
        if (isAllFilled) completedCount++;
      }
    });
    progressText.textContent = `${completedCount} / ${task.images.length}`;
    progressBar.style.width  = Math.round(completedCount * 100 / task.images.length) + '%';
    
    render();
  }).catch(err => {
    title.textContent = '載入失敗';
    subtitle.innerHTML = `<span class="error">${escapeHtml(err.message)}</span>`;
  });
})();
