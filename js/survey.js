(function () {
  const params = new URLSearchParams(location.search);
  const defaultReviewer = (APP_CONFIG.reviewers && APP_CONFIG.reviewers[0]) || 'Reviewer1';
  const reviewer = params.get('reviewer') || defaultReviewer;
  const taskIndex = Number(params.get('task') || 0);

  let manifest = [];
  let task = null;
  let current = 0;
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

  function getImageDraftKey(img) {
    return img.id || img.fileId || img.filename || img.url;
  }

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
        const id = `${name}_${score}`;
        return `<label class="matrix-radio"><input id="${id}" type="radio" name="${name}" value="${score}"></label>`;
      }).join('');

      return `<div class="matrix-row-label">${escapeHtml(row.label)}</div>${cells}`;
    }).join('');

    section.innerHTML = `
      <h2>${escapeHtml(field.label)}</h2>
      <div class="matrix-grid" style="--scale-cols:${APP_CONFIG.ratingScale.length}">
        <div></div>
        ${scaleHeaders}
        ${rows}
      </div>`;

    return section;
  }

  function buildForm() {
    if (!form) return;

    form.innerHTML = '';
    APP_CONFIG.ratingFields.forEach(f => form.appendChild(buildMatrixQuestion(f)));

    form.addEventListener('change', () => {
      if (!task || !task.images || !task.images[current]) return;
      const imgKey = getImageDraftKey(task.images[current]);
      localMemoryDraft[imgKey] = readFormValues();
      updateProgressDisplay();
    });
  }

  function setFormValues(rating) {
    if (!form) return;

    USE.ratingKeys().forEach(k => {
      const targetValue = String(rating && rating[k] ? rating[k] : '');
      const radios = form.querySelectorAll(`input[name="${CSS.escape(k)}"]`);
      radios.forEach(radio => {
        radio.checked = radio.value === targetValue;
      });
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
      action: 'saveRating',
      reviewer,
      strategy: task.strategy,
      dataset: task.dataset,
      model: task.model,
      displayModel: USE.displayModel(task.model),
      imageId: img.id || img.fileId || img.filename || '',
      fileId: img.fileId || '',
      filename: img.filename || '',
      imageUrl: img.url || img.path || ''
    }, values);
  }

  function isRatingComplete(rating) {
    return USE.ratingKeys().every(k =>
      rating &&
      rating[k] !== undefined &&
      rating[k] !== null &&
      rating[k] !== ''
    );
  }

  function countCompletedFromDraft() {
    if (!task || !task.images) return 0;

    return task.images.filter(img => {
      const imgKey = getImageDraftKey(img);
      const rating = localMemoryDraft[imgKey] || {};
      return isRatingComplete(rating);
    }).length;
  }

  function updateProgressDisplay() {
    if (!task || !task.images) return;

    const completedCount = countCompletedFromDraft();
    const total = task.images.length;

    if (progressText) progressText.textContent = `${completedCount} / ${total}`;
    if (progressBar) {
      progressBar.style.width = total > 0
        ? Math.round(completedCount * 100 / total) + '%'
        : '0%';
    }
  }

  async function saveAllToCloud(isFinal = false) {
    if (!task || !task.images || !task.images[current]) return;

    showHint('正在同步作答進度與紀錄至雲端試算表...');

    const currentImgKey = getImageDraftKey(task.images[current]);
    localMemoryDraft[currentImgKey] = readFormValues();

    let savedCount = 0;
    const promises = [];

    task.images.forEach((img, idx) => {
      const imgKey = getImageDraftKey(img);
      const ratingData = localMemoryDraft[imgKey];

      if (!ratingData) return;

      const payload = makePayloadForImage(idx, ratingData);
      const storageKey = USE.imageKey(task, img);

      USE.saveLocalRating(reviewer, storageKey, payload);
      promises.push(USE.postToSheet(payload));
      savedCount++;
    });

    const completedCount = countCompletedFromDraft();

    USE.saveLocalProgress(reviewer, task, current, task.images.length);

    promises.push(USE.postToSheet({
      action: 'saveProgress',
      reviewer,
      strategy: task.strategy,
      dataset: task.dataset,
      model: task.model,
      displayModel: USE.displayModel(task.model),
      currentIndex: current,
      total: task.images.length,
      completed: completedCount,
      completedStatus: completedCount >= task.images.length ? 'Completed' : 'In Progress'
    }));

    await Promise.all(promises);

    updateProgressDisplay();

    if (!isFinal) {
      showHint(`💾 儲存成功！已更新 ${savedCount} 筆作答至 responses，並儲存目前進度。`);
    }
  }

  function missingIndices() {
    const missing = [];
    if (!task || !task.images) return missing;

    for (let i = 0; i < task.images.length; i++) {
      const imgKey = getImageDraftKey(task.images[i]);
      const rating = localMemoryDraft[imgKey] || {};

      if (!isRatingComplete(rating)) {
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
        const imgKey = getImageDraftKey(task.images[current]);
        localMemoryDraft[imgKey] = readFormValues();

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
      showHint(`雲端同步完成！但尚有 ${missing.length} 張圖未填滿分數，請補齊後再送出。`);
      return;
    }

    renderMissingPanel([]);
    showHint('🎉 恭喜！本項任務已全部評分完畢並成功送出！');

    setTimeout(() => {
      location.href = 'index.html';
    }, 1200);
  }

  function render() {
    if (!task || !task.images || !task.images.length) return;

    const img = task.images[current];
    const total = task.images.length;

    if (title) title.textContent = USE.displayModel(task.model);
    if (subtitle) subtitle.textContent = reviewer;
    if (imageMeta) imageMeta.textContent = `${current + 1} / ${total} ${img.filename || img.id || ''}`;
    if (image) image.src = img.url || img.path || '';

    if (prevBtn) prevBtn.disabled = current <= 0;
    if (nextBtn) nextBtn.disabled = current >= total - 1;

    if (current >= total - 1) {
      if (saveProgressBtn) saveProgressBtn.style.display = 'none';
      if (finalSubmitBtn) finalSubmitBtn.style.display = 'inline-block';
    } else {
      if (saveProgressBtn) saveProgressBtn.style.display = 'inline-block';
      if (finalSubmitBtn) finalSubmitBtn.style.display = 'none';
    }

    const imgKey = getImageDraftKey(img);
    setFormValues(localMemoryDraft[imgKey] || {});

    updateProgressDisplay();
    showHint('');
  }

  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      if (!task || current <= 0) return;

      const imgKey = getImageDraftKey(task.images[current]);
      localMemoryDraft[imgKey] = readFormValues();

      current--;
      render();
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      if (!task || current >= task.images.length - 1) return;

      const imgKey = getImageDraftKey(task.images[current]);
      localMemoryDraft[imgKey] = readFormValues();

      current++;
      render();
    });
  }

  if (saveProgressBtn) {
    saveProgressBtn.addEventListener('click', () => saveAllToCloud(false));
  }

  if (finalSubmitBtn) {
    finalSubmitBtn.addEventListener('click', handleFinalSubmit);
  }

  buildForm();

  USE.loadManifest().then(async m => {
    manifest = m;
    task = manifest[taskIndex];

    if (!task) {
      throw new Error('找不到指定的評分任務。');
    }

    await USE.loadServerRatings(reviewer, task);

    task.images.forEach(img => {
      const serverKey = USE.imageKey(task, img);
      const imgKey = getImageDraftKey(img);
      const serverRating = USE.readRating(reviewer, serverKey);

      if (serverRating) {
        localMemoryDraft[imgKey] = serverRating;
      }
    });

    let loadedProgress = null;

    try {
      const cloudData = await USE.jsonp('loadProgressAndRatings', {
        reviewer,
        strategy: task.strategy,
        dataset: task.dataset,
        model: task.model
      });

      if (
        cloudData &&
        cloudData.success &&
        cloudData.data &&
        cloudData.data.progress
      ) {
        loadedProgress = cloudData.data.progress;
      }
    } catch (_) {
      loadedProgress = null;
    }

    if (loadedProgress && loadedProgress.currentIndex !== undefined && loadedProgress.currentIndex !== '') {
      current = Number(loadedProgress.currentIndex);

      if (Number.isNaN(current)) current = 0;
      if (current < 0) current = 0;
      if (current >= task.images.length) current = task.images.length - 1;
    } else {
      const localProgress = USE.readLocalProgress(reviewer, task);

      if (localProgress && localProgress.currentIndex !== undefined) {
        current = Number(localProgress.currentIndex);
        if (Number.isNaN(current)) current = 0;
      } else {
        current = USE.firstIncompleteIndex(reviewer, task);
      }
    }

    updateProgressDisplay();
    render();
  }).catch(err => {
    if (title) title.textContent = '載入失敗';
    if (subtitle) subtitle.innerHTML = `<span class="error">${escapeHtml(err.message)}</span>`;
  });
})();
