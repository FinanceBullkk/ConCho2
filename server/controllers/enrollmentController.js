// ──────────────────────────────────────────────────────────
// Enrollment Controller (facade)
// ──────────────────────────────────────────────────────────
// The legacy 544-line enrollmentController was split by concern (Phase 1
// modular-monolith refactor) into controllers/enrollment/*:
//   - enrollment-shared.js   → enrichWithAttendance + pull-dropped helper
//   - enrollment-queries.js  → list / by-team / by-user / check-conflicts
//   - enrollment-status.js   → update + bulk status change (tx)
//   - enrollment-transfer.js → single + bulk transfer (atomic, reuses single)
// This module re-exports the same handler surface so enrollmentRoutes.js is
// unchanged.

const {
  getEnrollments,
  getTeamEnrollments,
  getUserEnrollments,
  checkConflicts,
} = require('./enrollment/enrollment-queries');
const {
  updateEnrollment,
  bulkUpdateEnrollmentStatus,
} = require('./enrollment/enrollment-status');
const {
  transferEnrollment,
  bulkTransferEnrollment,
} = require('./enrollment/enrollment-transfer');

module.exports = {
  getEnrollments,
  getTeamEnrollments,
  getUserEnrollments,
  updateEnrollment,
  checkConflicts,
  transferEnrollment,
  bulkUpdateEnrollmentStatus,
  bulkTransferEnrollment,
};
