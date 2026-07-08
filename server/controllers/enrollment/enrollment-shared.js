const Schedule = require('../../models/Schedule');
const Attendance = require('../../models/Attendance');
// Dual-backend roster pull (Phase 5 slice 4, B2-tail); DB_BACKEND selects.
const scheduleRepo = require('../../domains/schedule/repository');

// ──────────────────────────────────────────────────────────
// Enrollment Controller — shared helpers
// ──────────────────────────────────────────────────────────
// Split from the legacy enrollmentController (Phase 1 modular-monolith).
// Internal helpers shared across the read/status/transfer handlers.

/**
 * Enrich a list of (lean) enrollments with per-(user, class) attendance counts.
 * Mutates nothing; returns a new array of enrollments with `.attendance` attached.
 */
const enrichWithAttendance = async (enrollments) => {
  if (enrollments.length === 0) return enrollments;

  const classIds = [...new Set(enrollments.map(e => e.classId?._id?.toString()).filter(Boolean))];
  const userIds = enrollments.map(e => e.userId?._id?.toString()).filter(Boolean);

  const schedules = classIds.length
    ? await Schedule.find({ classId: { $in: classIds }, status: 'scheduled' }).select('_id classId').lean()
    : [];
  const scheduleIds = schedules.map(s => s._id);
  const attendanceRecords = scheduleIds.length
    ? await Attendance.find({ scheduleId: { $in: scheduleIds }, userId: { $in: userIds } })
        .select('scheduleId userId status').lean()
    : [];

  const scheduleMap = {};
  schedules.forEach(s => { scheduleMap[s._id.toString()] = s; });

  const attMap = {};
  attendanceRecords.forEach(a => {
    const sched = scheduleMap[a.scheduleId.toString()];
    if (!sched) return;
    const key = `${a.userId}|${sched.classId}`;
    if (!attMap[key]) attMap[key] = { P: 0, A: 0, L: 0, EL: 0, total: 0 };
    attMap[key][a.status] = (attMap[key][a.status] || 0) + 1;
    attMap[key].total += 1;
  });

  return enrollments.map(e => ({
    ...e,
    attendance: attMap[`${e.userId?._id}|${e.classId?._id}`] || { P: 0, A: 0, L: 0, EL: 0, total: 0 },
  }));
};

/**
 * Remove userIds from all future Schedule.enrolledUsers when they are Dropped.
 * Shared by updateEnrollment (single) and bulkUpdateEnrollmentStatus (bulk).
 * On-hold is intentionally excluded — reversible status, keep in schedules.
 * LIVE sessions only — durable-cancelled rosters are frozen history.
 * `tx` = the caller's unit-of-work handle (dual-backend; was a raw session).
 */
const pullDroppedUsersFromFutureSchedules = (userIds, tx = null) =>
  scheduleRepo.pullUsersFromFutureSchedules(userIds, tx);

module.exports = { enrichWithAttendance, pullDroppedUsersFromFutureSchedules };
