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

  function taskKey(task) { 
    if (!task) return 'UNKNOWN';
    return [task.strategy, task.dataset, task.model].join('||'); 
  }
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

  // 🟢 修正 1：放行所有草稿與未選滿項目
  function isCompleteRating(r) {
    return true; 
  }

  function mergedRatings(reviewer) {
    if (!(reviewer in mergedCache) || !mergedCache[reviewer]) {
      mergedCache[reviewer] = Object.assign({}, serverRatings[reviewer] || {}, getJson(localRatingsKey(reviewer), {}));
    }
    return mergedCache[reviewer];
  }
  function readRating(reviewer, key) { return mergedRatings(reviewer)[key] || {}; }

  // 計算完美填滿 12 格的圖片數量 (用來展示給主頁面/進度條看)
  function countCompleted(reviewer, task) {
    const all = mergedRatings(reviewer);
    return task.images.filter(img => {
      const key = imageKey(task, img);
      const r = all[key];
      if (!r) return false;
      return ratingKeys().every(keyName => r[keyName] !== undefined && r[keyName] !== null && r[keyName] !== '');
    }).length;
  }

  // 🟢 修正 2：初始化定位由本地和雲端 progress 接口雙重保護，不強制抓前面未滿格
  function firstIncompleteIndex(reviewer, task) {
    return 0; 
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
      const data = await jsonp('loadManifest', {});
      if (!data.success) throw new Error(data.error || 'Google Drive manifest 載入失敗');
      return normalizeManifest(data.data.manifest || []);
    }
    const res = await fetch((cfg.manifestPath || 'manifest.json') + '?v=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) throw new Error('manifest.json 載入失敗');
    return normalizeManifest(await res.json());
  }

  // 🟢 修正 3：徹底解決首頁載入崩潰（相容不傳送 task 參數的舊版首頁呼叫方式）
  async function loadServerRatings(reviewer, task) {
    const params = { reviewer };
    if (task) {
      Object.assign(params, { strategy: task.strategy, dataset: task.dataset, model: task.model });
      // 如果有傳任務進來，代表在作答頁，改走一鍵雙拿進度的最新優化接口
      const data = await jsonp('loadProgressAndRatings', params);
      const map = {};
      if (data.success && data.data) {
        (data.data.ratings || []).forEach(r => {
          const key = [r.strategy, r.dataset, r.model, r.imageId || r.fileId || r.filename].join('||');
          map[key] = r;
        });
        serverRatings[reviewer] = Object.assign(serverRatings[reviewer] || {}, map);
        if (data.data.progress) {
          const allProg = getJson('use_progress_' + reviewer, {});
          allProg[taskKey(task)] = data.data.progress;
          setJson('use_progress_' + reviewer, allProg);
        }
      }
      const local = getJson(localRatingsKey(reviewer), {});
      setJson(localRatingsKey(reviewer), Object.assign({}, map, local));
      invalidateMergedCache(reviewer);
      return map;
    } else {
      // ➔ 這是首頁（index.html）在呼叫的！此處必須使用傳統的 listResponses 盲載，避免 task 遺失而崩潰
      const data = await jsonp('listResponses', params);
      const map = {};
      if (data.success && data.data && data.data.rows) {
        data.data.rows.forEach(r => {
          const key = [r.strategy, r.dataset, r.model, r.imageId || r.fileId || r.filename].join('||');
          map[key] = r;
        });
        serverRatings[reviewer] = Object.assign(serverRatings[reviewer] || {}, map);
      }
      const local = getJson(localRatingsKey(reviewer), {});
      setJson(localRatingsKey(reviewer), Object.assign({}, map, local));
      invalidateMergedCache(reviewer);
      return map;
    }
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
