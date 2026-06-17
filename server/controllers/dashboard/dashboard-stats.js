const { handleError } = require('../../helpers/handleError');
const logger = require('../../lib/logger');
const repository = require('./dashboard-stats-repository');

// ──────────────────────────────────────────────────────────
// Dashboard Controller — Admin Analytics (Interactive Filters)
// ──────────────────────────────────────────────────────────
// Split from the legacy dashboardController (Phase 1 modular-monolith).
// Filter options + the filtered analytics aggregation. getDashboardStats is
// one cohesive endpoint: 14 independent aggregations run in parallel (PHASE 1,
// in dashboard-stats-repository) then composed in-process with zero extra DB
// round-trips (PHASE 2, here). All Mongoose access lives in the repository
// (Phase 0 Postgres readiness).

/**
 * Build a MongoDB filter object from query params.
 * Only includes non-empty filter dimensions.
 */
const buildUserFilter = (query) => {
  const filter = { role: 'Participant' };
  if (query.department) filter.department = query.department;
  if (query.position) filter.position = query.position;
  if (query.entranceLevel) filter.entranceLevel = query.entranceLevel;
  if (query.currentLevel) filter.currentLevel = query.currentLevel;
  if (query.status) filter.status = query.status;
  return filter;
};

// ──────────────────────────────────────────────────────────
// GET /api/dashboard/filter-options
// Returns distinct values for each filterable dimension.
// ──────────────────────────────────────────────────────────
const getFilterOptions = async (req, res) => {
  try {
    const d = await repository.getFilterDistincts();
    res.json({
      success: true,
      data: {
        departments: d.departments.sort(),
        positions: d.positions.sort(),
        entranceLevels: d.entranceLevels.sort(),
        currentLevels: d.currentLevels.sort(),
        statuses: d.statuses.sort(),
      },
    });
  } catch (error) {
    handleError(res, error);
  }
};

// ──────────────────────────────────────────────────────────
// GET /api/dashboard/stats?department=X&position=Y&...
// All aggregations respect the active filters.
// ──────────────────────────────────────────────────────────
const getDashboardStats = async (req, res) => {
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const userFilter = buildUserFilter(req.query);
    const hasFilters = Object.keys(userFilter).length > 1; // >1 because 'role' is always there

    // ── Pre-fetch: filtered user IDs (needed for attendance/schedule cross-filter) ──
    const filteredUserIds = hasFilters ? await repository.findFilteredUserIds(userFilter) : null;

    // ═══ PHASE 1: All independent queries in parallel (repository) ═══
    const results = await repository.runStatsAggregations({ userFilter, filteredUserIds, now, thirtyDaysAgo });

    // Safely extract values
    const safeValue = (r, fallback = []) => r.status === 'fulfilled' ? r.value : fallback;
    const [
      userStatusCounts,
      attStats,
      recentlyActiveIds,
      teams,
      allParticipants,
      dropReasonAgg,
      dropClassificationAgg,
      classes,
      scheduleCountsByClass,
      departmentAgg,
      positionAgg,
      entranceLevelAgg,
      currentLevelAgg,
      levelProgressionAgg,
    ] = results.map(r => safeValue(r));

    // ═══ PHASE 2: Compute from fetched data (zero extra DB) ═══
    const statusMap = {};
    userStatusCounts.forEach(s => { statusMap[s._id] = s.count; });
    const totalUsers = Object.values(statusMap).reduce((a, b) => a + b, 0);
    const activeUsers = statusMap['Active'] || 0;

    const totalAtt = attStats[0]?.total || 0;
    const presentAtt = attStats[0]?.present || 0;

    const recentSet = new Set(recentlyActiveIds.map(id => id.toString()));
    const atRisk = allParticipants.filter(u => u.status === 'Active' && !recentSet.has(u._id.toString())).length;

    // Course breakdown — only count filtered users
    const filteredIdSet = hasFilters ? new Set(allParticipants.map(u => u._id.toString())) : null;
    const userStatusLookup = {};
    allParticipants.forEach(u => { userStatusLookup[u._id.toString()] = u.status; });
    const courseStats = {};
    for (const team of teams) {
      if (!team.classId) continue;
      const cn = team.classId.courseName;
      if (!courseStats[cn]) courseStats[cn] = { active: 0, inactive: 0, waiting: 0, total: 0 };
      for (const m of (team.members || [])) {
        const mid = m._id?.toString() || m.toString();
        // If filtering, skip members not in the filtered set
        if (filteredIdSet && !filteredIdSet.has(mid)) continue;
        const s = userStatusLookup[mid];
        if (!s) continue;
        courseStats[cn].total++;
        if (s === 'Active') courseStats[cn].active++;
        else if (s === 'Inactive') courseStats[cn].inactive++;
        else if (s === 'Waiting for class') courseStats[cn].waiting++;
      }
    }

    // Class progress (no N+1)
    const schedMap = {};
    scheduleCountsByClass.forEach(s => {
      const cid = s._id?.toString();
      if (cid) schedMap[cid] = s;
    });

    res.json({
      success: true,
      data: {
        // Echo active filters back to the client
        activeFilters: hasFilters ? req.query : null,
        overview: {
          totalStudents: totalUsers,
          active: activeUsers,
          inactive: statusMap['Inactive'] || 0,
          waiting: statusMap['Waiting for class'] || 0,
          dropped: statusMap['Dropped'] || 0,
          onHold: statusMap['On-hold'] || 0,
          attendanceRate: totalAtt > 0 ? presentAtt / totalAtt : 0,
          totalSessions: totalAtt,
          presentSessions: presentAtt,
          atRisk,
          totalClasses: classes.length,
          totalTeams: teams.length,
        },
        courseBreakdown: Object.entries(courseStats)
          .map(([courseName, c]) => ({ courseName, ...c }))
          .filter(c => c.total > 0) // hide empty courses when filtered
          .sort((a, b) => b.total - a.total),
        dropReasons: dropReasonAgg.map(d => ({ reason: d._id, count: d.count })),
        dropClassifications: dropClassificationAgg.map(d => ({ classification: d._id, count: d.count })),
        classProgress: classes.map(cls => {
          const s = schedMap[cls._id.toString()] || { done: 0 };
          return { _id: cls._id, classCode: cls.classCode, courseName: cls.courseName, totalSessions: cls.totalSessions, doneSessions: s.done, progress: cls.totalSessions > 0 ? s.done / cls.totalSessions : 0, status: cls.status };
        }),
        departmentBreakdown: departmentAgg.map(d => {
          const obj = { department: d._id, total: d.total, active: 0, inactive: 0, waiting: 0 };
          (d.statuses || []).forEach(s => {
            if (s.status === 'Active') obj.active = s.count;
            else if (s.status === 'Inactive') obj.inactive = s.count;
            else if (s.status === 'Waiting for class') obj.waiting = s.count;
          });
          return obj;
        }),
        positionBreakdown: positionAgg.map(p => {
          const obj = { position: p._id, total: p.total, active: 0, inactive: 0 };
          (p.statuses || []).forEach(s => {
            if (s.status === 'Active') obj.active = s.count;
            else if (s.status === 'Inactive') obj.inactive = s.count;
          });
          return obj;
        }),
        entranceLevelBreakdown: entranceLevelAgg.map(l => ({ level: l._id, count: l.count })),
        currentLevelBreakdown: currentLevelAgg.map(l => ({ level: l._id, count: l.count })),
        levelProgression: levelProgressionAgg[0] || { total: 0, progressed: 0, stayed: 0 },
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Dashboard query failed');
    handleError(res, error);
  }
};

module.exports = { buildUserFilter, getFilterOptions, getDashboardStats };
