const { ServiceError } = require('../../helpers/ServiceError');

// ──────────────────────────────────────────────────────────
// Export row cap (shared by attendance + evaluation export)
// ──────────────────────────────────────────────────────────
// PERF-001 (audit PR D): hard cap on rows per export call.
//
// generateExcel buffers the entire workbook in Node memory via
// workbook.xlsx.writeBuffer(). At ~150B/cell × 15 columns × 100k rows
// that's 225 MB+ — enough to OOM the Render free-tier instance (512 MB).
// At 50k rows we stay comfortably under 200 MB heap.
//
// Operator override: set EXPORT_MAX_ROWS env to raise/lower without a
// code change. Read at CALL time (not module-load) so tests + ops can
// flip it without restarting the process. The full streaming refactor
// (workbook.xlsx.write(res) + aggregation cursor) is tracked as
// PERF-001 follow-up.
const DEFAULT_EXPORT_MAX_ROWS = 50_000;

/**
 * Throw a 413 if an export would exceed the per-request row cap.
 * @param {number} recordCount  Number of rows the export would produce
 * @param {string} kind         Export kind ('attendance'|'evaluations') — reserved for messaging
 */
const enforceRowCap = (recordCount, kind = 'export') => {
  const max = Number(process.env.EXPORT_MAX_ROWS) || DEFAULT_EXPORT_MAX_ROWS;
  if (recordCount > max) {
    throw new ServiceError(
      `Export too large: ${recordCount} rows exceeds the per-request limit of ${max}. ` +
      `Narrow the date range or set EXPORT_MAX_ROWS higher.`,
      413, // Payload Too Large — semantically correct for size-driven refusal
    );
  }
};

module.exports = { enforceRowCap, DEFAULT_EXPORT_MAX_ROWS };
