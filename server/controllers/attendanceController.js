const mongoose = require('mongoose');
const Attendance = require('../models/Attendance');
const Schedule = require('../models/Schedule');
const Team = require('../models/Team');
const { invalidateAnalyticsCache } = require('../middleware/analyticsCache');

// ──────────────────────────────────────────────────────────
// Attendance Controller
// ──────────────────────────────────────────────────────────

/**
 * POST /api/attendance/:scheduleId
 * BULK UPSERT attendance for an entire class roster
 *
 * Body: {
 *   records: [
 *     { userId: "...", status: "P", remark: "", photoUrl: "" },
 *     { userId: "...", status: "A" },
 *     ...
 *   ]
 * }
 *
 * Uses MongoDB bulkWrite with upsert to efficiently handle
 * both inserts and updates in a single DB roundtrip.
 *
 * After a successful write, invalidates the analytics cache
 * so the dashboard reflects the new data immediately.
 */
const bulkMarkAttendance = async (req, res) => {
  try {
    const { scheduleId } = req.params;
    const { records } = req.body;

    if (!records || !Array.isArray(records) || records.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'records array is required and must not be empty',
      });
    }

    // Verify schedule exists
    const schedule = await Schedule.findById(scheduleId);
    if (!schedule) {
      return res.status(404).json({ success: false, message: 'Schedule not found' });
    }

    // Validate statuses
    const validStatuses = ['P', 'A', 'L', 'EL'];
    for (const record of records) {
      if (!record.userId || !record.status) {
        return res.status(400).json({
          success: false,
          message: 'Each record must have userId and status',
        });
      }
      if (!validStatuses.includes(record.status)) {
        return res.status(400).json({
          success: false,
          message: `Invalid status "${record.status}". Use: ${validStatuses.join(', ')}`,
        });
      }
    }

    // Build bulkWrite operations (upsert = insert or update)
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

    // ── Invalidate analytics cache after successful write ──
    invalidateAnalyticsCache();

    res.json({
      success: true,
      message: `Attendance processed: ${result.upsertedCount} created, ${result.modifiedCount} updated`,
      data: {
        matched: result.matchedCount,
        modified: result.modifiedCount,
        upserted: result.upsertedCount,
        total: records.length,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /api/attendance/schedule/:scheduleId
 * Get all attendance records for a specific schedule
 */
const getAttendanceBySchedule = async (req, res) => {
  try {
    const records = await Attendance.find({ scheduleId: req.params.scheduleId })
      .populate('userId', 'empCode name department')
      .sort({ 'userId.empCode': 1 });

    res.json({ success: true, count: records.length, data: records });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /api/attendance/user/:userId
 * Get attendance history for a specific user
 */
const getAttendanceByUser = async (req, res) => {
  try {
    const records = await Attendance.find({ userId: req.params.userId })
      .populate({
        path: 'scheduleId',
        populate: [
          { path: 'classId', select: 'classCode courseName' },
          { path: 'teacherId', select: 'empCode name' },
        ],
      })
      .sort({ createdAt: -1 });

    res.json({ success: true, count: records.length, data: records });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /api/attendance/analytics/by-employee
 */
const getAnalyticsByEmployee = async (req, res) => {
  try {
    const pipeline = [
      {
        $group: {
          _id: '$userId',
          totalSessions: { $sum: 1 },
          present: { $sum: { $cond: [{ $eq: ['$status', 'P'] }, 1, 0] } },
          absent: { $sum: { $cond: [{ $eq: ['$status', 'A'] }, 1, 0] } },
          late: { $sum: { $cond: [{ $eq: ['$status', 'L'] }, 1, 0] } },
          excused: { $sum: { $cond: [{ $eq: ['$status', 'EL'] }, 1, 0] } },
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user'
        }
      },
      { $unwind: '$user' },
      {
        $project: {
          empCode: '$user.empCode',
          name: '$user.name',
          department: '$user.department',
          totalSessions: 1,
          present: 1, absent: 1, late: 1, excused: 1,
          attendanceRate: {
            $round: [{ $multiply: [{ $divide: ['$present', '$totalSessions'] }, 100] }, 1]
          }
        }
      },
      { $sort: { attendanceRate: -1, empCode: 1 } }
    ];
    
    // If specific user requested — validate ObjectId first
    if (req.query.userId) {
      if (!mongoose.Types.ObjectId.isValid(req.query.userId)) {
        return res.status(400).json({ success: false, message: 'Invalid userId format' });
      }
      pipeline.unshift({ $match: { userId: new mongoose.Types.ObjectId(req.query.userId) } });
    }

    const data = await Attendance.aggregate(pipeline);
    res.json({ success: true, count: data.length, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /api/attendance/analytics/by-team
 */
const getAnalyticsByTeam = async (req, res) => {
  try {
    // Single query: get all teams with members
    const teams = await Team.find().populate('members', '_id').lean();

    // Build a map: userId → [teamId, teamId, ...]
    // Then run ONE aggregation across ALL attendance records,
    // instead of N separate aggregations (N+1 problem).
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

    // Single aggregation: group by userId
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
        }
      }
    ]);

    // Aggregate per-user stats into per-team stats
    const teamStats = {};
    for (const tid of Object.keys(teamMeta)) {
      teamStats[tid] = { totalSessions: 0, present: 0, absent: 0, late: 0, excused: 0 };
    }

    for (const us of userStats) {
      const uid = us._id.toString();
      const tids = memberToTeams[uid] || [];
      for (const tid of tids) {
        teamStats[tid].totalSessions += us.totalSessions;
        teamStats[tid].present += us.present;
        teamStats[tid].absent += us.absent;
        teamStats[tid].late += us.late;
        teamStats[tid].excused += us.excused;
      }
    }

    // Build response
    const results = Object.entries(teamMeta).map(([tid, meta]) => {
      const s = teamStats[tid] || { totalSessions: 0, present: 0, absent: 0, late: 0, excused: 0 };
      const rate = s.totalSessions > 0 ? parseFloat(((s.present / s.totalSessions) * 100).toFixed(1)) : 0;
      return {
        _id: tid,
        name: meta.name,
        memberCount: meta.memberCount,
        stats: {
          totalSessions: s.totalSessions,
          present: s.present,
          absent: s.absent,
          late: s.late,
          excused: s.excused,
          attendanceRate: rate,
        },
      };
    });

    res.json({ success: true, count: results.length, data: results });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /api/attendance/analytics/by-class
 */
const getAnalyticsByClass = async (req, res) => {
  try {
    const classId = req.query.classId;
    if (!classId) return res.status(400).json({ success: false, message: 'classId is required' });

    // Find all schedules for this class
    const schedules = await Schedule.find({ classId }).select('_id date timeSlot').sort({ date: 1 }).lean();
    const scheduleIds = schedules.map(s => s._id);

    // Get all attendance for these schedules
    const records = await Attendance.find({ scheduleId: { $in: scheduleIds } })
      .populate('userId', 'empCode name')
      .lean();

    // Group by user
    const userMap = {};
    records.forEach(r => {
      if (!userMap[r.userId._id]) {
        userMap[r.userId._id] = {
          user: r.userId,
          sessions: {},
          present: 0,
          total: 0
        };
      }
      userMap[r.userId._id].sessions[r.scheduleId] = r.status;
      userMap[r.userId._id].total++;
      if (r.status === 'P') userMap[r.userId._id].present++;
    });

    const data = Object.values(userMap).map(u => ({
      user: u.user,
      sessions: u.sessions,
      attendanceRate: u.total > 0 ? parseFloat(((u.present / u.total) * 100).toFixed(1)) : 0
    }));

    res.json({ 
      success: true, 
      data: {
        schedules,
        roster: data
      } 
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { 
  bulkMarkAttendance, 
  getAttendanceBySchedule, 
  getAttendanceByUser,
  getAnalyticsByEmployee,
  getAnalyticsByTeam,
  getAnalyticsByClass
};
