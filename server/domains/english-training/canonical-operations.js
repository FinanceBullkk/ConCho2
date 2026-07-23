// Canonical English live-operations commands — public entry point.
//
// The implementation is split by concern to stay within the modularization
// guideline while keeping this stable require path for the controller and tests:
//   - canonical-operations-shared.js       → helpers + pinned authority
//   - canonical-enrollment-operations.js   → class create / start / leave / transfer
//   - canonical-meeting-operations.js      → Meeting create/reschedule/cancel + roster read/save
//
// ConMeoGauGau owns business semantics; canonical commands live here while raw
// workbook evidence stays immutable.
const enrollment = require('./canonical-enrollment-operations');
const meeting = require('./canonical-meeting-operations');
const { normalizeLabel, rosterToken } = require('./canonical-operations-shared');

module.exports = {
  createClassCourseRun: enrollment.createClassCourseRun,
  addRunEnrollment: enrollment.addRunEnrollment,
  leaveRunEnrollment: enrollment.leaveRunEnrollment,
  transferLearner: enrollment.transferLearner,
  createAttendanceSession: meeting.createAttendanceSession,
  rescheduleMeeting: meeting.rescheduleMeeting,
  cancelMeeting: meeting.cancelMeeting,
  getAttendanceRoster: meeting.getAttendanceRoster,
  saveAttendanceRoster: meeting.saveAttendanceRoster,
  normalizeLabel,
  rosterToken,
};
