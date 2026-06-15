const reviewerEl = document.getElementById('reviewer');
const tasksEl = document.getElementById('tasks');
CONFIG.REVIEWERS.forEach(r => reviewerEl.add(new Option(r, r)));
reviewerEl.value = qs('reviewer', CONFIG.REVIEWERS[0]);
reviewerEl.onchange = load;
document.getElementById('reload').onclick = load;

async function load(){
  tasksEl.textContent = 'Loading...';
  try{
    const reviewer = reviewerEl.value;
    const [m, p] = await Promise.all([apiGet('manifest'), apiGet('progress', {reviewer})]);
    const progress = new Map((p.progress||[]).map(x => [x.taskId, x]));
    tasksEl.innerHTML = '';
    (m.tasks||[]).forEach(t => {
      const pr = progress.get(t.taskId) || {};
      const done = Number(pr.completedCount || 0);
      const total = Number(t.total_groups || pr.totalGroups || 0);
      const status = pr.submitted === 'YES' ? 'Submitted' : done ? 'In Progress' : 'Not Started';
      const div = document.createElement('div');
      div.className = 'task';
      div.innerHTML = `<div><b>${t.modelAlias}｜${t.strategy}｜${t.dataset}</b><br><span class="muted">${t.model}　${done} / ${total}　${status}</span></div>
      <div class="actions"><a href="survey.html?reviewer=${encodeURIComponent(reviewer)}&taskId=${encodeURIComponent(t.taskId)}">開始/續作</a><a href="history.html?reviewer=${encodeURIComponent(reviewer)}&taskId=${encodeURIComponent(t.taskId)}">查看作答記錄</a></div>`;
      tasksEl.appendChild(div);
    });
    if (!(m.tasks||[]).length) tasksEl.innerHTML = '<p class="warn">Code.gs 的 CONFIG.tasks 尚未填入 Drive folderId，所以目前沒有任務。</p>';
  }catch(err){ tasksEl.innerHTML = `<p class="warn">${err.message}</p>`; }
}
load();
