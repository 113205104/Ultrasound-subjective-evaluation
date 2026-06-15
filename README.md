<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>History | Ultrasound Subjective Evaluation</title>
  <link rel="stylesheet" href="css/style.css" />
</head>
<body>
  <div class="forms-topbar"></div>

  <main class="page-shell">
    <section class="form-card form-header compact">
      <a class="back-link" href="index.html">← 回首頁</a>
      <h1>作答紀錄</h1>
      <p>可依 Reviewer、Strategy、Dataset、Model 查詢每題作答結果，方便人工核對或備份輸入 SPSS。</p>
    </section>

    <section class="form-card question-card filter-card">
      <div class="filter-grid">
        <label>
          Reviewer
          <select id="reviewerFilter" class="select-input"></select>
        </label>

        <label>
          Strategy
          <input id="strategyFilter" class="text-input" placeholder="例如 Unsupervised" />
        </label>

        <label>
          Dataset
          <input id="datasetFilter" class="text-input" placeholder="例如 v7-only" />
        </label>

        <label>
          Model
          <input id="modelFilter" class="text-input" placeholder="cut / cyc / fast / p2p / reg" />
        </label>
      </div>

      <button id="reloadBtn" class="primary-button" type="button">查詢 / 重新載入</button>
    </section>

    <section id="historyList" class="history-list" aria-live="polite"></section>
  </main>

  <script src="js/config.js"></script>
  <script src="js/admin.js"></script>
  <script src="js/history.js"></script>
</body>
</html>
