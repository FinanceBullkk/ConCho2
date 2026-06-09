// ──────────────────────────────────────────────────────────
// Export Service (facade)
// ──────────────────────────────────────────────────────────
// The legacy 618-line exportService was split by concern (Phase 1
// modular-monolith refactor) into services/export/*:
//   - export-row-cap.js      → shared per-request row cap
//   - attendance-workbook.js → attendance Excel rendering
//   - attendance-export.js   → attendance pipeline + claim-race flow + stats
//   - evaluation-workbook.js → evaluation Excel rendering
//   - evaluation-export.js   → evaluation pipeline + flow
// This module re-exports the same public surface so the export controller
// and tests (which import `services/exportService`) are unchanged.

const { ServiceError } = require('../helpers/ServiceError');
const { safeCell } = require('../helpers/excel-formula-guard');
const attendance = require('./export/attendance-export');
const evaluation = require('./export/evaluation-export');

module.exports = {
  ServiceError,
  // Attendance export
  exportAttendance: attendance.exportAttendance,
  getExportStats: attendance.getExportStats,
  queryExportData: attendance.queryExportData,
  // Evaluation export
  exportEvaluations: evaluation.exportEvaluations,
  queryEvaluationData: evaluation.queryEvaluationData,
  // Re-exported for unit tests (SEC-004 formula-injection guard)
  safeCell,
};
