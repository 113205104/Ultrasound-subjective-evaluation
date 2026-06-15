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

  // ─── 【重要修正 1】鬆綁草稿驗證 ───
  // 以前限定 1~4 分才算有效；現在只要有資料（不管是草稿還是滿分），
  // 在讀取與還原階段一律放行，允許前端將草稿撈出來
  function isCompleteRating(r) {
    if (!r) return false;
    return true; 
  }

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
    return Object.keys(all).filter(k => {
      if (!k.startsWith(taskKey(task) + '||')) return false;
      const r = all[k];
      // 只有在 12 格都有填值的情況下，進度條數字才會往前進
      return ratingKeys().every(keyName => r[keyName] !== undefined && r[keyName] !== null && r[keyName] !== '');
    }).length;
  }

  // ─── 【重要修正 2】解決不同電腦進度問題 ───
  // 進網頁時，不要自作聰明去抓前面沒選滿的格子來干擾
  // 優先遵守在 survey.js 中由雲端 progress 所推薦回傳的最新 currentIndex 位置
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

  // ─── 【重要修正 3】修正動作名稱衝突 ───
  // 原本呼叫 'getManifest'，但新版 Code.gs 裡面的實作叫 'loadManifest'，在這裡將其拉回一致
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

  async function loadServerRatings(reviewer, task) {
    const params = { reviewer };
    if (task) Object.assign(params, { strategy: task.strategy, dataset: task.dataset, model: task.model });
    
    // 呼叫雲端一鍵載入進度與評分的新接口
    const data = await jsonp('loadProgressAndRatings', params);
    const map = {};
    
    if (data.success && data.data) {
      (data.data.ratings || []).forEach(r => {
        const key = [r.strategy, r.dataset, r.model, r.imageId || r.fileId || r.filename].join('||');
        map[key] = r;
      });
      serverRatings[reviewer] = Object.assign(serverRatings[reviewer] || {}, map);
      
      // 將雲端最新的 progress 暫存在 localStorage 供初始定位讀取
      if (data.data.progress) {
        const progKey = 'use_progress_' + reviewer;
        const allProg = getJson(progKey, {});
        allProg[taskKey(task)] = data.data.progress;
        setJson(progKey, allProg);
      }
    }
    
    const local = getJson(localRatingsKey(reviewer), {});
    setJson(localRatingsKey(reviewer), Object.assign({}, map, local));
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
    isCompleteRating, postToSheet, jsonp, loadManifest, loadServerRatings,
    populateReviewerSelect
  };
})();
