(function () {
  const reviewerSelect = document.getElementById('reviewerSelect');
  const taskList = document.getElementById('taskList');
  let manifest = [];

  function render() {
    const reviewer = reviewerSelect.value;
    taskList.innerHTML = '';
    if (!manifest.length) {
      taskList.innerHTML = '<p class="muted">目前 manifest.json 尚未建立評分任務。</p>';
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
          <div class="task-meta">${task.strategy} / ${task.dataset} / ${task.model}</div>
          <span class="status ${statusText === 'Completed' ? 'completed' : ''}">${completed} / ${total}　${statusText}</span>
        </div>`;
      row.appendChild(a);
      taskList.appendChild(row);
    });
  }

  reviewerSelect.addEventListener('change', render);
  USE.loadManifest().then(m => { manifest = m; render(); }).catch(err => {
    taskList.innerHTML = `<div class="error">${err.message}</div>`;
  });
})();
