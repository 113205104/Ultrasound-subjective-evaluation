const SHEET_RESPONSES = "responses";
const SHEET_PROGRESS = "progress";

function doPost(e) {
  try {
    setupSheets_();
    const payload = JSON.parse(e.postData.contents || "{}");
    const action = payload.action;

    if (action === "saveScore") return json_(saveScore_(payload));
    if (action === "loadTask") return json_(loadTask_(payload));
    if (action === "loadAllProgress") return json_(loadAllProgress_(payload));
    if (action === "loadHistory") return json_(loadHistory_(payload));

    return json_({ ok: false, error: "Unknown action: " + action });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function setupSheets_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  let responses = ss.getSheetByName(SHEET_RESPONSES);
  if (!responses) {
    responses = ss.insertSheet(SHEET_RESPONSES);
  }
  if (responses.getLastRow() === 0) {
    responses.appendRow([
      "key",
      "reviewer",
      "strategy",
      "dataset",
      "model",
      "model_display",
      "group",
      "machine_group",
      "organ",
      "filename",
      "metric",
      "image_position",
      "score",
      "updated_at"
    ]);
  }

  let progress = ss.getSheetByName(SHEET_PROGRESS);
  if (!progress) {
    progress = ss.insertSheet(SHEET_PROGRESS);
  }
  if (progress.getLastRow() === 0) {
    progress.appendRow([
      "key",
      "reviewer",
      "strategy",
      "dataset",
      "model",
      "model_display",
      "answered_count",
      "total_count",
      "status",
      "last_group",
      "page_index",
      "updated_at"
    ]);
  }
}

function responseKey_(p) {
  return [
    p.reviewer,
    p.strategy,
    p.dataset,
    p.model,
    p.group,
    p.metric,
    p.image_position
  ].join("|");
}

function progressKey_(p) {
  return [
    p.reviewer,
    p.strategy,
    p.dataset,
    p.model
  ].join("|");
}

function buildKeyIndex_(sheet) {
  const values = sheet.getDataRange().getValues();
  const out = {};
  for (let i = 1; i < values.length; i++) {
    if (values[i][0]) out[values[i][0]] = i + 1;
  }
  return out;
}

function saveScore_(p) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const responses = ss.getSheetByName(SHEET_RESPONSES);
    const progress = ss.getSheetByName(SHEET_PROGRESS);
    const now = new Date();

    const key = responseKey_(p);
    const index = buildKeyIndex_(responses);

    const row = [
      key,
      p.reviewer,
      p.strategy,
      p.dataset,
      p.model,
      p.model_display || "",
      p.group,
      p.machine_group || "",
      p.organ || "",
      p.filename || "",
      p.metric,
      p.image_position,
      p.score,
      now
    ];

    if (index[key]) {
      responses.getRange(index[key], 1, 1, row.length).setValues([row]);
    } else {
      responses.appendRow(row);
    }

    updateProgress_(progress, p, now);

    return { ok: true, key: key, updated_at: now.toISOString() };
  } finally {
    lock.releaseLock();
  }
}

function updateProgress_(progressSheet, p, now) {
  const all = SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName(SHEET_RESPONSES)
    .getDataRange()
    .getValues();

  const taskKeyPrefix = [
    p.reviewer,
    p.strategy,
    p.dataset,
    p.model
  ].join("|");

  const answered = {};
  let lastGroup = p.group || "";

  for (let i = 1; i < all.length; i++) {
    const key = all[i][0];
    if (String(key).startsWith(taskKeyPrefix + "|")) {
      const group = all[i][6];
      const metric = all[i][10];
      const pos = all[i][11];
      answered[group + "|" + metric + "|" + pos] = true;
      lastGroup = group;
    }
  }

  const answeredCount = Object.keys(answered).length;
  const totalItems = Number(p.total_items || 0);
  let status = "Not Started";
  if (answeredCount > 0 && answeredCount < totalItems) status = "In Progress";
  if (totalItems > 0 && answeredCount >= totalItems) status = "Completed";

  const progressKey = progressKey_(p);
  const idx = buildKeyIndex_(progressSheet);
  const row = [
    progressKey,
    p.reviewer,
    p.strategy,
    p.dataset,
    p.model,
    p.model_display || "",
    answeredCount,
    totalItems,
    status,
    lastGroup,
    Number(p.page_index || 0),
    now
  ];

  if (idx[progressKey]) {
    progressSheet.getRange(idx[progressKey], 1, 1, row.length).setValues([row]);
  } else {
    progressSheet.appendRow(row);
  }
}

function loadTask_(p) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const responses = ss.getSheetByName(SHEET_RESPONSES).getDataRange().getValues();
  const progressValues = ss.getSheetByName(SHEET_PROGRESS).getDataRange().getValues();

  const responseMap = {};
  for (let i = 1; i < responses.length; i++) {
    if (
      responses[i][1] === p.reviewer &&
      responses[i][2] === p.strategy &&
      responses[i][3] === p.dataset &&
      responses[i][4] === p.model
    ) {
      const group = responses[i][6];
      const metric = responses[i][10];
      const imagePosition = responses[i][11];
      const score = responses[i][12];

      responseMap[[group, metric, imagePosition].join("|")] = String(score);
    }
  }

  let pageIndex = 0;
  const pkey = progressKey_(p);
  for (let i = 1; i < progressValues.length; i++) {
    if (progressValues[i][0] === pkey) {
      pageIndex = Number(progressValues[i][10]) || 0;
      break;
    }
  }

  return { ok: true, responses: responseMap, page_index: pageIndex };
}

function loadAllProgress_(p) {
  const progress = SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName(SHEET_PROGRESS)
    .getDataRange()
    .getValues();

  const out = {};
  for (let i = 1; i < progress.length; i++) {
    if (progress[i][1] === p.reviewer) {
      const key = [
        progress[i][2],
        progress[i][3],
        progress[i][4]
      ].join("|");

      out[key] = {
        reviewer: progress[i][1],
        strategy: progress[i][2],
        dataset: progress[i][3],
        model: progress[i][4],
        model_display: progress[i][5],
        answered_count: progress[i][6],
        total_count: progress[i][7],
        status: progress[i][8],
        last_group: progress[i][9],
        page_index: progress[i][10],
        updated_at: progress[i][11]
      };
    }
  }

  return { ok: true, progress: out };
}

function loadHistory_(p) {
  return loadTask_(p);
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
