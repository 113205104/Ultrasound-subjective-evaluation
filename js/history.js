(function () {
  const list = document.getElementById('historyList');
  const reloadBtn = document.getElementById('reloadBtn');
  USE.populateReviewerSelect(document.getElementById('reviewerFilter'), true);
  function val(id) { return document.getElementById(id).value.trim(); }
  function escapeHtml(s) {
    return String(s || '').replace(/[&<>\"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }
  function matrixHtml(r) {
    return '<div class="matrix-history">' + APP_CONFIG.ratingFields.map(f => {
      const rows = APP_CONFIG.tripanelRows.map(row => `<div>${escapeHtml(row.label)}</div><div>${r[`${f.key}_${row.key}`] || ''}</div>`).join('');
      return `<div class="matrix-history-block">
        <div class="matrix-history-title">${escapeHtml(f.label)}</div>
        <div class="matrix-history-grid">
          <div class="head">影像</div><div class="head">分數</div>
          ${rows}
        </div>
      </div>`;
    }).join('') + '</div>';
  }
  function renderRows(rows) {
    list.innerHTML = '';
    if (!rows || !rows.length) {
      list.innerHTML = '<section class="form-card history-card"><p class="muted">目前沒有符合條件的作答紀錄。</p></section>';
      return;
    }
    rows.forEach(r => {
      const card = document.createElement('section');
      card.className = 'form-card history-card';
      card.innerHTML = `
        <h2>${escapeHtml(r.displayModel || USE.displayModel(r.model))}　${escapeHtml(r.filename || r.imageId || '')}</h2>
        <p class="muted">${escapeHtml(r.timestamp || '')} / ${escapeHtml(r.reviewer || '')}</p>
        ${r.imageUrl ? `<img src="${escapeHtml(r.imageUrl)}" alt="${escapeHtml(r.filename || 'Tripanel ultrasound image')}">` : ''}
        ${matrixHtml(r)}`;
      list.appendChild(card);
    });
  }
  function load() {
    list.innerHTML = '<section class="form-card history-card"><p class="muted">載入中...</p></section>';
    USE.jsonp('listResponses', {
      reviewer: val('reviewerFilter'), strategy: val('strategyFilter'), dataset: val('datasetFilter'), model: val('modelFilter')
    }).then(data => renderRows(data.rows || [])).catch(err => {
      list.innerHTML = `<section class="form-card history-card"><div class="error">無法讀取 Google Sheet：${err.message}</div></section>`;
    });
  }
  reloadBtn.addEventListener('click', load);
  load();
})();
