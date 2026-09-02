/**
 * Nixora Services — form submissions into a spreadsheet.
 *
 * Paste this into Extensions → Apps Script on the destination spreadsheet,
 * set SHARED_TOKEN below, then deploy it as a Web App. Full steps are in
 * worker/README.md.
 *
 * The Worker posts one submission at a time. Each form gets its own tab, and
 * the header row is grown as needed, so adding a field to the site later means
 * a new column here rather than a broken import.
 */

// Must match the SHEET_TOKEN variable on the Cloudflare Worker. A Web App
// deployed for "Anyone" is a public URL: without this, anyone who found it
// could write rows into the company's hiring records.
var SHARED_TOKEN = 'PUT-THE-SAME-TOKEN-HERE';

function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);

    if (!SHARED_TOKEN || payload.token !== SHARED_TOKEN) {
      return reply({ ok: false, error: 'Bad token' });
    }
    if (!payload.tab || !payload.columns || !payload.values) {
      return reply({ ok: false, error: 'Missing tab, columns or values' });
    }

    // One writer at a time: two submissions landing together would otherwise
    // read the same last row and one would overwrite the other.
    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      writeRow(payload);
    } finally {
      lock.releaseLock();
    }

    return reply({ ok: true });
  } catch (error) {
    return reply({ ok: false, error: String(error) });
  }
}

function writeRow(payload) {
  var book = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = book.getSheetByName(payload.tab) || book.insertSheet(payload.tab);

  var header = sheet.getLastRow() > 0
    ? sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0]
    : [];
  header = header.filter(function (name) { return name !== ''; });

  // Any column this submission carries that the sheet has not seen before is
  // added on the end, so an older row keeps its meaning and a newer field does
  // not shift everything sideways.
  var added = false;
  payload.columns.forEach(function (name) {
    if (header.indexOf(name) === -1) {
      header.push(name);
      added = true;
    }
  });

  if (added || sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, header.length).setValues([header]);
    sheet.getRange(1, 1, 1, header.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }

  var byName = {};
  payload.columns.forEach(function (name, i) { byName[name] = payload.values[i]; });

  var row = header.map(function (name) {
    var value = byName.hasOwnProperty(name) ? byName[name] : '';
    // A leading =, + or - makes a spreadsheet treat typed text as a formula.
    // These values come from a public form, so they are pinned to text.
    return typeof value === 'string' && /^[=+\-@]/.test(value) ? "'" + value : value;
  });

  sheet.appendRow(row);
}

function reply(body) {
  return ContentService
    .createTextOutput(JSON.stringify(body))
    .setMimeType(ContentService.MimeType.JSON);
}
