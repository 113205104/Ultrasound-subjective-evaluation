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

  function matrixHtml(r) {
    return `
      <div class="matrix-history">
        ${APP_CONFIG.ratingFields.map(f => {
          const rows = APP_CONFIG.tripanelRows.map(row => {
            const key = `${f.key}_${row.key}`;
            return `
              <div>${escapeHtml(row.label)}</div>
              <div>${scoreValue(r, key)}</div>
            `;
          }).join('');

          return `
            <div class="matrix-history-block">
              <div class="matrix-history-title">${escapeHtml(f.label)}</div>
              <div class="matrix-history-grid">
                <div class="head">影像</div>
                <div class="head">分數</div>
                ${rows}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  function renderRows(rows) {
    list.innerHTML = '';

    if (!rows || !rows.length) {
      list.innerHTML = `
        <section class="form-card history-card">
          <p class="muted">目前沒有符合條件的作答紀錄。</p>
        </section>
      `;
      return;
    }

    rows.forEach((r, index) => {
      const card = document.createElement('section');
      card.className = 'form-card history-card';

      card.innerHTML = `
        <h2>題號 ${index + 1}　${escapeHtml(r.displayModel || USE.displayModel(r.model))}</h2>

        <p class="muted">
          Reviewer：${escapeHtml(r.reviewer || '')}
          ｜ Strategy：${escapeHtml(r.strategy || '')}
          ｜ Dataset：${escapeHtml(r.dataset || '')}
          ｜ Model：${escapeHtml(r.model || '')}
        </p>

        <p class="muted">
          檔名：${escapeHtml(r.filename || r.imageId || '')}
        </p>

        <p class="muted">
          時間：${escapeHtml(r.timestamp || '')}
        </p>

        ${r.imageUrl ? `
          <img src="${escapeHtml(r.imageUrl)}"
               alt="${escapeHtml(r.filename || 'Tripanel ultrasound image')}">
        ` : ''}

        ${matrixHtml(r)}
      `;

      list.appendChild(card);
    });
  }

  function load() {
    if (!list) return;

    list.innerHTML = `
      <section class="form-card history-card">
        <p class="muted">載入中...</p>
      </section>
    `;

    USE.jsonp('listResponses', {
      reviewer: val('reviewerFilter'),
      strategy: val('strategyFilter'),
      dataset: val('datasetFilter'),
      model: val('modelFilter')
    }).then(res => {
  renderRows((res.data && res.data.rows) || res.rows || []);
})
})
    }).catch(err => {
      list.innerHTML = `
        <section class="form-card history-card">
          <div class="error">無法讀取 Google Sheet：${escapeHtml(err.message)}</div>
        </section>
      `;
    });
  }

  if (reloadBtn) {
    reloadBtn.addEventListener('click', load);
  }

  if (reviewerFilter) {
    reviewerFilter.addEventListener('change', load);
  }

  ['strategyFilter', 'datasetFilter', 'modelFilter'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;

    el.addEventListener('keydown', e => {
      if (e.key === 'Enter') load();
    });
  });

  window.addEventListener('focus', load);

  load();
})();
