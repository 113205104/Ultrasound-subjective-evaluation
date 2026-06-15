let task, reviewer, state, idx = 0;
const img = document.getElementById('img'), form = document.getElementById('form');

init();
async function init(){
  reviewer = qs('reviewer', CONFIG.REVIEWERS[0]);
  const taskId = qs('taskId');
  const m = await apiGet('manifest');
  task = (m.tasks||[]).find(x => x.taskId === taskId);
  if(!task) throw new Error('找不到 taskId');

  state = loadLocal(reviewer, taskId);
  state.answers = state.answers || {};

  // 跨裝置續作：優先讀 Google Sheet responses/progress，再合併 localStorage。
  try{
    const server = await apiGet('history', {reviewer, taskId});
    (server.rows || []).forEach(r => mergeServerRow(r));
  }catch(e){ console.warn('history load failed', e); }

  try{
    const p = await apiGet('progress', {reviewer});
    const pr = (p.progress||[]).find(x => x.taskId === taskId);
    if(pr && pr.currentIndex !== '') idx = Math.min(Number(pr.currentIndex||0), task.images.length-1);
    else idx = Math.min(Number(state.currentIndex||0), task.images.length-1);
  }catch(e){ idx = Math.min(Number(state.currentIndex||0), task.images.length-1); }

  document.getElementById('title').textContent = `${task.modelAlias}｜${task.strategy}｜${task.dataset}`;
  document.getElementById('meta').textContent = `Reviewer：${reviewer}`;
  render();
}

function emptyAns(){ const o={}; CONFIG.CRITERIA.forEach(c=>{o[c.key]={}; CONFIG.PANELS.forEach(p=>o[c.key][p.key]='');}); return o; }
function curImage(){ return task.images[idx]; }
function curAns(){ const g=String(curImage().group); state.answers[g]=state.answers[g]||emptyAns(); return state.answers[g]; }
function persist(){ state.currentIndex=idx; saveLocal(reviewer, task.taskId, state); }

function mergeServerRow(r){
  const g = String(r.questionNo || r.group || '');
  if(!g) return;
  state.answers[g] = state.answers[g] || emptyAns();
  CONFIG.CRITERIA.forEach(c=>CONFIG.PANELS.forEach(p=>{
    const key = `${c.key}_${p.key}`;
    if(r[key] !== undefined && r[key] !== '') state.answers[g][c.key][p.key] = Number(r[key]);
  }));
}

function render(){
  const item = curImage();
  document.getElementById('count').textContent = `${idx+1} / ${task.images.length}`;
  document.getElementById('bar').style.width = `${((idx+1)/task.images.length)*100}%`;
  document.getElementById('imageTitle').textContent = `第 ${idx+1} / ${task.images.length} 張｜${item.file || item.filename}`;
  img.src = item.image_url || item.imageUrl;
  form.innerHTML = '';
  const ans = curAns();
  CONFIG.CRITERIA.forEach(c=>{
    const sec=document.createElement('section'); sec.className='criterion';
    let html=`<h2>${c.label} <span class="warn">*</span></h2><table class="grid"><thead><tr><th></th>${CONFIG.SCORE_VALUES.map(s=>`<th>${s}</th>`).join('')}</tr></thead><tbody>`;
    CONFIG.PANELS.forEach(p=>{
      html += `<tr><td>${p.label}</td>` + CONFIG.SCORE_VALUES.map(s=>`<td><label class="choice"><input type="radio" name="${c.key}_${p.key}" value="${s}" ${Number(ans[c.key]?.[p.key])===s?'checked':''}></label></td>`).join('') + `</tr>`;
    });
    html += '</tbody></table>'; sec.innerHTML=html; form.appendChild(sec);
  });
  form.querySelectorAll('input').forEach(el=>el.addEventListener('change', collect));
  document.getElementById('prev').disabled = idx===0;
  document.getElementById('next').textContent = idx===task.images.length-1 ? '確認完成並送出' : '下一張';
}

function collect(){
  const ans=curAns();
  CONFIG.CRITERIA.forEach(c=>CONFIG.PANELS.forEach(p=>{
    const checked = form.querySelector(`input[name="${c.key}_${p.key}"]:checked`);
    ans[c.key][p.key] = checked ? Number(checked.value) : '';
  }));
  persist();
}
function isCompleteAnswer(a){ return CONFIG.CRITERIA.every(c=>CONFIG.PANELS.every(p=>a[c.key] && a[c.key][p.key]!=='')); }
function allAnswersArray(){
  return task.images.map(item=>Object.assign({
    group:item.group,
    questionNo:item.group,
    file:item.file || item.filename,
    filename:item.filename || item.file,
    fileId:item.fileId,
    imageUrl:item.imageUrl || item.image_url
  }, state.answers[String(item.group)]||emptyAns()));
}
async function save(submit=false){
  collect(); persist();
  const data = await apiPost({action:submit?'submit':'save', reviewer, taskId:task.taskId, currentIndex:idx, answers:allAnswersArray()});
  alert(submit ? '已確認送出，全部作答已更新至試算表與作答記錄。' : '已儲存目前進度，已更新至試算表與作答記錄。');
  return data;
}

document.getElementById('prev').onclick=()=>{collect(); if(idx>0){idx--; persist(); render();}};
document.getElementById('save').onclick=()=>save(false);
document.getElementById('next').onclick=async()=>{
  collect();
  if(idx < task.images.length-1){ idx++; persist(); render(); }
  else{
    const incomplete = allAnswersArray().filter(a=>!isCompleteAnswer(a)).map(a=>a.group);
    if(incomplete.length){ alert('尚有未完成題目：第 '+incomplete.slice(0,20).join(', ')+' 張'); return; }
    await save(true);
    location.href = `history.html?reviewer=${encodeURIComponent(reviewer)}&taskId=${encodeURIComponent(task.taskId)}`;
  }
};
