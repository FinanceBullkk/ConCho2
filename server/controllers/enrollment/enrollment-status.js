const mongoose = require('mongoose');
const Enrollment = require('../../models/Enrollment');
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

    // Wrap enrollment update + schedule pull in one transaction so a crash
    // between the two writes cannot leave a dropped user in future rosters (BUG #2 fix).
    let enrollment = null;
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        enrollment = await Enrollment.findByIdAndUpdate(
          req.params.id,
          update,
          { new: true, runValidators: true, session },
        );
        if (!enrollment) return; // handled below after commit

        if (status === 'Dropped') {
          const uid = enrollment.userId?._id ?? enrollment.userId;
          await pullDroppedUsersFromFutureSchedules([uid], session);
        }
      });
    } finally {
      session.endSession();
    }

    if (!enrollment) {
      return res.status(404).json({ success: false, message: 'Enrollment not found' });
    }

    // Populate post-commit (populate does not run inside transactions).
    await enrollment.populate('userId', 'empCode name department status');
    await enrollment.populate('teamId', 'name');
    await enrollment.populate('classId', 'classCode courseName totalSessions');
    await enrollment.populate('transferredTo', 'name');

    invalidateAnalyticsCache();
    res.json({ success: true, data: enrollment });
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
      const affected = await Enrollment.find(
        { _id: { $in: enrollmentIds } },
        { userId: 1 }
      ).lean();
      droppedUserIds = affected.map(e => e.userId);
    }

    // Wrap both writes in one transaction — prevents ghost attendance records
    // when server crashes between enrollment update and schedule pull (BUG #2 fix).
    let result;
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        result = await Enrollment.updateMany(
          { _id: { $in: enrollmentIds } },
          update,
          { session },
        );

        if (droppedUserIds.length > 0) {
          await pullDroppedUsersFromFutureSchedules(droppedUserIds, session);
        }
      });
    } finally {
      session.endSession();
    }

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
