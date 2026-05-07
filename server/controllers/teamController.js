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
 * @param {string} teamId — the team being modified
 * @param {string[]} addedIds — user IDs being added
 * @param {string[]} removedIds — user IDs being removed
 * @param {string|null} classId — the team's current classId
 */
const syncEnrollments = async (teamId, addedIds, removedIds, classId) => {
  const now = new Date();

  // ── Handle ADDED members ────────────────────────────────
  for (const userId of addedIds) {
    // Check if user has an Active enrollment in ANOTHER team
    const existingEnrollment = await Enrollment.findOne({
      userId,
      status: 'Active',
      teamId: { $ne: teamId },
    });

    if (existingEnrollment) {
      // Close old enrollment → Transferred
      existingEnrollment.status = 'Transferred';
      existingEnrollment.leftAt = now;
      existingEnrollment.transferredTo = teamId;
      await existingEnrollment.save();

      // Auto-remove from old team's members array
      await Team.findByIdAndUpdate(existingEnrollment.teamId, {
        $pull: { members: userId },
      });

      logger.info({ userId, fromTeamId: existingEnrollment.teamId, toTeamId: teamId }, 'Enrollment transferred');
    }

    // Check if user already has an Active enrollment in THIS team (avoid duplicates)
    const alreadyActive = await Enrollment.findOne({
      userId,
      teamId,
      status: 'Active',
    });

    if (!alreadyActive) {
      await Enrollment.create({
        userId,
        teamId,
        classId: classId || null,
        joinedAt: now,
        status: 'Active',
      });
      logger.info({ userId, teamId }, 'Enrollment created (Active)');
    }
  }

  // ── Handle REMOVED members ──────────────────────────────
  for (const userId of removedIds) {
    const activeEnrollment = await Enrollment.findOne({
      userId,
      teamId,
      status: 'Active',
    });

    if (activeEnrollment) {
      activeEnrollment.status = 'Dropped';
      activeEnrollment.leftAt = now;
      await activeEnrollment.save();
      logger.info({ userId, teamId }, 'Enrollment marked Dropped');
    }
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
    let team;
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        [team] = await Team.create(
          [{ name, classId: classId || null, leaderId, members: memberList }],
          { session }
        );

        // Sync enrollments inside the same transaction
        await syncEnrollments(team._id.toString(), memberList, [], classId || null);
      });
    } finally {
      session.endSession();
    }

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

    // ── TRANSACTION: Team update + Schedule sync (atomic) ───
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
            await syncEnrollments(req.params.id, addedIds, removedIds, effectiveClassId);
          }
        }
      });
    } finally {
      session.endSession();
    }

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
};
