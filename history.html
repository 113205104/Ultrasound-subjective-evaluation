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

  function buildRadios() {
    document.querySelectorAll('[data-field]').forEach(card => {
      const field = card.dataset.field;
      const row = card.querySelector('.radio-row');
      row.innerHTML = '';
      APP_CONFIG.ratingScale.forEach(score => {
        const label = document.createElement('label');
        label.className = 'radio-option';
        label.innerHTML = `<input type="radio" name="${field}" value="${score}"><span>${score}</span>`;
        row.appendChild(label);
      });
    });
    document.getElementById('ratingForm').addEventListener('change', saveCurrent);
  }

  function currentImage() { return task.images[current]; }
  function getCurrentRating() { return USE.readLocalRating(reviewer, USE.imageKey(task, currentImage())); }
  function setFormValues(rating) {
    APP_CONFIG.ratingFields.forEach(f => {
      document.querySelectorAll(`input[name="${f.key}"]`).forEach(el => { el.checked = String(rating[f.key] || '') === el.value; });
    });
  }
  function readFormValues() {
    const out = {};
    APP_CONFIG.ratingFields.forEach(f => {
      const checked = document.querySelector(`input[name="${f.key}"]:checked`);
      out[f.key] = checked ? Number(checked.value) : '';
    });
    return out;
  }
  function render() {
    const img = currentImage();
    const total = task.images.length;
    const completed = USE.countCompleted(reviewer, task);
    title.textContent = USE.displayModel(task.model);
    subtitle.textContent = `${reviewer} / ${task.strategy} / ${task.dataset} / ${task.model}`;
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
      imageId: img.id || '', filename: img.filename || '', imageUrl: img.url || img.path || ''
    }, values);
    USE.saveLocalRating(reviewer, USE.imageKey(task, img), payload);
    USE.postToSheet(payload);
    render();
  }
  prevBtn.addEventListener('click', () => { if (current > 0) { current--; render(); } });
  nextBtn.addEventListener('click', () => { if (current < task.images.length - 1) { current++; render(); } });

  buildRadios();
  USE.loadManifest().then(m => {
    manifest = m; task = manifest[taskIndex];
    if (!task) throw new Error('找不到指定任務');
    const saved = USE.readLocalProgress(reviewer, task);
    current = saved && Number.isInteger(saved.currentIndex) ? Math.min(saved.currentIndex, task.images.length - 1) : 0;
    if (!task.images.length) throw new Error('此任務沒有影像，請先執行 build_manifest.py 更新 manifest.json');
    render();
  }).catch(err => {
    title.textContent = '載入失敗';
    subtitle.innerHTML = `<span class="error">${err.message}</span>`;
  });
})();
