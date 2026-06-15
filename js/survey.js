(function () {
  const params = new URLSearchParams(location.search);
  const defaultReviewer = (APP_CONFIG.reviewers && APP_CONFIG.reviewers[0]) || 'Reviewer1';
  const reviewer = params.get('reviewer') || defaultReviewer;
  const taskIndex = Number(params.get('task') || 0);
  let manifest = [], task = null, current = 0;

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
    if (!form) return;
    form.innerHTML = '';
    APP_CONFIG.ratingFields.forEach(f => form.appendChild(buildMatrixQuestion(f)));
    
    form.addEventListener('change', () => {
      const currentValues = readFormValues();
      const imgKey = task.images[current].id || task.images[current].filename;
      localMemoryDraft[imgKey] = currentValues;
    });
  }

  function setFormValues(rating) {
    if (!form) return;
    USE.ratingKeys().forEach(k => {
      const targetValue = String(rating[k] || '');
      const radios = form.querySelectorAll(`input[name="${CSS.escape(k)}"]`);
      radios.forEach(radio => { radio.checked = (radio.value === targetValue); });
    });
  }

  function readFormValues() {
    const out = {};
    if (!form) return out;
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

  async function saveAllToCloud(isFinal = false) {
    showHint('正在同步作答進度與紀錄至雲端試算表...');
    
    const currentValues = readFormValues();
    const currentImgKey = task.images[current].id || task.images[current].filename;
    localMemoryDraft[currentImgKey] = currentValues;

    let savedCount = 0;
    const promises = [];

    task.images.forEach((img, idx) => {
      const imgKey = img.id || img.filename;
      if (localMemoryDraft[imgKey]) {
        const ratingData = localMemoryDraft[imgKey];
        const payload = makePayloadForImage(idx, ratingData);
        
        const storageKey = [task.strategy, task.dataset, task.model, imgKey].join('||');
        USE.saveLocalRating(reviewer, storageKey, payload);
        
        promises.push(USE.postToSheet(payload));
        savedCount++;
      }
    });

    let completedCount = USE.countCompleted(reviewer, task);

    promises.push(USE.postToSheet({
      action: 'saveProgress', reviewer,
      strategy: task.strategy, dataset: task.dataset, model: task.model,
      displayModel: USE.displayModel(task.model),
      currentIndex: current, total: task.images.length, completed: completedCount,
      completedStatus: completedCount >= task.images.length ? 'Completed' : 'In Progress'
    }));

    await Promise.all(promises);

    if (progressText) progressText.textContent = `${completedCount} / ${task.images.length}`;
    if (progressBar) progressBar.style.width  = Math.round(completedCount * 100 / task.images.length) + '%';

    if (!isFinal) {
      showHint(`💾 儲存成功！已將 ${savedCount} 筆作答更新至 responses（未選欄位在後台已保留空白）。`);
    }
  }

  function missingIndices() {
    const missing = [];
    if (!task) return missing;
    for (let i = 0; i < task.images.length; i++) {
      const imgKey = task.images[i].id || task.images[i].filename;
      const rating = localMemoryDraft[imgKey] || {};
      const isAllFilled = USE.ratingKeys().every(k => rating[k] !== undefined && rating[k] !== null && rating[k] !== '');
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

  function render() {
    const img   = task.images[current];
    const total = task.images.length;
    if (title) title.textContent     = USE.displayModel(task.model);
    if (subtitle) subtitle.textContent  = reviewer;
    if (imageMeta) imageMeta.textContent = `${current + 1} / ${total} ${img.filename || img.id || ''}`;
    if (image) image.src             = img.url || img.path || '';
    
    if (prevBtn) prevBtn.disabled = current <= 0;
    if (nextBtn) nextBtn.disabled = current >= total - 1;

    // ➔ 加上安全鎖，防止這兩個按鈕在某些介面不存在時引發 style 崩潰
    if (current >= total - 1) {
      if (saveProgressBtn) saveProgressBtn.style.display = 'none';
      if (finalSubmitBtn) finalSubmitBtn.style.display = 'inline-block';
    } else {
      if (saveProgressBtn) saveProgressBtn.style.display = 'inline-block';
      if (finalSubmitBtn) finalSubmitBtn.style.display = 'none';
    }
    
    const imgKey = img.id || img.filename;
    if (localMemoryDraft[imgKey]) {
      setFormValues(localMemoryDraft[imgKey]);
    } else {
      const serverKey = USE.imageKey(task, img);
      setFormValues(USE.readRating(reviewer, serverKey) || {});
    }
    showHint('');
  }

  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      if (current <= 0) return;
      localMemoryDraft[task.images[current].id || task.images[current].filename] = readFormValues();
      current--;
      render();
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      if (current >= task.images.length - 1) return;
      localMemoryDraft[task.images[current].id || task.images[current].filename] = readFormValues();
      current++;
      render();
    });
  }

  if (saveProgressBtn) saveProgressBtn.addEventListener('click', () => saveAllToCloud(false));
  if (finalSubmitBtn) finalSubmitBtn.addEventListener('click', handleFinalSubmit);

  buildForm();

  // ➔ 完全回歸調用您 admin.js 定義好的唯一 loadManifest
  USE.loadManifest().then(async m => {
    manifest = m;
    task = manifest[taskIndex];
    
    await USE.loadServerRatings(reviewer, task);
    
    task.images.forEach(img => {
      const skey = USE.imageKey(task, img);
      const serverRating = USE.readRating(reviewer, skey);
      if (serverRating) {
        localMemoryDraft[img.id || img.filename] = serverRating;
      }
    });

    current = USE.firstIncompleteIndex(reviewer, task);
    
    let completedCount = USE.countCompleted(reviewer, task);
    if (progressText) progressText.textContent = `${completedCount} / ${task.images.length}`;
    if (progressBar) progressBar.style.width  = Math.round(completedCount * 100 / task.images.length) + '%';
    
    render();
  }).catch(err => {
    if (title) title.textContent = '載入失敗';
    if (subtitle) subtitle.innerHTML = `<span class="error">${escapeHtml(err.message)}</span>`;
  });
})();
