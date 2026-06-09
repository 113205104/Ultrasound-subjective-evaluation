const reviewerSelect = document.getElementById("reviewer");
const taskList = document.getElementById("taskList");

CONFIG.REVIEWERS.forEach(reviewer => {
  const option = document.createElement("option");
  option.value = reviewer;
  option.textContent = reviewer;
  reviewerSelect.appendChild(option);
});

async function loadManifest() {
  const res = await fetch("manifest.json");
  const tasks = await res.json();
  renderTasks(tasks);
}

function renderTasks(tasks) {
  taskList.innerHTML = "";

  const grouped = {};

  tasks.forEach(task => {
    if (!grouped[task.strategy]) grouped[task.strategy] = {};
    if (!grouped[task.strategy][task.dataset]) grouped[task.strategy][task.dataset] = [];
    grouped[task.strategy][task.dataset].push(task);
  });

  Object.keys(grouped).forEach(strategy => {
    const section = document.createElement("div");
    section.className = "task-section";

    const title = document.createElement("h3");
    title.textContent = strategy;
    section.appendChild(title);

    Object.keys(grouped[strategy]).forEach(dataset => {
      const datasetTitle = document.createElement("h4");
      datasetTitle.textContent = dataset;
      section.appendChild(datasetTitle);

      grouped[strategy][dataset].forEach(task => {
        const modelDisplay = CONFIG.MODEL_MAP[task.model] || task.model;

        const card = document.createElement("div");
        card.className = "task-card";

        card.innerHTML = `
          <div class="task-title">${modelDisplay}</div>
          <div class="task-meta">${task.strategy} / ${task.dataset}</div>
          <button onclick="startSurvey('${task.strategy}', '${task.dataset}', '${task.model}')">
            開始 / 繼續評分
          </button>
        `;

        section.appendChild(card);
      });
    });

    taskList.appendChild(section);
  });
}

function startSurvey(strategy, dataset, model) {
  const reviewer = reviewerSelect.value;

  if (!reviewer) {
    alert("請先選擇 Reviewer");
    return;
  }

  alert(
    "下一步會進入評分頁：\\n" +
    reviewer + "\\n" +
    strategy + " / " + dataset + " / " + model
  );
}

loadManifest();
