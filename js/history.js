(function () {
  const list = document.getElementById('historyList');
  const reloadBtn = document.getElementById('reloadBtn');
  const reviewerFilter = document.getElementById('reviewerFilter');

  USE.populateReviewerSelect(reviewerFilter, true);

  function val(id) {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
  }

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"]/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  function scoreValue(r, key) {
    const v = r[key];
    if (v === undefined || v === null || v === '') {
      return '<span class="muted">未填</span>';
    }
    return escapeHtml(v);
  }

  function questionNoFromRow(r, fallbackIndex) {
    if (r.questionNo !== undefined && r.questionNo !== null && r.questionNo !== '') return r.questionNo;
    const text = String(r.filename || r.imageId || '');
    const m = text.match(/_(\d+)(?:\.[^.]+)?$/);
    return m ? m[1] : String(fallbackIndex + 1);
  }

  function imageLink(r) {
    return r.imageLink || r.webViewUrl || r.imageUrl || '';
  }

  function matrixHtml(r) {
    const shortName = {
      whole_quality: 'Whole',
      noise_suppression: 'Noise',
      contrast: 'Contrast',
      edge_sharpness: 'Edge'
    };
    const head = APP_CONFIG.tripanelRows.map(row => `<div class="head">${escapeHtml(row.key)}</div>`).join('');
    const rows = APP_CONFIG.ratingFields.map(f => {
      const scores = APP_CONFIG.tripanelRows.map(row => scoreValue(r, `${f.key}_${row.key}`)).join('');
      return `<div class="score-label">${escapeHtml(shortName[f.key] || f.label)}</div>${scores}`;
    }).join('');
    return `
      <div class="score-table">
        <div class="head">項目</div>${head}
        ${rows}
      </div>`;
  }

  function renderRows(rows) {
    list.innerHTML = '';

    if (!rows || !rows.length) {
      list.innerHTML = '<section class="form-card history-card"><p class="muted">目前沒有符合條件的作答紀錄。</p></section>';
      return;
    }

    rows.forEach((r, index) => {
      const card = document.createElement('section');
      card.className = 'form-card history-card';

      card.innerHTML = `
        <h2>題號 ${escapeHtml(questionNoFromRow(r, index))}　${escapeHtml(r.displayModel || USE.displayModel(r.model))}</h2>
        <p class="muted">
          Reviewer：${escapeHtml(r.reviewer || '')}
          ｜ Strategy：${escapeHtml(r.strategy || '')}
          ｜ Dataset：${escapeHtml(r.dataset || '')}
          ｜ Model：${escapeHtml(r.model || '')}
        </p>
        <p class="muted">檔名：${escapeHtml(r.filename || r.imageId || '')}</p>
        <p class="muted">最後修改時間：${escapeHtml(r.timestamp || '')}</p>
        ${imageLink(r) ? `<p><a class="image-link" href="${escapeHtml(imageLink(r))}" target="_blank" rel="noopener">查看圖片</a></p>` : ''}
        ${matrixHtml(r)}
      `;

      list.appendChild(card);
    });
  }

  function load() {
    if (!list) return;

    list.innerHTML = '<section class="form-card history-card"><p class="muted">載入中...</p></section>';

    USE.jsonp('listResponses', {
      reviewer: val('reviewerFilter'),
      strategy: val('strategyFilter'),
      dataset: val('datasetFilter'),
      model: val('modelFilter')
    }).then(res => {
      renderRows((res.data && res.data.rows) || res.rows || []);
    }).catch(err => {
      list.innerHTML = `<section class="form-card history-card"><div class="error">無法讀取 Google Sheet：${escapeHtml(err.message)}</div></section>`;
    });
  }

  if (reloadBtn) reloadBtn.addEventListener('click', load);
  if (reviewerFilter) reviewerFilter.addEventListener('change', load);

  ['strategyFilter', 'datasetFilter', 'modelFilter'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter') load();
    });
  });

  load();
})();
