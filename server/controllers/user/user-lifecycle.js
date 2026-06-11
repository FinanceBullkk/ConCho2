const mongoose = require('mongoose');
const User = require('../../models/User');
const Team = require('../../models/Team');
const Schedule = require('../../models/Schedule');
const Enrollment = require('../../models/Enrollment');
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
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Guard: Block if user is a team leader
    const ledTeams = await Team.find({ leaderId: user._id }).select('name').lean();
    if (ledTeams.length > 0) {
      const teamNames = ledTeams.map(t => t.name).join(', ');
      return res.status(409).json({
        success: false,
        message: `Cannot delete: user is leader of team(s): ${teamNames}. Reassign leader first.`,
      });
    }

    // ── TRANSACTION: Soft-delete cascade (UX-03) ──────────
    const session = await mongoose.startSession();
    let pulledFromTeams = 0;
    let pulledFromSchedules = 0;
    let closedEnrollments = 0;

    try {
      await session.withTransaction(async () => {
        // Step 1: Pull from Team.members
        const teamResult = await Team.updateMany(
          { members: user._id },
          { $pull: { members: user._id } },
          { session }
        );
        pulledFromTeams = teamResult.modifiedCount;

        // Step 2: Pull from future LIVE Schedule.enrolledUsers (cancelled
        // sessions keep their roster snapshot as history — phase-04 slice A)
        const now = new Date();
        const schedResult = await Schedule.updateMany(
          { startTime: { $gt: now }, enrolledUsers: user._id, status: 'scheduled' },
          { $pull: { enrolledUsers: user._id } },
          { session }
        );
        pulledFromSchedules = schedResult.modifiedCount;

        // Step 3: Close active enrollments
        const enrollResult = await Enrollment.updateMany(
          { userId: user._id, status: 'Active' },
          { $set: { status: 'Dropped', leftAt: new Date() } },
          { session }
        );
        closedEnrollments = enrollResult.modifiedCount;

        // Step 4: Soft-delete the user (bypass auto-filter via raw update)
        //
        // Audit PR Q (DATA-008): mutate empCode + park email so the
        // original identifier slots are freed up for reuse. The unique
        // constraint on empCode and the partial-unique on email both
        // stay in place; the suffix `__DEL_<ts36>` is reversible via the
        // restore handler. Done as a raw collection update so we bypass
        // the soft-delete auto-filter (which would otherwise hide the
        // row from the update query).
        const tagSuffix = `__DEL_${Date.now().toString(36).toUpperCase()}`;
        const releasedEmpCode = `${user.empCode}${tagSuffix}`;
        const releasedEmail = user.email || null;
        await User.collection.updateOne(
          { _id: user._id },
          {
            $set: {
              isDeleted: true,
              deletedAt: new Date(),
              status: 'Dropped',
              empCode: releasedEmpCode,
              email: null,
              _softDeletedEmail: releasedEmail,
            },
          },
          { session }
        );
      });
    } finally {
      session.endSession();
    }

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
    const user = await User.findOne({ _id: req.params.id, isDeleted: true })
      .select('+isDeleted +deletedAt +_softDeletedEmail')
      .lean();

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
      const empClash = await User.collection.findOne({
        empCode: originalEmpCode,
        isDeleted: { $ne: true },
      });
      if (empClash) {
        return res.status(409).json({
          success: false,
          message: `Cannot restore: empCode "${originalEmpCode}" is now in use. Rename the active user first.`,
        });
      }
    }
    if (originalEmail) {
      const emailClash = await User.collection.findOne({
        email: originalEmail,
        isDeleted: { $ne: true },
      });
      if (emailClash) {
        return res.status(409).json({
          success: false,
          message: `Cannot restore: email "${originalEmail}" is now in use. Rename the active user first.`,
        });
      }
    }

    await User.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(req.params.id) },
      {
        $set: {
          isDeleted: false,
          deletedAt: null,
          status: 'Inactive',
          empCode: originalEmpCode,
          email: originalEmail,
          _softDeletedEmail: null,
        },
      }
    );

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
