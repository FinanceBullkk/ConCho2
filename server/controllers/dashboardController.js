const User = require('../models/User');
const Class = require('../models/Class');
const Schedule = require('../models/Schedule');
const Attendance = require('../models/Attendance');
const Team = require('../models/Team');

// ──────────────────────────────────────────────────────────
// Dashboard Controller — Admin Analytics
// ──────────────────────────────────────────────────────────
// Mirrors the 4 sections of the Excel DASHBOARD sheet:
//   Section 1: Overview KPIs
//   Section 2: Students by Course
//   Section 3: Drop Reason Analytics
//   Section 4: Class Progress (done/expected)
// ──────────────────────────────────────────────────────────

const getDashboardStats = async (req, res) => {
  try {
    // ── Section 1: Overview KPIs ──
    const [
      totalUsers,
      activeUsers,
      inactiveUsers,
      waitingUsers,
      droppedUsers,
      onHoldUsers,
      totalClasses,
      totalTeams,
    ] = await Promise.all([
      User.countDocuments({ role: 'Participant' }),
      User.countDocuments({ role: 'Participant', status: 'Active' }),
      User.countDocuments({ role: 'Participant', status: 'Inactive' }),
      User.countDocuments({ role: 'Participant', status: 'Waiting for class' }),
      User.countDocuments({ role: 'Participant', status: 'Dropped' }),
      User.countDocuments({ role: 'Participant', status: 'On-hold' }),
      Class.countDocuments(),
      Team.countDocuments(),
    ]);

    // Attendance rate: total Present / total records
    const attStats = await Attendance.aggregate([
      { $group: {
        _id: null,
        total: { $sum: 1 },
        present: { $sum: { $cond: [{ $in: ['$status', ['P', 'L']] }, 1, 0] } },
      }},
    ]);
    const totalAtt = attStats[0]?.total || 0;
    const presentAtt = attStats[0]?.present || 0;
    const attendanceRate = totalAtt > 0 ? presentAtt / totalAtt : 0;

    // At Risk: participants with lastActive > 30 days ago OR no attendance at all
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const activeUserIds = await User.find({ role: 'Participant', status: 'Active' }).select('_id').lean();
    const activeIds = activeUserIds.map(u => u._id);

    const recentlyActive = await Attendance.distinct('userId', {
      userId: { $in: activeIds },
      createdAt: { $gte: thirtyDaysAgo },
    });
    const atRisk = activeIds.length - recentlyActive.length;

    // ── Section 2: Students by Course ──
    // Get all classes and map which users are in which teams
    const teams = await Team.find().populate('classId', 'courseName status').lean();
    const courseStats = {};

    for (const team of teams) {
      if (!team.classId) continue;
      const courseName = team.classId.courseName;
      if (!courseStats[courseName]) {
        courseStats[courseName] = { active: 0, inactive: 0, waiting: 0, total: 0 };
      }
      // Count members by status
      const memberIds = [...(team.members || [])];
      if (memberIds.length > 0) {
        const members = await User.find({ _id: { $in: memberIds }, role: 'Participant' })
          .select('status').lean();
        for (const m of members) {
          courseStats[courseName].total++;
          if (m.status === 'Active') courseStats[courseName].active++;
          else if (m.status === 'Inactive') courseStats[courseName].inactive++;
          else if (m.status === 'Waiting for class') courseStats[courseName].waiting++;
        }
      }
    }

    // If no team data, fallback: count from users' current enrollment
    // Use the imported STUDENTS data (all users have courses tracked externally)
    // For now, provide what we have from teams
    const courseBreakdown = Object.entries(courseStats)
      .map(([courseName, counts]) => ({ courseName, ...counts }))
      .sort((a, b) => b.total - a.total);

    // ── Section 3: Drop Reasons ──
    const dropReasonAgg = await User.aggregate([
      { $match: { role: 'Participant', status: { $in: ['Inactive', 'Dropped'] }, dropReason: { $ne: '' } } },
      {
        $project: {
          // Extract the last part after " — " for the reason
          reason: {
            $cond: {
              if: { $regexMatch: { input: { $ifNull: ['$dropReason', ''] }, regex: / — / } },
              then: { $arrayElemAt: [{ $split: ['$dropReason', ' — '] }, 1] },
              else: '$dropReason',
            }
          },
          classification: {
            $cond: {
              if: { $regexMatch: { input: { $ifNull: ['$dropReason', ''] }, regex: / — / } },
              then: { $arrayElemAt: [{ $split: ['$dropReason', ' — '] }, 0] },
              else: '',
            }
          }
        }
      },
      { $group: { _id: '$reason', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]);

    const dropClassificationAgg = await User.aggregate([
      { $match: { role: 'Participant', status: { $in: ['Inactive', 'Dropped'] }, dropReason: { $ne: '' } } },
      {
        $project: {
          classification: {
            $cond: {
              if: { $regexMatch: { input: { $ifNull: ['$dropReason', ''] }, regex: / — / } },
              then: { $arrayElemAt: [{ $split: ['$dropReason', ' — '] }, 0] },
              else: '$dropReason',
            }
          }
        }
      },
      { $group: { _id: '$classification', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);

    // ── Section 4: Class Progress ──
    const classes = await Class.find().sort({ classCode: 1 }).lean();
    const classProgress = [];

    for (const cls of classes) {
      // Count done sessions (schedules in the past)
      const schedules = await Schedule.find({ classId: cls._id }).lean();
      const now = new Date();
      const doneSessions = schedules.filter(s => new Date(s.endTime) < now).length;

      // Find PIC (teacher from first schedule that has one)
      const withTeacher = schedules.find(s => s.teacherId);
      let teacherName = null;
      if (withTeacher) {
        const teacher = await User.findById(withTeacher.teacherId).select('name').lean();
        teacherName = teacher?.name || null;
      }

      classProgress.push({
        classCode: cls.classCode,
        courseName: cls.courseName,
        totalSessions: cls.totalSessions,
        doneSessions,
        progress: cls.totalSessions > 0 ? doneSessions / cls.totalSessions : 0,
        status: cls.status,
        teacher: teacherName,
      });
    }

    res.json({
      success: true,
      data: {
        overview: {
          totalStudents: totalUsers,
          active: activeUsers,
          inactive: inactiveUsers,
          waiting: waitingUsers,
          dropped: droppedUsers,
          onHold: onHoldUsers,
          attendanceRate,
          totalSessions: totalAtt,
          presentSessions: presentAtt,
          atRisk,
          totalClasses,
          totalTeams,
        },
        courseBreakdown,
        dropReasons: dropReasonAgg.map(d => ({ reason: d._id, count: d.count })),
        dropClassifications: dropClassificationAgg.map(d => ({ classification: d._id, count: d.count })),
        classProgress,
      },
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { getDashboardStats };
