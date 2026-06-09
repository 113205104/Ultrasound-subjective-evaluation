(function () {
  const list = document.getElementById('historyList');
  const reloadBtn = document.getElementById('reloadBtn');
  function val(id) { return document.getElementById(id).value.trim(); }
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
        <h2>${r.displayModel || USE.displayModel(r.model)}　${r.filename || r.imageId || ''}</h2>
        <p class="muted">${r.timestamp || ''} / ${r.reviewer || ''} / ${r.strategy || ''} / ${r.dataset || ''} / ${r.model || ''}</p>
        ${r.imageUrl ? `<img src="${r.imageUrl}" alt="${r.filename || 'Tripanel ultrasound image'}">` : ''}
        <div class="score-grid">
          <div class="score-box"><span>Whole image quality</span>${r.whole_quality || ''}</div>
          <div class="score-box"><span>Noise suppression</span>${r.noise_suppression || ''}</div>
          <div class="score-box"><span>Contrast</span>${r.contrast || ''}</div>
          <div class="score-box"><span>Edge sharpness</span>${r.edge_sharpness || ''}</div>
        </div>`;
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
