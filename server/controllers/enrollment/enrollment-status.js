// Dual-backend (Mongo ⇔ Postgres) — Phase 5 slice 4 (B2-tail): the status
// writes + the future-roster pull ride the repos on ONE unit-of-work tx.
const { runInTransaction } = require('../../domains/_shared/unit-of-work');
const enrollmentRepo = require('../../domains/learning/enrollment/repository');
const { handleError } = require('../../helpers/handleError');
const { invalidateAnalyticsCache } = require('../../middleware/analyticsCache');
const auditService = require('../../services/auditService');
const { pullDroppedUsersFromFutureSchedules } = require('./enrollment-shared');

// ──────────────────────────────────────────────────────────
// Enrollment Controller — status change handlers
// ──────────────────────────────────────────────────────────
// Split from the legacy enrollmentController (Phase 1 modular-monolith).
// Single + bulk status overrides. Each wraps the enrollment write and the
// future-schedule pull (on Dropped) in one transaction so a crash between
// the two cannot leave a dropped user in future rosters (BUG #2 fix).

/**
 * PUT /api/enrollments/:id
 * Update enrollment status/note (Admin manual override).
 * E.g. mark as Completed or Dropped.
 */
const updateEnrollment = async (req, res) => {
  try {
    const { status, note } = req.body;
    const update = {};
    if (status !== undefined) {
      update.status = status;
      // If marking as non-Active, set leftAt
      if (status !== 'Active' && !req.body.leftAt) {
        update.leftAt = new Date();
      }
      if (status === 'Active') {
        update.leftAt = null;
      }
    }
    if (note !== undefined) update.note = note;

    // Snapshot the pre-update state for the audit diff (golden rule: every
    // mutation is audited — this single-update path previously skipped audit
    // while its bulk twin recorded it).
    const before = await enrollmentRepo.findEnrollmentByIdLean(req.params.id);

    // Wrap enrollment update + schedule pull in one transaction so a crash
    // between the two writes cannot leave a dropped user in future rosters (BUG #2 fix).
    let enrollment = null;
    await runInTransaction(async (tx) => {
      enrollment = await enrollmentRepo.updateEnrollmentById(req.params.id, update, tx);
      if (!enrollment) return; // handled below after commit

      if (status === 'Dropped') {
        const uid = enrollment.userId?._id ?? enrollment.userId;
        await pullDroppedUsersFromFutureSchedules([uid], tx);
      }
    });

    if (!enrollment) {
      return res.status(404).json({ success: false, message: 'Enrollment not found' });
    }

    // Audit the admin override — mirrors the bulk twin (BUG: single path was
    // the one close-path that left no audit trail).
    auditService.record({
      req,
      action: 'updated',
      entity: 'Enrollment',
      entityId: enrollment._id,
      diff: auditService.diff(before, enrollment.toObject ? enrollment.toObject() : enrollment),
      note: 'Admin enrollment status/note override',
    });

    // Re-fetch populated post-commit (populate does not run inside
    // transactions; the dual read embeds on either backend).
    const populated = await enrollmentRepo.findEnrollmentByIdPopulated(req.params.id);

    invalidateAnalyticsCache();
    res.json({ success: true, data: populated });
  } catch (error) {
    handleError(res, error);
  }
};

/**
 * PATCH /api/enrollments/bulk-status
 * Bulk status change (Active / On-hold / Dropped) for N enrollments.
 * Body: { enrollmentIds: [string], status: string, note?: string }
 */
const bulkUpdateEnrollmentStatus = async (req, res) => {
  try {
    const { enrollmentIds, status, note } = req.body;
    if (!Array.isArray(enrollmentIds) || enrollmentIds.length === 0) {
      return res.status(400).json({ success: false, message: 'enrollmentIds must be a non-empty array' });
    }
    const ALLOWED = ['Active', 'On-hold', 'Dropped'];
    if (!ALLOWED.includes(status)) {
      return res.status(400).json({ success: false, message: `status must be one of ${ALLOWED.join(', ')}` });
    }

    const update = { status };
    if (status === 'Active') update.leftAt = null;
    else                     update.leftAt = new Date();
    if (note !== undefined) update.note = note;

    // P2-03: When Dropped, remove users from future schedule.enrolledUsers.
    // On-hold is reversible — keep in schedules. Team.members is untouched
    // (team is a booking unit, separate from enrollment status).
    let droppedUserIds = [];
    if (status === 'Dropped') {
      const affected = await enrollmentRepo.findEnrollmentUserIdsByIds(enrollmentIds);
      droppedUserIds = affected.map(e => e.userId);
    }

    // Wrap both writes in one transaction — prevents ghost attendance records
    // when server crashes between enrollment update and schedule pull (BUG #2 fix).
    let result;
    await runInTransaction(async (tx) => {
      result = await enrollmentRepo.bulkUpdateEnrollmentsByIds(enrollmentIds, update, tx);

      if (droppedUserIds.length > 0) {
        await pullDroppedUsersFromFutureSchedules(droppedUserIds, tx);
      }
    });

    auditService.record({
      req, action: 'bulk-status-change', entity: 'Enrollment',
      entityId: null, diff: { enrollmentIds, status, modifiedCount: result.modifiedCount },
    });
    invalidateAnalyticsCache();

    res.json({
      success: true,
      modifiedCount: result.modifiedCount,
      message: `${result.modifiedCount} enrollment(s) updated to ${status}`,
    });
  } catch (error) {
    handleError(res, error);
  }
};

module.exports = { updateEnrollment, bulkUpdateEnrollmentStatus };
