const mongoose = require('mongoose');
const Attendance = require('../../models/Attendance');
const Schedule = require('../../models/Schedule');
const Team = require('../../models/Team'); // used in analyticsByTeam aggregation
const { ServiceError } = require('../../helpers/ServiceError');
const { findTeacherVisibleClassIds } = require('../../helpers/teacher-class-scope');
const { scopedAttendanceMatch } = require('./scope');

// ──────────────────────────────────────────────────────────
// attendance/analytics — analytics rollups
// ──────────────────────────────────────────────────────────
// Relocated from services/attendance/attendance-analytics.js (Phase 1 domain
// extraction — behavior-preserving). By-employee / by-team (inverted-join,
// PERF-003) / by-class / personal stats. Teacher scope applied via
// ./scope + findTeacherVisibleClassIds.

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
      const scheduleIds = await Schedule.distinct('_id', {
        classId: { $in: scopedClassIds }, status: 'scheduled',
      });
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

  const schedules = await Schedule.find({ classId, status: 'scheduled' })
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

module.exports = { analyticsByEmployee, analyticsByTeam, analyticsByClass, getMyStats };
