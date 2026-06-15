(function () {
  const cfg = window.APP_CONFIG;
  const serverRatings = {};
  const mergedCache = {};

  function invalidateMergedCache(reviewer) { delete mergedCache[reviewer]; }

  function encodeQuery(params) {
    return Object.keys(params || {})
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
  function getJson(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) || fallback; }
    catch (_) { return fallback; }
  }
  function setJson(key, value) { localStorage.setItem(key, JSON.stringify(value)); }

  function normalizeRating(data) {
    const out = Object.assign({}, data || {});
    // 舊欄位相容：若曾經用 whole_image_quality_*，自動轉回 whole_quality_*
    ['1', '2', '3'].forEach(n => {
      if ((out[`whole_quality_${n}`] === undefined || out[`whole_quality_${n}`] === '') && out[`whole_image_quality_${n}`] !== undefined) {
        out[`whole_quality_${n}`] = out[`whole_image_quality_${n}`];
      }
    });
    return out;
  }

  function saveLocalRating(reviewer, key, data) {
    const all = getJson(localRatingsKey(reviewer), {});
    const prev = all[key] || {};
    const rkeys = ratingKeys();
    rkeys.forEach(k => { delete prev[k]; });
    all[key] = normalizeRating(Object.assign({}, prev, data, { draftUpdatedAt: new Date().toISOString() }));
    setJson(localRatingsKey(reviewer), all);
    invalidateMergedCache(reviewer);
  }

  function readLocalRating(reviewer, key) { return normalizeRating(getJson(localRatingsKey(reviewer), {})[key] || {}); }

  function ratingIsComplete(r) {
    r = normalizeRating(r);
    return ratingKeys().every(k => r[k] !== undefined && r[k] !== null && r[k] !== '');
  }

  function saveLocalProgress(reviewer, task, currentIndex, total) {
    const all = getJson(localProgressKey(reviewer), {});
    const completed = countCompleted(reviewer, task);
    all[taskKey(task)] = { currentIndex, total, completed, updatedAt: new Date().toISOString() };
    setJson(localProgressKey(reviewer), all);
    return all[taskKey(task)];
  }

  function readLocalProgress(reviewer, task) { return getJson(localProgressKey(reviewer), {})[taskKey(task)] || null; }

  function isCompleteRating(r) { return ratingIsComplete(r); }

  function mergedRatings(reviewer) {
    if (!(reviewer in mergedCache) || !mergedCache[reviewer]) {
      mergedCache[reviewer] = Object.assign({}, serverRatings[reviewer] || {}, getJson(localRatingsKey(reviewer), {}));
      Object.keys(mergedCache[reviewer]).forEach(k => { mergedCache[reviewer][k] = normalizeRating(mergedCache[reviewer][k]); });
    }
    return mergedCache[reviewer];
  }

  function readRating(reviewer, key) { return normalizeRating(mergedRatings(reviewer)[key] || {}); }

  function countCompleted(reviewer, task) {
    const all = mergedRatings(reviewer);
    return Object.keys(all).filter(k => k.startsWith(taskKey(task) + '||') && ratingIsComplete(all[k])).length;
  }

  function firstIncompleteIndex(reviewer, task, images) {
    if (!Array.isArray(images)) return 0;
    for (let i = 0; i < images.length; i++) {
      if (!ratingIsComplete(readRating(reviewer, imageKey(task, images[i])))) return i;
    }
    return 0;
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

  async function postToSheet(payload) {
    // 保留舊接口；改用 JSONP 才能知道是否真的成功。
    const res = await jsonp(payload.action || 'saveRating', payload);
    if (!res.success) throw new Error(res.error || 'Google Sheet 儲存失敗');
    return true;
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

  function makeKeyFromRow(r) {
    return [r.strategy, r.dataset, r.model, r.imageId || r.fileId || r.filename].join('||');
  }

  async function loadServerRatings(reviewer, task) {
    const params = { reviewer };
    if (task) Object.assign(params, { strategy: task.strategy, dataset: task.dataset, model: task.model });
    const data = await jsonp('loadProgressAndRatings', params);
    const map = {};
    if (data.success && data.data) {
      (data.data.ratings || []).forEach(r => { map[makeKeyFromRow(r)] = normalizeRating(r); });
      serverRatings[reviewer] = Object.assign(serverRatings[reviewer] || {}, map);
      const local = getJson(localRatingsKey(reviewer), {});
      setJson(localRatingsKey(reviewer), Object.assign({}, map, local));
      if (task && data.data.progress) {
        const allProg = getJson(localProgressKey(reviewer), {});
        allProg[taskKey(task)] = data.data.progress;
        setJson(localProgressKey(reviewer), allProg);
      }
    }
    invalidateMergedCache(reviewer);
    return map;
  }

  function buildRatingPayload(reviewer, task, image, rating) {
    rating = normalizeRating(rating);
    const payload = {
      action: 'saveRating',
      reviewer,
      strategy: task.strategy,
      dataset: task.dataset,
      model: task.model,
      displayModel: displayModel(task.model),
      imageId: imageStableId(image),
      fileId: image.fileId || '',
      filename: image.filename || imageStableId(image),
      imageUrl: image.url || image.imageUrl || ''
    };
    ratingKeys().forEach(k => { payload[k] = rating[k] === undefined || rating[k] === null ? '' : rating[k]; });
    return payload;
  }

  async function saveServerRating(reviewer, task, image, rating) {
    const payload = buildRatingPayload(reviewer, task, image, rating);
    const res = await jsonp('saveRating', payload);
    if (!res.success) throw new Error(res.error || '作答結果儲存失敗');
    serverRatings[reviewer] = serverRatings[reviewer] || {};
    serverRatings[reviewer][imageKey(task, image)] = normalizeRating(Object.assign({}, payload, { timestamp: new Date().toISOString() }));
    invalidateMergedCache(reviewer);
    return res.data;
  }

  async function saveServerProgress(reviewer, task, currentIndex, total) {
    const completed = countCompleted(reviewer, task);
    const payload = {
      reviewer,
      strategy: task.strategy,
      dataset: task.dataset,
      model: task.model,
      displayModel: displayModel(task.model),
      currentIndex,
      total,
      completed,
      completedStatus: total > 0 && completed >= total ? 'Completed' : 'In Progress'
    };
    const res = await jsonp('saveProgress', payload);
    if (!res.success) throw new Error(res.error || '進度儲存失敗');
    return res.data;
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
    saveServerRating, saveServerProgress, buildRatingPayload,
    populateReviewerSelect
  };
})();
