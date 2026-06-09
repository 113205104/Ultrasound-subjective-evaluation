(function () {
  const params = new URLSearchParams(location.search);
  const reviewer = params.get('reviewer') || 'Reviewer1';
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
  const form = document.getElementById('ratingForm');

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>\"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  function buildMatrixQuestion(field) {
    const section = document.createElement('section');
    section.className = 'form-card question-card matrix-card';
    section.dataset.field = field.key;
    const scaleHeaders = APP_CONFIG.ratingScale.map(score => `<div class="matrix-col-head">${score}</div>`).join('');
    const rows = APP_CONFIG.tripanelRows.map(row => {
      const cells = APP_CONFIG.ratingScale.map(score => {
        const name = `${field.key}_${row.key}`;
        const id = `${name}_${score}`;
        return `<label class="matrix-radio" for="${id}">
          <input id="${id}" type="radio" name="${name}" value="${score}" aria-label="${escapeHtml(field.label)} ${escapeHtml(row.label)} ${score}">
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
    form.addEventListener('change', saveCurrent);
  }

  function currentImage() { return task.images[current]; }
  function currentRatingKey() { return USE.imageKey(task, currentImage()); }
  function getCurrentRating() { return USE.readRating(reviewer, currentRatingKey()); }

  function setFormValues(rating) {
    USE.ratingKeys().forEach(k => {
      document.querySelectorAll(`input[name="${k}"]`).forEach(el => { el.checked = String(rating[k] || '') === el.value; });
    });
  }
  function readFormValues() {
    const out = {};
    USE.ratingKeys().forEach(k => {
      const checked = document.querySelector(`input[name="${k}"]:checked`);
      out[k] = checked ? Number(checked.value) : '';
    });
    return out;
  }
  function render() {
    const img = currentImage();
    const total = task.images.length;
    const completed = USE.countCompleted(reviewer, task);
    title.textContent = USE.displayModel(task.model);
    subtitle.textContent = `${reviewer}`;
    progressText.textContent = `${completed} / ${total}`;
    progressBar.style.width = total ? Math.round(completed * 100 / total) + '%' : '0%';
    imageMeta.textContent = `${current + 1} / ${total}　${img.filename || img.id || ''}`;
    image.src = img.url || img.path || '';
    image.alt = img.filename || 'Tripanel ultrasound image';
    prevBtn.disabled = current <= 0;
    nextBtn.disabled = current >= total - 1;
    setFormValues(getCurrentRating());
    USE.saveLocalProgress(reviewer, task, current, total);
    USE.postToSheet({
      action: 'saveProgress', reviewer,
      strategy: task.strategy, dataset: task.dataset, model: task.model,
      displayModel: USE.displayModel(task.model), currentIndex: current, total,
      completed, completedStatus: completed >= total ? 'Completed' : 'In Progress'
    });
  }
  function saveCurrent() {
    const img = currentImage();
    const values = readFormValues();
    const payload = Object.assign({
      action: 'saveRating', reviewer,
      strategy: task.strategy, dataset: task.dataset, model: task.model,
      displayModel: USE.displayModel(task.model),
      imageId: img.id || '', fileId: img.fileId || '', filename: img.filename || '', imageUrl: img.url || img.path || ''
    }, values);
    USE.saveLocalRating(reviewer, currentRatingKey(), payload);
    USE.postToSheet(payload);
    render();
  }
  prevBtn.addEventListener('click', () => { if (current > 0) { current--; render(); } });
  nextBtn.addEventListener('click', () => { if (current < task.images.length - 1) { current++; render(); } });

  buildForm();
  USE.loadManifest().then(async m => {
    manifest = m; task = manifest[taskIndex];
    if (!task) throw new Error('找不到指定任務');
    if (!task.images.length) throw new Error('此任務沒有影像，請確認 Google Drive 資料夾架構與檔名。');
    await USE.loadServerRatings(reviewer, task);
    const saved = USE.readLocalProgress(reviewer, task);
    const suggested = USE.firstIncompleteIndex(reviewer, task);
    current = saved && Number.isInteger(saved.currentIndex) ? Math.min(saved.currentIndex, task.images.length - 1) : suggested;
    if (USE.isCompleteRating(getCurrentRating())) current = suggested;
    render();
  }).catch(err => {
    title.textContent = '載入失敗';
    subtitle.innerHTML = `<span class="error">${err.message}</span>`;
  });
})();
