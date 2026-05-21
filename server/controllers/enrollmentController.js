const mongoose = require('mongoose');
const Enrollment = require('../models/Enrollment');
const Attendance = require('../models/Attendance');
const Schedule = require('../models/Schedule');
const Team = require('../models/Team');
const { syncSchedulesForTeamUpdate } = require('../models/Team');
const { syncEnrollments, flushPendingEmails } = require('./teamController');
const { handleError } = require('../helpers/handleError');
const { invalidateAnalyticsCache } = require('../middleware/analyticsCache');
const logger = require('../lib/logger');
const auditService = require('../services/auditService');

// ──────────────────────────────────────────────────────────
// Enrollment Controller
// ──────────────────────────────────────────────────────────

/**
 * Enrich a list of (lean) enrollments with per-(user, class) attendance counts.
 * Mutates nothing; returns a new array of enrollments with `.attendance` attached.
 */
const enrichWithAttendance = async (enrollments) => {
  if (enrollments.length === 0) return enrollments;

  const classIds = [...new Set(enrollments.map(e => e.classId?._id?.toString()).filter(Boolean))];
  const userIds = enrollments.map(e => e.userId?._id?.toString()).filter(Boolean);

  const schedules = classIds.length
    ? await Schedule.find({ classId: { $in: classIds } }).select('_id classId').lean()
    : [];
  const scheduleIds = schedules.map(s => s._id);
  const attendanceRecords = scheduleIds.length
    ? await Attendance.find({ scheduleId: { $in: scheduleIds }, userId: { $in: userIds } })
        .select('scheduleId userId status').lean()
    : [];

  const scheduleMap = {};
  schedules.forEach(s => { scheduleMap[s._id.toString()] = s; });

  const attMap = {};
  attendanceRecords.forEach(a => {
    const sched = scheduleMap[a.scheduleId.toString()];
    if (!sched) return;
    const key = `${a.userId}|${sched.classId}`;
    if (!attMap[key]) attMap[key] = { P: 0, A: 0, L: 0, EL: 0, total: 0 };
    attMap[key][a.status] = (attMap[key][a.status] || 0) + 1;
    attMap[key].total += 1;
  });

  return enrollments.map(e => ({
    ...e,
    attendance: attMap[`${e.userId?._id}|${e.classId?._id}`] || { P: 0, A: 0, L: 0, EL: 0, total: 0 },
  }));
};

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
 * PUT /api/enrollments/:id
 * Update enrollment status/note (Admin manual override).
 * E.g. mark as Completed or Dropped.
 *
 * When status changes to Dropped: user is removed from Team.members and future
 * Schedule.enrolledUsers atomically (same transaction).
 * When status is re-set to Active from Dropped: user is re-added.
 */
const updateEnrollment = async (req, res) => {
  try {
    const { status, note } = req.body;

    // Load current enrollment first so we can diff the status and know userId/teamId.
    const currentEnrollment = await Enrollment.findById(req.params.id).lean();
    if (!currentEnrollment) {
      return res.status(404).json({ success: false, message: 'Enrollment not found' });
    }

    const update = {};
    if (status !== undefined) {
      update.status = status;
      if (status !== 'Active' && !req.body.leftAt) {
        update.leftAt = new Date();
      }
      if (status === 'Active') {
        update.leftAt = null;
      }
    }
    if (note !== undefined) update.note = note;

    const statusChanging = status !== undefined && status !== currentEnrollment.status;
    const isDropped = status === 'Dropped';
    const isReactivate = status === 'Active';

    if (statusChanging && (isDropped || isReactivate) && currentEnrollment.teamId) {
      const userId = currentEnrollment.userId.toString();
      const teamId = currentEnrollment.teamId.toString();

      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          await Enrollment.findByIdAndUpdate(req.params.id, update, { session });

          const team = await Team.findById(teamId).session(session).lean();
          if (team) {
            const oldMembers = (team.members || []).map(id => id.toString());

            if (isDropped && oldMembers.includes(userId)) {
              await Team.findByIdAndUpdate(
                teamId,
                { $pull: { members: currentEnrollment.userId } },
                { session }
              );
              const newMembers = oldMembers.filter(id => id !== userId);
              await syncSchedulesForTeamUpdate({ teamId, oldMembers, newMembers, session });
            } else if (isReactivate && !oldMembers.includes(userId)) {
              await Team.findByIdAndUpdate(
                teamId,
                { $addToSet: { members: currentEnrollment.userId } },
                { session }
              );
              const newMembers = [...oldMembers, userId];
              await syncSchedulesForTeamUpdate({ teamId, oldMembers, newMembers, session });
            }
          }
        });
      } finally {
        session.endSession();
      }
    } else {
      const existing = await Enrollment.findByIdAndUpdate(req.params.id, update);
      if (!existing) {
        return res.status(404).json({ success: false, message: 'Enrollment not found' });
      }
    }

    // Re-fetch with full population for response
    const enrollment = await Enrollment.findById(req.params.id)
      .populate('userId', 'empCode name department status')
      .populate('teamId', 'name')
      .populate('classId', 'classCode courseName totalSessions')
      .populate('transferredTo', 'name');

    if (!enrollment) {
      return res.status(404).json({ success: false, message: 'Enrollment not found' });
    }

    invalidateAnalyticsCache();
    res.json({ success: true, data: enrollment });
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

/**
 * POST /api/enrollments/:id/transfer
 * Atomically transfer a participant from one team to another.
 *
 * Body: { toTeamId: string, note?: string }
 *
 * Algorithm (inside a MongoDB transaction):
 *   1. Source enrollment → status='Transferred', transferredTo=toTeamId, leftAt=now
 *   2. Source team.members → $pull user
 *   3. Target team.members → $addToSet user
 *   4. Schedule.enrolledUsers → synced for BOTH teams (future sessions)
 *   5. New Enrollment created in target team (status='Active', classId from target team)
 *
 * Validations:
 *   - Source enrollment must exist and be Active
 *   - Target team must exist and not equal source team
 *   - User must not already be in target team's members
 */
const transferEnrollment = async (req, res) => {
  try {
    const { toTeamId, note } = req.body;
    if (!toTeamId) {
      return res.status(400).json({ success: false, message: 'toTeamId is required' });
    }

    // ── Pre-validation (read-only) ──────────────────────────
    const enrollment = await Enrollment.findById(req.params.id).lean();
    if (!enrollment) {
      return res.status(404).json({ success: false, message: 'Enrollment not found' });
    }
    if (enrollment.status !== 'Active') {
      return res.status(400).json({
        success: false,
        message: `Cannot transfer enrollment with status "${enrollment.status}". Only Active enrollments can be transferred.`,
      });
    }

    const fromTeamId = enrollment.teamId.toString();
    if (fromTeamId === toTeamId.toString()) {
      return res.status(400).json({ success: false, message: 'Source and target teams are the same' });
    }

    const [fromTeam, toTeam] = await Promise.all([
      Team.findById(fromTeamId).lean(),
      Team.findById(toTeamId).lean(),
    ]);
    if (!toTeam) {
      return res.status(404).json({ success: false, message: 'Target team not found' });
    }
    if (!fromTeam) {
      return res.status(404).json({ success: false, message: 'Source team not found' });
    }

    const userIdStr = enrollment.userId.toString();
    const alreadyInTarget = (toTeam.members || []).some(m => m.toString() === userIdStr);
    if (alreadyInTarget) {
      return res.status(409).json({
        success: false,
        message: `User is already a member of "${toTeam.name}".`,
      });
    }

    // ── TRANSACTION (target team + its schedules only) ──────
    // syncEnrollments (run outside the transaction) handles source-side
    // cleanup: it closes the old Active enrollment, sets transferredTo,
    // pulls the user from fromTeam.members, and creates the new Active
    // enrollment in toTeam. This mirrors how teamController.updateTeam
    // works (transactional team/schedule writes, post-commit enrollment sync)
    // — keeping behavior consistent and avoiding write conflicts on
    // fromTeam.members between the session and syncEnrollments.
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const toOld = (toTeam.members || []).map(id => id.toString());
        const toNew = [...toOld, userIdStr];

        // Step 1: Add user to target team
        await Team.findByIdAndUpdate(
          toTeamId,
          { $addToSet: { members: enrollment.userId } },
          { session },
        );

        // Step 2: Sync target team's future schedules (member added)
        await syncSchedulesForTeamUpdate({
          teamId: toTeamId, oldMembers: toOld, newMembers: toNew, session,
        });
      });
    } finally {
      session.endSession();
    }

    // ── POST-COMMIT enrollment sync ─────────────────────────
    // Closes source enrollment (Transferred + transferredTo + leftAt),
    // pulls user from fromTeam.members, creates new Active enrollment in toTeam.
    // Runs WITHOUT a session (post-commit, by design). Emails are queued
    // and flushed below (BUG #7 fix: same pattern as createTeam/updateTeam).
    const { pendingEmails } = await syncEnrollments(
      toTeamId,
      [userIdStr],
      [],
      toTeam.classId ? toTeam.classId.toString() : null,
    );
    flushPendingEmails(pendingEmails);

    // BUG #8 fix: previously only toTeam's future schedules were synced.
    // Without this, the user remained in fromTeam's future
    // Schedule.enrolledUsers — they could still be marked attendance for
    // a team they no longer belong to. Now sync fromTeam too, in its own
    // transaction (kept separate so a fromTeam-side failure doesn't undo
    // the already-committed target-side state).
    const fromOldMembers = (fromTeam.members || []).map((id) => id.toString());
    const fromNewMembers = fromOldMembers.filter((id) => id !== userIdStr);
    if (fromOldMembers.length !== fromNewMembers.length) {
      const fromSession = await mongoose.startSession();
      try {
        await fromSession.withTransaction(async () => {
          await syncSchedulesForTeamUpdate({
            teamId: fromTeamId,
            oldMembers: fromOldMembers,
            newMembers: fromNewMembers,
            session: fromSession,
          });
        });
      } catch (err) {
        // Source-side schedule sync failure is logged but does NOT fail the
        // transfer — the membership/enrollment changes are already committed.
        // A reconciliation pass can heal divergence later.
        logger.warn(
          { err, fromTeamId, toTeamId, userId: userIdStr },
          'Transfer source-team schedule sync failed (membership changes already committed)',
        );
      } finally {
        fromSession.endSession();
      }
    }

    // Attach optional transfer reason to the new Active enrollment
    if (note) {
      await Enrollment.findOneAndUpdate(
        { userId: enrollment.userId, teamId: toTeamId, status: 'Active' },
        { $set: { note } },
      );
    }

    logger.info({ enrollmentId: req.params.id, fromTeamId, toTeamId, userId: userIdStr }, 'Enrollment transferred');

    auditService.record({
      req,
      action: 'transferred',
      entity: 'Enrollment',
      entityId: req.params.id,
      diff: { teamId: { from: fromTeamId, to: toTeamId.toString() } },
    });

    invalidateAnalyticsCache();

    // Return the new Active enrollment (in target team)
    const newEnrollment = await Enrollment.findOne({
      userId: enrollment.userId,
      teamId: toTeamId,
      status: 'Active',
    })
      .populate('userId', 'empCode name department status')
      .populate('teamId', 'name')
      .populate('classId', 'classCode courseName totalSessions')
      .populate('transferredTo', 'name');

    res.json({ success: true, data: newEnrollment });
  } catch (error) {
    handleError(res, error);
  }
};

// ──────────────────────────────────────────────────────────
// PATCH /api/enrollments/bulk-status
// Bulk status change (Active / On-hold / Dropped) for N enrollments.
// Body: { enrollmentIds: [string], status: string, note?: string }
//
// When status → Dropped: users removed from Team.members and future
// Schedule.enrolledUsers (grouped by team, single transaction).
// When status → Active: users re-added to Team.members and schedules.
// ──────────────────────────────────────────────────────────
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

    const isDropped = status === 'Dropped';
    const isReactivate = status === 'Active';

    let modifiedCount = 0;

    if (isDropped || isReactivate) {
      // Load current enrollments to find which ones change status and which teams they belong to.
      const currentEnrollments = await Enrollment.find(
        { _id: { $in: enrollmentIds } }
      ).lean();

      // Only process enrollments that are actually changing status and have a team.
      const changing = currentEnrollments.filter(e => e.status !== status && e.teamId);

      // Group affected users by teamId for efficient team/schedule sync.
      const byTeam = new Map();
      for (const e of changing) {
        const teamId = e.teamId.toString();
        if (!byTeam.has(teamId)) byTeam.set(teamId, []);
        byTeam.get(teamId).push(e.userId.toString());
      }

      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          const result = await Enrollment.updateMany(
            { _id: { $in: enrollmentIds } },
            update,
            { session }
          );
          modifiedCount = result.modifiedCount;

          for (const [teamId, userIds] of byTeam) {
            const team = await Team.findById(teamId).session(session).lean();
            if (!team) continue;

            const oldMembers = (team.members || []).map(id => id.toString());
            let newMembers;

            if (isDropped) {
              const toDrop = userIds.filter(id => oldMembers.includes(id));
              if (toDrop.length === 0) continue;
              newMembers = oldMembers.filter(id => !toDrop.includes(id));
              await Team.updateOne(
                { _id: teamId },
                { $pull: { members: { $in: toDrop.map(id => new mongoose.Types.ObjectId(id)) } } },
                { session }
              );
            } else {
              const toAdd = userIds.filter(id => !oldMembers.includes(id));
              if (toAdd.length === 0) continue;
              newMembers = [...oldMembers, ...toAdd];
              await Team.updateOne(
                { _id: teamId },
                { $addToSet: { members: { $each: toAdd.map(id => new mongoose.Types.ObjectId(id)) } } },
                { session }
              );
            }

            await syncSchedulesForTeamUpdate({ teamId, oldMembers, newMembers, session });
          }
        });
      } finally {
        session.endSession();
      }
    } else {
      const result = await Enrollment.updateMany(
        { _id: { $in: enrollmentIds } },
        update,
      );
      modifiedCount = result.modifiedCount;
    }

    auditService.record({
      req, action: 'bulk-status-change', entity: 'Enrollment',
      entityId: null, diff: { enrollmentIds, status, modifiedCount },
    });
    invalidateAnalyticsCache();

    res.json({
      success: true,
      modifiedCount,
      message: `${modifiedCount} enrollment(s) updated to ${status}`,
    });
  } catch (error) {
    handleError(res, error);
  }
};

// ──────────────────────────────────────────────────────────
// POST /api/enrollments/bulk-transfer
// Sequentially transfers N enrollments to the same target team.
// Body: { enrollmentIds: [string], toTeamId: string, note?: string }
// Returns: { success: true, results: [{enrollmentId, status, message?}] }
//
// Uses the existing single-transfer logic per id (correct + auditable).
// Performance: O(N); acceptable for typical bulk size (1–20 students).
// ──────────────────────────────────────────────────────────
const bulkTransferEnrollment = async (req, res) => {
  try {
    const { enrollmentIds, toTeamId, note } = req.body;
    if (!Array.isArray(enrollmentIds) || enrollmentIds.length === 0) {
      return res.status(400).json({ success: false, message: 'enrollmentIds must be a non-empty array' });
    }
    if (!toTeamId) {
      return res.status(400).json({ success: false, message: 'toTeamId is required' });
    }

    const results = [];
    let ok = 0, failed = 0;
    for (const id of enrollmentIds) {
      // Reuse the single-transfer controller by shimming a minimal req/res.
      // It already handles validation, transactions, audit and cache invalidation.
      let captured = null;
      const shimRes = {
        status(code) { this._code = code; return this; },
        json(payload) { captured = { code: this._code || 200, payload }; },
      };
      const shimReq = {
        ...req,
        params: { id },
        body: { toTeamId, note },
      };
      try {
        await transferEnrollment(shimReq, shimRes);
        if (captured?.payload?.success) {
          results.push({ enrollmentId: id, status: 'ok' });
          ok += 1;
        } else {
          results.push({
            enrollmentId: id, status: 'error',
            message: captured?.payload?.message || 'Unknown error',
          });
          failed += 1;
        }
      } catch (err) {
        results.push({ enrollmentId: id, status: 'error', message: err.message });
        failed += 1;
      }
    }

    logger.info({ enrollmentIds, toTeamId, ok, failed }, 'Bulk transfer complete');
    invalidateAnalyticsCache();

    res.json({ success: true, results, ok, failed });
  } catch (error) {
    handleError(res, error);
  }
};

module.exports = {
  getEnrollments,
  getTeamEnrollments,
  getUserEnrollments,
  updateEnrollment,
  checkConflicts,
  transferEnrollment,
  bulkUpdateEnrollmentStatus,
  bulkTransferEnrollment,
};
