const Schedule = require('../../models/Schedule');
const Attendance = require('../../models/Attendance');
const Class = require('../../models/Class');

// ──────────────────────────────────────────────────────────
// Reconcile — schedule-integrity checks (READ-ONLY)
// ──────────────────────────────────────────────────────────
//  1. missing_attendance     — past session with incomplete roll-call
//  4. empty_future_schedule  — future schedule with 0 enrolled users
//  7. orphan_schedule_class  — schedule references a deleted Class

const LOOKBACK_DAYS = 90; // how far back to check past schedules (CHECK 1)

/**
 * CHECK 1 — Past schedules with incomplete attendance.
 * Looks at sessions that ended in the last LOOKBACK_DAYS days.
 * A session is flagged if the number of Attendance records is
 * less than the number of enrolledUsers on the Schedule.
 */
async function checkMissingAttendance() {
  const issues = [];
  const now = new Date();
  const lookback = new Date(now - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  // Fetch past schedules that had enrolled users
  const pastSchedules = await Schedule.find({
    endTime: { $lt: now, $gte: lookback },
    $expr: { $gt: [{ $size: '$enrolledUsers' }, 0] },
  })
    .select('_id classId bookedTeamId startTime endTime enrolledUsers')
    .lean();

  if (pastSchedules.length === 0) return issues;

  // Batch-fetch attendance counts per schedule (one aggregate, no N+1)
  const scheduleIds = pastSchedules.map((s) => s._id);
  const attCounts = await Attendance.aggregate([
    { $match: { scheduleId: { $in: scheduleIds } } },
    { $group: { _id: '$scheduleId', count: { $sum: 1 } } },
  ]);
  const countMap = {};
  attCounts.forEach((a) => { countMap[a._id.toString()] = a.count; });

  for (const sched of pastSchedules) {
    const expected = sched.enrolledUsers.length;
    const actual = countMap[sched._id.toString()] || 0;
    if (actual < expected) {
      issues.push({
        check: 'missing_attendance',
        description: `Schedule on ${sched.startTime.toISOString().slice(0, 10)} has ${actual}/${expected} attendance records`,
        refs: {
          scheduleId: sched._id,
          classId: sched.classId,
          teamId: sched.bookedTeamId,
        },
        detail: { recorded: actual, expected, missingCount: expected - actual },
      });
    }
  }
  return issues;
}

/**
 * CHECK 4 — Future schedules with zero enrolled users.
 * These should have been auto-deleted when the last member
 * was removed (via auto-release or team-sync).
 * Their existence indicates the cleanup path failed silently.
 */
async function checkEmptyFutureSchedules() {
  const issues = [];
  const now = new Date();

  const emptySchedules = await Schedule.find({
    startTime: { $gt: now },
    $expr: { $eq: [{ $size: '$enrolledUsers' }, 0] },
  })
    .select('_id classId bookedTeamId startTime')
    .lean();

  for (const sched of emptySchedules) {
    issues.push({
      check: 'empty_future_schedule',
      description: `Future schedule on ${sched.startTime.toISOString().slice(0, 10)} has 0 enrolled users and should be deleted`,
      refs: { scheduleId: sched._id, classId: sched.classId, teamId: sched.bookedTeamId },
      detail: null,
    });
  }
  return issues;
}

/**
 * CHECK 7 — Schedule.classId references a Class that no longer exists.
 * Hard-delete of a Class via the dedicated route would have cascaded;
 * direct admin-DB ops or partial migrations can leave dangling refs.
 */
async function checkOrphanScheduleClass() {
  const issues = [];

  // Distinct classIds referenced by ANY schedule (past or future)
  const referencedClassIds = await Schedule.distinct('classId');
  if (referencedClassIds.length === 0) return issues;

  // Class model auto-filters soft-deleted via pre('find'); we explicitly
  // include them by overriding the filter so we only flag truly missing.
  const existing = await Class.find(
    { _id: { $in: referencedClassIds }, isDeleted: { $in: [true, false, null] } }
  ).select('_id').lean();
  const existingSet = new Set(existing.map((c) => String(c._id)));

  const orphanIds = referencedClassIds.filter((id) => !existingSet.has(String(id)));
  if (orphanIds.length === 0) return issues;

  const orphanSchedules = await Schedule.find({ classId: { $in: orphanIds } })
    .select('_id classId bookedTeamId startTime')
    .lean();

  for (const sched of orphanSchedules) {
    issues.push({
      check: 'orphan_schedule_class',
      description: `Schedule ${sched._id} points to deleted Class ${sched.classId}`,
      refs: { scheduleId: sched._id, classId: sched.classId, teamId: sched.bookedTeamId },
      detail: { startTime: sched.startTime },
    });
  }
  return issues;
}

module.exports = {
  LOOKBACK_DAYS,
  checkMissingAttendance,
  checkEmptyFutureSchedules,
  checkOrphanScheduleClass,
};
