const Team = require('../../models/Team');
const Schedule = require('../../models/Schedule');
const Attendance = require('../../models/Attendance');
const { handleError } = require('../../helpers/handleError');
const { paginatedResponse } = require('../../helpers/pagination');

// ──────────────────────────────────────────────────────────
// Team Controller — read handlers (Admin only)
// ──────────────────────────────────────────────────────────
// Split from the legacy teamController (Phase 1 modular-monolith).
// Listings (paginated/slim/legacy), single fetch, my-teams, trash, progress.

/**
 * GET /api/teams
 *
 * Audit PR T (API-002): two optional query modes for the
 * "1000 teams × 9 members ≈ 9000 user docs" payload problem.
 *
 *   ?page=&limit=        — paginated response with {data, total, pages, …}
 *                          (default behaviour when caller supplies either)
 *   ?slim=true           — skip the deep populate of `members`. Useful for
 *                          lookups (userId → teamName) where the caller
 *                          only needs name + classCode + leaderId.
 *
 * When neither pagination param is present, the legacy shape is kept
 * verbatim so existing client callers (useTeams() in TeamsPage,
 * ClassesPage, UsersPage, SchedulesPage, ClassDetailPage) work unchanged.
 * Future clients can opt into pagination + slim mode incrementally.
 */
const getTeams = async (req, res) => {
  try {
    const isPaginated = req.query.page !== undefined || req.query.limit !== undefined;
    const slim = req.query.slim === 'true';

    let query = Team.find()
      .populate('classId', 'classCode courseName status')
      .populate('leaderId', 'empCode name department status');
    if (!slim) {
      query = query.populate('members', 'empCode name department status');
    }
    query = query.sort({ name: 1 });

    if (isPaginated) {
      // teamRoutes has no zod schema on GET so query params come through as
      // strings. Coerce to numbers ourselves before handing off to
      // parsePagination so the response shape carries numeric page/limit
      // (matches other paginated endpoints that DO have zod schemas).
      const page = Number(req.query.page) || 1;
      const limit = Math.min(Number(req.query.limit) || 50, 200);
      const skip = (page - 1) * limit;
      const [teams, total] = await Promise.all([
        query.clone().skip(skip).limit(limit),
        Team.countDocuments(),
      ]);
      return res.json(paginatedResponse({ data: teams, total, page, limit }));
    }

    const teams = await query;
    res.json({ success: true, count: teams.length, data: teams });
  } catch (error) {
    handleError(res, error);
  }
};

/**
 * GET /api/teams/:id
 */
const getTeamById = async (req, res) => {
  try {
    const team = await Team.findById(req.params.id)
      .populate('classId', 'classCode courseName status')
      .populate('leaderId', 'empCode name department status')
      .populate('members', 'empCode name department status');

    if (!team) {
      return res.status(404).json({ success: false, message: 'Team not found' });
    }
    res.json({ success: true, data: team });
  } catch (error) {
    handleError(res, error);
  }
};

/**
 * GET /api/teams/my-teams
 */
const getMyTeams = async (req, res) => {
  try {
    const teams = await Team.find({
      $or: [
        { leaderId: req.user._id },
        { members: req.user._id },
      ],
    })
      // Nested-populate the program's schedulingMode so the booking client can
      // gate cells before the server 403/400s (Pass C is enforced at bookSlot).
      // Class.programId is nullable → a program-less class exposes no nested
      // program; the client resolver falls back to 'leader_booking' to match
      // server/domains/schedule/repository.js → findClassSchedulingMode.
      .populate({
        path: 'classId',
        select: 'classCode courseName status programId',
        populate: { path: 'programId', select: 'schedulingMode' },
      })
      .populate('leaderId', 'empCode name department status')
      .populate('members', 'empCode name department status')
      .sort({ name: 1 });

    res.json({ success: true, count: teams.length, data: teams });
  } catch (error) {
    handleError(res, error);
  }
};

/**
 * GET /api/teams/deleted
 * List all soft-deleted teams (Admin trash view).
 */
const getDeletedTeams = async (req, res) => {
  try {
    const teams = await Team.find({ isDeleted: true })
      .populate('classId', 'classCode courseName')
      .populate('leaderId', 'empCode name')
      .sort({ deletedAt: -1 })
      .lean();

    res.json({ success: true, count: teams.length, data: teams });
  } catch (error) {
    handleError(res, error);
  }
};

/**
 * GET /api/teams/:id/progress
 */
const getTeamProgress = async (req, res) => {
  try {
    const teamId = req.params.id;
    const team = await Team.findById(teamId)
      .populate('members', 'empCode name department status')
      .populate('classId', 'classCode courseName')
      .lean();

    if (!team) return res.status(404).json({ success: false, message: 'Team not found' });

    const schedules = await Schedule.find({ bookedTeamId: teamId })
      .sort({ startTime: 1 })
      .lean();

    const scheduleIds = schedules.map(s => s._id);
    const attendances = await Attendance.find({ scheduleId: { $in: scheduleIds } }).lean();

    res.json({
      success: true,
      data: {
        team,
        schedules,
        attendances,
      }
    });
  } catch (error) {
    handleError(res, error);
  }
};

module.exports = { getTeams, getTeamById, getMyTeams, getDeletedTeams, getTeamProgress };
