const Schedule = require('../../models/Schedule');
const { findTeacherVisibleClassIds } = require('../../helpers/teacher-class-scope');

// ──────────────────────────────────────────────────────────
// Attendance Service — Teacher visibility scope helpers
// ──────────────────────────────────────────────────────────
// Split from the legacy attendanceService (Phase 1 modular-monolith).
// Shared by the record reads (getByUser) and the analytics rollups so a
// Teacher only ever sees attendance for classes bound to them.

const scopedScheduleIdsForActor = async (actor) => {
  if (actor?.role !== 'Teacher') return null;
  const classIds = await findTeacherVisibleClassIds(actor._id);
  if (classIds.length === 0) return [];
  return Schedule.distinct('_id', { classId: { $in: classIds } });
};

const scopedAttendanceMatch = async (actor) => {
  const scheduleIds = await scopedScheduleIdsForActor(actor);
  return scheduleIds ? { scheduleId: { $in: scheduleIds } } : {};
};

module.exports = { scopedScheduleIdsForActor, scopedAttendanceMatch };
