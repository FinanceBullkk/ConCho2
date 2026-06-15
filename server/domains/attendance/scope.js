const repository = require('./repository');
const { findTeacherVisibleClassIds } = require('../../helpers/teacher-class-scope');

// ──────────────────────────────────────────────────────────
// attendance/scope — Teacher visibility scope helpers
// ──────────────────────────────────────────────────────────
// Relocated from services/attendance/attendance-scope.js (Phase 1 domain
// extraction — behavior-preserving). Shared by the record reads (getByUser)
// and the analytics rollups so a Teacher only ever sees attendance for classes
// bound to them.

const scopedScheduleIdsForActor = async (actor) => {
  if (actor?.role !== 'Teacher') return null;
  const classIds = await findTeacherVisibleClassIds(actor._id);
  if (classIds.length === 0) return [];
  return repository.distinctScheduledIdsForClasses(classIds);
};

const scopedAttendanceMatch = async (actor) => {
  const scheduleIds = await scopedScheduleIdsForActor(actor);
  return scheduleIds ? { scheduleId: { $in: scheduleIds } } : {};
};

module.exports = { scopedScheduleIdsForActor, scopedAttendanceMatch };
