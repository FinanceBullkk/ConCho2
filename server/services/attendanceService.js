const mongoose = require('mongoose');
const Attendance = require('../models/Attendance');
const Schedule = require('../models/Schedule');
const Team = require('../models/Team'); // used in analyticsByTeam aggregation
const { invalidateAnalyticsCache } = require('../middleware/analyticsCache');
const { findTeacherVisibleClassIds } = require('../helpers/teacher-class-scope');

// ──────────────────────────────────────────────────────────
// Attendance Service
// ──────────────────────────────────────────────────────────

const { ServiceError } = require('../helpers/ServiceError');

const VALID_STATUSES = ['P', 'A', 'L', 'EL'];

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

/**
 * Analytics: attendance stats grouped by employee.
 * @param {string|undefined} filterUserId  Optional userId filter
 * @param {object}           pagination    { page, limit, skip }
 */
const analyticsByEmployee = async (filterUserId, { page = 1, limit = 100, skip = 0 } = {}, actor) => {
  const match = await scopedAttendanceMatch(actor);
  if (filterUserId) {
    if (!mongoose.Types.ObjectId.isValid(filterUserId)) {
      throw new ServiceError('Invalid userId format');
    }
    match.userId = new mongoose.Types.ObjectId(filterUserId);
  }

  const pipeline = [
    { $match: match },
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
 *
 * PERF-003 (audit PR G): old impl used a `$lookup` with
 * `$expr: $in $userId $$memberIds`. `$expr` inside a sub-pipeline
 * cannot use the index on `attendances.userId` — Mongo scans the
 * entire attendances collection for EACH team. At 1000 teams ×
 * 100k attendance records that's catastrophic.
 *
 * New strategy (invert the join):
 *   1. Fetch non-deleted teams with members (uses Team.aggregate
 *      soft-delete hook + the team.members index from PR D).
 *   2. Aggregate attendance ONCE by userId (uses the
 *      {userId, status} index).
 *   3. Roll up per-team in memory.
 *
 * For 1000 teams + 100k attendance: one indexed Team scan + one
 * indexed Attendance group-by + O(n) JS rollup. ~10× faster than
 * the previous cross-product $lookup.
 *
 * @param {object} pagination  { page, limit, skip }
 */
const analyticsByTeam = async ({ page = 1, limit = 100, skip = 0 } = {}, actor) => {
  const scopedClassIds = actor?.role === 'Teacher'
    ? await findTeacherVisibleClassIds(actor._id)
    : null;

  // ── Step 1: fetch teams ────────────────────────────────────
  // Team.aggregate pre-hook auto-injects { isDeleted: { $ne: true } }.
  // Project only what we need to keep working set small.
  const teamPipeline = [];
  if (scopedClassIds) {
    teamPipeline.push({ $match: { classId: { $in: scopedClassIds } } });
  }
  teamPipeline.push(
    { $project: { _id: 1, name: 1, members: 1 } },
  );
  const teamsRaw = await Team.aggregate(teamPipeline);

  // ── Step 2: per-user attendance counters ───────────────────
  // Union of all member IDs across teams (deduped).
  const allMemberIds = [...new Set(
    teamsRaw.flatMap((t) => (t.members || []).map((m) => String(m))),
  )].map((id) => new mongoose.Types.ObjectId(id));

  let perUser = new Map(); // userIdString → { total, present, absent, late, excused }

  if (allMemberIds.length > 0) {
    const match = { userId: { $in: allMemberIds } };
    if (scopedClassIds) {
      const scheduleIds = await Schedule.distinct('_id', { classId: { $in: scopedClassIds } });
      match.scheduleId = { $in: scheduleIds };
    }
    const grouped = await Attendance.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$userId',
          total:   { $sum: 1 },
          present: { $sum: { $cond: [{ $eq: ['$status', 'P'] }, 1, 0] } },
          absent:  { $sum: { $cond: [{ $eq: ['$status', 'A'] }, 1, 0] } },
          late:    { $sum: { $cond: [{ $eq: ['$status', 'L'] }, 1, 0] } },
          excused: { $sum: { $cond: [{ $eq: ['$status', 'EL'] }, 1, 0] } },
        },
      },
    ]);
    perUser = new Map(grouped.map((g) => [String(g._id), g]));
  }

  // ── Step 3: roll up per team in JS ─────────────────────────
  const rolled = teamsRaw.map((t) => {
    let total = 0, present = 0, absent = 0, late = 0, excused = 0;
    for (const memberId of t.members || []) {
      const u = perUser.get(String(memberId));
      if (!u) continue;
      total   += u.total;
      present += u.present;
      absent  += u.absent;
      late    += u.late;
      excused += u.excused;
    }
    const attendanceRate = total > 0
      ? Math.round((present / total) * 1000) / 10
      : 0;
    return {
      _id: t._id,
      name: t.name,
      memberCount: (t.members || []).length,
      stats: { totalSessions: total, present, absent, late, excused, attendanceRate },
    };
  });

  // Sort by attendance rate desc, then name asc (matches old behaviour).
  rolled.sort((a, b) =>
    b.stats.attendanceRate - a.stats.attendanceRate ||
    a.name.localeCompare(b.name),
  );

  const total = rolled.length;
  const data = rolled.slice(skip, skip + limit);

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
