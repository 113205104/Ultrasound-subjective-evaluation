(function () {
  const cfg = window.APP_CONFIG;
  const serverRatings = {};
  
  // 核心快取
  const mergedCache = {};
  function invalidateMergedCache(reviewer) { delete mergedCache[reviewer]; }

  function encodeQuery(params) {
    return Object.keys(params)
      .filter(k => params[k] !== undefined && params[k] !== null && params[k] !== '')
      .map(k => encodeURIComponent(k) + '=' + encodeURIComponent(params[k]))
      .join('&');
  }

  function taskKey(task) { return [task.strategy, task.dataset, task.model].join('||'); }
  function imageStableId(image) { return image.id || image.fileId || image.filename || image.url; }
  function imageKey(task, image) { return [taskKey(task), imageStableId(image)].join('||'); }
  function displayModel(model) { return (cfg.modelDisplayMap && cfg.modelDisplayMap[model]) || model; }

  function ratingKeys() {
    const rows = cfg.tripanelRows || [{ key: '1' }, { key: '2' }, { key: '3' }];
    return (cfg.ratingFields || []).flatMap(f => rows.map(r => `${f.key}_${r.key}`));
  }

  function localRatingsKey(reviewer) { return 'use_ratings_' + reviewer; }
  function localProgressKey(reviewer) { return 'use_progress_' + reviewer; }
  function getJson(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch (_) { return fallback; } }
  function setJson(key, value) { localStorage.setItem(key, JSON.stringify(value)); }

  function saveLocalRating(reviewer, key, data) {
    const all = getJson(localRatingsKey(reviewer), {});
    const prev = all[key] || {};
    const rkeys = ratingKeys();
    rkeys.forEach(k => { delete prev[k]; });
    all[key] = Object.assign({}, prev, data, { draftUpdatedAt: new Date().toISOString() });
    setJson(localRatingsKey(reviewer), all);
    invalidateMergedCache(reviewer);
  }
  function readLocalRating(reviewer, key) { return getJson(localRatingsKey(reviewer), {})[key] || {}; }

  function saveLocalProgress(reviewer, task, currentIndex, total) {
    const all = getJson(localProgressKey(reviewer), {});
    const completed = countCompleted(reviewer, task);
    all[taskKey(task)] = { currentIndex, total, completed, updatedAt: new Date().toISOString() };
    setJson(localProgressKey(reviewer), all);
  }
  function readLocalProgress(reviewer, task) { return getJson(localProgressKey(reviewer), {})[taskKey(task)] || null; }

  // ➔ 放行防線：允許沒選滿 12 格的草稿在任何地方正常讀取還原
  function isCompleteRating(r) {
    return true; 
  }

  // 確保只有在真正沒有快取時才解析一次硬碟
  function mergedRatings(reviewer) {
    if (!(reviewer in mergedCache) || !mergedCache[reviewer]) {
      mergedCache[reviewer] = Object.assign({}, serverRatings[reviewer] || {}, getJson(localRatingsKey(reviewer), {}));
    }
    return mergedCache[reviewer];
  }
  function readRating(reviewer, key) { return mergedRatings(reviewer)[key] || {}; }

  // 計算完美填滿 12 格的圖片數量 (用來展示給進度條看)
  function countCompleted(reviewer, task) {
    const all = mergedRatings(reviewer);
    return task.images.filter(img => {
      const key = imageKey(task, img);
      const r = all[key];
      if (!r) return false;
      return ratingKeys().every(keyName => r[keyName] !== undefined && r[keyName] !== null && r[keyName] !== '');
    }).length;
  }

  // 進網頁時，依照原本系統預設的機制尋找第一個沒填滿分數的格子
  function firstIncompleteIndex(reviewer, task) {
    const allRatings = mergedRatings(reviewer); 
    for (let i = 0; i < task.images.length; i++) {
      const key = imageKey(task, task.images[i]);
      const r = allRatings[key] || {};
      const isAllFilled = ratingKeys().every(keyName => r[keyName] !== undefined && r[keyName] !== null && r[keyName] !== '');
      if (!isAllFilled) return i; 
    }
    return Math.max(task.images.length - 1, 0);
  }

  function postToSheet(payload) {
    if (!cfg.appsScriptUrl) return Promise.resolve(false);
    const body = new URLSearchParams(payload);
    return fetch(cfg.appsScriptUrl, { method: 'POST', mode: 'no-cors', body }).then(() => true).catch(() => false);
  }

  function jsonp(action, params) {
    return new Promise((resolve, reject) => {
      if (!cfg.appsScriptUrl) return reject(new Error('Apps Script URL 未設定'));
      const cb = 'jsonp_' + Date.now() + '_' + Math.random().toString(36).slice(2);
      const script = document.createElement('script');
      let timer;
      window[cb] = function (data) { cleanup(); resolve(data); };
      function cleanup() { clearTimeout(timer); delete window[cb]; script.remove(); }
      script.onerror = function () { cleanup(); reject(new Error('JSONP request failed')); };
      timer = setTimeout(() => { cleanup(); reject(new Error('JSONP request timeout')); }, 30000);
      script.src = cfg.appsScriptUrl + '?' + encodeQuery(Object.assign({}, params || {}, { action, callback: cb, _t: Date.now() }));
      document.body.appendChild(script);
    });
  }

  // ─── Manifest 本地快取 ───────────────────────────────────────────────────────
  // GAS 端有 CacheService 快取（10 分鐘），但 JSONP 本身仍需一次 HTTP 往返。
  // 前端再加一層 sessionStorage 快取，同一 session 換模型時直接命中，0 delay。
  const MANIFEST_SESSION_KEY = 'use_manifest_session_v1';
  let _manifestMemory = null; // in-memory，頁面刷新前不再請求

  async function loadManifest() {
    if (_manifestMemory) return _manifestMemory;
    const sessRaw = sessionStorage.getItem(MANIFEST_SESSION_KEY);
    if (sessRaw) {
      try {
        _manifestMemory = JSON.parse(sessRaw);
        return _manifestMemory;
      } catch(e) {}
    }
    if (cfg.manifestSource === 'drive') {
      const data = await jsonp('loadManifest', {});
      if (!data.success) throw new Error(data.error || 'Google Drive manifest 載入失敗');
      _manifestMemory = normalizeManifest(data.data.manifest || []);
    } else {
      const res = await fetch((cfg.manifestPath || 'manifest.json') + '?v=' + Date.now(), { cache: 'no-store' });
      if (!res.ok) throw new Error('manifest.json 載入失敗');
      _manifestMemory = normalizeManifest(await res.json());
    }
    try { sessionStorage.setItem(MANIFEST_SESSION_KEY, JSON.stringify(_manifestMemory)); } catch(e) {}
    return _manifestMemory;
  }

  // 強制重新掃 Drive（換模型後如果需要刷新，可在 home.js 呼叫 USE.reloadManifest()）
  async function reloadManifest() {
    _manifestMemory = null;
    sessionStorage.removeItem(MANIFEST_SESSION_KEY);
    if (cfg.manifestSource === 'drive') {
      // 同步通知 GAS 清掉 CacheService 快取
      await jsonp('bustManifestCache', {}).catch(() => {});
    }
    return loadManifest();
  }

  // ─── Batch save ─────────────────────────────────────────────────────────────
  // 把 task 內所有有作答的圖片整理成一個 rows 陣列，送出單次 POST。
  // 呼叫者：survey.js 的 saveAllToCloud()
  function buildBatchPayload(reviewer, task, localMemoryDraft, current) {
    const rows = [];
    task.images.forEach((img, idx) => {
      const imgKey = img.id || img.filename;
      const ratingData = localMemoryDraft[imgKey];
      if (!ratingData) return;
      const hasAnswer = ratingKeys().some(k => ratingData[k] !== undefined && ratingData[k] !== null && ratingData[k] !== '');
      if (!hasAnswer) return;

      const row = Object.assign({
        reviewer,
        strategy: task.strategy, dataset: task.dataset, model: task.model,
        displayModel: displayModel(task.model),
        imageId:   img.id       || img.fileId || img.filename || '',
        fileId:    img.fileId   || '',
        filename:  img.filename || '',
        imageUrl:  img.url      || img.path   || '',
        imageLink: img.imageLink || img.webViewUrl || '',
        questionNo: img.questionNo || img.number || ''
      }, ratingData);
      rows.push(row);
    });
    return rows;
  }

  // ─── Batch save + JSONP 確認 ────────────────────────────────────────────────
  // 流程：
  //   1. fetch no-cors POST 送出全部 rows（GAS 端用 setValues 一次寫完）
  //   2. 等 1.5 秒後，用 JSONP GET 呼叫 countSaved，比對 GAS 實際存了幾筆
  //   3. 如果筆數不符（網路錯誤或 GAS timeout），自動重試最多 MAX_RETRY 次
  //   4. 回傳 { ok: true/false, saved: N, expected: N, attempts: N }
  //      讓 survey.js 決定要不要顯示警告

  const BATCH_CONFIRM_DELAY = 1500; // ms，等 GAS 寫完再查
  const BATCH_MAX_RETRY     = 2;

  function postBatchToSheet(reviewer, task, rows, currentIndex, completedCount) {
    if (!cfg.appsScriptUrl) return Promise.resolve({ ok: false, error: 'no_url' });

    var imageIds = rows.map(function(r) { return r.imageId || r.filename || ''; }).filter(Boolean).join(',');
    var expected = rows.length;

    var body = new URLSearchParams({
      action: 'saveBatchRating',
      reviewer: reviewer,
      strategy: task.strategy,
      dataset:  task.dataset,
      model:    task.model,
      displayModel: displayModel(task.model),
      rows: JSON.stringify(rows),
      progressCurrentIndex:    currentIndex,
      progressTotal:           task.images.length,
      progressCompleted:       completedCount,
      progressCompletedStatus: completedCount >= task.images.length ? 'Completed' : 'In Progress'
    });

    function doPost() {
      return fetch(cfg.appsScriptUrl, { method: 'POST', mode: 'no-cors', body: body }).catch(function() {});
    }

    function confirmSaved() {
      return new Promise(function(resolve) {
        setTimeout(function() {
          if (expected === 0) { resolve({ ok: true, saved: 0, expected: 0 }); return; }
          jsonp('countSaved', {
            reviewer: reviewer,
            strategy: task.strategy,
            dataset:  task.dataset,
            model:    task.model,
            imageIds: imageIds
          }).then(function(res) {
            var saved = (res && res.data && res.data.count != null) ? res.data.count : -1;
            resolve({ ok: saved >= expected, saved: saved, expected: expected });
          }).catch(function() {
            resolve({ ok: false, saved: -1, expected: expected });
          });
        }, BATCH_CONFIRM_DELAY);
      });
    }

    // 最多重試 BATCH_MAX_RETRY 次
    function attempt(n) {
      return doPost().then(confirmSaved).then(function(result) {
        result.attempts = n;
        if (result.ok || n >= BATCH_MAX_RETRY) return result;
        return attempt(n + 1);
      });
    }

    return attempt(1);
  }

  function normalizeManifest(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.map(task => Object.assign({}, task, { images: Array.isArray(task.images) ? task.images : [] }));
  }

  // ➔ 從 Google Sheet 載入該 reviewer 的作答記錄（帳號綁定，跨裝置同步）。
  //    合併順序：local 草稿優先（尚未送出的本機編輯）覆蓋 server，
  //    但 server 已儲存的欄位不被本機的空白 {} 污染。
  async function loadServerRatings(reviewer, task) {
    const params = { reviewer };
    if (task) Object.assign(params, { strategy: task.strategy, dataset: task.dataset, model: task.model });
    
    const res = await jsonp('listResponses', params);
    const rows = (res && res.data && Array.isArray(res.data.rows)) ? res.data.rows : (Array.isArray(res.rows) ? res.rows : []);
    const map = {};
    rows.forEach(r => {
      const key = [r.strategy, r.dataset, r.model, r.imageId || r.fileId || r.filename].join('||');
      map[key] = r;
    });
    serverRatings[reviewer] = Object.assign(serverRatings[reviewer] || {}, map);

    // ➔ 合併：以 server 為底，local 草稿中只有真正有作答（hasAnyAnswer）的才覆蓋上去，
    //    避免舊裝置殘留的空白 {} 把 server 的正確答案蓋掉。
    const local = getJson(localRatingsKey(reviewer), {});
    const merged = Object.assign({}, map);
    Object.keys(local).forEach(k => {
      const loc = local[k];
      const hasAnswer = loc && ratingKeys().some(rk => loc[rk] !== undefined && loc[rk] !== null && loc[rk] !== '');
      if (hasAnswer) merged[k] = Object.assign({}, map[k] || {}, loc);
    });
    setJson(localRatingsKey(reviewer), merged);
    invalidateMergedCache(reviewer);
    return map;
  }

  function populateReviewerSelect(select, includeAll) {
    if (!select) return;
    const oldValue = select.value;
    const reviewers = Array.isArray(cfg.reviewers) && cfg.reviewers.length ? cfg.reviewers : ['Reviewer1', 'Reviewer2'];
    select.innerHTML = '';
    if (includeAll) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'All';
      select.appendChild(opt);
    }
    reviewers.forEach(name => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      select.appendChild(opt);
    });
    if ([...select.options].some(o => o.value === oldValue)) select.value = oldValue;
  }

  window.USE = {
    taskKey, imageKey, imageStableId, displayModel, ratingKeys,
    saveLocalRating, readLocalRating, readRating,
    saveLocalProgress, readLocalProgress, countCompleted, firstIncompleteIndex,
    isCompleteRating, postToSheet, jsonp, loadManifest, reloadManifest,
    loadServerRatings, populateReviewerSelect,
    buildBatchPayload, postBatchToSheet
  };
})();
