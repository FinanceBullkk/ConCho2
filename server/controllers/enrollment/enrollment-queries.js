const Enrollment = require('../../models/Enrollment');
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
    const filter = {};
    if (req.query.teamId) filter.teamId = req.query.teamId;
    if (req.query.userId) filter.userId = req.query.userId;
    if (req.query.status) filter.status = req.query.status;
    if (req.query.classId) filter.classId = req.query.classId;

    const needsAttendance = !!req.query.classId;
    const query = Enrollment.find(filter)
      .populate('userId', 'empCode name department status')
      .populate('teamId', 'name')
      .populate('classId', 'classCode courseName totalSessions')
      .populate('transferredTo', 'name')
      .sort({ joinedAt: -1 });

    const enrollments = needsAttendance ? await query.lean() : await query;
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

    const filter = { teamId };
    if (statusFilter && statusFilter !== 'All') {
      filter.status = statusFilter;
    }

    const enrollments = await Enrollment.find(filter)
      .populate('userId', 'empCode name department status')
      .populate('teamId', 'name classId')
      .populate('classId', 'classCode courseName totalSessions')
      .populate('transferredTo', 'name')
      .sort({ status: 1, joinedAt: -1 })
      .lean();

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
    const enrollments = await Enrollment.find({ userId: req.params.userId })
      .populate('userId', 'empCode name department status')
      .populate('teamId', 'name')
      .populate('classId', 'classCode courseName totalSessions')
      .populate('transferredTo', 'name')
      .sort({ joinedAt: -1 })
      .lean();

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
    const conflicts = await Enrollment.find({
      userId: { $in: memberIds },
      status: 'Active',
      teamId: { $ne: teamId }, // Ignore if they are already in THIS team (that's not a transfer)
    })
      .populate('userId', 'empCode name department')
      .populate('teamId', 'name')
      .lean();

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
