const repository = require('./repository');
const { handleError } = require('../../helpers/handleError');
const { paginatedResponse } = require('../../helpers/pagination');

// ──────────────────────────────────────────────────────────
// Groups (Team) — read handlers (Admin only)
// ──────────────────────────────────────────────────────────
// Relocated from controllers/team/* into domains/groups (Phase 1 domain extraction).
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

    if (isPaginated) {
      // teamRoutes has no zod schema on GET so query params come through as
      // strings. Coerce to numbers ourselves so the response shape carries
      // numeric page/limit (matches other paginated endpoints with zod schemas).
      const page = Number(req.query.page) || 1;
      const limit = Math.min(Number(req.query.limit) || 50, 200);
      const skip = (page - 1) * limit;
      const [teams, total] = await Promise.all([
        repository.findTeamsPage({ slim, skip, limit }),
        repository.countTeams(),
      ]);
      return res.json(paginatedResponse({ data: teams, total, page, limit }));
    }

    const teams = await repository.findAllTeams({ slim });
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
    const team = await repository.findTeamByIdPopulated(req.params.id);

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
    // Nested program.schedulingMode lets the booking client gate cells before
    // the server 403/400s (Pass C is enforced at bookSlot). A program-less class
    // exposes no nested program; the client resolver falls back to
    // 'leader_booking' (matches schedule repo → findClassSchedulingMode).
    const teams = await repository.findTeamsForUser(req.user._id);

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
    const teams = await repository.findDeletedTeams();

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
    const team = await repository.findTeamForProgress(teamId);

    if (!team) return res.status(404).json({ success: false, message: 'Team not found' });

    const schedules = await repository.findTeamScheduledSessions(teamId);
    const scheduleIds = schedules.map(s => s._id);
    const attendances = await repository.findAttendanceForSchedules(scheduleIds);

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
