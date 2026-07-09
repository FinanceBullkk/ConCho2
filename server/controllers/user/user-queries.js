const listRepository = require('./user-list-repository');
// Dual-backend reads (K1b slice 4): getUserById + the getUserProgress bundle
// (user + enrollments + member-team fallback + team sessions + attendance) route
// through the DB_BACKEND-selected repos so they read the active backend.
const userRepo = require('./user-repository');
const userMutationsRepo = require('./user-mutations-repository');
const enrollmentRepo = require('../../domains/learning/enrollment/repository');
const groupsReadRepo = require('../../domains/groups/read-repository');
const attendanceRepo = require('../../domains/attendance/repository');
const { parsePagination, paginatedResponse } = require('../../helpers/pagination');
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
    const { page, limit, skip } = parsePagination(req);

    // Sortable columns whitelist. `lastActive` is the client-facing column
    // name; it sorts on the denormalised `lastActiveAt` (BUG-005 — the
    // UsersPage default sort silently fell back to empCode before).
    const SORTABLE = ['empCode', 'name', 'department', 'position', 'status', 'role', 'entranceLevel', 'currentLevel', 'lastActive'];
    const sortBy = SORTABLE.includes(req.query.sortBy) ? req.query.sortBy : 'empCode';
    const sortField = sortBy === 'lastActive' ? 'lastActiveAt' : sortBy;
    const sortOrder = req.query.sortOrder === 'desc' ? -1 : 1;

    // Reads follow DB_BACKEND (Wave-G port): the pg impl reads the users table
    // so PG-written denormalisations (last_active_at, bumped by the ported
    // attendance write-through) surface here — a Mongoose read would miss them
    // on the pg lane. Filter/sort/pagination semantics are identical on both.
    const spec = {
      role: req.query.role,
      status: req.query.status,
      department: req.query.department,
      search: req.query.search,
      sortField, sortOrder, skip, limit,
    };

    const [users, total] = await Promise.all([
      listRepository.listUsers(spec),
      listRepository.countUsers(spec),
    ]);

    // PERF-008 (audit PR H): lastActiveAt is denormalised onto the User document
    // by attendanceService.bulkMark (write-through cache) — no per-page
    // Attendance×Schedule aggregation. The mongo impl returns hydrated docs
    // (toObject), the pg impl plain rows; enrich either uniformly.
    const enrichedUsers = users.map((u) => {
      const obj = typeof u.toObject === 'function' ? u.toObject() : u;
      const lastDate = obj.lastActiveAt || null;
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
    // Dual-backend full-user read (same projection as create/update responses;
    // sensitive select:false fields stay excluded). is_deleted filtered → 404.
    const user = await userMutationsRepo.findByIdLean(req.params.id);
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
    // Dual-backend (Phase 5 slice 4): lifecycle writes follow DB_BACKEND, so
    // the trash view reads the same backend.
    const users = await listRepository.listTrashedUsers();

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
    const user = await userRepo.findLiveUserById(userId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const enrollments = await enrollmentRepo.listUserEnrollments(userId);

    // Fallback: Check for teams where user is a member but missing an Enrollment record
    const activeTeams = await groupsReadRepo.findMemberTeamsWithClass(userId);

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

    const schedules = await groupsReadRepo.findScheduledByBookedTeamIdsPopulated(teamIds);

    const scheduleIds = schedules.map(s => s._id);
    const attendances = await attendanceRepo.findAttendanceStatusRows(scheduleIds, [userId]);

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
