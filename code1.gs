const SPREADSHEET_NAME = 'Ultrasound_subjective_evaluation_database';
const RESPONSES_SHEET = 'responses';
const PROGRESS_SHEET = 'progress';

const DRIVE_ROOT_FOLDER_ID = '';
const DRIVE_ROOT_FOLDER_NAME = 'UltrasoundImages';
const AUTO_SHARE_IMAGES = false;

const ALLOWED_MODELS = ['cut', 'cyc', 'fast', 'p2p', 'reg'];
const MODEL_DISPLAY = {
  cut: 'Model A',
  cyc: 'Model B',
  fast: 'Model C',
  p2p: 'Model D',
  reg: 'Model E'
};

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
  return handleRequest_(e);
}

function doPost(e) {
  return handleRequest_(e);
}

function handleRequest_(e) {
  const p = e && e.parameter ? e.parameter : {};
  const action = p.action || '';
  const callback = p.callback || '';

  try {
    let data = {};

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
    } else {
      throw new Error('Unknown action: ' + action);
    }

    return jsonpResponse_(callback, {
      success: true,
      data: data
    });

  } catch (err) {
    return jsonpResponse_(callback, {
      success: false,
      error: err.message
    });
  }
}

function jsonpResponse_(callback, obj) {
  const json = JSON.stringify(obj);
  const text = callback ? callback + '(' + json + ')' : json;

  return ContentService
    .createTextOutput(text)
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function getOrCreateSpreadsheet_() {
  const files = DriveApp.getFilesByName(SPREADSHEET_NAME);

  if (files.hasNext()) {
    return SpreadsheetApp.open(files.next());
  }

  return SpreadsheetApp.create(SPREADSHEET_NAME);
}

function getOrCreateSheet_(ss, name, headers) {
  let sheet = ss.getSheetByName(name);

  if (!sheet) {
    sheet = ss.insertSheet(name);
  }

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
  } else {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }

  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');

  const lastCol = sheet.getLastColumn();
  if (lastCol > headers.length) {
    sheet.deleteColumns(headers.length + 1, lastCol - headers.length);
  }

  return sheet;
}

function saveRating_(p) {
  const ss = getOrCreateSpreadsheet_();
  const sheet = getOrCreateSheet_(ss, RESPONSES_SHEET, RESPONSE_HEADERS);

  const reviewer = p.reviewer || '';
  const strategy = p.strategy || '';
  const dataset = p.dataset || '';
  const model = p.model || '';
  const imageId = p.imageId || '';

  if (!reviewer || !strategy || !dataset || !model || !imageId) {
    throw new Error('Missing core identification fields.');
  }

  const rowData = RESPONSE_HEADERS.map(h => {
    if (h === 'timestamp') return new Date();
    return p[h] !== undefined ? p[h] : '';
  });

  const values = sheet.getDataRange().getValues();
  let foundRowIndex = -1;

  for (let i = 1; i < values.length; i++) {
    const r = values[i];

    const sameReviewer = r[1] === reviewer;
    const sameStrategy = r[2] === strategy;
    const sameDataset = r[3] === dataset;
    const sameModel = r[4] === model;
    const sameImage = r[6] === imageId;

    if (sameReviewer && sameStrategy && sameDataset && sameModel && sameImage) {
      foundRowIndex = i + 1;
      break;
    }
  }

  if (foundRowIndex > 0) {
    sheet.getRange(foundRowIndex, 1, 1, rowData.length).setValues([rowData]);
  } else {
    sheet.appendRow(rowData);
  }

  return {
    status: 'Saved',
    reviewer: reviewer,
    imageId: imageId
  };
}

function saveProgress_(p) {
  const ss = getOrCreateSpreadsheet_();
  const sheet = getOrCreateSheet_(ss, PROGRESS_SHEET, PROGRESS_HEADERS);

  const reviewer = p.reviewer || '';
  const strategy = p.strategy || '';
  const dataset = p.dataset || '';
  const model = p.model || '';

  if (!reviewer || !strategy || !dataset || !model) {
    throw new Error('Missing identification for progress.');
  }

  const rowData = PROGRESS_HEADERS.map(h => {
    if (h === 'timestamp') return new Date();
    return p[h] !== undefined ? p[h] : '';
  });

  const values = sheet.getDataRange().getValues();
  let foundRowIndex = -1;

  for (let i = 1; i < values.length; i++) {
    const r = values[i];

    const sameReviewer = r[1] === reviewer;
    const sameStrategy = r[2] === strategy;
    const sameDataset = r[3] === dataset;
    const sameModel = r[4] === model;

    if (sameReviewer && sameStrategy && sameDataset && sameModel) {
      foundRowIndex = i + 1;
      break;
    }
  }

  if (foundRowIndex > 0) {
    sheet.getRange(foundRowIndex, 1, 1, rowData.length).setValues([rowData]);
  } else {
    sheet.appendRow(rowData);
  }

  return {
    status: 'ProgressSaved',
    reviewer: reviewer,
    strategy: strategy,
    dataset: dataset,
    model: model
  };
}

function listResponses_(p) {
  const ss = getOrCreateSpreadsheet_();
  const sheet = getOrCreateSheet_(ss, RESPONSES_SHEET, RESPONSE_HEADERS);
  const values = sheet.getDataRange().getValues();

  if (values.length <= 1) {
    return { rows: [] };
  }

  const filterReviewer = p.reviewer || '';
  const filterStrategy = p.strategy || '';
  const filterDataset = p.dataset || '';
  const filterModel = p.model || '';

  const out = [];

  for (let i = 1; i < values.length; i++) {
    const r = values[i];
    const rowObj = {};

    RESPONSE_HEADERS.forEach((h, idx) => {
      rowObj[h] = r[idx];
    });

    if (filterReviewer && rowObj.reviewer !== filterReviewer) continue;
    if (filterStrategy && !String(rowObj.strategy).toLowerCase().includes(filterStrategy.toLowerCase())) continue;
    if (filterDataset && !String(rowObj.dataset).toLowerCase().includes(filterDataset.toLowerCase())) continue;
    if (filterModel && !String(rowObj.model).toLowerCase().includes(filterModel.toLowerCase())) continue;

    out.push(rowObj);
  }

  return { rows: out };
}

function loadProgressAndRatings_(p) {
  const ss = getOrCreateSpreadsheet_();

  const reviewer = p.reviewer || '';
  const strategy = p.strategy || '';
  const dataset = p.dataset || '';
  const model = p.model || '';

  const rSheet = getOrCreateSheet_(ss, RESPONSES_SHEET, RESPONSE_HEADERS);
  const rValues = rSheet.getDataRange().getValues();

  const userRatings = [];

  for (let i = 1; i < rValues.length; i++) {
    const r = rValues[i];

    if (r[1] === reviewer && r[2] === strategy && r[3] === dataset && r[4] === model) {
      const rowObj = {};
      RESPONSE_HEADERS.forEach((h, idx) => {
        rowObj[h] = r[idx];
      });
      userRatings.push(rowObj);
    }
  }

  const pSheet = getOrCreateSheet_(ss, PROGRESS_SHEET, PROGRESS_HEADERS);
  const pValues = pSheet.getDataRange().getValues();

  let userProgress = null;

  for (let i = 1; i < pValues.length; i++) {
    const r = pValues[i];

    if (r[1] === reviewer && r[2] === strategy && r[3] === dataset && r[4] === model) {
      userProgress = {};
      PROGRESS_HEADERS.forEach((h, idx) => {
        userProgress[h] = r[idx];
      });
      break;
    }
  }

  return {
    ratings: userRatings,
    progress: userProgress
  };
}

function loadManifest() {
  let root;

  if (DRIVE_ROOT_FOLDER_ID) {
    root = DriveApp.getFolderById(DRIVE_ROOT_FOLDER_ID);
  } else {
    const folders = DriveApp.getFoldersByName(DRIVE_ROOT_FOLDER_NAME);

    if (!folders.hasNext()) {
      throw new Error('Root folder "' + DRIVE_ROOT_FOLDER_NAME + '" not found.');
    }

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
            try {
              f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
            } catch (e) {}
          }

          images.push(fileToMeta_(f, modelName));
        });

        if (images.length > 0) {
          manifest.push({
            strategy: strategyName,
            dataset: datasetName,
            model: modelName,
            images: images
          });
        }
      });
    });
  });

  return manifest;
}

function fileToMeta_(file, model) {
  const filename = file.getName();
  const m = filename.match(FILENAME_RE);

  let machine = '';
  let organ = '';
  let number = '';

  if (m) {
    machine = m[2];
    organ = m[3];
    number = m[4];
  }

  return {
    id: stableIdFromFilename_(filename),
    fileId: file.getId(),
    filename: filename,
    url: 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(file.getId()) + '&sz=w2000',
    webViewUrl: file.getUrl(),
    machine_group: machine,
    organ: organ,
    number: number
  };
}

function stableIdFromFilename_(filename) {
  const m = String(filename || '').match(FILENAME_RE);

  if (!m) {
    return String(filename || '').replace(/\.[^.]+$/, '');
  }

  return [
    m[1].toLowerCase(),
    m[2],
    m[3] + '_' + m[4]
  ].join('-');
}

function foldersToArray_(folder) {
  const out = [];
  const it = folder.getFolders();

  while (it.hasNext()) {
    out.push(it.next());
  }

  return out;
}

function filesToArray_(folder) {
  const out = [];
  const it = folder.getFiles();

  while (it.hasNext()) {
    out.push(it.next());
  }

  return out;
}

function getChildFolder_(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : null;
}

function isAllowedImage_(filename) {
  const ext = String(filename || '').split('.').pop().toLowerCase();
  return IMAGE_EXTS.indexOf(ext) !== -1;
}

function nameSort_(a, b) {
  return String(a.getName()).localeCompare(
    String(b.getName()),
    undefined,
    {
      numeric: true,
      sensitivity: 'base'
    }
  );
}
