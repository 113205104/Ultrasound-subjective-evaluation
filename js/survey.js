(function () {
  const params = new URLSearchParams(location.search);
  const defaultReviewer = (APP_CONFIG.reviewers && APP_CONFIG.reviewers[0]) || 'Reviewer1';
  const reviewer = params.get('reviewer') || defaultReviewer;
  const taskIndex = Number(params.get('task') || 0);

  let manifest = [];
  let task = null;
  let current = 0;

  const localMemoryDraft = {};
  const touchedImages = new Set();

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

  function hasAnyScore(rating) {
    return USE.ratingKeys().some(k =>
      rating &&
      rating[k] !== undefined &&
      rating[k] !== null &&
      rating[k] !== ''
    );
  }

  function isCompleteRating(rating) {
    return USE.ratingKeys().every(k =>
      rating &&
      rating[k] !== undefined &&
      rating[k] !== null &&
      rating[k] !== ''
    );
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
      if (!task || !task.images[current]) return;

      const imgKey = getImageDraftKey(task.images[current]);
      const values = readFormValues();

      localMemoryDraft[imgKey] = values;
      touchedImages.add(imgKey);

      updateProgressDisplay();
    });
  }

  function setFormValues(rating) {
    if (!form) return;

    USE.ratingKeys().forEach(k => {
      const radios = form.querySelectorAll(`input[name="${CSS.escape(k)}"]`);
      radios.forEach(radio => {
        radio.checked = false;
      });
    });

    if (!rating) return;

    USE.ratingKeys().forEach(k => {
      const targetValue = rating[k];

      if (targetValue === undefined || targetValue === null || targetValue === '') return;

      const radio = form.querySelector(
        `input[name="${CSS.escape(k)}"][value="${CSS.escape(String(targetValue))}"]`
      );

      if (radio) radio.checked = true;
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

  function countCompletedFromDraft() {
    if (!task || !task.images) return 0;

    return task.images.filter(img => {
      const imgKey = getImageDraftKey(img);
      return isCompleteRating(localMemoryDraft[imgKey]);
    }).length;
  }

  function updateProgressDisplay() {
    if (!task || !task.images) return;

    const completed = countCompletedFromDraft();
    const total = task.images.length;

    if (progressText) progressText.textContent = `${completed} / ${total}`;
    if (progressBar) {
      progressBar.style.width = total ? Math.round(completed * 100 / total) + '%' : '0%';
    }
  }

  async function saveAllToCloud(isFinal = false) {
    if (!task || !task.images[current]) return;

    showHint('正在儲存目前已作答內容...');

    const currentImg = task.images[current];
    const currentImgKey = getImageDraftKey(currentImg);
    const currentValues = readFormValues();

    if (hasAnyScore(currentValues)) {
      localMemoryDraft[currentImgKey] = currentValues;
      touchedImages.add(currentImgKey);
    }

    const promises = [];
    let savedCount = 0;

    task.images.forEach((img, idx) => {
      const imgKey = getImageDraftKey(img);
      const ratingData = localMemoryDraft[imgKey];

      if (!touchedImages.has(imgKey)) return;
      if (!hasAnyScore(ratingData)) return;

      const payload = makePayloadForImage(idx, ratingData);
      const storageKey = USE.imageKey(task, img);

      USE.saveLocalRating(reviewer, storageKey, payload);
      promises.push(USE.postToSheet(payload));

      savedCount++;
    });

    const completed = countCompletedFromDraft();

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
      completed,
      completedStatus: completed >= task.images.length ? 'Completed' : 'In Progress'
    }));

    await Promise.all(promises);

    updateProgressDisplay();

    if (!isFinal) {
      showHint(`💾 儲存完成：已寫入 ${savedCount} 題作答紀錄，並儲存目前進度。`);
    }
  }

  function missingIndices() {
    const missing = [];

    task.images.forEach((img, idx) => {
      const imgKey = getImageDraftKey(img);
      if (!isCompleteRating(localMemoryDraft[imgKey])) {
        missing.push(idx);
      }
    });

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
        <h2 style="color:#d32f2f;">⚠️ 尚有 ${missing.length} 張未完成</h2>
        <p class="muted">請點選下方題號補齊。</p>
        <div class="missing-jump-list">
          ${missing.map(i =>
            `<button type="button" class="ghost-button missing-jump" data-index="${i}">第 ${i + 1} 張</button>`
          ).join('')}
        </div>
      </section>`;

    missingPanel.querySelectorAll('.missing-jump').forEach(btn => {
      btn.addEventListener('click', () => {
        const imgKey = getImageDraftKey(task.images[current]);
        const values = readFormValues();

        if (hasAnyScore(values)) {
          localMemoryDraft[imgKey] = values;
          touchedImages.add(imgKey);
        }

        current = Number(btn.dataset.index);
        render();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });
  }

  async function handleFinalSubmit() {
    await saveAllToCloud(true);

    const missing = missingIndices();

    if (missing.length) {
      renderMissingPanel(missing);
      showHint(`已儲存目前作答，但尚有 ${missing.length} 張未完成。`);
      return;
    }

    renderMissingPanel([]);
    showHint('🎉 本任務已完成並送出。');

    setTimeout(() => {
      location.href = 'index.html';
    }, 1200);
  }

  function render() {
    if (!task || !task.images.length) return;

    const img = task.images[current];
    const total = task.images.length;
    const imgKey = getImageDraftKey(img);

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

    setFormValues(localMemoryDraft[imgKey] || {});
    updateProgressDisplay();
    showHint('');
  }

  function saveCurrentIfAnswered() {
    if (!task || !task.images[current]) return;

    const imgKey = getImageDraftKey(task.images[current]);
    const values = readFormValues();

    if (hasAnyScore(values)) {
      localMemoryDraft[imgKey] = values;
      touchedImages.add(imgKey);
    }
  }

  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      if (current <= 0) return;
      saveCurrentIfAnswered();
      current--;
      render();
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      if (current >= task.images.length - 1) return;
      saveCurrentIfAnswered();
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

    if (!task) throw new Error('找不到指定任務。');

    await USE.loadServerRatings(reviewer, task);

    task.images.forEach(img => {
      const serverKey = USE.imageKey(task, img);
      const imgKey = getImageDraftKey(img);
      const serverRating = USE.readRating(reviewer, serverKey);

      if (hasAnyScore(serverRating)) {
        localMemoryDraft[imgKey] = serverRating;
      }
    });

    try {
      const result = await USE.jsonp('loadProgressAndRatings', {
        reviewer,
        strategy: task.strategy,
        dataset: task.dataset,
        model: task.model
      });

      const progress = result && result.data && result.data.progress;

      if (progress && progress.currentIndex !== undefined && progress.currentIndex !== '') {
        current = Number(progress.currentIndex);
      } else {
        current = USE.firstIncompleteIndex(reviewer, task);
      }
    } catch (_) {
      current = USE.firstIncompleteIndex(reviewer, task);
    }

    if (Number.isNaN(current) || current < 0) current = 0;
    if (current >= task.images.length) current = task.images.length - 1;

    updateProgressDisplay();
    render();
  }).catch(err => {
    if (title) title.textContent = '載入失敗';
    if (subtitle) subtitle.innerHTML = `<span class="error">${escapeHtml(err.message)}</span>`;
  });
})();
