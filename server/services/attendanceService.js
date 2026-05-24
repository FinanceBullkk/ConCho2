const mongoose = require('mongoose');
const Attendance = require('../models/Attendance');
const Schedule = require('../models/Schedule');
const Team = require('../models/Team'); // used in analyticsByTeam aggregation
const { invalidateAnalyticsCache } = require('../middleware/analyticsCache');

// ──────────────────────────────────────────────────────────
// Attendance Service
// ──────────────────────────────────────────────────────────

const { ServiceError } = require('../helpers/ServiceError');

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
      'Chưa thể điểm danh — Buổi học này chưa diễn ra. Cannot mark attendance for a future session.',
      400
    );
  }

  // ── Guard: cannot modify attendance for sessions > 30 days old (UX-07) ──
  const EDIT_WINDOW_DAYS = 30;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - EDIT_WINDOW_DAYS);
  if (new Date(schedule.startTime) < cutoff) {
    throw new ServiceError(
      `Không thể chỉnh sửa điểm danh cho buổi học cũ hơn ${EDIT_WINDOW_DAYS} ngày. Cannot edit attendance older than ${EDIT_WINDOW_DAYS} days.`,
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
const getByUser = async (userId) => {
  return Attendance.find({ userId })
    .populate({
      path: 'scheduleId',
      populate: [
        { path: 'classId', select: 'classCode courseName' },
      ],
    })
    .sort({ createdAt: -1 });
};

/**
 * Analytics: attendance stats grouped by employee.
 * @param {string|undefined} filterUserId  Optional userId filter
 * @param {object}           pagination    { page, limit, skip }
 */
const analyticsByEmployee = async (filterUserId, { page = 1, limit = 100, skip = 0 } = {}) => {
  const pipeline = [
    {
      $group: {
        _id: '$userId',
        totalSessions: { $sum: 1 },
        present: { $sum: { $cond: [{ $eq: ['$status', 'P'] }, 1, 0] } },
        absent: { $sum: { $cond: [{ $eq: ['$status', 'A'] }, 1, 0] } },
        late: { $sum: { $cond: [{ $eq: ['$status', 'L'] }, 1, 0] } },
        excused: { $sum: { $cond: [{ $eq: ['$status', 'EL'] }, 1, 0] } },
      },
    },
    {
      // DATA-009 (audit PR A): the $lookup pipeline form is required so we
      // can $match isDeleted at the join layer. Mongoose `pre('find')` and
      // `pre('aggregate')` hooks do NOT fire inside a $lookup's sub-pipeline,
      // so without this explicit filter soft-deleted users would surface in
      // analytics rollups.
      $lookup: {
        from: 'users',
        let: { uid: '$_id' },
        pipeline: [
          { $match: { $expr: { $eq: ['$_id', '$$uid'] }, isDeleted: { $ne: true } } },
        ],
        as: 'user',
      },
    },
    { $unwind: '$user' },
    {
      $project: {
        empCode: '$user.empCode', name: '$user.name',
        department: '$user.department',
        totalSessions: 1, present: 1, absent: 1, late: 1, excused: 1,
        attendanceRate: {
          $round: [{ $multiply: [{ $divide: ['$present', '$totalSessions'] }, 100] }, 1],
        },
      },
    },
    { $sort: { attendanceRate: -1, empCode: 1 } },
  ];

  if (filterUserId) {
    if (!mongoose.Types.ObjectId.isValid(filterUserId)) {
      throw new ServiceError('Invalid userId format');
    }
    pipeline.unshift({ $match: { userId: new mongoose.Types.ObjectId(filterUserId) } });
  }

  // Count total matching groups before slicing
  const countPipeline = [...pipeline, { $count: 'total' }];
  const [countResult] = await Attendance.aggregate(countPipeline);
  const total = countResult ? countResult.total : 0;

  const data = await Attendance.aggregate([
    ...pipeline,
    { $skip: skip },
    { $limit: limit },
  ]);

  return { data, total, page, limit };
};

/**
 * Analytics: attendance stats grouped by team.
 * Uses a single aggregation pipeline — no in-memory fan-out.
 * @param {object} pagination  { page, limit, skip }
 */
const analyticsByTeam = async ({ page = 1, limit = 100, skip = 0 } = {}) => {
  const basePipeline = [
    // For each team, fetch all attendance records for its members
    {
      $lookup: {
        from: 'attendances',
        let: { memberIds: '$members' },
        pipeline: [
          { $match: { $expr: { $in: ['$userId', '$$memberIds'] } } },
        ],
        as: 'attendanceRecords',
      },
    },
    {
      $project: {
        name: 1,
        memberCount: { $size: '$members' },
        totalSessions: { $size: '$attendanceRecords' },
        present: {
          $size: {
            $filter: { input: '$attendanceRecords', as: 'a', cond: { $eq: ['$$a.status', 'P'] } },
          },
        },
        absent: {
          $size: {
            $filter: { input: '$attendanceRecords', as: 'a', cond: { $eq: ['$$a.status', 'A'] } },
          },
        },
        late: {
          $size: {
            $filter: { input: '$attendanceRecords', as: 'a', cond: { $eq: ['$$a.status', 'L'] } },
          },
        },
        excused: {
          $size: {
            $filter: { input: '$attendanceRecords', as: 'a', cond: { $eq: ['$$a.status', 'EL'] } },
          },
        },
      },
    },
    {
      $addFields: {
        attendanceRate: {
          $cond: [
            { $gt: ['$totalSessions', 0] },
            { $round: [{ $multiply: [{ $divide: ['$present', '$totalSessions'] }, 100] }, 1] },
            0,
          ],
        },
      },
    },
    { $sort: { attendanceRate: -1, name: 1 } },
  ];

  const [countResult] = await Team.aggregate([...basePipeline, { $count: 'total' }]);
  const total = countResult ? countResult.total : 0;

  const results = await Team.aggregate([
    ...basePipeline,
    { $skip: skip },
    { $limit: limit },
  ]);

  const data = results.map(r => ({
    _id: r._id,
    name: r.name,
    memberCount: r.memberCount,
    stats: {
      totalSessions: r.totalSessions,
      present: r.present,
      absent: r.absent,
      late: r.late,
      excused: r.excused,
      attendanceRate: r.attendanceRate,
    },
  }));

  return { data, total, page, limit };
};

/**
 * Analytics: attendance stats for a specific class.
 */
const analyticsByClass = async (classId) => {
  if (!classId) throw new ServiceError('classId is required');

  const schedules = await Schedule.find({ classId })
    .select('_id startTime endTime').sort({ startTime: 1 }).lean();
  const scheduleIds = schedules.map(s => s._id);

  const records = await Attendance.find({ scheduleId: { $in: scheduleIds } })
    .populate('userId', 'empCode name').lean();

  const userMap = {};
  // Filter out orphan records where user was deleted (populate → null)
  records.filter(r => r.userId).forEach(r => {
    if (!userMap[r.userId._id]) {
      userMap[r.userId._id] = { user: r.userId, sessions: {}, present: 0, total: 0 };
    }
    userMap[r.userId._id].sessions[r.scheduleId] = r.status;
    userMap[r.userId._id].total++;
    if (r.status === 'P') userMap[r.userId._id].present++;
  });

  const roster = Object.values(userMap).map(u => ({
    user: u.user,
    sessions: u.sessions,
    attendanceRate: u.total > 0 ? parseFloat(((u.present / u.total) * 100).toFixed(1)) : 0,
  }));

  return { schedules, roster };
};

/**
 * Get personal attendance stats for a participant.
 */
const getMyStats = async (userId) => {
  const pipeline = [
    { $match: { userId: new mongoose.Types.ObjectId(userId) } },
    {
      $group: {
        _id: null,
        totalSessions: { $sum: 1 },
        present: { $sum: { $cond: [{ $eq: ['$status', 'P'] }, 1, 0] } },
        absent: { $sum: { $cond: [{ $eq: ['$status', 'A'] }, 1, 0] } },
        late: { $sum: { $cond: [{ $eq: ['$status', 'L'] }, 1, 0] } },
        excused: { $sum: { $cond: [{ $eq: ['$status', 'EL'] }, 1, 0] } },
      },
    },
  ];

  const results = await Attendance.aggregate(pipeline);
  const stats = results[0] || { totalSessions: 0, present: 0, absent: 0, late: 0, excused: 0 };
  stats.attendanceRate = stats.totalSessions > 0
    ? parseFloat(((stats.present / stats.totalSessions) * 100).toFixed(1))
    : 0;
  delete stats._id;
  return stats;
};

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
