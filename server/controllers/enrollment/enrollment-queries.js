// Dual-backend (Mongo ⇔ Postgres) read surface (K1b slice 3): the legacy
// /api/enrollments listings route through the DB_BACKEND-selected repo so they
// read the active backend once Mongo is retired.
const enrollmentRepo = require('../../domains/learning/enrollment/repository');
const { handleError } = require('../../helpers/handleError');
const { enrichWithAttendance } = require('./enrollment-shared');

// ──────────────────────────────────────────────────────────
// Enrollment Controller — read handlers
// ──────────────────────────────────────────────────────────
// Split from the legacy enrollmentController (Phase 1 modular-monolith).
// List/by-team/by-user listings + conflict precheck. classId-scoped lists
// are enriched with per-user attendance summary.

/**
 * GET /api/enrollments
 * List enrollments with optional filters. When `classId` is provided,
 * results are enriched with per-user attendance summary.
 */
const getEnrollments = async (req, res) => {
  try {
    const enrollments = await enrollmentRepo.listEnrollments({
      teamId: req.query.teamId,
      userId: req.query.userId,
      status: req.query.status,
      classId: req.query.classId,
    });

    const needsAttendance = !!req.query.classId;
    const data = needsAttendance ? await enrichWithAttendance(enrollments) : enrollments;

    res.json({ success: true, count: data.length, data });
  } catch (error) {
    handleError(res, error);
  }
};

/**
 * GET /api/enrollments/team/:teamId
 * All enrollments for a specific team, enriched with attendance summary.
 */
const getTeamEnrollments = async (req, res) => {
  try {
    const { teamId } = req.params;
    const statusFilter = req.query.status; // optional: 'Active', 'All', etc.

    const enrollments = await enrollmentRepo.listTeamEnrollments({ teamId, status: statusFilter });

    const enriched = await enrichWithAttendance(enrollments);
    res.json({ success: true, count: enriched.length, data: enriched });
  } catch (error) {
    handleError(res, error);
  }
};

/**
 * GET /api/enrollments/user/:userId
 * Full learning timeline for a specific user.
 */
const getUserEnrollments = async (req, res) => {
  try {
    const enrollments = await enrollmentRepo.listUserEnrollments(req.params.userId);

    res.json({ success: true, count: enrollments.length, data: enrollments });
  } catch (error) {
    handleError(res, error);
  }
};

/**
 * POST /api/enrollments/check-conflicts
 * Check if the given memberIds are already active in another team.
 */
const checkConflicts = async (req, res) => {
  try {
    const { teamId, memberIds } = req.body;
    if (!memberIds || !Array.isArray(memberIds)) {
      return res.status(400).json({ success: false, message: 'memberIds must be an array' });
    }

    // Find Active enrollments for these users that are NOT in the target team
    // (teamId $ne target → still flags cohort-mode rows, teamId:null).
    const conflicts = await enrollmentRepo.findActiveConflicts({ memberIds, teamId });

    const formattedConflicts = conflicts.map(c => ({
      userId: c.userId._id,
      name: c.userId.name,
      empCode: c.userId.empCode,
      currentTeamId: c.teamId?._id,
      currentTeamName: c.teamId?.name || 'Unknown Team',
    }));

    res.json({ success: true, data: formattedConflicts });
  } catch (error) {
    handleError(res, error);
  }
};

module.exports = { getEnrollments, getTeamEnrollments, getUserEnrollments, checkConflicts };
