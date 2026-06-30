(function () {
  const reviewerSelect = document.getElementById('reviewerSelect');
  const taskList = document.getElementById('taskList');
  const refreshBtn = document.getElementById('refreshTaskListBtn');
  let manifest = [];
  USE.populateReviewerSelect(reviewerSelect, false);

  // 只新增分組顯示用的樣式，不更動 css/style.css 檔案本身。
  function injectGroupingStyles() {
    if (document.getElementById('homeGroupingStyles')) return;
    const style = document.createElement('style');
    style.id = 'homeGroupingStyles';
    style.textContent = `
      .strategy-group { margin-bottom: 28px; }
      .strategy-group + .strategy-group {
        margin-top: 8px;
        padding-top: 24px;
        border-top: 2px solid #e0e0e0;
      }
      .strategy-header {
        font-size: 1.05rem;
        font-weight: 700;
        color: #37474f;
        margin-bottom: 14px;
        padding-left: 10px;
        border-left: 4px solid #673ab7;
      }
      .dataset-group { margin-left: 16px; margin-bottom: 16px; }
      .dataset-group + .dataset-group { margin-top: 16px; }
      .dataset-header {
        font-size: 0.92rem;
        font-weight: 600;
        color: #607d8b;
        margin-bottom: 10px;
        padding-left: 8px;
        border-left: 3px solid #b39ddb;
      }
      .model-rows { margin-left: 10px; display: flex; flex-direction: column; gap: 12px; }
    `;
    document.head.appendChild(style);
  }

  // 與原本完全相同的單一任務列建立邏輯，僅抽成函式以便分組重複使用。
  function buildTaskRow(task, idx, reviewer) {
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
    return row;
  }

  // 依 Drive 資料夾層級（strategy -> dataset）將原始 manifest 任務分組，
  // 僅用於顯示排版，不影響任務本身的索引（idx）或任何作答資料。
  function groupManifest(tasks) {
    const strategyOrder = [];
    const strategyMap = new Map();

    tasks.forEach((task, idx) => {
      const strategyKey = task.strategy || '';
      if (!strategyMap.has(strategyKey)) {
        strategyMap.set(strategyKey, { strategy: strategyKey, datasetOrder: [], datasetMap: new Map() });
        strategyOrder.push(strategyKey);
      }
      const sGroup = strategyMap.get(strategyKey);

      const datasetKey = task.dataset || '';
      if (!sGroup.datasetMap.has(datasetKey)) {
        sGroup.datasetMap.set(datasetKey, []);
        sGroup.datasetOrder.push(datasetKey);
      }
      sGroup.datasetMap.get(datasetKey).push({ task, idx });
    });

    return strategyOrder.map(strategyKey => {
      const sGroup = strategyMap.get(strategyKey);
      return {
        strategy: sGroup.strategy,
        datasets: sGroup.datasetOrder.map(datasetKey => ({
          dataset: datasetKey,
          items: sGroup.datasetMap.get(datasetKey)
        }))
      };
    });
  }

  function render() {
    const reviewer = reviewerSelect.value;
    taskList.innerHTML = '';
    if (!manifest.length) {
      taskList.innerHTML = '<p class="muted">目前 Google Drive 尚未建立評分任務，或 Apps Script 尚未設定 DRIVE_ROOT_FOLDER_ID。</p>';
      return;
    }

    injectGroupingStyles();

    const groups = groupManifest(manifest);
    groups.forEach(group => {
      const strategySection = document.createElement('div');
      strategySection.className = 'strategy-group';

      const strategyHeader = document.createElement('div');
      strategyHeader.className = 'strategy-header';
      strategyHeader.textContent = 'Strategy：' + group.strategy;
      strategySection.appendChild(strategyHeader);

      group.datasets.forEach(datasetGroup => {
        const datasetBlock = document.createElement('div');
        datasetBlock.className = 'dataset-group';

        const datasetHeader = document.createElement('div');
        datasetHeader.className = 'dataset-header';
        datasetHeader.textContent = 'Dataset：' + datasetGroup.dataset;
        datasetBlock.appendChild(datasetHeader);

        const modelRows = document.createElement('div');
        modelRows.className = 'model-rows';
        datasetGroup.items.forEach(({ task, idx }) => {
          modelRows.appendChild(buildTaskRow(task, idx, reviewer));
        });
        datasetBlock.appendChild(modelRows);

        strategySection.appendChild(datasetBlock);
      });

      taskList.appendChild(strategySection);
    });
  }

  async function loadAll(forceReload) {
    taskList.innerHTML = '<p class="muted">正在讀取 Google Drive 任務與 Google Sheet 作答紀錄...</p>';
    try {
      manifest = forceReload ? await USE.reloadManifest() : await USE.loadManifest();
      await USE.loadServerRatings(reviewerSelect.value);
      render();
    } catch (err) {
      taskList.innerHTML = `<div class="error">${err.message}</div>`;
    }
  }

  // 「重新整理任務列表」：同時清掉前端 sessionStorage 快取與 GAS 端的 CacheService 快取，
  // 強迫重新掃描 Google Drive，避免新增資料夾後要等 10 分鐘或手動清瀏覽器快取才看得到。
  if (refreshBtn) {
    refreshBtn.addEventListener('click', async () => {
      refreshBtn.disabled = true;
      const originalText = refreshBtn.textContent;
      refreshBtn.textContent = '重新整理中...';
      try {
        await loadAll(true);
      } finally {
        refreshBtn.disabled = false;
        refreshBtn.textContent = originalText;
      }
    });
  }

  reviewerSelect.addEventListener('change', () => loadAll(false));
  loadAll(false);
})();

