// English-training import — workbook reader (exceljs). Reads the 6 Phase-1 source
// sheets into header-keyed row objects, with a file checksum + per-row hash for
// idempotent staging. Read-only; no DB, no business rules.

const fs = require('fs');
const crypto = require('crypto');
const ExcelJS = require('exceljs');

// Phase-1 canonical source sheets (others — attendance/placement/dashboards — ignored).
const PHASE1_SHEETS = ['STUDENTS', 'COURSE_PLAN', 'CLASSES', 'ENROLLMENTS', 'PIC'];
const PHASE2_SHEETS = ['CLASS_SESSIONS', 'ATTENDANCE'];
const IMPORT_SHEETS = [...PHASE1_SHEETS, ...PHASE2_SHEETS];

// exceljs cell value → primitive: unwrap formula {result}, hyperlink {text}, richText.
function cellValue(v) {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'object') {
    if ('result' in v) return v.result;
    if ('text' in v) return v.text;
    if ('richText' in v) return v.richText.map((r) => r.text).join('');
    if ('hyperlink' in v) return v.hyperlink;
    return null;
  }
  return v;
}

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

// Returns { checksum, sheets: { NAME: [{ __row, ...headerKeyedCells }] } }.
async function readWorkbook(path) {
  const checksum = sha256(fs.readFileSync(path));
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);

  const sheets = {};
  for (const name of IMPORT_SHEETS) {
    const ws = wb.getWorksheet(name);
    if (!ws) { sheets[name] = []; continue; }

    // Header = row 1 (trimmed). Column index → header label.
    const header = {};
    ws.getRow(1).eachCell({ includeEmpty: false }, (cell, col) => {
      const label = String(cellValue(cell.value) ?? '').replace(/\s+/g, ' ').trim();
      if (label) header[col] = label;
    });

    const rows = [];
    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return; // header
      const obj = { __row: rowNumber };
      let hasValue = false;
      row.eachCell({ includeEmpty: false }, (cell, col) => {
        const label = header[col];
        if (!label) return;
        const val = cellValue(cell.value);
        if (val !== null && val !== '') hasValue = true;
        obj[label] = val;
      });
      if (hasValue) rows.push(obj);
    });
    sheets[name] = rows;
  }
  return { checksum, sheets };
}

// Stable hash of one source row's content (excludes __row) for idempotent staging.
function rowHash(obj) {
  const copy = { ...obj };
  delete copy.__row;
  return sha256(JSON.stringify(copy, Object.keys(copy).sort()));
}

module.exports = { readWorkbook, rowHash, PHASE1_SHEETS, PHASE2_SHEETS, IMPORT_SHEETS };
