const User = require('../models/User');
const Class = require('../models/Class');
const Schedule = require('../models/Schedule');
const Attendance = require('../models/Attendance');
const Team = require('../models/Team');

// ──────────────────────────────────────────────────────────
// Dashboard Controller — Admin Analytics (Optimized)
// ──────────────────────────────────────────────────────────

const getDashboardStats = async (req, res) => {
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // ═══ PHASE 1: All independent queries in parallel ═══
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
    ] = await Promise.all([
      User.aggregate([
        { $match: { role: 'Participant' } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      Attendance.aggregate([
        { $group: { _id: null, total: { $sum: 1 }, present: { $sum: { $cond: [{ $in: ['$status', ['P', 'L']] }, 1, 0] } } } },
      ]),
      Attendance.distinct('userId', { createdAt: { $gte: thirtyDaysAgo } }),
      Team.find().populate('classId', 'courseName status').select('members classId').lean(),
      User.find({ role: 'Participant' }).select('_id status').lean(),
      User.aggregate([
        { $match: { role: 'Participant', status: { $in: ['Inactive', 'Dropped'] }, dropReason: { $ne: '' } } },
        { $project: { reason: { $cond: { if: { $regexMatch: { input: { $ifNull: ['$dropReason', ''] }, regex: / — / } }, then: { $arrayElemAt: [{ $split: ['$dropReason', ' — '] }, 1] }, else: '$dropReason' } } } },
        { $group: { _id: '$reason', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
      User.aggregate([
        { $match: { role: 'Participant', status: { $in: ['Inactive', 'Dropped'] }, dropReason: { $ne: '' } } },
        { $project: { classification: { $cond: { if: { $regexMatch: { input: { $ifNull: ['$dropReason', ''] }, regex: / — / } }, then: { $arrayElemAt: [{ $split: ['$dropReason', ' — '] }, 0] }, else: '$dropReason' } } } },
        { $group: { _id: '$classification', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      Class.find().sort({ classCode: 1 }).lean(),
      Schedule.aggregate([
        { $group: { _id: '$classId', total: { $sum: 1 }, done: { $sum: { $cond: [{ $lt: ['$endTime', now] }, 1, 0] } }, teacherId: { $first: '$teacherId' } } },
      ]),
    ]);

    // ═══ PHASE 2: Compute from fetched data (zero DB) ═══
    const statusMap = {};
    userStatusCounts.forEach(s => { statusMap[s._id] = s.count; });
    const totalUsers = Object.values(statusMap).reduce((a, b) => a + b, 0);
    const activeUsers = statusMap['Active'] || 0;

    const totalAtt = attStats[0]?.total || 0;
    const presentAtt = attStats[0]?.present || 0;

    const recentSet = new Set(recentlyActiveIds.map(id => id.toString()));
    const atRisk = allParticipants.filter(u => u.status === 'Active' && !recentSet.has(u._id.toString())).length;

    // Course breakdown (no N+1)
    const userStatusLookup = {};
    allParticipants.forEach(u => { userStatusLookup[u._id.toString()] = u.status; });
    const courseStats = {};
    for (const team of teams) {
      if (!team.classId) continue;
      const cn = team.classId.courseName;
      if (!courseStats[cn]) courseStats[cn] = { active: 0, inactive: 0, waiting: 0, total: 0 };
      for (const m of (team.members || [])) {
        const s = userStatusLookup[m._id?.toString() || m.toString()];
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
        courseBreakdown: Object.entries(courseStats).map(([courseName, c]) => ({ courseName, ...c })).sort((a, b) => b.total - a.total),
        dropReasons: dropReasonAgg.map(d => ({ reason: d._id, count: d.count })),
        dropClassifications: dropClassificationAgg.map(d => ({ classification: d._id, count: d.count })),
        classProgress: classes.map(cls => {
          const s = schedMap[cls._id.toString()] || { done: 0, teacherId: null };
          return { classCode: cls.classCode, courseName: cls.courseName, totalSessions: cls.totalSessions, doneSessions: s.done, progress: cls.totalSessions > 0 ? s.done / cls.totalSessions : 0, status: cls.status, teacher: s.teacherId ? teacherMap[s.teacherId.toString()] || null : null };
        }),
      },
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { getDashboardStats };
