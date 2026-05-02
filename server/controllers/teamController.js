const mongoose = require('mongoose');
const Team = require('../models/Team');
const Schedule = require('../models/Schedule');
const Attendance = require('../models/Attendance');
const Enrollment = require('../models/Enrollment');
const { handleError } = require('../helpers/handleError');

// ──────────────────────────────────────────────────────────
// Team Controller (Admin Only)
// ──────────────────────────────────────────────────────────
// ENROLLMENT INTEGRATION:
//   When members are added/removed, enrollment records are
//   automatically created/closed to maintain learning history.
//
// The DYNAMIC TEAM SYNC logic lives in the Team model
// middleware (models/Team.js). When updateTeam changes the
// members array via findOneAndUpdate, the post middleware
// auto-syncs all future schedules.
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

      console.log(`📋 Enrollment: ${userId} transferred from team ${existingEnrollment.teamId} → ${teamId}`);
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
      console.log(`📋 Enrollment: created Active record for ${userId} in team ${teamId}`);
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
      console.log(`📋 Enrollment: marked ${userId} as Dropped from team ${teamId}`);
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
          console.log(`🔄 Force-swap: unassigned class "${code}" from team "${conflict.name}"`);
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

    const team = await Team.create({ name, classId: classId || null, leaderId, members: memberList });

    // ── Enrollment: create records for all initial members ──
    // Fire and forget to avoid response bottleneck
    syncEnrollments(team._id.toString(), memberList, [], classId || null)
      .catch(err => console.error('Background syncEnrollments failed:', err));

    // Return populated
    const populated = await Team.findById(team._id)
      .populate('classId', 'classCode courseName status')
      .populate('leaderId', 'empCode name department status')
      .populate('members', 'empCode name department status');

    res.status(201).json({ success: true, data: populated });
  } catch (error) {
    handleError(res, error);
  }
};

/**
 * PUT /api/teams/:id
 *
 * IMPORTANT: Uses findOneAndUpdate which triggers the
 * Dynamic Team Sync middleware in Team.js
 */
const updateTeam = async (req, res) => {
  try {
    const { name, classId, leaderId, members, forceSwap } = req.body;

    // Fetch current team state BEFORE update for enrollment diff
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
            console.log(`🔄 Force-swap: unassigned class "${code}" from team "${conflict.name}"`);
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

    // ── Enrollment diff: compute added/removed BEFORE the update ──
    if (members !== undefined) {
      const oldMembers = currentTeam.members.map(id => id.toString());
      const newMembers = (updateData.members || members).map(id => id.toString());

      const addedIds = newMembers.filter(id => !oldMembers.includes(id));
      const removedIds = oldMembers.filter(id => !newMembers.includes(id));

      const effectiveClassId = updateData.classId !== undefined
        ? updateData.classId
        : currentTeam.classId?.toString() || null;

      if (addedIds.length > 0 || removedIds.length > 0) {
        // Fire and forget to avoid response bottleneck
        syncEnrollments(req.params.id, addedIds, removedIds, effectiveClassId)
          .catch(err => console.error('Background syncEnrollments failed:', err));
      }
    }

    const team = await Team.findOneAndUpdate(
      { _id: req.params.id },
      updateData,
      { new: true, runValidators: true }
    );

    // Return populated
    const populated = await Team.findById(team._id)
      .populate('classId', 'classCode courseName status')
      .populate('leaderId', 'empCode name department status')
      .populate('members', 'empCode name department status');

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
    const teams = await Team.find({ leaderId: req.user._id })
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
 * CASCADE: Schedules → Attendance → Team.
 * Enrollment records are preserved (status → Dropped).
 */
const deleteTeam = async (req, res) => {
  try {
    const team = await Team.findById(req.params.id);
    if (!team) {
      return res.status(404).json({ success: false, message: 'Team not found' });
    }

    // ── TRANSACTION: Cascade delete (all-or-nothing) ──────
    const session = await mongoose.startSession();
    let deletedAttendance = 0;
    let deletedSchedules = 0;

    try {
      await session.withTransaction(async () => {
        // Step 1: Close all active enrollments for this team
        await Enrollment.updateMany(
          { teamId: team._id, status: 'Active' },
          { $set: { status: 'Dropped', leftAt: new Date() } },
          { session }
        );

        // Step 2: Cascade delete — attendance → schedules
        const scheduleIds = await Schedule.find({ bookedTeamId: team._id })
          .select('_id').session(session).lean();
        const ids = scheduleIds.map(s => s._id);

        if (ids.length > 0) {
          const attResult = await Attendance.deleteMany({ scheduleId: { $in: ids } }, { session });
          deletedAttendance = attResult.deletedCount;
          const schResult = await Schedule.deleteMany({ _id: { $in: ids } }, { session });
          deletedSchedules = schResult.deletedCount;
        }

        // Step 3: Delete the team
        await Team.findByIdAndDelete(team._id, { session });
      });
    } finally {
      session.endSession();
    }

    res.json({
      success: true,
      message: `Team "${team.name}" deleted`,
      cascade: { deletedSchedules, deletedAttendance },
    });
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

module.exports = { getTeams, getTeamById, createTeam, updateTeam, deleteTeam, getMyTeams, getTeamProgress };
