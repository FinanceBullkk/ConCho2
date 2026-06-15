const repository = require('./repository');
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
  const { data, total } = await repository.aggregateByEmployee(match, filterUserId, { skip, limit });
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

  // ── Step 1: fetch teams (soft-delete hook + class scope in the repo) ──
  const teamsRaw = await repository.aggregateTeamsForAnalytics(scopedClassIds);

  // ── Step 2: per-user attendance counters ───────────────────
  // Union of all member IDs across teams (deduped, as strings — the repo
  // coerces to ObjectId). PERF-003: one indexed Attendance group-by.
  const allMemberIds = [...new Set(
    teamsRaw.flatMap((t) => (t.members || []).map((m) => String(m))),
  )];

  let perUser = new Map(); // userIdString → { total, present, absent, late, excused }

  if (allMemberIds.length > 0) {
    const scheduleIds = scopedClassIds
      ? await repository.distinctScheduledIdsForClasses(scopedClassIds)
      : null;
    const grouped = await repository.aggregateAttendanceCountsByUser(allMemberIds, scheduleIds);
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

  const schedules = await repository.findScheduledForClass(classId);
  const scheduleIds = schedules.map(s => s._id);

  const records = await repository.findAttendanceForSchedules(scheduleIds);

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
  const results = await repository.aggregateMyStats(userId);
  const stats = results[0] || { totalSessions: 0, present: 0, absent: 0, late: 0, excused: 0 };
  stats.attendanceRate = stats.totalSessions > 0
    ? parseFloat(((stats.present / stats.totalSessions) * 100).toFixed(1))
    : 0;
  delete stats._id;
  return stats;
};

module.exports = { analyticsByEmployee, analyticsByTeam, analyticsByClass, getMyStats };
