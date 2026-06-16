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
      data = { manifest: loadManifest() };
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

function saveRating_(p) {
  const ss = getOrCreateSpreadsheet_();
  const sheet = getOrCreateSheet_(ss, RESPONSES_SHEET, RESPONSE_HEADERS);
  const hm = headerIndexMap_(sheet, RESPONSE_HEADERS);

  const reviewer = p.reviewer || '';
  const strategy = p.strategy || '';
  const dataset = p.dataset || '';
  const model = p.model || '';
  const imageId = p.imageId || p.fileId || p.filename || '';

  p.imageId = imageId;
  if (!reviewer || !strategy || !dataset || !model || !imageId) {
    throw new Error('Missing core identification fields.');
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
  const idxImageId = hm.map.imageId;

  for (let i = 1; i < values.length; i++) {
    const r = values[i];
    if (r[idxReviewer] === reviewer && r[idxStrategy] === strategy && r[idxDataset] === dataset && r[idxModel] === model && r[idxImageId] === imageId) {
      foundRowIndex = i + 1;
      break;
    }
  }

  if (foundRowIndex > 0) {
    sheet.getRange(foundRowIndex, 1, 1, rowData.length).setValues([rowData]);
  } else {
    sheet.appendRow(rowData);
  }
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

function listResponses_(p) {
  const ss = getOrCreateSpreadsheet_();
  const sheet = getOrCreateSheet_(ss, RESPONSES_SHEET, RESPONSE_HEADERS);
  const hm = headerIndexMap_(sheet, RESPONSE_HEADERS);
  const values = sheet.getDataRange().getValues();

  const filterReviewer = p.reviewer || '';
  const filterStrategy = p.strategy || '';
  const filterDataset = p.dataset || '';
  const filterModel = p.model || '';

  const out = [];
  for (let i = 1; i < values.length; i++) {
    const r = values[i];
    const rowObj = {};
    hm.headers.forEach((h, idx) => { rowObj[h] = r[idx]; });

    if (filterReviewer && rowObj.reviewer !== filterReviewer) continue;
    if (filterStrategy && !String(rowObj.strategy).toLowerCase().includes(filterStrategy.toLowerCase())) continue;
    if (filterDataset && !String(rowObj.dataset).toLowerCase().includes(filterDataset.toLowerCase())) continue;
    if (filterModel && !String(rowObj.model).toLowerCase().includes(filterModel.toLowerCase())) continue;

    if (responseRowHasAnyScore_(rowObj)) out.push(rowObj);
  }

  // 保險：若 responses 沒有資料或分數欄空白，但 answer_log 已有答案，讀取時自動回填 responses。
  if (out.length === 0) {
    syncResponsesFromAnswerLog_();
    const refreshed = sheet.getDataRange().getValues();
    for (let i = 1; i < refreshed.length; i++) {
      const r = refreshed[i];
      const rowObj = {};
      hm.headers.forEach((h, idx) => { rowObj[h] = r[idx]; });
      if (filterReviewer && rowObj.reviewer !== filterReviewer) continue;
      if (filterStrategy && !String(rowObj.strategy).toLowerCase().includes(filterStrategy.toLowerCase())) continue;
      if (filterDataset && !String(rowObj.dataset).toLowerCase().includes(filterDataset.toLowerCase())) continue;
      if (filterModel && !String(rowObj.model).toLowerCase().includes(filterModel.toLowerCase())) continue;
      if (responseRowHasAnyScore_(rowObj)) out.push(rowObj);
    }
  }

  out.sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')));
  return { rows: out };
}

function loadProgressAndRatings_(p) {
  const ss = getOrCreateSpreadsheet_();
  const reviewer = p.reviewer || '';
  const strategy = p.strategy || '';
  const dataset = p.dataset || '';
  const model = p.model || '';

  const rSheet = getOrCreateSheet_(ss, RESPONSES_SHEET, RESPONSE_HEADERS);
  const rhm = headerIndexMap_(rSheet, RESPONSE_HEADERS);
  const rValues = rSheet.getDataRange().getValues();
  const userRatings = [];
  for (let i = 1; i < rValues.length; i++) {
    const r = rValues[i];
    const rowObj = {};
    rhm.headers.forEach((h, idx) => { rowObj[h] = r[idx]; });
    if (reviewer && rowObj.reviewer !== reviewer) continue;
    if (strategy && rowObj.strategy !== strategy) continue;
    if (dataset && rowObj.dataset !== dataset) continue;
    if (model && rowObj.model !== model) continue;
    userRatings.push(rowObj);
  }

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
    if (dataset && rowObj.dataset !== dataset) continue;
    if (model && rowObj.model !== model) continue;
    userProgress = rowObj;
    break;
  }
  return { ratings: userRatings, progress: userProgress };
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
