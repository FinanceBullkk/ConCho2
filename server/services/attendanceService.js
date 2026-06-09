// ──────────────────────────────────────────────────────────
// Attendance Service (facade)
// ──────────────────────────────────────────────────────────
// The legacy 396-line attendanceService was split by concern (Phase 1
// modular-monolith refactor) into services/attendance/*:
//   - attendance-scope.js     → Teacher visibility scope helpers (shared)
//   - attendance-marking.js   → bulkMark (+ lastActiveAt write-through) + record reads
//   - attendance-analytics.js → by-employee / by-team / by-class / personal rollups
// This module re-exports the same surface so attendanceController and the
// tests that import it directly are unchanged.

const { ServiceError } = require('../helpers/ServiceError');
const { bulkMark, getBySchedule, getByUser } = require('./attendance/attendance-marking');
const {
  analyticsByEmployee,
  analyticsByTeam,
  analyticsByClass,
  getMyStats,
} = require('./attendance/attendance-analytics');

module.exports = {
  ServiceError,
  bulkMark,
  getBySchedule,
  getByUser,
  analyticsByEmployee,
  analyticsByTeam,
  analyticsByClass,
  getMyStats,
};
