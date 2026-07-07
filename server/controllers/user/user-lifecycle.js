// Dual-backend (Mongo ⇔ Postgres) — Phase 5 slice 4 (B1): the soft-delete
// cascade + restore ride the user/schedule repos on ONE unit-of-work tx.
const { runInTransaction } = require('../../domains/_shared/unit-of-work');
const userRepo = require('./user-repository');
const scheduleRepo = require('../../domains/schedule/repository');
const { invalidateUserCache } = require('../../middleware/auth');
const { handleError } = require('../../helpers/handleError');
const auditService = require('../../services/auditService');
const { invalidateAnalyticsCache } = require('../../middleware/analyticsCache');

// ──────────────────────────────────────────────────────────
// User Controller — soft-delete lifecycle (Admin only)
// ──────────────────────────────────────────────────────────
// Split from the legacy userController (Phase 1 modular-monolith).
// Soft-delete cascade + restore. The AUTO-RELEASE logic lives in the
// User model middleware (models/User.js). Attendance + Evaluation records
// are PRESERVED for the audit trail; only team/schedule/enrollment links
// are released (reversibly).

/**
 * DELETE /api/users/:id
 * SOFT DELETE — marks user as deleted but preserves history.
 *
 * Guards:
 *   - BLOCKS deletion if user is a Team Leader (must reassign first)
 *
 * Side-effects (reversible via restore):
 *   1. Pull user from all Teams' members arrays
 *   2. Pull user from all future Schedules' enrolledUsers
 *   3. Close active Enrollment records (status → 'Dropped')
 *   4. Mark user as soft-deleted (isDeleted=true, deletedAt=now)
 *
 * Attendance, Evaluation records are PRESERVED for audit trail.
 */
const deleteUser = async (req, res) => {
  try {
    const user = await userRepo.findLiveUserById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Guard: Block if user is a team leader
    const ledTeams = await userRepo.findTeamsLedByUser(user._id);
    if (ledTeams.length > 0) {
      const teamNames = ledTeams.map(t => t.name).join(', ');
      return res.status(409).json({
        success: false,
        message: `Cannot delete: user is leader of team(s): ${teamNames}. Reassign leader first.`,
      });
    }

    // ── TRANSACTION: Soft-delete cascade (UX-03) — one unit-of-work ─────
    let pulledFromTeams = 0;
    let pulledFromSchedules = 0;
    let closedEnrollments = 0;

    await runInTransaction(async (tx) => {
      // Step 1: Pull from Team.members (⇔ the team_members junction on PG)
      pulledFromTeams = (await userRepo.pullUserFromAllTeams(user._id, tx)).modifiedCount;

      // Step 2: Pull from future LIVE Schedule.enrolledUsers (cancelled
      // sessions keep their roster snapshot as history — phase-04 slice A)
      pulledFromSchedules = (await scheduleRepo.pullUsersFromFutureSchedules([user._id], tx)).modifiedCount;

      // Step 3: Close active enrollments
      closedEnrollments = (await userRepo.bulkDropActiveEnrollmentsByUser(user._id, tx)).modifiedCount;

      // Step 4: Soft-delete the user. Audit PR Q (DATA-008): mutate empCode +
      // park email so the identifier slots free up for reuse; the suffix
      // `__DEL_<ts36>` is reversible via the restore handler.
      const tagSuffix = `__DEL_${Date.now().toString(36).toUpperCase()}`;
      await userRepo.softDeleteUserWithParking(user._id, {
        releasedEmpCode: `${user.empCode}${tagSuffix}`,
        releasedEmail: user.email || null,
      }, tx);
    });

    // Invalidate auth cache so deleted user can't make requests
    invalidateUserCache(user._id);

    auditService.record({
      req,
      action: 'soft-deleted',
      entity: 'User',
      entityId: user._id,
      note: `Cascade: ${pulledFromTeams} teams, ${pulledFromSchedules} schedules, ${closedEnrollments} enrollments`,
    });

    invalidateAnalyticsCache();
    res.json({
      success: true,
      message: `User ${user.empCode} soft-deleted (can be restored)`,
      cascade: { pulledFromTeams, pulledFromSchedules, closedEnrollments },
    });
  } catch (error) {
    handleError(res, error);
  }
};

/**
 * POST /api/users/:id/restore
 * Restore a soft-deleted user. Only sets isDeleted=false.
 * Admin must manually re-add user to teams/classes if needed.
 */
const restoreUser = async (req, res) => {
  try {
    // Must bypass auto-filter to find deleted users
    const user = await userRepo.findDeletedUserById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Deleted user not found. Either the ID is invalid or the user was not soft-deleted.',
      });
    }

    // Audit PR Q (DATA-008): reverse the empCode / email mutation that
    // deleteUser applied. If a replacement now holds either identifier,
    // refuse the restore with a 409 so the admin can rename one side
    // explicitly rather than silently losing the original value.
    const tagMatch = user.empCode.match(/^(.*)__DEL_[A-Z0-9]+$/);
    const originalEmpCode = tagMatch ? tagMatch[1] : user.empCode;
    const originalEmail = user._softDeletedEmail || null;

    // Conflict check — use raw collection (not Mongoose) to bypass the
    // pre-find soft-delete filter; active replacements must be visible.
    if (tagMatch) {
      const empClash = await userRepo.findActiveUserByEmpCode(originalEmpCode);
      if (empClash) {
        return res.status(409).json({
          success: false,
          message: `Cannot restore: empCode "${originalEmpCode}" is now in use. Rename the active user first.`,
        });
      }
    }
    if (originalEmail) {
      const emailClash = await userRepo.findActiveUserByEmail(originalEmail);
      if (emailClash) {
        return res.status(409).json({
          success: false,
          message: `Cannot restore: email "${originalEmail}" is now in use. Rename the active user first.`,
        });
      }
    }

    await userRepo.restoreUserIdentity(req.params.id, {
      empCode: originalEmpCode,
      email: originalEmail,
    });

    invalidateUserCache(req.params.id);

    auditService.record({
      req,
      action: 'restored',
      entity: 'User',
      entityId: user._id,
      note: `Restored empCode=${originalEmpCode}` + (originalEmail ? ` + email` : ''),
    });

    invalidateAnalyticsCache();
    res.json({
      success: true,
      message: `User ${originalEmpCode} restored (status set to Inactive — admin can re-activate)`,
    });
  } catch (error) {
    handleError(res, error);
  }
};

module.exports = { deleteUser, restoreUser };
