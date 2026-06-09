(function () {
  const cfg = window.APP_CONFIG;
  function encodeQuery(params) {
    return Object.keys(params)
      .filter(k => params[k] !== undefined && params[k] !== null && params[k] !== '')
      .map(k => encodeURIComponent(k) + '=' + encodeURIComponent(params[k]))
      .join('&');
  }
  function taskKey(task) { return [task.strategy, task.dataset, task.model].join('||'); }
  function imageKey(task, image) { return [taskKey(task), image.id || image.filename || image.url].join('||'); }
  function displayModel(model) { return cfg.modelDisplayMap[model] || model; }
  function localRatingsKey(reviewer) { return 'use_ratings_' + reviewer; }
  function localProgressKey(reviewer) { return 'use_progress_' + reviewer; }
  function getJson(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch (_) { return fallback; } }
  function setJson(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
  function saveLocalRating(reviewer, key, data) {
    const all = getJson(localRatingsKey(reviewer), {});
    all[key] = data;
    setJson(localRatingsKey(reviewer), all);
  }
  function readLocalRating(reviewer, key) { return getJson(localRatingsKey(reviewer), {})[key] || {}; }
  function saveLocalProgress(reviewer, task, currentIndex, total) {
    const all = getJson(localProgressKey(reviewer), {});
    const completed = countCompleted(reviewer, task);
    all[taskKey(task)] = { currentIndex, total, completed, updatedAt: new Date().toISOString() };
    setJson(localProgressKey(reviewer), all);
  }
  function readLocalProgress(reviewer, task) { return getJson(localProgressKey(reviewer), {})[taskKey(task)] || null; }
  function isCompleteRating(r) { return cfg.ratingFields.every(f => Number(r[f.key]) >= 1 && Number(r[f.key]) <= 4); }
  function countCompleted(reviewer, task) {
    const all = getJson(localRatingsKey(reviewer), {});
    return Object.keys(all).filter(k => k.startsWith(taskKey(task) + '||') && isCompleteRating(all[k])).length;
  }
  function postToSheet(payload) {
    if (!cfg.appsScriptUrl) return Promise.resolve(false);
    const body = new URLSearchParams(payload);
    return fetch(cfg.appsScriptUrl, { method: 'POST', mode: 'no-cors', body }).then(() => true).catch(() => false);
  }
  function jsonp(action, params) {
    return new Promise((resolve, reject) => {
      const cb = 'jsonp_' + Date.now() + '_' + Math.random().toString(36).slice(2);
      const script = document.createElement('script');
      window[cb] = function (data) { cleanup(); resolve(data); };
      function cleanup() { delete window[cb]; script.remove(); }
      script.onerror = function () { cleanup(); reject(new Error('JSONP request failed')); };
      script.src = cfg.appsScriptUrl + '?' + encodeQuery(Object.assign({}, params || {}, { action, callback: cb }));
      document.body.appendChild(script);
    });
  }
  function normalizeManifest(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.map(task => Object.assign({}, task, { images: Array.isArray(task.images) ? task.images : [] }));
  }
  async function loadManifest() {
    const res = await fetch(cfg.manifestPath + '?v=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) throw new Error('manifest.json 載入失敗');
    return normalizeManifest(await res.json());
  }
  window.USE = {
    taskKey, imageKey, displayModel, saveLocalRating, readLocalRating,
    saveLocalProgress, readLocalProgress, countCompleted, isCompleteRating,
    postToSheet, jsonp, loadManifest
  };
})();
