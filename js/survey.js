(function () {
  const params = new URLSearchParams(location.search);
  const reviewer = params.get('reviewer') || (APP_CONFIG.reviewers && APP_CONFIG.reviewers[0]) || 'Reviewer1';
  const taskIndex = Number(params.get('task') || 0);

  const taskTitle = document.getElementById('taskTitle');
  const taskSubtitle = document.getElementById('taskSubtitle');
  const progressText = document.getElementById('progressText');
  const progressBar = document.getElementById('progressBar');
  const imageMeta = document.getElementById('imageMeta');
  const tripanelImage = document.getElementById('tripanelImage');
  const form = document.getElementById('ratingForm');
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  const saveProgressBtn = document.getElementById('saveProgressBtn');
  const finalSubmitBtn = document.getElementById('finalSubmitBtn');
  const saveHint = document.getElementById('saveHint');
  const missingPanel = document.getElementById('missingPanel');

  let manifest = [];
  let task = null;
  let images = [];
  let currentIndex = 0;
  let saving = false;

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>\"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  function showHint(text, isError) {
    if (!saveHint) return;
    saveHint.hidden = false;
    saveHint.textContent = text;
    saveHint.style.color = isError ? 'var(--danger)' : 'var(--muted)';
  }

  function setBusy(flag) {
    saving = flag;
    [prevBtn, nextBtn, saveProgressBtn, finalSubmitBtn].forEach(btn => { if (btn) btn.disabled = flag; });
  }

  function currentImage() { return images[currentIndex]; }
  function currentKey() { return USE.imageKey(task, currentImage()); }

  function collectRating() {
    const out = {};
    USE.ratingKeys().forEach(k => {
      const checked = form.querySelector(`input[name="${CSS.escape(k)}"]:checked`);
      out[k] = checked ? checked.value : '';
    });
    return out;
  }

  function applyRating(r) {
    USE.ratingKeys().forEach(k => {
      const v = r && r[k] !== undefined && r[k] !== null ? String(r[k]) : '';
      form.querySelectorAll(`input[name="${CSS.escape(k)}"]`).forEach(input => {
        input.checked = v !== '' && input.value === v;
      });
    });
  }

  function renderForm() {
    form.className = 'rating-form';
    form.innerHTML = APP_CONFIG.ratingFields.map(f => `
      <section class="form-card question-card matrix-card">
        <h2>${escapeHtml(f.label)} <span class="required">*</span></h2>
        <div class="matrix-grid">
          <div class="matrix-corner"></div>
          ${APP_CONFIG.ratingScale.map(score => `<div class="matrix-col-head">${score}</div>`).join('')}
          ${APP_CONFIG.tripanelRows.map(row => `
            <div class="matrix-row">
              <div class="matrix-row-label">${escapeHtml(row.label)}</div>
              ${APP_CONFIG.ratingScale.map(score => {
                const name = `${f.key}_${row.key}`;
                return `<label class="matrix-radio"><input type="radio" name="${escapeHtml(name)}" value="${score}"></label>`;
              }).join('')}
            </div>`).join('')}
        </div>
      </section>
    `).join('');

    // 簡化作答：使用原生 radio 行為。
    // 點一次就是選取；不再支援再次點擊取消，避免快速作答時卡頓或誤清除。
    form.addEventListener('change', e => {
      if (!e.target.matches('input[type="radio"]')) return;
      USE.saveLocalRating(reviewer, currentKey(), collectRating());
      updateProgressUI();
    });
  }

  function updateProgressUI() {
    const total = images.length;
    const completed = USE.countCompleted(reviewer, task);
    if (progressText) progressText.textContent = `${completed} / ${total}`;
    if (progressBar) progressBar.style.width = total ? Math.min(100, Math.round(completed / total * 100)) + '%' : '0%';
    if (finalSubmitBtn) finalSubmitBtn.style.display = (total > 0 && completed >= total) ? 'inline-flex' : 'none';
  }

  function renderImage() {
    if (!task || !images.length) return;
    const image = currentImage();
    const display = USE.displayModel(task.model);
    taskTitle.textContent = `${display}｜${task.strategy}｜${task.dataset}`;
    taskSubtitle.textContent = `Reviewer：${reviewer}`;
    imageMeta.textContent = `第 ${currentIndex + 1} / ${images.length} 張｜${image.filename || image.id || ''}`;
    tripanelImage.src = image.url || image.imageUrl || '';
    tripanelImage.alt = image.filename || 'Tripanel ultrasound image';
    applyRating(USE.readRating(reviewer, currentKey()));
    prevBtn.disabled = currentIndex <= 0;
    nextBtn.disabled = currentIndex >= images.length - 1;
    if (missingPanel) missingPanel.hidden = true;
    updateProgressUI();
  }

  async function saveCurrentToCloud() {
    const rating = collectRating();
    USE.saveLocalRating(reviewer, currentKey(), rating);
    USE.saveLocalProgress(reviewer, task, currentIndex, images.length);
    await USE.saveServerRating(reviewer, task, currentImage(), rating);
    await USE.saveServerProgress(reviewer, task, currentIndex, images.length);
    updateProgressUI();
  }

  async function saveCurrentClicked() {
    if (saving) return;
    setBusy(true);
    try {
      await saveCurrentToCloud();
      showHint('已儲存到 Google Sheet responses 與 progress；更換裝置後選同一位 Reviewer 可繼續作答。', false);
    } catch (err) {
      showHint('儲存失敗：' + err.message, true);
    } finally {
      setBusy(false);
      renderImage();
    }
  }

  async function go(delta) {
    if (saving) return;
    USE.saveLocalRating(reviewer, currentKey(), collectRating());
    USE.saveLocalProgress(reviewer, task, currentIndex, images.length);
    const next = Math.max(0, Math.min(images.length - 1, currentIndex + delta));
    currentIndex = next;
    renderImage();
  }

  function missingIndexes() {
    const out = [];
    images.forEach((img, i) => {
      if (!USE.isCompleteRating(USE.readRating(reviewer, USE.imageKey(task, img)))) out.push(i);
    });
    return out;
  }

  function showMissing(indexes) {
    if (!missingPanel) return;
    missingPanel.hidden = false;
    missingPanel.className = 'form-card question-card missing-card';
    missingPanel.innerHTML = `
      <h2>仍有漏題，請先補完再送出</h2>
      <p class="muted">點選題號可跳到該張影像。</p>
      <div class="missing-jump-list">
        ${indexes.map(i => `<button class="ghost-button missing-jump" type="button" data-index="${i}">第 ${i + 1} 張</button>`).join('')}
      </div>
    `;
    missingPanel.querySelectorAll('[data-index]').forEach(btn => {
      btn.addEventListener('click', () => {
        currentIndex = Number(btn.dataset.index);
        renderImage();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });
  }

  async function finalSubmit() {
    if (saving) return;
    USE.saveLocalRating(reviewer, currentKey(), collectRating());
    const miss = missingIndexes();
    if (miss.length) {
      showMissing(miss);
      showHint(`尚有 ${miss.length} 張未完成 12 格評分，已停止送出。`, true);
      return;
    }

    setBusy(true);
    try {
      for (let i = 0; i < images.length; i++) {
        const img = images[i];
        const rating = USE.readRating(reviewer, USE.imageKey(task, img));
        await USE.saveServerRating(reviewer, task, img, rating);
      }
      await USE.saveServerProgress(reviewer, task, currentIndex, images.length);
      showHint('已確認送出：本任務全部作答結果已更新到 responses、progress 與作答紀錄頁。', false);
      updateProgressUI();
    } catch (err) {
      showHint('確認送出失敗：' + err.message, true);
    } finally {
      setBusy(false);
      renderImage();
    }
  }

  async function init() {
    taskTitle.textContent = 'Loading...';
    try {
      manifest = await USE.loadManifest();
      task = manifest[taskIndex];
      if (!task) throw new Error('找不到指定的評分任務。');
      images = task.images || [];
      await USE.loadServerRatings(reviewer, task);
      renderForm();
      const cloudProgress = USE.readLocalProgress(reviewer, task);
      if (cloudProgress && cloudProgress.currentIndex !== undefined && cloudProgress.currentIndex !== '') {
        currentIndex = Math.max(0, Math.min(images.length - 1, Number(cloudProgress.currentIndex) || 0));
      } else {
        currentIndex = USE.firstIncompleteIndex(reviewer, task, images);
      }
      renderImage();
    } catch (err) {
      taskTitle.textContent = '載入失敗';
      taskSubtitle.textContent = err.message;
    }
  }

  if (prevBtn) prevBtn.addEventListener('click', () => go(-1));
  if (nextBtn) nextBtn.addEventListener('click', () => go(1));
  if (saveProgressBtn) saveProgressBtn.addEventListener('click', saveCurrentClicked);
  if (finalSubmitBtn) finalSubmitBtn.addEventListener('click', finalSubmit);

  init();
})();
