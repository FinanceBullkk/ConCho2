const mongoose = require('mongoose');
const Team = require('../../models/Team');
const Enrollment = require('../../models/Enrollment');
const { handleError } = require('../../helpers/handleError');
const auditService = require('../../services/auditService');
const { invalidateAnalyticsCache } = require('../../middleware/analyticsCache');

// ──────────────────────────────────────────────────────────
// Team Controller — soft-delete lifecycle (Admin only)
// ──────────────────────────────────────────────────────────
// Split from the legacy teamController (Phase 1 modular-monolith).
// Soft-delete (closes active enrollments in-tx) + restore. Schedules and
// Attendance are PRESERVED for the audit trail.

/**
 * DELETE /api/teams/:id
 * SOFT DELETE — marks team as deleted but preserves all data.
 *
 * Side-effects (reversible via restore):
 *   1. Close active Enrollment records (status → 'Dropped')
 *   2. Mark team as soft-deleted (isDeleted=true, deletedAt=now)
 *
 * Schedules and Attendance are PRESERVED for audit trail.
 */
const deleteTeam = async (req, res) => {
  try {
    const team = await Team.findById(req.params.id);
    if (!team) {
      return res.status(404).json({ success: false, message: 'Team not found' });
    }

    // ── TRANSACTION: Soft-delete (UX-03) ──────────────────
    const session = await mongoose.startSession();
    let closedEnrollments = 0;

    try {
      await session.withTransaction(async () => {
        // Step 1: Close all active enrollments for this team
        const enrollResult = await Enrollment.updateMany(
          { teamId: team._id, status: 'Active' },
          { $set: { status: 'Dropped', leftAt: new Date() } },
          { session }
        );
        closedEnrollments = enrollResult.modifiedCount;

        // Step 2: Soft-delete the team (bypass auto-filter via raw update)
        await Team.collection.updateOne(
          { _id: team._id },
          { $set: { isDeleted: true, deletedAt: new Date() } },
          { session }
        );
      });
    } finally {
      session.endSession();
    }

    auditService.record({
      req,
      action: 'soft-deleted',
      entity: 'Team',
      entityId: team._id,
      note: `Closed ${closedEnrollments} enrollments`,
    });

    invalidateAnalyticsCache();
    res.json({
      success: true,
      message: `Team "${team.name}" soft-deleted (can be restored)`,
      cascade: { closedEnrollments },
    });
  } catch (error) {
    handleError(res, error);
  }
};

/**
 * POST /api/teams/:id/restore
 * Restore a soft-deleted team.
 * Admin must manually re-add members if needed.
 */
const restoreTeam = async (req, res) => {
  try {
    const team = await Team.findOne({ _id: req.params.id, isDeleted: true }).lean();
    if (!team) {
      return res.status(404).json({
        success: false,
        message: 'Deleted team not found.',
      });
    }

    await Team.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(req.params.id) },
      { $set: { isDeleted: false, deletedAt: null } }
    );

    auditService.record({
      req,
      action: 'restored',
      entity: 'Team',
      entityId: team._id,
    });

    invalidateAnalyticsCache();
    res.json({
      success: true,
      message: `Team "${team.name}" restored`,
    });
  } catch (error) {
    handleError(res, error);
  }
};

module.exports = { deleteTeam, restoreTeam };
