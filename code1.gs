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
  'timestamp', 'reviewer', 'filename', 'imagePosition', 'ratingItem', 'score',
  'strategy', 'dataset', 'model', 'displayModel', 'imageId', 'fileId', 'imageUrl', 'imageLink'
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
  getOrCreateSheet_(ss, ANSWER_LOG_SHEET, ANSWER_LOG_HEADERS);
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
  const imageId = p.imageId || '';

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
  const sheet = getOrCreateSheet_(ss, ANSWER_LOG_SHEET, ANSWER_LOG_HEADERS);
  const hm = headerIndexMap_(sheet, ANSWER_LOG_HEADERS);

  const reviewer = p.reviewer || '';
  const strategy = p.strategy || '';
  const dataset = p.dataset || '';
  const model = p.model || '';
  const displayModel = p.displayModel || '';
  const imageId = p.imageId || '';
  const fileId = p.fileId || '';
  const filename = p.filename || '';
  const imageUrl = p.imageUrl || '';
  const imageLink = p.imageLink || '';

  if (!reviewer || !strategy || !dataset || !model || !imageId) {
    throw new Error('Missing core identification fields for answer_log.');
  }

  // 先刪除此 reviewer + task + image 的舊簡化紀錄，避免同一題重複累積。
  const values = sheet.getDataRange().getValues();
  const idxReviewer = hm.map.reviewer;
  const idxStrategy = hm.map.strategy;
  const idxDataset = hm.map.dataset;
  const idxModel = hm.map.model;
  const idxImageId = hm.map.imageId;
  for (let i = values.length - 1; i >= 1; i--) {
    const r = values[i];
    if (r[idxReviewer] === reviewer && r[idxStrategy] === strategy && r[idxDataset] === dataset && r[idxModel] === model && r[idxImageId] === imageId) {
      sheet.deleteRow(i + 1);
    }
  }

  const now = new Date();
  const rows = [];
  TRIPANEL_ROWS.forEach(row => {
    RATING_FIELDS.forEach(field => {
      const key = field + '_' + row.key;
      const score = p[key];
      if (score === undefined || score === null || score === '') return;
      const obj = {
        timestamp: now, reviewer: reviewer, filename: filename,
        imagePosition: row.label, ratingItem: field, score: score,
        strategy: strategy, dataset: dataset, model: model, displayModel: displayModel,
        imageId: imageId, fileId: fileId, imageUrl: imageUrl, imageLink: imageLink
      };
      rows.push(hm.headers.map(h => obj[h] !== undefined ? obj[h] : ''));
    });
  });

  if (rows.length) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, hm.headers.length).setValues(rows);
  }
  return { status: 'AnswerLogSaved', rows: rows.length };
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

function listResponses_(p) {
  const ss = getOrCreateSpreadsheet_();
  const sheet = getOrCreateSheet_(ss, RESPONSES_SHEET, RESPONSE_HEADERS);
  const hm = headerIndexMap_(sheet, RESPONSE_HEADERS);
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return { rows: [] };

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

    out.push(rowObj);
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
