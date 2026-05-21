const mongoose = require('mongoose');
const Team = require('../models/Team');
const { syncSchedulesForTeamUpdate } = require('../models/Team');
const Schedule = require('../models/Schedule');
const Attendance = require('../models/Attendance');
const Enrollment = require('../models/Enrollment');
const { handleError } = require('../helpers/handleError');
const auditService = require('../services/auditService');
const { invalidateAnalyticsCache } = require('../middleware/analyticsCache');
const logger = require('../lib/logger');
const calendarService = require('../services/calendarService');
const { todayVN } = require('../helpers/dayjsConfig');
const User = require('../models/User');
const {
  sendEnrollmentDropped,
  sendEnrollmentTransferred,
} = require('../lib/emailTemplates');

// ──────────────────────────────────────────────────────────
// Team Controller (Admin Only)
// ──────────────────────────────────────────────────────────
// ENROLLMENT INTEGRATION:
//   When members are added/removed, enrollment records are
//   automatically created/closed to maintain learning history.
//
// SCHEDULE SYNC (transactional):
//   When updateTeam changes the members array, the sync logic
//   runs INSIDE the same MongoDB transaction — ensuring Team
//   and Schedule are always consistent (no fire-and-forget).
// ──────────────────────────────────────────────────────────

// Helper to check if any user is already in another team
const checkMemberConflicts = async (memberIds, excludeTeamId = null) => {
  if (!memberIds || memberIds.length === 0) return null;
  
  const query = { members: { $in: memberIds } };
  if (excludeTeamId) query._id = { $ne: excludeTeamId };
  
  const conflictingTeams = await Team.find(query)
    .populate('members', 'name empCode')
    .lean();
    
  if (conflictingTeams.length > 0) {
    const details = [];
    conflictingTeams.forEach(t => {
      const overlap = t.members.filter(m => memberIds.includes(m._id.toString()));
      if (overlap.length > 0) {
        const names = overlap.map(m => `${m.name} (${m.empCode})`).join(', ');
        details.push(`${names} đang ở nhóm "${t.name}"`);
      }
    });
    return details.join('; ');
  }
  return null;
};

/**
 * Handle enrollment records when members change.
 * Called by both createTeam and updateTeam.
 *
 * BUG #7 fix: now accepts an optional MongoDB `session` parameter and
 * threads it through every DB op. Callers that wrap the call inside
 * `session.withTransaction(...)` should pass the session so the
 * enrollment writes commit (or roll back) together with the outer
 * team/schedule writes.
 *
 * Email side-effects are returned as a list of "pending notification"
 * thunks rather than fired in-flight, so the caller can flush them
 * AFTER the transaction commits. This prevents misleading emails when
 * the outer transaction rolls back.
 *
 * @param {string} teamId — the team being modified
 * @param {string[]} addedIds — user IDs being added
 * @param {string[]} removedIds — user IDs being removed
 * @param {string|null} classId — the team's current classId
 * @param {Object}  [opts]
 * @param {mongoose.ClientSession} [opts.session]
 * @returns {Promise<{ pendingEmails: Array<() => void> }>}
 */
const syncEnrollments = async (teamId, addedIds, removedIds, classId, opts = {}) => {
  const { session = null } = opts;
  const now = new Date();
  const pendingEmails = [];

  // Resolve target team once (used for email context). Read in-session so
  // it sees any team writes made earlier in the same transaction.
  const targetTeam = await Team.findById(teamId)
    .populate('classId', 'classCode courseName')
    .session(session || null)
    .lean();

  // ── Handle ADDED members ────────────────────────────────
  for (const userId of addedIds) {
    // Check if user has an Active enrollment in ANOTHER team
    const existingEnrollment = await Enrollment.findOne({
      userId,
      status: 'Active',
      teamId: { $ne: teamId },
    })
      .populate('teamId', 'name')
      .session(session || null);

    if (existingEnrollment) {
      const fromTeamName = existingEnrollment.teamId?.name || 'previous team';

      // Close old enrollment → Transferred
      existingEnrollment.status = 'Transferred';
      existingEnrollment.leftAt = now;
      existingEnrollment.transferredTo = teamId;
      const carriedNote = existingEnrollment.note;
      await existingEnrollment.save({ session: session || undefined });

      // Auto-remove from old team's members array
      await Team.findByIdAndUpdate(
        existingEnrollment.teamId,
        { $pull: { members: userId } },
        { session: session || undefined },
      );

      logger.info({ userId, fromTeamId: existingEnrollment.teamId, toTeamId: teamId }, 'Enrollment transferred');

      // Queue email send for post-commit flush.
      pendingEmails.push(async () => {
        const u = await User.findById(userId).select('name email').lean();
        if (u && u.email) {
          sendEnrollmentTransferred({
            to: u.email,
            userName: u.name,
            fromTeamName,
            toTeamName: targetTeam?.name || 'new team',
            toCourseName: targetTeam?.classId?.courseName || '',
            note: carriedNote || '',
          });
        }
      });
    }

    // Check if user already has an Active enrollment in THIS team (avoid duplicates)
    const alreadyActive = await Enrollment.findOne({
      userId,
      teamId,
      status: 'Active',
    }).session(session || null);

    if (!alreadyActive) {
      await Enrollment.create(
        [{
          userId,
          teamId,
          classId: classId || null,
          joinedAt: now,
          status: 'Active',
        }],
        { session: session || undefined },
      );
      logger.info({ userId, teamId }, 'Enrollment created (Active)');
    }
  }

  // ── Handle REMOVED members ──────────────────────────────
  for (const userId of removedIds) {
    const activeEnrollment = await Enrollment.findOne({
      userId,
      teamId,
      status: 'Active',
    }).session(session || null);

    if (activeEnrollment) {
      activeEnrollment.status = 'Dropped';
      activeEnrollment.leftAt = now;
      await activeEnrollment.save({ session: session || undefined });
      logger.info({ userId, teamId }, 'Enrollment marked Dropped');

      // Queue email for post-commit flush.
      pendingEmails.push(async () => {
        const u = await User.findById(userId).select('name email').lean();
        if (u && u.email) {
          sendEnrollmentDropped({
            to: u.email,
            userName: u.name,
            teamName: targetTeam?.name || 'team',
            courseName: targetTeam?.classId?.courseName || '',
          });
        }
      });
    }
  }

  return { pendingEmails };
};

/**
 * Helper to fire-and-forget all queued email senders after a transaction
 * commits. Each thunk is async; any rejection is swallowed and logged so
 * the parent flow never fails on email delivery.
 */
const flushPendingEmails = (pendingEmails) => {
  if (!Array.isArray(pendingEmails)) return;
  for (const send of pendingEmails) {
    Promise.resolve()
      .then(() => send())
      .catch((err) => logger.warn({ err }, 'Pending email flush failed'));
  }
};

/**
 * GET /api/teams
 */
const getTeams = async (req, res) => {
  try {
    const teams = await Team.find()
      .populate('classId', 'classCode courseName status')
      .populate('leaderId', 'empCode name department status')
      .populate('members', 'empCode name department status')
      .sort({ name: 1 });

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
    const team = await Team.findById(req.params.id)
      .populate('classId', 'classCode courseName status')
      .populate('leaderId', 'empCode name department status')
      .populate('members', 'empCode name department status');

    if (!team) {
      return res.status(404).json({ success: false, message: 'Team not found' });
    }
    res.json({ success: true, data: team });
  } catch (error) {
    handleError(res, error);
  }
};

/**
 * POST /api/teams
 */
const createTeam = async (req, res) => {
  try {
    const { name, classId, leaderId, members, forceSwap } = req.body;

    // Guard: check if classId is already assigned to another team
    if (classId) {
      const conflict = await Team.findOne({ classId }).populate('classId', 'classCode').lean();
      if (conflict) {
        const code = conflict.classId?.classCode || classId;
        if (forceSwap) {
          await Team.findByIdAndUpdate(conflict._id, { $set: { classId: null } });
          logger.info({ classCode: code, fromTeam: conflict.name }, 'Force-swap: class unassigned');
        } else {
          return res.status(409).json({
            success: false,
            message: `Class "${code}" is already assigned to team "${conflict.name}".`,
            conflictTeamId: conflict._id,
            conflictTeamName: conflict.name,
          });
        }
      }
    }

    // Ensure leader is included in members
    let memberList = members || [];
    if (leaderId && !memberList.includes(leaderId)) {
      memberList = [leaderId, ...memberList];
    }

    // Guard: check if any members are already in another team
    const memberConflictStr = await checkMemberConflicts(memberList);
    if (memberConflictStr) {
      return res.status(409).json({
        success: false,
        message: `Không thể tạo nhóm: ${memberConflictStr}. Vui lòng gỡ họ khỏi nhóm cũ trước.`,
      });
    }

    // ── TRANSACTION: Team creation + Enrollment sync (SYNC-01) ──
    // BUG #7 fix: syncEnrollments now runs in-session and returns pending
    // email notifications to flush after commit.
    let team;
    let pendingEmails = [];
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        [team] = await Team.create(
          [{ name, classId: classId || null, leaderId, members: memberList }],
          { session }
        );

        const result = await syncEnrollments(
          team._id.toString(), memberList, [], classId || null,
          { session },
        );
        pendingEmails = result.pendingEmails;
      });
    } finally {
      session.endSession();
    }
    flushPendingEmails(pendingEmails);

    // Return populated (read-only, outside transaction)
    const populated = await Team.findById(team._id)
      .populate('classId', 'classCode courseName status')
      .populate('leaderId', 'empCode name department status')
      .populate('members', 'empCode name department status');

    auditService.record({
      req,
      action: 'created',
      entity: 'Team',
      entityId: team._id,
      diff: { after: { name: team.name, classId: team.classId, leaderId: team.leaderId, memberCount: memberList.length } },
    });

    invalidateAnalyticsCache();
    res.status(201).json({ success: true, data: populated });
  } catch (error) {
    handleError(res, error);
  }
};

/**
 * PUT /api/teams/:id
 *
 * TRANSACTIONAL: Team update + Schedule sync + Enrollment sync
 * are wrapped in a single MongoDB transaction. If the process
 * crashes mid-way, the entire operation rolls back — no stale
 * Schedule.enrolledUsers left behind.
 */
const updateTeam = async (req, res) => {
  try {
    const { name, classId, leaderId, members, forceSwap } = req.body;

    // ── Pre-validation (read-only, outside transaction) ─────
    const currentTeam = await Team.findById(req.params.id).lean();
    if (!currentTeam) {
      return res.status(404).json({ success: false, message: 'Team not found' });
    }

    const updateData = {};

    if (name !== undefined) updateData.name = name;

    // classId handling: null = unassign, string = assign
    if (classId !== undefined) {
      if (classId === null || classId === '') {
        updateData.classId = null;
      } else {
        // Guard: check if classId is already assigned to ANOTHER team
        const conflict = await Team.findOne({ classId, _id: { $ne: req.params.id } })
          .populate('classId', 'classCode').lean();
        if (conflict) {
          const code = conflict.classId?.classCode || classId;
          if (forceSwap) {
            await Team.findByIdAndUpdate(conflict._id, { $set: { classId: null } });
            logger.info({ classCode: code, fromTeam: conflict.name }, 'Force-swap: class unassigned');
          } else {
            return res.status(409).json({
              success: false,
              message: `Class "${code}" is already assigned to team "${conflict.name}".`,
              conflictTeamId: conflict._id,
              conflictTeamName: conflict.name,
            });
          }
        }
        updateData.classId = classId;
      }
    }

    if (leaderId !== undefined) updateData.leaderId = leaderId;
    if (members !== undefined) {
      // Ensure leader is in members if both provided
      const effectiveLeader = leaderId || currentTeam.leaderId?.toString();
      if (effectiveLeader && !members.includes(effectiveLeader)) {
        updateData.members = [effectiveLeader, ...members];
      } else {
        updateData.members = members;
      }
      
      // Guard: check if any members are already in another team
      const memberConflictStr = await checkMemberConflicts(updateData.members, currentTeam._id);
      if (memberConflictStr) {
        return res.status(409).json({
          success: false,
          message: `Không thể cập nhật: ${memberConflictStr}. Vui lòng gỡ họ khỏi nhóm cũ trước.`,
        });
      }
    }

    // ── Compute member diff BEFORE transaction ──────────────
    const oldMemberStrs = currentTeam.members.map(id => id.toString());
    const newMemberStrs = updateData.members
      ? updateData.members.map(id => id.toString())
      : oldMemberStrs;
    const membersChanged = members !== undefined
      && (oldMemberStrs.length !== newMemberStrs.length
          || oldMemberStrs.some(id => !newMemberStrs.includes(id)));

    // ── TRANSACTION: Team update + Schedule sync + Enrollment sync (atomic) ──
    // BUG #7 fix: previously syncEnrollments ran without the session,
    // committing enrollment writes outside the outer transaction. If the
    // outer transaction rolled back (e.g. a later step failed), the team
    // would revert but enrollments would be left in the new state.
    // Emails are now queued and flushed AFTER the commit so a rollback
    // doesn't generate misleading notifications.
    let pendingEmails = [];
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        // Step 1: Update Team document
        await Team.findOneAndUpdate(
          { _id: req.params.id },
          updateData,
          { new: true, runValidators: true, session }
        );

        // Step 2: Sync Schedule.enrolledUsers (if members changed)
        if (membersChanged) {
          await syncSchedulesForTeamUpdate({
            teamId: req.params.id,
            oldMembers: oldMemberStrs,
            newMembers: newMemberStrs,
            session,
          });
        }

        // Step 3: Sync Enrollment records (if members changed)
        if (membersChanged) {
          const addedIds = newMemberStrs.filter(id => !oldMemberStrs.includes(id));
          const removedIds = oldMemberStrs.filter(id => !newMemberStrs.includes(id));

          const effectiveClassId = updateData.classId !== undefined
            ? updateData.classId
            : currentTeam.classId?.toString() || null;

          if (addedIds.length > 0 || removedIds.length > 0) {
            const { pendingEmails: emails } = await syncEnrollments(
              req.params.id, addedIds, removedIds, effectiveClassId,
              { session },
            );
            pendingEmails = emails;
          }
        }
      });
    } finally {
      session.endSession();
    }

    // Flush queued notification emails now that the transaction has committed.
    flushPendingEmails(pendingEmails);

    // Return populated (outside transaction — read-only)
    const populated = await Team.findById(req.params.id)
      .populate('classId', 'classCode courseName status')
      .populate('leaderId', 'empCode name department status')
      .populate('members', 'empCode name department status');

    auditService.record({
      req,
      action: 'updated',
      entity: 'Team',
      entityId: req.params.id,
      diff: auditService.diff(
        { name: currentTeam.name, classId: currentTeam.classId, leaderId: currentTeam.leaderId, members: oldMemberStrs },
        { name: populated.name, classId: populated.classId?._id, leaderId: populated.leaderId?._id, members: newMemberStrs }
      ),
    });

    invalidateAnalyticsCache();
    res.json({ success: true, data: populated });
  } catch (error) {
    handleError(res, error);
  }
};


/**
 * GET /api/teams/my-teams
 */
const getMyTeams = async (req, res) => {
  try {
    const teams = await Team.find({
      $or: [
        { leaderId: req.user._id },
        { members: req.user._id },
      ],
    })
      .populate('classId', 'classCode courseName')
      .populate('leaderId', 'empCode name department status')
      .populate('members', 'empCode name department status')
      .sort({ name: 1 });

    res.json({ success: true, count: teams.length, data: teams });
  } catch (error) {
    handleError(res, error);
  }
};

/**
 * DELETE /api/teams/:id
 * SOFT DELETE — marks team as deleted but preserves all data.
 *
 * Side-effects (reversible via restore):
 *   1. Close active Enrollment records (status → 'Dropped')
 *   2. Cancel future Schedules (delete + cascade Attendance)
 *   3. Mark team as soft-deleted (isDeleted=true, deletedAt=now)
 *
 * Past schedules and their Attendance PRESERVED for audit trail.
 * Calendar events for future schedules deleted best-effort after commit.
 */
const deleteTeam = async (req, res) => {
  try {
    const team = await Team.findById(req.params.id);
    if (!team) {
      return res.status(404).json({ success: false, message: 'Team not found' });
    }

    // Snapshot future schedules before transaction to collect calendar event IDs.
    const todayBoundary = todayVN();
    const futureSchedules = await Schedule.find(
      { bookedTeamId: team._id, startTime: { $gte: todayBoundary } },
      { _id: 1, googleEventId: 1 }
    ).lean();
    const futureScheduleIds = futureSchedules.map(s => s._id);
    const calendarEventIds = futureSchedules
      .filter(s => s.googleEventId)
      .map(s => s.googleEventId);

    // ── TRANSACTION: Soft-delete (UX-03) ──────────────────
    const session = await mongoose.startSession();
    let closedEnrollments = 0;
    let cancelledSchedules = 0;

    try {
      await session.withTransaction(async () => {
        // Step 1: Close all active enrollments for this team
        const enrollResult = await Enrollment.updateMany(
          { teamId: team._id, status: 'Active' },
          { $set: { status: 'Dropped', leftAt: new Date() } },
          { session }
        );
        closedEnrollments = enrollResult.modifiedCount;

        // Step 2: Delete future schedules and their attendance.
        // Past schedules kept intact for historical reporting.
        if (futureScheduleIds.length > 0) {
          await Attendance.deleteMany(
            { scheduleId: { $in: futureScheduleIds } },
            { session }
          );
          const schedResult = await Schedule.deleteMany(
            { _id: { $in: futureScheduleIds } },
            { session }
          );
          cancelledSchedules = schedResult.deletedCount;
        }

        // Step 3: Soft-delete the team (bypass auto-filter via raw update)
        await Team.collection.updateOne(
          { _id: team._id },
          { $set: { isDeleted: true, deletedAt: new Date() } },
          { session }
        );
      });
    } finally {
      session.endSession();
    }

    // Best-effort: remove calendar events after commit so attendees are notified.
    for (const eventId of calendarEventIds) {
      try {
        if (calendarService.isConfigured()) {
          await calendarService.deleteEventForSchedule(eventId);
        }
      } catch (err) {
        logger.warn({ err, eventId }, 'Failed to delete calendar event after team deletion');
      }
    }

    auditService.record({
      req,
      action: 'soft-deleted',
      entity: 'Team',
      entityId: team._id,
      note: `Closed ${closedEnrollments} enrollments, cancelled ${cancelledSchedules} future schedules`,
    });

    invalidateAnalyticsCache();
    res.json({
      success: true,
      message: `Team "${team.name}" soft-deleted (can be restored)`,
      cascade: { closedEnrollments, cancelledSchedules },
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

/**
 * GET /api/teams/deleted
 * List all soft-deleted teams (Admin trash view).
 */
const getDeletedTeams = async (req, res) => {
  try {
    const teams = await Team.find({ isDeleted: true })
      .populate('classId', 'classCode courseName')
      .populate('leaderId', 'empCode name')
      .sort({ deletedAt: -1 })
      .lean();

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
    const team = await Team.findById(teamId)
      .populate('members', 'empCode name department status')
      .populate('classId', 'classCode courseName')
      .lean();
      
    if (!team) return res.status(404).json({ success: false, message: 'Team not found' });

    const schedules = await Schedule.find({ bookedTeamId: teamId })
      .sort({ startTime: 1 })
      .lean();

    const scheduleIds = schedules.map(s => s._id);
    const attendances = await Attendance.find({ scheduleId: { $in: scheduleIds } }).lean();

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

module.exports = {
  getTeams, getTeamById, createTeam, updateTeam, deleteTeam,
  restoreTeam, getDeletedTeams, getMyTeams, getTeamProgress,
  // Internal helpers exported for cross-controller use (enrollment transfers)
  syncEnrollments,
  flushPendingEmails,
};
