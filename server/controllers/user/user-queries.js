const User = require('../../models/User');
const Team = require('../../models/Team');
const Schedule = require('../../models/Schedule');
const Attendance = require('../../models/Attendance');
const Enrollment = require('../../models/Enrollment');
const { parsePagination, paginatedResponse } = require('../../helpers/pagination');
const { escapeRegex } = require('../../helpers/escapeRegex');
const { handleError } = require('../../helpers/handleError');

// ──────────────────────────────────────────────────────────
// User Controller — read handlers (Admin only)
// ──────────────────────────────────────────────────────────
// Split from the legacy userController (Phase 1 modular-monolith).
// Pure reads: list/search, single fetch, trash view, progress.

/**
 * GET /api/users
 * Filters: ?role=Teacher&status=Active&department=Sales
 * Pagination: ?page=1&limit=50
 */
const getUsers = async (req, res) => {
  try {
    const filter = {};
    if (req.query.role) filter.role = req.query.role;
    if (req.query.status) filter.status = req.query.status;
    if (req.query.department) filter.department = { $regex: escapeRegex(req.query.department), $options: 'i' };

    // Text search across empCode, name, department, position
    if (req.query.search) {
      const s = escapeRegex(req.query.search);
      filter.$or = [
        { empCode: { $regex: s, $options: 'i' } },
        { name: { $regex: s, $options: 'i' } },
        { department: { $regex: s, $options: 'i' } },
        { position: { $regex: s, $options: 'i' } },
      ];
    }

    const { page, limit, skip } = parsePagination(req);

    // Sortable columns whitelist
    const SORTABLE = ['empCode', 'name', 'department', 'position', 'status', 'role', 'entranceLevel', 'currentLevel'];
    const sortBy = SORTABLE.includes(req.query.sortBy) ? req.query.sortBy : 'empCode';
    const sortOrder = req.query.sortOrder === 'desc' ? -1 : 1;

    const [users, total] = await Promise.all([
      User.find(filter).sort({ [sortBy]: sortOrder }).skip(skip).limit(limit),
      User.countDocuments(filter),
    ]);

    // PERF-008 (audit PR H): lastActiveAt is now denormalised onto the
    // User document by attendanceService.bulkMark (write-through cache).
    // No more per-page Attendance×Schedule aggregation. For users who
    // existed BEFORE the cache was wired (lastActiveAt === null) the
    // value will populate on the next bulkMark; if you need a fresh
    // snapshot today, run `node server/scripts/backfill-lastActiveAt.js`.
    const enrichedUsers = users.map((u) => {
      const obj = u.toObject();
      const lastDate = u.lastActiveAt || null;
      obj.lastActive = lastDate;
      obj.daysSince = lastDate
        ? Math.floor((Date.now() - new Date(lastDate).getTime()) / (1000 * 60 * 60 * 24))
        : null;
      return obj;
    });

    res.json(paginatedResponse({ data: enrichedUsers, total, page, limit }));
  } catch (error) {
    handleError(res, error);
  }
};

/**
 * GET /api/users/:id
 * Get single user by ID
 */
const getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    res.json({ success: true, data: user });
  } catch (error) {
    handleError(res, error);
  }
};

/**
 * GET /api/users/deleted
 * List all soft-deleted users (Admin trash view).
 */
const getDeletedUsers = async (req, res) => {
  try {
    const users = await User.find({ isDeleted: true })
      .select('+isDeleted +deletedAt')
      .sort({ deletedAt: -1 })
      .lean();

    res.json({ success: true, count: users.length, data: users });
  } catch (error) {
    handleError(res, error);
  }
};

/**
 * GET /api/users/:id/progress
 */
const getUserProgress = async (req, res) => {
  try {
    const userId = req.params.id;
    const user = await User.findById(userId).select('-password').lean();
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const enrollments = await Enrollment.find({ userId })
      .populate('teamId')
      .populate('classId', 'classCode courseName')
      .lean();

    // Fallback: Check for teams where user is a member but missing an Enrollment record
    const activeTeams = await Team.find({ members: userId })
      .populate('classId', 'classCode courseName')
      .lean();

    const enrolledTeamIds = enrollments.map(e => e.teamId?._id?.toString());

    for (const team of activeTeams) {
      if (!enrolledTeamIds.includes(team._id.toString())) {
        enrollments.push({
          _id: `mock-${team._id}`,
          userId,
          teamId: team,
          classId: team.classId,
          status: 'Active',
          joinedAt: team.createdAt || new Date(),
        });
      }
    }

    const teamIds = enrollments.map(e => e.teamId?._id).filter(Boolean);

    const schedules = await Schedule.find({ bookedTeamId: { $in: teamIds } })
      .sort({ startTime: 1 })
      .populate('classId', 'classCode courseName')
      .populate('bookedTeamId', 'name')
      .lean();

    const scheduleIds = schedules.map(s => s._id);
    const attendances = await Attendance.find({
      scheduleId: { $in: scheduleIds },
      userId
    }).lean();

    res.json({
      success: true,
      data: {
        user,
        enrollments,
        schedules,
        attendances,
      }
    });
  } catch (error) {
    handleError(res, error);
  }
};

module.exports = { getUsers, getUserById, getDeletedUsers, getUserProgress };
