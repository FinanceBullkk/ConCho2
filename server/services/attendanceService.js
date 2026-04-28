const mongoose = require('mongoose');
const Attendance = require('../models/Attendance');
const Schedule = require('../models/Schedule');
const Team = require('../models/Team');
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
  }

  const operations = records.map((record) => ({
    updateOne: {
      filter: { scheduleId, userId: record.userId },
      update: {
        $set: {
          scheduleId,
          userId: record.userId,
          status: record.status,
          remark: record.remark || '',
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
        { path: 'teacherId', select: 'empCode name' },
      ],
    })
    .sort({ createdAt: -1 });
};

/**
 * Analytics: attendance stats grouped by employee.
 */
const analyticsByEmployee = async (filterUserId) => {
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
      $lookup: {
        from: 'users', localField: '_id', foreignField: '_id', as: 'user',
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

  return Attendance.aggregate(pipeline);
};

/**
 * Analytics: attendance stats grouped by team.
 */
const analyticsByTeam = async () => {
  const teams = await Team.find().populate('members', '_id').lean();

  const memberToTeams = {};
  const teamMeta = {};
  for (const team of teams) {
    teamMeta[team._id.toString()] = { name: team.name, memberCount: team.members.length };
    for (const m of team.members) {
      const uid = m._id.toString();
      if (!memberToTeams[uid]) memberToTeams[uid] = [];
      memberToTeams[uid].push(team._id.toString());
    }
  }

  const allMemberIds = Object.keys(memberToTeams).map(id => new mongoose.Types.ObjectId(id));

  const userStats = await Attendance.aggregate([
    { $match: { userId: { $in: allMemberIds } } },
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
  ]);

  // Aggregate per-user into per-team
  const teamStats = {};
  for (const tid of Object.keys(teamMeta)) {
    teamStats[tid] = { totalSessions: 0, present: 0, absent: 0, late: 0, excused: 0 };
  }
  for (const us of userStats) {
    const tids = memberToTeams[us._id.toString()] || [];
    for (const tid of tids) {
      teamStats[tid].totalSessions += us.totalSessions;
      teamStats[tid].present += us.present;
      teamStats[tid].absent += us.absent;
      teamStats[tid].late += us.late;
      teamStats[tid].excused += us.excused;
    }
  }

  return Object.entries(teamMeta).map(([tid, meta]) => {
    const s = teamStats[tid];
    const rate = s.totalSessions > 0 ? parseFloat(((s.present / s.totalSessions) * 100).toFixed(1)) : 0;
    return {
      _id: tid, name: meta.name, memberCount: meta.memberCount,
      stats: { ...s, attendanceRate: rate },
    };
  });
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
