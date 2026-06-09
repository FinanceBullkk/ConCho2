const mongoose = require('mongoose');
const Attendance = require('../../models/Attendance');
const Schedule = require('../../models/Schedule');
const { invalidateAnalyticsCache } = require('../../middleware/analyticsCache');
const { ServiceError } = require('../../helpers/ServiceError');
const { scopedAttendanceMatch } = require('./attendance-scope');

// ──────────────────────────────────────────────────────────
// Attendance Service — marking + record reads
// ──────────────────────────────────────────────────────────
// Split from the legacy attendanceService (Phase 1 modular-monolith).
// Bulk upsert with edit-window guards + lastActiveAt write-through (PERF-008),
// plus the per-schedule / per-user record reads.

const VALID_STATUSES = ['P', 'A', 'L', 'EL'];

/**
 * Bulk upsert attendance for a schedule.
 * @param {string} scheduleId
 * @param {Array}  records  [{ userId, status, remark?, photoUrl? }]
 * @returns {Object} bulkWrite result summary
 */
const bulkMark = async (scheduleId, records) => {
  if (!records || !Array.isArray(records) || records.length === 0) {
    throw new ServiceError('records array is required and must not be empty');
  }

  const schedule = await Schedule.findById(scheduleId);
  if (!schedule) throw new ServiceError('Schedule not found', 404);

  // ── Guard: cannot mark attendance for sessions that haven't started ──
  if (new Date(schedule.startTime) > new Date()) {
    throw new ServiceError(
      'Cannot mark attendance for a future session.',
      400
    );
  }

  // ── Guard: cannot modify attendance for sessions > 30 days old (UX-07) ──
  const EDIT_WINDOW_DAYS = 30;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - EDIT_WINDOW_DAYS);
  if (new Date(schedule.startTime) < cutoff) {
    throw new ServiceError(
      `Cannot edit attendance older than ${EDIT_WINDOW_DAYS} days.`,
      400
    );
  }

  // Build an allowlist of enrolled user IDs for this schedule
  const enrolledSet = new Set(schedule.enrolledUsers.map(id => id.toString()));

  // Validate each record
  for (const record of records) {
    if (!record.userId || !record.status) {
      throw new ServiceError('Each record must have userId and status');
    }
    if (!VALID_STATUSES.includes(record.status)) {
      throw new ServiceError(
        `Invalid status "${record.status}". Use: ${VALID_STATUSES.join(', ')}`
      );
    }
    if (!enrolledSet.has(record.userId.toString())) {
      throw new ServiceError(
        `User ${record.userId} is not enrolled in this schedule`,
        400
      );
    }
  }

  const operations = records.map((record) => ({
    updateOne: {
      filter: { scheduleId, userId: record.userId },
      update: {
        $set: {
          scheduleId,
          userId: record.userId,
          status: record.status,
          remark: record.remark || record.note || '',
          photoUrl: record.photoUrl || '',
        },
      },
      upsert: true,
    },
  }));

  const result = await Attendance.bulkWrite(operations);
  invalidateAnalyticsCache();

  // PERF-008 (audit PR H): denormalise lastActiveAt onto User for
  // the getUsers list page. Only P (present) + L (late) count as
  // active; A (absent) + EL (excused) don't bump the timestamp.
  // schedule.startTime is the actual session time — Attendance.createdAt
  // is when the admin marked, which can be much later.
  const activeUserIds = records
    .filter((r) => r.status === 'P' || r.status === 'L')
    .map((r) => r.userId);
  if (activeUserIds.length > 0) {
    const User = mongoose.model('User');
    // $max guarantees we never move lastActiveAt backwards if someone
    // re-marks an OLD session that pre-dates a more recent one.
    await User.bulkWrite(
      activeUserIds.map((uid) => ({
        updateOne: {
          filter: { _id: uid },
          update: { $max: { lastActiveAt: schedule.startTime } },
        },
      })),
    );
  }

  return {
    matched: result.matchedCount,
    modified: result.modifiedCount,
    upserted: result.upsertedCount,
    total: records.length,
  };
};

/**
 * Get attendance records for a specific schedule.
 */
const getBySchedule = async (scheduleId) => {
  return Attendance.find({ scheduleId })
    .populate('userId', 'empCode name department')
    .sort({ createdAt: 1 });  // Sort by creation order (populated field sort is a no-op)
};

/**
 * Get attendance history for a specific user.
 */
const getByUser = async (userId, actor) => {
  return Attendance.find({ userId, ...(await scopedAttendanceMatch(actor)) })
    .populate({
      path: 'scheduleId',
      populate: [
        { path: 'classId', select: 'classCode courseName' },
      ],
    })
    .sort({ createdAt: -1 });
};

module.exports = { VALID_STATUSES, bulkMark, getBySchedule, getByUser };
