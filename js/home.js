(function () {
  const reviewerSelect = document.getElementById('reviewerSelect');
  const taskList = document.getElementById('taskList');
  let manifest = [];

  function render() {
    const reviewer = reviewerSelect.value;
    taskList.innerHTML = '';
    if (!manifest.length) {
      taskList.innerHTML = '<p class="muted">目前 Google Drive 尚未建立評分任務，或 Apps Script 尚未設定 DRIVE_ROOT_FOLDER_ID。</p>';
      return;
    }
    manifest.forEach((task, idx) => {
      const total = task.images.length;
      const completed = USE.countCompleted(reviewer, task);
      const statusText = total > 0 && completed >= total ? 'Completed' : 'In Progress';
      const a = document.createElement('a');
      a.className = 'primary-button';
      a.href = 'survey.html?' + new URLSearchParams({ reviewer, task: idx }).toString();
      a.textContent = total > 0 && completed > 0 ? '繼續作答' : '開始作答';
      const row = document.createElement('div');
      row.className = 'task-row';
      row.innerHTML = `
        <div>
          <div class="task-title">${USE.displayModel(task.model)}</div>
          <span class="status ${statusText === 'Completed' ? 'completed' : ''}">${completed} / ${total}　${statusText}</span>
        </div>`;
      row.appendChild(a);
      taskList.appendChild(row);
    });
  }

  async function loadAll() {
    taskList.innerHTML = '<p class="muted">正在讀取 Google Drive 任務與 Google Sheet 作答紀錄...</p>';
    try {
      manifest = await USE.loadManifest();
      await USE.loadServerRatings(reviewerSelect.value);
      render();
    } catch (err) {
      taskList.innerHTML = `<div class="error">${err.message}</div>`;
    }
  }

  reviewerSelect.addEventListener('change', loadAll);
  loadAll();
})();
