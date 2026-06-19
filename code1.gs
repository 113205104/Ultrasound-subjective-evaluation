const SPREADSHEET_NAME = 'Ultrasound_subjective_evaluation_database';
const RESPONSES_SHEET = 'responses';
const PROGRESS_SHEET = 'progress';
const ANSWER_LOG_SHEET = 'answer_log';

const DRIVE_ROOT_FOLDER_ID = '';
const DRIVE_ROOT_FOLDER_NAME = 'UltrasoundImages';
const AUTO_SHARE_IMAGES = false;

const ALLOWED_MODELS = ['cut', 'cyc', 'fast', 'p2p', 'reg'];
const MODEL_DISPLAY = { cut: 'Model A', cyc: 'Model B', fast: 'Model C', p2p: 'Model D', reg: 'Model E' };
const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'webp'];
const FILENAME_RE = /^(cut|cyc|fast|p2p|reg)-(.+)-([^_]+)_(\d+)\.(png|jpg|jpeg|webp)$/i;

const RESPONSE_HEADERS = [
  'timestamp', 'reviewer', 'strategy', 'dataset', 'model', 'displayModel',
  'imageId', 'fileId', 'filename', 'imageUrl', 'imageLink', 'questionNo',
  'whole_quality_1', 'noise_suppression_1', 'contrast_1', 'edge_sharpness_1',
  'whole_quality_2', 'noise_suppression_2', 'contrast_2', 'edge_sharpness_2',
  'whole_quality_3', 'noise_suppression_3', 'contrast_3', 'edge_sharpness_3'
];

const PROGRESS_HEADERS = [
  'timestamp', 'reviewer', 'strategy', 'dataset', 'model', 'displayModel',
  'currentIndex', 'total', 'completed', 'completedStatus'
];

const ANSWER_LOG_HEADERS = [
  'timestamp', 'reviewer', 'strategy', 'dataset', 'model', 'displayModel',
  'imageId', 'fileId', 'filename', 'imageUrl', 'imageLink', 'questionNo',
  'whole_quality1', 'whole_quality2', 'whole_quality3',
  'noise_suppression1', 'noise_suppression2', 'noise_suppression3',
  'contrast1', 'contrast2', 'contrast3',
  'edge_sharpness1', 'edge_sharpness2', 'edge_sharpness3'
];

const RATING_FIELDS = ['whole_quality', 'noise_suppression', 'contrast', 'edge_sharpness'];
const TRIPANEL_ROWS = [
  { key: '1', label: '第一張' },
  { key: '2', label: '第二張' },
  { key: '3', label: '第三張' }
];


function doGet(e) { return handleRequest_(e); }
function doPost(e) { return handleRequest_(e); }

function handleRequest_(e) {
  const p = e && e.parameter ? e.parameter : {};
  const action = p.action || '';
  const callback = p.callback || '';

  try {
    let data = {};
    // ➔ 唯一名稱：loadManifest
    if (action === 'loadManifest') {
      data = { manifest: loadManifestCached_() };
    } else if (action === 'bustManifestCache') {
      CacheService.getScriptCache().remove('manifest_v1');
      data = { status: 'CacheCleared' };
    } else if (action === 'saveBatchRating') {
      data = saveBatchRating_(p);
    } else if (action === 'countSaved') {
      data = countSaved_(p);
    } else if (action === 'saveRating') {
      data = saveRating_(p);
    } else if (action === 'saveProgress') {
      data = saveProgress_(p);
    } else if (action === 'listResponses') {
      data = listResponses_(p);
    } else if (action === 'listAnswerLog') {
      data = listAnswerLog_(p);
    } else if (action === 'syncResponsesFromAnswerLog') {
      data = syncResponsesFromAnswerLog_();
    } else if (action === 'loadProgressAndRatings') {
      data = loadProgressAndRatings_(p);
    } else if (action === 'setup') {
      data = setup_();
    } else {
      throw new Error('Unknown action: ' + action);
    }
    return jsonpResponse_(callback, { success: true, data: data });
  } catch (err) {
    return jsonpResponse_(callback, { success: false, error: err.message });
  }
}

function jsonpResponse_(callback, obj) {
  const json = JSON.stringify(obj);
  let text = json;
  if (callback) { text = callback + '(' + json + ')'; }
  return ContentService.createTextOutput(text).setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function getOrCreateSpreadsheet_() {
  const files = DriveApp.getFilesByName(SPREADSHEET_NAME);
  if (files.hasNext()) { return SpreadsheetApp.open(files.next()); }
  return SpreadsheetApp.create(SPREADSHEET_NAME);
}

function getOrCreateSheet_(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    return sheet;
  }
  ensureHeaders_(sheet, headers);
  return sheet;
}

function ensureHeaders_(sheet, requiredHeaders) {
  const lastCol = Math.max(sheet.getLastColumn(), 1);
  const current = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
  if (current.length === 1 && current[0] === '') {
    sheet.getRange(1, 1, 1, requiredHeaders.length).setValues([requiredHeaders]);
    sheet.getRange(1, 1, 1, requiredHeaders.length).setFontWeight('bold');
    return;
  }
  const missing = requiredHeaders.filter(h => current.indexOf(h) === -1);
  if (missing.length) {
    sheet.getRange(1, current.length + 1, 1, missing.length).setValues([missing]);
    sheet.getRange(1, 1, 1, current.length + missing.length).setFontWeight('bold');
  }
}


function ensureExactHeaders_(sheet, exactHeaders) {
  const lastRow = Math.max(sheet.getLastRow(), 1);
  const lastCol = Math.max(sheet.getLastColumn(), 1);
  const current = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(String);

  const same = current.length === exactHeaders.length && exactHeaders.every((h, i) => current[i] === h);
  if (same) return;

  const oldMap = {};
  current.forEach((h, i) => { if (h) oldMap[h] = i; });

  if (lastRow <= 1) {
    sheet.clear();
    sheet.getRange(1, 1, 1, exactHeaders.length).setValues([exactHeaders]);
    sheet.getRange(1, 1, 1, exactHeaders.length).setFontWeight('bold');
    if (sheet.getMaxColumns() > exactHeaders.length) {
      sheet.deleteColumns(exactHeaders.length + 1, sheet.getMaxColumns() - exactHeaders.length);
    }
    return;
  }

  const oldValues = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  const newValues = oldValues.map(row => exactHeaders.map(h => oldMap[h] !== undefined ? row[oldMap[h]] : ''));

  sheet.clear();
  if (sheet.getMaxColumns() < exactHeaders.length) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), exactHeaders.length - sheet.getMaxColumns());
  }
  sheet.getRange(1, 1, 1, exactHeaders.length).setValues([exactHeaders]);
  sheet.getRange(1, 1, 1, exactHeaders.length).setFontWeight('bold');
  if (newValues.length) sheet.getRange(2, 1, newValues.length, exactHeaders.length).setValues(newValues);
  if (sheet.getMaxColumns() > exactHeaders.length) {
    sheet.deleteColumns(exactHeaders.length + 1, sheet.getMaxColumns() - exactHeaders.length);
  }
}

function getOrCreateAnswerLogSheet_(ss) {
  let sheet = ss.getSheetByName(ANSWER_LOG_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(ANSWER_LOG_SHEET);
  }
  ensureExactHeaders_(sheet, ANSWER_LOG_HEADERS);
  return sheet;
}

function headerIndexMap_(sheet, requiredHeaders) {
  ensureHeaders_(sheet, requiredHeaders);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
  const map = {};
  headers.forEach((h, i) => { map[h] = i; });
  return { headers: headers, map: map };
}

function setup_() {
  const ss = getOrCreateSpreadsheet_();
  getOrCreateSheet_(ss, RESPONSES_SHEET, RESPONSE_HEADERS);
  getOrCreateSheet_(ss, PROGRESS_SHEET, PROGRESS_HEADERS);
  getOrCreateAnswerLogSheet_(ss);
  return { status: 'SetupComplete', spreadsheetUrl: ss.getUrl() };
}

// ─── Batch save ──────────────────────────────────────────────────────────────
// 前端把整個任務所有有作答的圖片整理成 rows 陣列，一次 POST 送來。
// GAS 只做一次 getDataRange + 一次 setValues，大幅減少 Sheet API 呼叫次數。
//
// payload 格式（URL-encoded）：
//   action=saveBatchRating
//   reviewer=...  strategy=...  dataset=...  model=...
//   rows=<JSON 字串，陣列，每個元素等同於原本單張 saveRating 的 p>
//   progressCurrentIndex=...  progressTotal=...
//
function saveBatchRating_(p) {
  if (!p.rows) throw new Error('saveBatchRating: missing rows param');
  let rows;
  try { rows = JSON.parse(p.rows); } catch(e) { throw new Error('saveBatchRating: rows is not valid JSON'); }
  if (!Array.isArray(rows) || rows.length === 0) {
    // rows 為空時跳過 answer_log，但仍繼續執行 progress 儲存
    if (p.progressCurrentIndex !== undefined) {
      const fakeP = {
        reviewer: p.reviewer || '', strategy: p.strategy || '',
        dataset: p.dataset || '', model: p.model || '',
        displayModel: p.displayModel || '',
        currentIndex: p.progressCurrentIndex, total: p.progressTotal || 0,
        completed: p.progressCompleted || 0,
        completedStatus: p.progressCompletedStatus || 'In Progress'
      };
      saveProgress_(fakeP);
    }
    return { status: 'NothingToSave', saved: 0 };
  }

  const ss = getOrCreateSpreadsheet_();

  // ── 1. answer_log batch upsert ─────────────────────────────────────────────
  const logSheet  = getOrCreateAnswerLogSheet_(ss);
  const logHm     = headerIndexMap_(logSheet, ANSWER_LOG_HEADERS);
  const logValues = logSheet.getDataRange().getValues(); // 一次讀完整個 sheet

  // 建立現有列的 key → 陣列索引（0-based，不含 header）
  const logKeyMap = {};
  const idxR = logHm.map.reviewer, idxS = logHm.map.strategy,
        idxD = logHm.map.dataset,  idxM = logHm.map.model,
        idxI = logHm.map.imageId;
  for (var ri = 1; ri < logValues.length; ri++) {
    var v = logValues[ri];
    var k = [v[idxR], v[idxS], v[idxD], v[idxM], v[idxI]].join('||');
    logKeyMap[k] = ri; // 0-based index into logValues
  }

  // 把所有 rows 分流：已存在的直接改 logValues[ri]，新的放 toAppend
  var toAppend = [];
  var updatedSet = {}; // 避免同一批次對同一 key 重複處理

  rows.forEach(function(rp) {
    var reviewer     = rp.reviewer     || p.reviewer     || '';
    var strategy     = rp.strategy     || p.strategy     || '';
    var dataset      = rp.dataset      || p.dataset      || '';
    var model        = rp.model        || p.model        || '';
    var displayModel = rp.displayModel || p.displayModel || '';
    var imageId      = rp.imageId || rp.fileId || rp.filename || '';
    var fileId       = rp.fileId       || '';
    var filename     = rp.filename     || '';
    var imageUrl     = rp.imageUrl     || '';
    var imageLink    = rp.imageLink    || rp.webViewUrl || imageUrl || '';
    var questionNo   = rp.questionNo   || extractQuestionNo_(filename) || '';

    if (!reviewer || !strategy || !dataset || !model || !imageId) return;

    var obj = {
      timestamp: new Date(), reviewer: reviewer, strategy: strategy, dataset: dataset,
      model: model, displayModel: displayModel,
      imageId: imageId, fileId: fileId, filename: filename,
      imageUrl: imageUrl, imageLink: imageLink, questionNo: questionNo
    };
    RATING_FIELDS.forEach(function(field) {
      TRIPANEL_ROWS.forEach(function(posRow) {
        var srcKey = field + '_' + posRow.key;
        var logKey = field + posRow.key;
        var score  = rp[srcKey] !== undefined ? rp[srcKey] : rp[logKey];
        obj[logKey] = (score === undefined || score === null) ? '' : score;
      });
    });

    var rowData = logHm.headers.map(function(h) { return obj[h] !== undefined ? obj[h] : ''; });
    var mapKey  = [reviewer, strategy, dataset, model, imageId].join('||');

    if (logKeyMap[mapKey] !== undefined && !updatedSet[mapKey]) {
      // 直接覆寫 logValues 中對應列（稍後一次性 setValues 回 sheet）
      logValues[logKeyMap[mapKey]] = rowData;
      updatedSet[mapKey] = true;
    } else if (!updatedSet[mapKey]) {
      toAppend.push(rowData);
      updatedSet[mapKey] = true;
    }
  });

  // 把有修改的 body（不含 header 列）一次寫回 sheet
  var bodyRows = logValues.length - 1;
  if (bodyRows > 0) {
    logSheet.getRange(2, 1, bodyRows, logHm.headers.length).setValues(logValues.slice(1));
  }
  // 新增列：一次 setValues 追加到尾端
  if (toAppend.length === 1) {
    logSheet.appendRow(toAppend[0]);
  } else if (toAppend.length > 1) {
    logSheet.getRange(logSheet.getLastRow() + 1, 1, toAppend.length, toAppend[0].length)
            .setValues(toAppend);
  }

  // ── 2. progress upsert（沿用原本邏輯，僅一列）────────────────────────────
  if (p.progressCurrentIndex !== undefined) {
    const fakeP = {
      reviewer: p.reviewer || (rows[0] && rows[0].reviewer) || '',
      strategy: p.strategy || (rows[0] && rows[0].strategy) || '',
      dataset:  p.dataset  || (rows[0] && rows[0].dataset)  || '',
      model:    p.model    || (rows[0] && rows[0].model)    || '',
      displayModel: p.displayModel || '',
      currentIndex:    p.progressCurrentIndex,
      total:           p.progressTotal           || rows.length,
      completed:       p.progressCompleted       || rows.length,
      completedStatus: p.progressCompletedStatus || 'In Progress'
    };
    saveProgress_(fakeP);
  }

  return { status: 'BatchSaved', updated: Object.keys(updatedSet).length - toAppend.length, appended: toAppend.length };
}

// 輕量確認：只計算 answer_log 裡符合條件的筆數，供前端 JSONP 驗證儲存是否完整。
// params: reviewer, strategy, dataset, model, imageIds（逗號分隔的 imageId 清單）
function countSaved_(p) {
  var ss        = getOrCreateSpreadsheet_();
  var sheet     = getOrCreateAnswerLogSheet_(ss);
  var hm        = headerIndexMap_(sheet, ANSWER_LOG_HEADERS);
  var values    = sheet.getDataRange().getValues();

  var reviewer = p.reviewer || '';
  var strategy = p.strategy || '';
  var dataset  = p.dataset  || '';
  var model    = p.model    || '';
  var idList   = p.imageIds ? String(p.imageIds).split(',') : [];
  var idSet    = {};
  idList.forEach(function(id) { if (id) idSet[id.trim()] = true; });

  var idxR = hm.map.reviewer, idxS = hm.map.strategy,
      idxD = hm.map.dataset,  idxM = hm.map.model,
      idxI = hm.map.imageId;

  var count = 0;
  for (var i = 1; i < values.length; i++) {
    var r = values[i];
    if (reviewer && r[idxR] !== reviewer) continue;
    if (strategy && r[idxS] !== strategy) continue;
    if (dataset  && r[idxD] !== dataset)  continue;
    if (model    && r[idxM] !== model)    continue;
    if (idList.length > 0 && !idSet[String(r[idxI])]) continue;
    count++;
  }
  return { count: count, expected: idList.length };
}

function saveRating_(p) {
  const ss = getOrCreateSpreadsheet_();

  const reviewer = p.reviewer || '';
  const strategy = p.strategy || '';
  const dataset  = p.dataset  || '';
  const model    = p.model    || '';
  const imageId  = p.imageId || p.fileId || p.filename || '';

  p.imageId = imageId;
  if (!reviewer || !strategy || !dataset || !model || !imageId) {
    throw new Error('Missing core identification fields.');
  }

  // ➔ 只寫 answer_log，不再寫 responses。
  saveAnswerLog_(ss, p);
  return { status: 'Saved', imageId: imageId };
}

function saveAnswerLog_(ss, p) {
  const sheet = getOrCreateAnswerLogSheet_(ss);
  const hm = headerIndexMap_(sheet, ANSWER_LOG_HEADERS);

  const reviewer     = p.reviewer     || '';
  const strategy     = p.strategy     || '';
  const dataset      = p.dataset      || '';
  const model        = p.model        || '';
  const displayModel = p.displayModel || '';
  const imageId      = p.imageId || p.fileId || p.filename || '';
  const fileId       = p.fileId       || '';
  const filename     = p.filename     || '';
  const imageUrl     = p.imageUrl     || '';
  const imageLink    = p.imageLink || p.webViewUrl || imageUrl || '';
  const questionNo   = p.questionNo || extractQuestionNo_(filename) || '';

  if (!reviewer || !strategy || !dataset || !model || !imageId) {
    throw new Error('Missing core identification fields for answer_log.');
  }

  const obj = {
    timestamp: new Date(), reviewer, strategy, dataset, model, displayModel,
    imageId, fileId, filename, imageUrl, imageLink, questionNo
  };

  RATING_FIELDS.forEach(field => {
    TRIPANEL_ROWS.forEach(posRow => {
      const srcKey = field + '_' + posRow.key;   // 前端 responses 使用的欄位：whole_quality_1
      const logKey = field + posRow.key;         // answer_log 使用的欄位：whole_quality1
      const score = p[srcKey] !== undefined ? p[srcKey] : p[logKey];
      obj[logKey] = (score === undefined || score === null) ? '' : score;
    });
  });

  const rowData = hm.headers.map(h => obj[h] !== undefined ? obj[h] : '');
  const values = sheet.getDataRange().getValues();
  let foundRowIndex = -1;

  const idxReviewer = hm.map.reviewer;
  const idxStrategy = hm.map.strategy;
  const idxDataset  = hm.map.dataset;
  const idxModel    = hm.map.model;
  const idxImageId  = hm.map.imageId;

  for (let i = 1; i < values.length; i++) {
    const r = values[i];
    if (r[idxReviewer] === reviewer &&
        r[idxStrategy] === strategy &&
        r[idxDataset]  === dataset &&
        r[idxModel]    === model &&
        r[idxImageId]  === imageId) {
      foundRowIndex = i + 1;
      break;
    }
  }

  if (foundRowIndex > 0) {
    sheet.getRange(foundRowIndex, 1, 1, rowData.length).setValues([rowData]);
  } else {
    sheet.appendRow(rowData);
  }
  return { status: 'AnswerLogSaved' };
}

function extractQuestionNo_(filename) {
  const m = String(filename || '').match(/_(\d+)\.(png|jpg|jpeg|webp)$/i);
  return m ? m[1] : '';
}

function saveProgress_(p) {
  const ss = getOrCreateSpreadsheet_();
  const sheet = getOrCreateSheet_(ss, PROGRESS_SHEET, PROGRESS_HEADERS);
  const hm = headerIndexMap_(sheet, PROGRESS_HEADERS);

  const reviewer = p.reviewer || '';
  const strategy = p.strategy || '';
  const dataset = p.dataset || '';
  const model = p.model || '';

  if (!reviewer || !strategy || !dataset || !model) {
    throw new Error('Missing identification for progress.');
  }

  const rowData = hm.headers.map(h => {
    if (h === 'timestamp') return new Date();
    if (p[h] !== undefined) return p[h];
    return '';
  });

  const values = sheet.getDataRange().getValues();
  let foundRowIndex = -1;
  const idxReviewer = hm.map.reviewer;
  const idxStrategy = hm.map.strategy;
  const idxDataset = hm.map.dataset;
  const idxModel = hm.map.model;

  for (let i = 1; i < values.length; i++) {
    const r = values[i];
    if (r[idxReviewer] === reviewer && r[idxStrategy] === strategy && r[idxDataset] === dataset && r[idxModel] === model) {
      foundRowIndex = i + 1;
      break;
    }
  }

  if (foundRowIndex > 0) {
    sheet.getRange(foundRowIndex, 1, 1, rowData.length).setValues([rowData]);
  } else {
    sheet.appendRow(rowData);
  }
  return { status: 'ProgressSaved' };
}

// ➔ 讀取 answer_log sheet，依 strategy/dataset/model/reviewer 篩選，
//    並依題號（filename 內數字）→ imagePosition（第一張/第二張/第三張）排列。
function listAnswerLog_(p) {
  const ss = getOrCreateSpreadsheet_();
  const sheet = getOrCreateAnswerLogSheet_(ss);
  const hm = headerIndexMap_(sheet, ANSWER_LOG_HEADERS);
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return { rows: [] };

  const filterReviewer = p.reviewer || '';
  const filterStrategy = p.strategy || '';
  const filterDataset  = p.dataset  || '';
  const filterModel    = p.model    || '';

  const out = [];
  for (let i = 1; i < values.length; i++) {
    const r = values[i];
    const row = {};
    hm.headers.forEach((h, idx) => { row[h] = r[idx]; });

    if (filterReviewer && row.reviewer !== filterReviewer) continue;
    if (filterStrategy && !String(row.strategy || '').toLowerCase().includes(filterStrategy.toLowerCase())) continue;
    if (filterDataset  && !String(row.dataset  || '').toLowerCase().includes(filterDataset.toLowerCase()))  continue;
    if (filterModel    && !String(row.model    || '').toLowerCase().includes(filterModel.toLowerCase()))    continue;

    out.push(row);
  }

  function questionNum_(row) {
    const q = row.questionNo || extractQuestionNo_(row.filename);
    const n = parseInt(q, 10);
    return isNaN(n) ? 0 : n;
  }

  out.sort((a, b) => {
    const qA = questionNum_(a), qB = questionNum_(b);
    if (qA !== qB) return qA - qB;
    return String(a.filename || '').localeCompare(String(b.filename || ''), undefined, { numeric: true, sensitivity: 'base' });
  });

  return { rows: out };
}

function answerLogRowToResponseRow_(row) {
  const out = {};
  RESPONSE_HEADERS.forEach(h => { out[h] = row[h] !== undefined ? row[h] : ''; });
  out.timestamp = row.timestamp || new Date();
  out.reviewer = row.reviewer || '';
  out.strategy = row.strategy || '';
  out.dataset = row.dataset || '';
  out.model = row.model || '';
  out.displayModel = row.displayModel || '';
  out.imageId = row.imageId || row.fileId || row.filename || '';
  out.fileId = row.fileId || '';
  out.filename = row.filename || '';
  out.imageUrl = row.imageUrl || '';
  out.imageLink = row.imageLink || row.imageUrl || '';
  out.questionNo = row.questionNo || extractQuestionNo_(row.filename) || '';
  RATING_FIELDS.forEach(field => {
    TRIPANEL_ROWS.forEach(posRow => {
      const responseKey = field + '_' + posRow.key;
      const logKey = field + posRow.key;
      out[responseKey] = row[responseKey] !== undefined && row[responseKey] !== '' ? row[responseKey] : (row[logKey] || '');
    });
  });
  return out;
}

function responseRowHasAnyScore_(row) {
  return RATING_FIELDS.some(field => TRIPANEL_ROWS.some(posRow => {
    const k = field + '_' + posRow.key;
    return row[k] !== undefined && row[k] !== null && row[k] !== '';
  }));
}

function upsertResponseRow_(sheet, hm, obj) {
  const imageId = obj.imageId || obj.fileId || obj.filename || '';
  if (!obj.reviewer || !obj.strategy || !obj.dataset || !obj.model || !imageId) return false;
  obj.imageId = imageId;

  const rowData = hm.headers.map(h => obj[h] !== undefined ? obj[h] : '');
  const values = sheet.getDataRange().getValues();
  let foundRowIndex = -1;
  const idxReviewer = hm.map.reviewer;
  const idxStrategy = hm.map.strategy;
  const idxDataset = hm.map.dataset;
  const idxModel = hm.map.model;
  const idxImageId = hm.map.imageId;

  for (let i = 1; i < values.length; i++) {
    const r = values[i];
    if (r[idxReviewer] === obj.reviewer && r[idxStrategy] === obj.strategy && r[idxDataset] === obj.dataset && r[idxModel] === obj.model && r[idxImageId] === imageId) {
      foundRowIndex = i + 1;
      break;
    }
  }

  if (foundRowIndex > 0) sheet.getRange(foundRowIndex, 1, 1, rowData.length).setValues([rowData]);
  else sheet.appendRow(rowData);
  return true;
}

function syncResponsesFromAnswerLog_() {
  const ss = getOrCreateSpreadsheet_();
  const responseSheet = getOrCreateSheet_(ss, RESPONSES_SHEET, RESPONSE_HEADERS);
  const rhm = headerIndexMap_(responseSheet, RESPONSE_HEADERS);
  const logSheet = getOrCreateAnswerLogSheet_(ss);
  const lhm = headerIndexMap_(logSheet, ANSWER_LOG_HEADERS);
  const values = logSheet.getDataRange().getValues();
  let synced = 0;

  for (let i = 1; i < values.length; i++) {
    const raw = values[i];
    const logRow = {};
    lhm.headers.forEach((h, idx) => { logRow[h] = raw[idx]; });
    const responseObj = answerLogRowToResponseRow_(logRow);
    if (upsertResponseRow_(responseSheet, rhm, responseObj)) synced++;
  }
  return { status: 'Synced', synced: synced };
}

// ➔ 直接從 answer_log 讀評分，轉換欄位名稱後回傳，不再讀 responses。
function listResponses_(p) {
  const ss = getOrCreateSpreadsheet_();
  const sheet = getOrCreateAnswerLogSheet_(ss);
  const hm = headerIndexMap_(sheet, ANSWER_LOG_HEADERS);
  const values = sheet.getDataRange().getValues();

  const filterReviewer = p.reviewer || '';
  const filterStrategy = p.strategy || '';
  const filterDataset  = p.dataset  || '';
  const filterModel    = p.model    || '';

  const out = [];
  for (let i = 1; i < values.length; i++) {
    const r = values[i];
    const row = {};
    hm.headers.forEach((h, idx) => { row[h] = r[idx]; });

    if (filterReviewer && row.reviewer !== filterReviewer) continue;
    if (filterStrategy && !String(row.strategy || '').toLowerCase().includes(filterStrategy.toLowerCase())) continue;
    if (filterDataset  && !String(row.dataset  || '').toLowerCase().includes(filterDataset.toLowerCase()))  continue;
    if (filterModel    && !String(row.model    || '').toLowerCase().includes(filterModel.toLowerCase()))    continue;

    // ➔ 將 answer_log 的欄位名稱（whole_quality1）轉換為 responses 格式（whole_quality_1），
    //    確保前端 admin.js 的 ratingKeys() 解析邏輯不需更動。
    const converted = answerLogRowToResponseRow_(row);
    if (responseRowHasAnyScore_(converted)) out.push(converted);
  }

  out.sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')));
  return { rows: out };
}

// ➔ 評分資料改從 answer_log 讀取（已是唯一真實來源），progress 仍從 progress sheet 讀。
function loadProgressAndRatings_(p) {
  const ss = getOrCreateSpreadsheet_();
  const reviewer = p.reviewer || '';
  const strategy = p.strategy || '';
  const dataset  = p.dataset  || '';
  const model    = p.model    || '';

  // --- 從 answer_log 讀評分 ---
  const logSheet = getOrCreateAnswerLogSheet_(ss);
  const lhm = headerIndexMap_(logSheet, ANSWER_LOG_HEADERS);
  const lValues = logSheet.getDataRange().getValues();
  const userRatings = [];
  for (let i = 1; i < lValues.length; i++) {
    const r = lValues[i];
    const rowObj = {};
    lhm.headers.forEach((h, idx) => { rowObj[h] = r[idx]; });
    if (reviewer && rowObj.reviewer !== reviewer) continue;
    if (strategy && rowObj.strategy !== strategy) continue;
    if (dataset  && rowObj.dataset  !== dataset)  continue;
    if (model    && rowObj.model    !== model)     continue;
    // 轉換為 responses 格式，讓前端不需感知欄位差異
    userRatings.push(answerLogRowToResponseRow_(rowObj));
  }

  // --- 從 progress sheet 讀進度 ---
  const pSheet = getOrCreateSheet_(ss, PROGRESS_SHEET, PROGRESS_HEADERS);
  const phm = headerIndexMap_(pSheet, PROGRESS_HEADERS);
  const pValues = pSheet.getDataRange().getValues();
  let userProgress = null;
  for (let i = 1; i < pValues.length; i++) {
    const r = pValues[i];
    const rowObj = {};
    phm.headers.forEach((h, idx) => { rowObj[h] = r[idx]; });
    if (reviewer && rowObj.reviewer !== reviewer) continue;
    if (strategy && rowObj.strategy !== strategy) continue;
    if (dataset  && rowObj.dataset  !== dataset)  continue;
    if (model    && rowObj.model    !== model)     continue;
    userProgress = rowObj;
    break;
  }
  return { ratings: userRatings, progress: userProgress };
}

// ─── Manifest 快取（分塊，支援大型 manifest）────────────────────────────────
// CacheService 單個 value 上限 100KB，625 張圖的 manifest 可能超過。
// 解法：把 JSON 切成 < 95KB 的塊，分別存 manifest_v2_0 / manifest_v2_1 …
// 並存一個 manifest_v2_meta = { chunks: N } 作為索引。
const MANIFEST_CACHE_PREFIX = 'manifest_v2_';
const MANIFEST_CACHE_TTL    = 600;   // seconds
const MANIFEST_CHUNK_SIZE   = 95000; // bytes per chunk（留 5KB buffer）

function loadManifestCached_() {
  const cache = CacheService.getScriptCache();
  const meta  = cache.get(MANIFEST_CACHE_PREFIX + 'meta');
  if (meta) {
    try {
      const metaObj = JSON.parse(meta);
      const chunks = metaObj.chunks;
      const keys = [];
      for (var i = 0; i < chunks; i++) keys.push(MANIFEST_CACHE_PREFIX + i);
      const parts = cache.getAll(keys);
      var json = '';
      var ok = true;
      for (var j = 0; j < chunks; j++) {
        var part = parts[MANIFEST_CACHE_PREFIX + j];
        if (!part) { ok = false; break; }
        json += part;
      }
      if (ok && json) return JSON.parse(json);
    } catch(e) { /* fallthrough to rebuild */ }
  }

  const manifest = loadManifest();
  try {
    const json   = JSON.stringify(manifest);
    const chunks = Math.ceil(json.length / MANIFEST_CHUNK_SIZE);
    const toStore = {};
    toStore[MANIFEST_CACHE_PREFIX + 'meta'] = JSON.stringify({ chunks: chunks });
    for (var k = 0; k < chunks; k++) {
      toStore[MANIFEST_CACHE_PREFIX + k] = json.slice(k * MANIFEST_CHUNK_SIZE, (k + 1) * MANIFEST_CHUNK_SIZE);
    }
    cache.putAll(toStore, MANIFEST_CACHE_TTL);
  } catch(e) {}
  return manifest;
}

// meta key 被清掉就等同全部失效（舊 chunk key 等 TTL 自然過期）
function bustManifestCache_() {
  CacheService.getScriptCache().remove(MANIFEST_CACHE_PREFIX + 'meta');
}

function loadManifest() {
  let root;
  if (DRIVE_ROOT_FOLDER_ID) {
    root = DriveApp.getFolderById(DRIVE_ROOT_FOLDER_ID);
  } else {
    const folders = DriveApp.getFoldersByName(DRIVE_ROOT_FOLDER_NAME);
    if (!folders.hasNext()) { throw new Error('Root folder "' + DRIVE_ROOT_FOLDER_NAME + '" not found.'); }
    root = folders.next();
  }
  const manifest = [];
  const strategies = foldersToArray_(root);
  strategies.sort(nameSort_);

  strategies.forEach(sf => {
    const strategyName = sf.getName();
    if (strategyName.startsWith('.') || strategyName.startsWith('_')) return;

    const datasets = foldersToArray_(sf);
    datasets.sort(nameSort_);

    datasets.forEach(df => {
      const datasetName = df.getName();
      if (datasetName.startsWith('.') || datasetName.startsWith('_')) return;

      const models = foldersToArray_(df);
      models.sort(nameSort_);

      models.forEach(mf => {
        const modelName = mf.getName().toLowerCase();
        if (ALLOWED_MODELS.indexOf(modelName) === -1) return;

        const files = filesToArray_(mf);
        files.sort(nameSort_);

        const images = [];
        files.forEach(f => {
          const fname = f.getName();
          if (!isAllowedImage_(fname)) return;
          if (AUTO_SHARE_IMAGES) {
            try { f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch(e){}
          }
          images.push(fileToMeta_(f, modelName));
        });

        if (images.length > 0) {
          manifest.push({ strategy: strategyName, dataset: datasetName, model: modelName, images: images });
        }
      });
    });
  });
  return manifest;
}

function fileToMeta_(file, model) {
  const filename = file.getName();
  const m = filename.match(FILENAME_RE);
  let machine = '', organ = '', number = '';
  if (m) { machine = m[2]; organ = m[3]; number = m[4]; }
  return {
    id: stableIdFromFilename_(filename),
    fileId: file.getId(),
    filename: filename,
    url: 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(file.getId()) + '&sz=w2000',
    webViewUrl: file.getUrl(),
    imageLink: file.getUrl(),
    questionNo: number,
    machine_group: machine,
    organ: organ,
    number: number
  };
}

function stableIdFromFilename_(filename) {
  const m = String(filename || '').match(FILENAME_RE);
  if (!m) return String(filename || '').replace(/\.[^.]+$/, '');
  return [m[1].toLowerCase(), m[2], m[3] + '_' + m[4]].join('-');
}

function foldersToArray_(folder) {
  const out = []; const it = folder.getFolders();
  while (it.hasNext()) out.push(it.next());
  return out;
}
function filesToArray_(folder) {
  const out = []; const it = folder.getFiles();
  while (it.hasNext()) out.push(it.next());
  return out;
}
function getChildFolder_(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : null;
}
function isAllowedImage_(filename) {
  const ext = String(filename).split('.').pop().toLowerCase();
  return IMAGE_EXTS.indexOf(ext) !== -1;
}
function nameSort_(a, b) {
  return String(a.getName()).localeCompare(String(b.getName()), undefined, { numeric: true, sensitivity: 'base' });
}
