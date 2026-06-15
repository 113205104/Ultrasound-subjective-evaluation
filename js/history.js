(function () {
  const list = document.getElementById('historyList');
  const reloadBtn = document.getElementById('reloadBtn');
  USE.populateReviewerSelect(document.getElementById('reviewerFilter'), true);

  function val(id) {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
  }

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>\"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  function imagePositionLabel(pos) {
    return USE.tripanelRowLabel ? USE.tripanelRowLabel(pos) : (APP_CONFIG.tripanelRows.find(r => r.key === String(pos)) || {}).label || pos;
  }

  // ➔ 精簡版作答記錄表格：reviewer | strategy | dataset | model | filename | imagePosition | whole_quality | noise_suppression | contrast | edge_sharpness
  //    後端 listResponses 直接回傳長表格 rows（每張影像 3 行：第一張/第二張/第三張）。
  function renderTable(rows) {
    list.innerHTML = '';
    if (!rows || !rows.length) {
      list.innerHTML = '<section class="form-card history-card"><p class="muted">目前沒有符合條件的作答紀錄。</p></section>';
      return;
    }

    const ratingFieldKeys = (APP_CONFIG.ratingFields || []).map(f => f.key);
    const ratingFieldLabels = (APP_CONFIG.ratingFields || []).map(f => f.label);

    const headCells = ['Reviewer', 'Strategy', 'Dataset', 'Model', 'Filename', '影像位置']
      .concat(ratingFieldLabels)
      .map(h => `<th>${escapeHtml(h)}</th>`).join('');

    const bodyRows = rows.map(r => {
      const cells = [
        r.reviewer, r.strategy, r.dataset, r.displayModel || USE.displayModel(r.model),
        r.filename || r.imageId || '', imagePositionLabel(r.imagePosition)
      ].map(v => `<td>${escapeHtml(v)}</td>`).join('');
      const scoreCells = ratingFieldKeys.map(k => `<td>${escapeHtml(r[k])}</td>`).join('');
      return `<tr>${cells}${scoreCells}</tr>`;
    }).join('');

    const section = document.createElement('section');
    section.className = 'form-card history-card';
    section.innerHTML = `
      <h2>作答記錄（精簡版）</h2>
      <p class="muted">共 ${rows.length} 列（每張影像對應第一張/第二張/第三張共 3 列）</p>
      <div class="history-table-wrap" style="overflow-x:auto;">
        <table class="history-table" style="width:100%;border-collapse:collapse;font-size:0.9em;">
          <thead><tr>${headCells}</tr></thead>
          <tbody>${bodyRows}</tbody>
        </table>
      </div>`;
    list.appendChild(section);

    section.querySelectorAll('th').forEach(th => {
      th.style.textAlign = 'left';
      th.style.borderBottom = '1px solid #ccc';
      th.style.padding = '4px 8px';
    });
    section.querySelectorAll('td').forEach(td => {
      td.style.padding = '4px 8px';
      td.style.borderBottom = '1px solid #eee';
    });
  }

  function load() {
    list.innerHTML = '<section class="form-card history-card"><p class="muted">載入中...</p></section>';
    USE.jsonp('listResponses', {
      reviewer: val('reviewerFilter'),
      strategy: val('strategyFilter'),
      dataset: val('datasetFilter'),
      model: val('modelFilter')
    }).then(data => renderTable(data.rows || [])).catch(err => {
      list.innerHTML = `<section class="form-card history-card"><div class="error">無法讀取 Google Sheet：${escapeHtml(err.message)}</div></section>`;
    });
  }

  reloadBtn.addEventListener('click', load);
  load();
})();
