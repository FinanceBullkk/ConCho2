// ──────────────────────────────────────────────────────────
// attendance/use-cases — public surface for the attendance domain
// ──────────────────────────────────────────────────────────
// Phase 1 domain extraction: marking + analytics were relocated here from
// services/attendance/*. This module re-exports the same surface the legacy
// `services/attendanceService` facade exposed, so the controller and the tests
// that import that facade stay unchanged (behavior-preserving).

const { ServiceError } = require('../../helpers/ServiceError');
const { bulkMark, getBySchedule, getByUser } = require('./marking');
const {
  analyticsByEmployee,
  analyticsByTeam,
  analyticsByClass,
  getMyStats,
} = require('./analytics');

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
