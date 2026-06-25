const { runInTransaction } = require('../_shared/unit-of-work');
const repository = require('./lifecycle-repository');
const { handleError } = require('../../helpers/handleError');
const auditService = require('../../services/auditService');
const { invalidateAnalyticsCache } = require('../../middleware/analyticsCache');

// ──────────────────────────────────────────────────────────
// Groups (Team) — soft-delete lifecycle (Admin only)
// ──────────────────────────────────────────────────────────
// Relocated from controllers/team/* into domains/groups (Phase 1 domain extraction).
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
    const team = await repository.findTeamById(req.params.id);
    if (!team) {
      return res.status(404).json({ success: false, message: 'Team not found' });
    }

    // ── TRANSACTION: Soft-delete (UX-03) — backend-agnostic Unit of Work ──
    let closedEnrollments = 0;
    await runInTransaction(async (tx) => {
      // Step 1: Close all active enrollments for this team
      const enrollResult = await repository.closeActiveEnrollments(team._id, tx);
      closedEnrollments = enrollResult.modifiedCount;

      // Step 2: Soft-delete the team (raw write — bypasses the isDeleted hook)
      await repository.markTeamDeleted(team._id, tx);
    });

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
    const team = await repository.findDeletedTeamById(req.params.id);
    if (!team) {
      return res.status(404).json({
        success: false,
        message: 'Deleted team not found.',
      });
    }

    await repository.markTeamRestored(req.params.id);

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
