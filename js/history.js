const reviewer = qs('reviewer', CONFIG.REVIEWERS[0]);
const taskId = qs('taskId');
document.getElementById('reload').onclick = load;
load();
async function load(){
  const box = document.getElementById('history');
  box.textContent = 'Loading...';
  try{
    const data = await apiGet('history', {reviewer, taskId});
    document.getElementById('title').textContent = `作答記錄｜${reviewer}`;
    const rows = data.rows || [];
    if(!rows.length){ box.innerHTML = '<p class="warn">目前尚無伺服器端作答記錄。請先在評分頁按「儲存目前進度」。</p>'; return; }
    const scoreCols=[]; CONFIG.CRITERIA.forEach(c=>CONFIG.PANELS.forEach(p=>scoreCols.push(`${c.key}_${p.key}`)));
    let html = `<p>共 ${rows.length} 筆影像記錄。此頁直接讀取 Google Sheet responses。</p>`;
    html += `<table class="historyTable"><thead><tr>`;
    html += `<th>最後修改時間</th><th>Reviewer</th><th>策略</th><th>來源組別</th><th>模型</th><th>顯示</th><th>題號</th><th>圖片連結</th><th>filename</th>`;
    html += scoreCols.map(c=>`<th>${c}</th>`).join('');
    html += `</tr></thead><tbody>`;
    rows.forEach(r=>{
      const imgLink = r.imageUrl ? `<a href="${r.imageUrl}" target="_blank" rel="noopener">圖片</a>` : '';
      html += `<tr>` +
        `<td>${r.timestamp||''}</td>` +
        `<td>${r.reviewer||''}</td>` +
        `<td>${r.strategy||''}</td>` +
        `<td>${r.dataset||''}</td>` +
        `<td>${r.model||''}</td>` +
        `<td>${r.modelAlias||''}</td>` +
        `<td>${r.questionNo||''}</td>` +
        `<td>${imgLink}</td>` +
        `<td>${r.filename||''}</td>` +
        scoreCols.map(c=>`<td>${r[c] ?? ''}</td>`).join('') +
        `</tr>`;
    });
    html += '</tbody></table>'; box.innerHTML = html;
  }catch(err){ box.innerHTML = `<p class="warn">${err.message}</p>`; }
}
