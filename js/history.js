(function () {
  const list = document.getElementById('historyList');
  const reloadBtn = document.getElementById('reloadBtn');
  USE.populateReviewerSelect(document.getElementById('reviewerFilter'), true);

  function val(id) {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
  }

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  // answer_log 新格式：每一題/每一張 tripanel 影像只佔一列；12 個評分欄位展開為「項目+張數」。
  function renderTable(rows) {
    list.innerHTML = '';
    if (!rows || !rows.length) {
      list.innerHTML = '<section class="form-card history-card"><p class="muted">目前沒有符合條件的作答紀錄。</p></section>';
      return;
    }

    const cols = [
      'reviewer', 'strategy', 'dataset', 'model', 'filename', 'questionNo',
      'whole_quality1', 'whole_quality2', 'whole_quality3',
      'noise_suppression1', 'noise_suppression2', 'noise_suppression3',
      'contrast1', 'contrast2', 'contrast3',
      'edge_sharpness1', 'edge_sharpness2', 'edge_sharpness3'
    ];
    const labels = [
      'Reviewer', 'Strategy', 'Dataset', 'Model', 'Filename', 'Question No',
      'whole_quality1', 'whole_quality2', 'whole_quality3',
      'noise_suppression1', 'noise_suppression2', 'noise_suppression3',
      'contrast1', 'contrast2', 'contrast3',
      'edge_sharpness1', 'edge_sharpness2', 'edge_sharpness3'
    ];

    const headCells = labels.map(h => `<th>${escapeHtml(h)}</th>`).join('');
    const bodyRows  = rows.map(r =>
      '<tr>' + cols.map(k => `<td>${escapeHtml(r[k])}</td>`).join('') + '</tr>'
    ).join('');

    const section = document.createElement('section');
    section.className = 'form-card history-card';
    section.innerHTML = `
      <h2>作答記錄（answer_log）</h2>
      <p class="muted">共 ${rows.length} 列；每列為一題，12 個評分欄位已展開。</p>
      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;font-size:0.9em;">
          <thead><tr>${headCells}</tr></thead>
          <tbody>${bodyRows}</tbody>
        </table>
      </div>`;
    list.appendChild(section);

    section.querySelectorAll('th').forEach(th => {
      th.style.cssText = 'text-align:left;border-bottom:2px solid #ccc;padding:6px 10px;white-space:nowrap;';
    });
    section.querySelectorAll('td').forEach(td => {
      td.style.cssText = 'padding:5px 10px;border-bottom:1px solid #eee;white-space:nowrap;';
    });
  }

  function load() {
    list.innerHTML = '<section class="form-card history-card"><p class="muted">載入中...</p></section>';
    USE.jsonp('listAnswerLog', {
      reviewer: val('reviewerFilter'),
      strategy: val('strategyFilter'),
      dataset:  val('datasetFilter'),
      model:    val('modelFilter')
    }).then(data => renderTable(data.rows || [])).catch(err => {
      list.innerHTML = `<section class="form-card history-card"><div class="error">無法讀取 Google Sheet：${escapeHtml(err.message)}</div></section>`;
    });
  }

  reloadBtn.addEventListener('click', load);
  load();
})();

