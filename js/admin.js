(function () {
  const cfg = window.APP_CONFIG;
  const serverRatings = {};
  
  // 【效能優化】優化快取機制
  // 不再刪除快取，而是改為直接在記憶體中同步維護更新，
  // 徹底解決因 Radio Click 頻繁觸發 readRating 導致 JSON.parse 造成的 UI 凍結卡頓。
  const mergedCache = {};
  
  function updateMergedCache(reviewer, key, data) {
    if (!mergedCache[reviewer]) {
      // 如果快取尚未建立，先載入初始化
      mergedCache[reviewer] = Object.assign({}, serverRatings[reviewer] || {}, getJson(localRatingsKey(reviewer), {}));
    }
    // 直接更新記憶體中的該筆影像評分，不需 delete 整個快取物件
    mergedCache[reviewer][key] = Object.assign({}, mergedCache[reviewer][key] || {}, data);
  }

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
    // 移除舊的評分欄位，讓取消選取的項目能確實被複寫為空值
    const rkeys = ratingKeys();
    rkeys.forEach(k => { delete prev[k]; });
    
    const updatedRecord = Object.assign({}, prev, data, { draftUpdatedAt: new Date().toISOString() });
    all[key] = updatedRecord;
    setJson(localRatingsKey(reviewer), all);
    
    // 【關鍵修改】：不再呼叫 invalidate，而是直接將更新同步寫入記憶體快取
    updateMergedCache(reviewer, key, updatedRecord);
  }
  function readLocalRating(reviewer, key) { return getJson(localRatingsKey(reviewer), {})[key] || {}; }

  function saveLocalProgress(reviewer, task, currentIndex, total) {
    const all = getJson(localProgressKey(reviewer), {});
    const completed = countCompleted(reviewer, task);
    all[taskKey(task)] = { currentIndex, total, completed, updatedAt: new Date().toISOString() };
    setJson(localProgressKey(reviewer), all);
  }
  function readLocalProgress(reviewer, task) { return getJson(localProgressKey(reviewer), {})[taskKey(task)] || null; }

  function isCompleteRating(r) {
    return ratingKeys().every(k => Number(r && r[k]) >= 1 && Number(r && r[k]) <= 4);
  }

  // 讀取進度時直接從快速的記憶體快取中撈取，不存在時才初始化
  function mergedRatings(reviewer) {
    if (!(reviewer in mergedCache)) {
      mergedCache[reviewer] = Object.assign({}, serverRatings[reviewer] || {}, getJson(localRatingsKey(reviewer), {}));
    }
    return mergedCache[reviewer];
  }
  function readRating(reviewer, key) { return mergedRatings(reviewer)[key] || {}; }

  function countCompleted(reviewer, task) {
    const all = mergedRatings(reviewer);
    return Object.keys(all).filter(k => k.startsWith(taskKey(task) + '||') && isCompleteRating(all[k])).length;
  }

  function firstIncompleteIndex(reviewer, task) {
    for (let i = 0; i < task.images.length; i++) {
      if (!isCompleteRating(readRating(reviewer, imageKey(task, task.images[i])))) return i;
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

  function normalizeManifest(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.map(task => Object.assign({}, task, { images: Array.isArray(task.images) ? task.images : [] }));
  }

  async function loadManifest() {
    if (cfg.manifestSource === 'drive') {
      const data = await jsonp('getManifest', {});
      if (!data.ok) throw new Error(data.error || 'Google Drive manifest 載入失敗');
      return normalizeManifest(data.manifest || []);
    }
    const res = await fetch((cfg.manifestPath || 'manifest.json') + '?v=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) throw new Error('manifest.json 載入失敗');
    return normalizeManifest(await res.json());
  }

  async function loadServerRatings(reviewer, task) {
    const params = { reviewer };
    if (task) Object.assign(params, { strategy: task.strategy, dataset: task.dataset, model: task.model });
    const data = await jsonp('listResponses', params);
    const map = {};
    (data.rows || []).forEach(r => {
      const key = [r.strategy, r.dataset, r.model, r.imageId || r.fileId || r.filename].join('||');
      map[key] = r;
    });
    serverRatings[reviewer] = Object.assign(serverRatings[reviewer] || {}, map);
    // 回放伺服器資料至本地，但本地草稿擁有最高優先權
    const local = getJson(localRatingsKey(reviewer), {});
    setJson(localRatingsKey(reviewer), Object.assign({}, map, local));
    
    // 伺服器資料有變動時，才重新同步更新一次快取
    mergedCache[reviewer] = Object.assign({}, serverRatings[reviewer], local);
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
    isCompleteRating, postToSheet, jsonp, loadManifest, loadServerRatings,
    populateReviewerSelect
  };
})();