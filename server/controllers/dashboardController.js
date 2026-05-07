const User = require('../models/User');
const Class = require('../models/Class');
const Schedule = require('../models/Schedule');
const Attendance = require('../models/Attendance');
const Team = require('../models/Team');
const { handleError } = require('../helpers/handleError');
const logger = require('../lib/logger');

// ──────────────────────────────────────────────────────────
// Dashboard Controller — Admin Analytics (Interactive Filters)
// ──────────────────────────────────────────────────────────

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
    const base = { role: 'Participant' };
    const [departments, positions, entranceLevels, currentLevels, statuses] = await Promise.all([
      User.distinct('department', { ...base, department: { $ne: '' } }),
      User.distinct('position', { ...base, position: { $ne: '' } }),
      User.distinct('entranceLevel', { ...base, entranceLevel: { $ne: '' } }),
      User.distinct('currentLevel', { ...base, currentLevel: { $ne: '' } }),
      User.distinct('status', base),
    ]);
    res.json({
      success: true,
      data: {
        departments: departments.sort(),
        positions: positions.sort(),
        entranceLevels: entranceLevels.sort(),
        currentLevels: currentLevels.sort(),
        statuses: statuses.sort(),
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
    let filteredUserIds = null;
    if (hasFilters) {
      const filteredUsers = await User.find(userFilter).select('_id').lean();
      filteredUserIds = filteredUsers.map(u => u._id);
    }

    // Build attendance filter (only include filtered users' records)
    const attFilter = filteredUserIds
      ? { userId: { $in: filteredUserIds } }
      : {};

    // ═══ PHASE 1: All independent queries in parallel ═══
    const results = await Promise.allSettled([
      // 0: User status counts (filtered)
      User.aggregate([
        { $match: userFilter },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      // 1: Attendance stats (filtered by user set)
      Attendance.aggregate([
        ...(filteredUserIds ? [{ $match: { userId: { $in: filteredUserIds } } }] : []),
        { $group: { _id: null, total: { $sum: 1 }, present: { $sum: { $cond: [{ $in: ['$status', ['P', 'L']] }, 1, 0] } } } },
      ]),
      // 2: Recently active user IDs (for at-risk calc)
      Attendance.distinct('userId', {
        createdAt: { $gte: thirtyDaysAgo },
        ...(filteredUserIds ? { userId: { $in: filteredUserIds } } : {}),
      }),
      // 3: Teams with class info
      Team.find().populate('classId', 'courseName status').select('members classId').lean(),
      // 4: All filtered participants
      User.find(userFilter).select('_id status').lean(),
      // 5: Drop reasons (filtered)
      User.aggregate([
        { $match: { ...userFilter, status: { $in: ['Inactive', 'Dropped'] }, dropReason: { $ne: '' } } },
        { $project: { reason: { $cond: { if: { $regexMatch: { input: { $ifNull: ['$dropReason', ''] }, regex: / — / } }, then: { $arrayElemAt: [{ $split: ['$dropReason', ' — '] }, 1] }, else: '$dropReason' } } } },
        { $group: { _id: '$reason', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
      // 6: Drop classifications (filtered)
      User.aggregate([
        { $match: { ...userFilter, status: { $in: ['Inactive', 'Dropped'] }, dropReason: { $ne: '' } } },
        { $project: { classification: { $cond: { if: { $regexMatch: { input: { $ifNull: ['$dropReason', ''] }, regex: / — / } }, then: { $arrayElemAt: [{ $split: ['$dropReason', ' — '] }, 0] }, else: '$dropReason' } } } },
        { $group: { _id: '$classification', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      // 7: All classes
      Class.find().sort({ classCode: 1 }).lean(),
      // 8: Schedule counts by class
      Schedule.aggregate([
        { $group: { _id: '$classId', total: { $sum: 1 }, done: { $sum: { $cond: [{ $lt: ['$endTime', now] }, 1, 0] } }, teacherId: { $first: '$teacherId' } } },
      ]),
      // 9: BU (department) breakdown (filtered)
      User.aggregate([
        { $match: { ...userFilter, department: { $ne: '' } } },
        { $group: { _id: { department: '$department', status: '$status' }, count: { $sum: 1 } } },
        { $group: { _id: '$_id.department', statuses: { $push: { status: '$_id.status', count: '$count' } }, total: { $sum: '$count' } } },
        { $sort: { total: -1 } },
      ]),
      // 10: Position breakdown (filtered)
      User.aggregate([
        { $match: { ...userFilter, position: { $ne: '' } } },
        { $group: { _id: { position: '$position', status: '$status' }, count: { $sum: 1 } } },
        { $group: { _id: '$_id.position', statuses: { $push: { status: '$_id.status', count: '$count' } }, total: { $sum: '$count' } } },
        { $sort: { total: -1 } },
      ]),
      // 11: Entrance Level (filtered)
      User.aggregate([
        { $match: { ...userFilter, entranceLevel: { $ne: '' } } },
        { $group: { _id: '$entranceLevel', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      // 12: Current Level (filtered)
      User.aggregate([
        { $match: { ...userFilter, currentLevel: { $ne: '' } } },
        { $group: { _id: '$currentLevel', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      // 13: Level progression (filtered)
      User.aggregate([
        { $match: { ...userFilter, entranceLevel: { $ne: '' }, currentLevel: { $ne: '' } } },
        { $project: { same: { $eq: ['$entranceLevel', '$currentLevel'] } } },
        { $group: { _id: null, total: { $sum: 1 }, progressed: { $sum: { $cond: [{ $not: '$same' }, 1, 0] } }, stayed: { $sum: { $cond: ['$same', 1, 0] } } } },
      ]),
    ]);

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
    const teacherIds = new Set();
    scheduleCountsByClass.forEach(s => {
      const cid = s._id?.toString();
      if (cid) { schedMap[cid] = s; if (s.teacherId) teacherIds.add(s.teacherId.toString()); }
    });
    let teacherMap = {};
    if (teacherIds.size > 0) {
      const teachers = await User.find({ _id: { $in: [...teacherIds] } }).select('name').lean();
      teachers.forEach(t => { teacherMap[t._id.toString()] = t.name; });
    }

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
          const s = schedMap[cls._id.toString()] || { done: 0, teacherId: null };
          return { _id: cls._id, classCode: cls.classCode, courseName: cls.courseName, totalSessions: cls.totalSessions, doneSessions: s.done, progress: cls.totalSessions > 0 ? s.done / cls.totalSessions : 0, status: cls.status, teacher: s.teacherId ? teacherMap[s.teacherId.toString()] || null : null };
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

module.exports = { getDashboardStats, getFilterOptions };
