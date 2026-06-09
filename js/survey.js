const params = new URLSearchParams(window.location.search);

const reviewer = params.get("reviewer");
const strategy = params.get("strategy");
const dataset = params.get("dataset");
const model = params.get("model");

const modelDisplay = CONFIG.MODEL_MAP[model] || model;

const METRICS = [
  "Whole image quality",
  "Noise suppression",
  "Contrast",
  "Edge sharpness"
];

const IMAGE_POSITIONS = ["第一張", "第二張", "第三張"];
const SCORES = [1, 2, 3, 4];
const GROUPS_PER_PAGE = 5;

let manifestData = [];
let task = null;
let page = 0;
let responses = {};

document.getElementById("taskTitle").textContent = modelDisplay;
document.getElementById("taskInfo").textContent =
  `${reviewer} / ${strategy} / ${dataset}`;

function goHome() {
  window.location.href = "index.html";
}

async function loadTask() {
  const res = await fetch("manifest.json");
  manifestData = await res.json();

  task = manifestData.find(t =>
    t.strategy === strategy &&
    t.dataset === dataset &&
    t.model === model
  );

  if (!task) {
    document.getElementById("surveyArea").innerHTML =
      "<p>找不到此任務，請回首頁。</p>";
    return;
  }

  renderPage();
}

function imagePath(img) {
  return `images/${strategy}/${dataset}/${model}/${img.file}`;
}

function responseKey(group, metric, position) {
  return `${reviewer}|${strategy}|${dataset}|${model}|${group}|${metric}|${position}`;
}

function renderPage() {
  const start = page * GROUPS_PER_PAGE;
  const end = Math.min(start + GROUPS_PER_PAGE, task.images.length);
  const images = task.images.slice(start, end);

  const area = document.getElementById("surveyArea");
  area.innerHTML = "";

  images.forEach(img => {
    const groupText = String(img.group).padStart(3, "0");

    const card = document.createElement("div");
    card.className = "task-card";

    card.innerHTML = `
      <div class="task-title">${modelDisplay} 組別${groupText}</div>
      <div class="task-meta">${img.file}</div>
      <img src="${imagePath(img)}" style="width:100%;max-width:900px;margin:16px 0;border:1px solid #ccc;">
    `;

    METRICS.forEach(metric => {
      const block = document.createElement("div");
      block.className = "metric-block";

      const title = document.createElement("div");
      title.className = "metric-title";
      title.textContent = `${groupText}. ${metric}`;
      block.appendChild(title);

      const table = document.createElement("table");
      table.className = "rating-table";

      let html = "<tr><th>影像</th>";
      SCORES.forEach(s => html += `<th>${s}</th>`);
      html += "</tr>";

      IMAGE_POSITIONS.forEach(pos => {
        html += `<tr><td>${pos}</td>`;

        SCORES.forEach(score => {
          const key = responseKey(groupText, metric, pos);
          const checked = responses[key] == score ? "checked" : "";

          html += `
            <td>
              <input type="radio"
                     name="${key}"
                     value="${score}"
                     ${checked}
                     onchange="saveLocal('${key}', '${score}')">
            </td>
          `;
        });

        html += "</tr>";
      });

      table.innerHTML = html;
      block.appendChild(table);
      card.appendChild(block);
    });

    area.appendChild(card);
  });

  document.getElementById("pageInfo").textContent =
    `第 ${page + 1} / ${Math.ceil(task.images.length / GROUPS_PER_PAGE)} 頁`;

  document.getElementById("prevBtn").disabled = page === 0;
  document.getElementById("nextBtn").disabled =
    page >= Math.ceil(task.images.length / GROUPS_PER_PAGE) - 1;
}

function saveLocal(key, score) {
  responses[key] = score;
  localStorage.setItem("responses", JSON.stringify(responses));
}

document.getElementById("prevBtn").onclick = () => {
  if (page > 0) {
    page--;
    renderPage();
    window.scrollTo(0, 0);
  }
};

document.getElementById("nextBtn").onclick = () => {
  if (page < Math.ceil(task.images.length / GROUPS_PER_PAGE) - 1) {
    page++;
    renderPage();
    window.scrollTo(0, 0);
  }
};

const saved = localStorage.getItem("responses");
if (saved) {
  responses = JSON.parse(saved);
}

loadTask();
