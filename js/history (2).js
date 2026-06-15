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

  // ➔ 精簡版：把單列 wide 評分 (whole_quality_1, whole_quality_2, ...)
  //    拆成 reviewer | filename | imagePosition | ratingItem | score 的長表格列，僅供顯示。
  //    不影響 Sheet 內 responses 的 wide 格式。
  function buildLongRows(r) {
    const filename = r.filename || r.imageId || '';
    const out = [];
    APP_CONFIG.tripanelRows.forEach(posRow => {
      APP_CONFIG.ratingFields.forEach(field => {
        out.push({
          reviewer: r.reviewer || '',
          filename,
          imagePosition: posRow.label,
          ratingItem: field.label,
          score: r[`${field.key}_${posRow.key}`] || ''
        });
      });
    });
    return out;
  }

  function longTableHtml(rows) {
    const flat = rows.flatMap(buildLongRows);
    if (!flat.length) return '<p class="muted">目前沒有符合條件的作答紀錄。</p>';
    const body = flat.map(row => `<tr>
        <td>${escapeHtml(row.reviewer)}</td>
        <td>${escapeHtml(row.filename)}</td>
        <td>${escapeHtml(row.imagePosition)}</td>
        <td>${escapeHtml(row.ratingItem)}</td>
        <td>${escapeHtml(row.score)}</td>
      </tr>`).join('');
    return `<table class="long-history-table" style="width:100%;border-collapse:collapse;font-size:0.9em;">
      <thead><tr>
        <th style="text-align:left;border-bottom:1px solid #ccc;padding:4px 8px;">reviewer</th>
        <th style="text-align:left;border-bottom:1px solid #ccc;padding:4px 8px;">filename</th>
        <th style="text-align:left;border-bottom:1px solid #ccc;padding:4px 8px;">imagePosition</th>
        <th style="text-align:left;border-bottom:1px solid #ccc;padding:4px 8px;">ratingItem</th>
        <th style="text-align:left;border-bottom:1px solid #ccc;padding:4px 8px;">score</th>
      </tr></thead>
      <tbody>${body.replace(/<td>/g, '<td style="padding:4px 8px;border-bottom:1px solid #eee;">')}</tbody>
    </table>`;
  }
  function renderRows(rows) {
    list.innerHTML = '';
    if (!rows || !rows.length) {
      list.innerHTML = '<section class="form-card history-card"><p class="muted">目前沒有符合條件的作答紀錄。</p></section>';
      return;
    }

    const longSection = document.createElement('section');
    longSection.className = 'form-card history-card';
    longSection.innerHTML = `<h2>作答紀錄（精簡版）</h2>${longTableHtml(rows)}`;
    list.appendChild(longSection);

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
