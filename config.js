const SPREADSHEET_NAME = 'Ultrasound_subjective_evaluation_database';
const RESPONSES_SHEET = 'responses';
const PROGRESS_SHEET = 'progress';

// IMPORTANT: paste the folder ID of Google Drive folder "UltrasoundImages" here.
// Example folder URL: https://drive.google.com/drive/folders/1AbCdEf...
// Folder ID is the part after /folders/.
const DRIVE_ROOT_FOLDER_ID = '';
const DRIVE_ROOT_FOLDER_NAME = 'UltrasoundImages';

// If true, Apps Script will set each image file to "Anyone with the link can view" while scanning.
// Keep false if your institution does not allow public Drive sharing. Images may not render in browser unless they are viewable.
const AUTO_SHARE_IMAGES = false;

const ALLOWED_MODELS = ['cut', 'cyc', 'fast', 'p2p', 'reg'];
const MODEL_DISPLAY = { cut: 'Model A', cyc: 'Model B', fast: 'Model C', p2p: 'Model D', reg: 'Model E' };
const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'webp'];
const FILENAME_RE = /^(cut|cyc|fast|p2p|reg)-(.+)-([^_]+)_(\d+)\.(png|jpg|jpeg|webp)$/i;

const RESPONSE_HEADERS = [
  'timestamp', 'reviewer', 'strategy', 'dataset', 'model', 'displayModel',
  'imageId', 'fileId', 'filename', 'imageUrl',
  'whole_quality_1', 'whole_quality_2', 'whole_quality_3',
  'noise_suppression_1', 'noise_suppression_2', 'noise_suppression_3',
  'contrast_1', 'contrast_2', 'contrast_3',
  'edge_sharpness_1', 'edge_sharpness_2', 'edge_sharpness_3'
];

const PROGRESS_HEADERS = [
  'timestamp', 'reviewer', 'strategy', 'dataset', 'model', 'displayModel',
  'currentIndex', 'total', 'completed', 'completedStatus'
];

function doGet(e) {
  const p = (e && e.parameter) ? e.parameter : {};
  const action = String(p.action || 'ping');
  setupSheets_();
  let result;
  try {
    if (action === 'getManifest') {
      result = { ok: true, manifest: buildDriveManifest_() };
    } else if (action === 'listResponses') {
      result = { ok: true, rows: listResponses_(p) };
    } else if (action === 'listProgress') {
      result = { ok: true, rows: listProgress_(p) };
    } else if (action === 'setup') {
      result = { ok: true, message: 'Sheets are ready.' };
    } else {
      result = { ok: true, message: 'Ultrasound subjective evaluation backend is running.' };
    }
  } catch (err) {
    result = { ok: false, error: String(err && err.message ? err.message : err) };
  }
  return output_(result, p.callback);
}

function doPost(e) {
  const p = (e && e.parameter) ? e.parameter : {};
  const action = String(p.action || '');
  setupSheets_();
  try {
    if (action === 'saveRating') {
      upsertRating_(p);
      return output_({ ok: true, action: 'saveRating' });
    }
    if (action === 'saveProgress') {
      upsertProgress_(p);
      return output_({ ok: true, action: 'saveProgress' });
    }
    return output_({ ok: false, error: 'Unknown action: ' + action });
  } catch (err) {
    return output_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function output_(obj, callback) {
  const json = JSON.stringify(obj);
  if (callback) {
    return ContentService.createTextOutput(String(callback) + '(' + json + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

function getSpreadsheet_() {
  const files = DriveApp.getFilesByName(SPREADSHEET_NAME);
  if (files.hasNext()) return SpreadsheetApp.open(files.next());
  return SpreadsheetApp.create(SPREADSHEET_NAME);
}

function setupSheets_() {
  const ss = getSpreadsheet_();
  ensureSheet_(ss, RESPONSES_SHEET, RESPONSE_HEADERS);
  ensureSheet_(ss, PROGRESS_SHEET, PROGRESS_HEADERS);
  return ss;
}

// Safe schema migration: append missing headers only. Never clear existing sheets.
function ensureSheet_(ss, name, requiredHeaders) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  const lastCol = Math.max(sh.getLastColumn(), 1);
  let existing = sh.getRange(1, 1, 1, lastCol).getValues()[0].filter(String);
  if (existing.length === 0) {
    sh.getRange(1, 1, 1, requiredHeaders.length).setValues([requiredHeaders]);
    sh.setFrozenRows(1);
    return sh;
  }
  const missing = requiredHeaders.filter(h => existing.indexOf(h) === -1);
  if (missing.length) {
    sh.getRange(1, existing.length + 1, 1, missing.length).setValues([missing]);
    sh.setFrozenRows(1);
  }
  return sh;
}

function headerMap_(sh) {
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const map = {};
  headers.forEach((h, i) => { if (h) map[String(h)] = i + 1; });
  return map;
}

function rowObject_(headers, row) {
  const obj = {};
  headers.forEach((h, i) => obj[h] = row[i]);
  return obj;
}

function findRowByKey_(sh, keyHeaders, p) {
  const map = headerMap_(sh);
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return -1;
  const values = sh.getRange(2, 1, lastRow - 1, sh.getLastColumn()).getValues();
  for (let i = 0; i < values.length; i++) {
    let ok = true;
    for (let j = 0; j < keyHeaders.length; j++) {
      const h = keyHeaders[j];
      const col = map[h];
      if (!col || String(values[i][col - 1]) !== String(p[h] || '')) { ok = false; break; }
    }
    if (ok) return i + 2;
  }
  return -1;
}

function setRowByHeaders_(sh, rowIndex, headers, p) {
  const map = headerMap_(sh);
  headers.forEach(h => {
    if (map[h]) sh.getRange(rowIndex, map[h]).setValue(p[h] === undefined ? '' : p[h]);
  });
}

function upsertRating_(p) {
  const ss = setupSheets_();
  const sh = ss.getSheetByName(RESPONSES_SHEET);
  const record = {};
  RESPONSE_HEADERS.forEach(h => record[h] = p[h] || '');
  record.timestamp = new Date();
  record.imageId = p.imageId || stableIdFromFilename_(p.filename || '') || p.fileId || '';
  record.fileId = p.fileId || '';
  record.imageUrl = p.imageUrl || '';
  record.displayModel = p.displayModel || MODEL_DISPLAY[p.model] || p.model || '';

  // The stable key intentionally excludes imageUrl/fileId. If Drive URL changes, old answers remain attached to the same imageId.
  const key = ['reviewer', 'strategy', 'dataset', 'model', 'imageId'];
  const row = findRowByKey_(sh, key, record);
  if (row > 0) setRowByHeaders_(sh, row, RESPONSE_HEADERS, record);
  else sh.appendRow(RESPONSE_HEADERS.map(h => record[h] || ''));
}

function upsertProgress_(p) {
  const ss = setupSheets_();
  const sh = ss.getSheetByName(PROGRESS_SHEET);
  const record = {};
  PROGRESS_HEADERS.forEach(h => record[h] = p[h] || '');
  record.timestamp = new Date();
  record.displayModel = p.displayModel || MODEL_DISPLAY[p.model] || p.model || '';
  const key = ['reviewer', 'strategy', 'dataset', 'model'];
  const row = findRowByKey_(sh, key, record);
  if (row > 0) setRowByHeaders_(sh, row, PROGRESS_HEADERS, record);
  else sh.appendRow(PROGRESS_HEADERS.map(h => record[h] || ''));
}

function listResponses_(p) {
  const ss = setupSheets_();
  const sh = ss.getSheetByName(RESPONSES_SHEET);
  if (sh.getLastRow() < 2) return [];
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const rows = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues().map(r => rowObject_(headers, r));
  return rows.filter(r =>
    (!p.reviewer || String(r.reviewer) === String(p.reviewer)) &&
    (!p.strategy || String(r.strategy) === String(p.strategy)) &&
    (!p.dataset || String(r.dataset) === String(p.dataset)) &&
    (!p.model || String(r.model) === String(p.model))
  ).map(r => {
    if (r.timestamp instanceof Date) r.timestamp = Utilities.formatDate(r.timestamp, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
    return r;
  });
}

function listProgress_(p) {
  const ss = setupSheets_();
  const sh = ss.getSheetByName(PROGRESS_SHEET);
  if (sh.getLastRow() < 2) return [];
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const rows = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues().map(r => rowObject_(headers, r));
  return rows.filter(r =>
    (!p.reviewer || String(r.reviewer) === String(p.reviewer)) &&
    (!p.strategy || String(r.strategy) === String(p.strategy)) &&
    (!p.dataset || String(r.dataset) === String(p.dataset)) &&
    (!p.model || String(r.model) === String(p.model))
  );
}

function getRootFolder_() {
  if (DRIVE_ROOT_FOLDER_ID) return DriveApp.getFolderById(DRIVE_ROOT_FOLDER_ID);
  const it = DriveApp.getFoldersByName(DRIVE_ROOT_FOLDER_NAME);
  if (it.hasNext()) return it.next();
  throw new Error('找不到 Google Drive 根資料夾：請設定 DRIVE_ROOT_FOLDER_ID，或建立名為 ' + DRIVE_ROOT_FOLDER_NAME + ' 的資料夾。');
}

function buildDriveManifest_() {
  const root = getRootFolder_();
  const manifest = [];
  const strategyFolders = foldersToArray_(root).sort(nameSort_);
  strategyFolders.forEach(strategyFolder => {
    const strategy = strategyFolder.getName();
    const datasetFolders = foldersToArray_(strategyFolder).sort(nameSort_);
    datasetFolders.forEach(datasetFolder => {
      const dataset = datasetFolder.getName();
      ALLOWED_MODELS.forEach(model => {
        const modelFolder = getChildFolder_(datasetFolder, model);
        if (!modelFolder) return;
        const images = filesToArray_(modelFolder)
          .filter(f => isAllowedImage_(f.getName()))
          .sort(fileNaturalSort_)
          .map(f => imageEntry_(f));
        manifest.push({
          strategy: strategy,
          dataset: dataset,
          model: model,
          displayModel: MODEL_DISPLAY[model],
          images: images
        });
      });
    });
  });
  return manifest;
}

function imageEntry_(file) {
  const name = file.getName();
  const m = name.match(FILENAME_RE);
  if (!m) throw new Error('檔名不符合規則：' + name);
  const model = m[1].toLowerCase();
  const machine = m[2];
  const organ = m[3];
  const number = m[4];
  if (AUTO_SHARE_IMAGES) {
    try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (err) {}
  }
  return {
    id: stableIdFromFilename_(name),
    fileId: file.getId(),
    filename: name,
    // Browser image display still requires that the file can be viewed by the page visitor.
    url: 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(file.getId()) + '&sz=w2000',
    webViewUrl: file.getUrl(),
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
  const out = [];
  const it = folder.getFolders();
  while (it.hasNext()) out.push(it.next());
  return out;
}
function filesToArray_(folder) {
  const out = [];
  const it = folder.getFiles();
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
function nameSort_(a, b) { return String(a.getName()).localeCompare(String(b.getName()), undefined, { numeric: true, sensitivity: 'base' }); }
function fileNaturalSort_(a, b) { return String(a.getName()).localeCompare(String(b.getName()), undefined, { numeric: true, sensitivity: 'base' }); }
