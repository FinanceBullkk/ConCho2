const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Team = require('../models/Team');
const Schedule = require('../models/Schedule');
const Attendance = require('../models/Attendance');
const Enrollment = require('../models/Enrollment');
const Evaluation = require('../models/Evaluation');
const { parsePagination, paginatedResponse } = require('../helpers/pagination');
const { escapeRegex } = require('../helpers/escapeRegex');
const { invalidateUserCache } = require('../middleware/auth');
const { handleError } = require('../helpers/handleError');
const auditService = require('../services/auditService');
const { invalidateAnalyticsCache } = require('../middleware/analyticsCache');

// ──────────────────────────────────────────────────────────
// User Controller (Admin Only)
// ──────────────────────────────────────────────────────────
// The AUTO-RELEASE logic lives in the User model middleware
// (models/User.js). When updateUser changes status to
// 'Dropped' via findOneAndUpdate, the post middleware
// automatically pulls the user from future schedules.
//
// empCode generation uses the atomic Counter helper
// (helpers/counter.js) to avoid race conditions.
// ──────────────────────────────────────────────────────────

/**
 * GET /api/users
 * Filters: ?role=Teacher&status=Active&department=Sales
 * Pagination: ?page=1&limit=50
 */
const getUsers = async (req, res) => {
  try {
    const filter = {};
    if (req.query.role) filter.role = req.query.role;
    if (req.query.status) filter.status = req.query.status;
    if (req.query.department) filter.department = { $regex: escapeRegex(req.query.department), $options: 'i' };

    // Text search across empCode, name, department, position
    if (req.query.search) {
      const s = escapeRegex(req.query.search);
      filter.$or = [
        { empCode: { $regex: s, $options: 'i' } },
        { name: { $regex: s, $options: 'i' } },
        { department: { $regex: s, $options: 'i' } },
        { position: { $regex: s, $options: 'i' } },
      ];
    }

    const { page, limit, skip } = parsePagination(req);

    // Sortable columns whitelist
    const SORTABLE = ['empCode', 'name', 'department', 'position', 'status', 'role', 'entranceLevel', 'currentLevel'];
    const sortBy = SORTABLE.includes(req.query.sortBy) ? req.query.sortBy : 'empCode';
    const sortOrder = req.query.sortOrder === 'desc' ? -1 : 1;

    const [users, total] = await Promise.all([
      User.find(filter).sort({ [sortBy]: sortOrder }).skip(skip).limit(limit),
      User.countDocuments(filter),
    ]);

    // PERF-008 (audit PR H): lastActiveAt is now denormalised onto the
    // User document by attendanceService.bulkMark (write-through cache).
    // No more per-page Attendance×Schedule aggregation. For users who
    // existed BEFORE the cache was wired (lastActiveAt === null) the
    // value will populate on the next bulkMark; if you need a fresh
    // snapshot today, run `node server/scripts/backfill-lastActiveAt.js`.
    const enrichedUsers = users.map((u) => {
      const obj = u.toObject();
      const lastDate = u.lastActiveAt || null;
      obj.lastActive = lastDate;
      obj.daysSince = lastDate
        ? Math.floor((Date.now() - new Date(lastDate).getTime()) / (1000 * 60 * 60 * 24))
        : null;
      return obj;
    });

    res.json(paginatedResponse({ data: enrichedUsers, total, page, limit }));
  } catch (error) {
    handleError(res, error);
  }
};

/**
 * GET /api/users/:id
 * Get single user by ID
 */
const getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    res.json({ success: true, data: user });
  } catch (error) {
    handleError(res, error);
  }
};

/**
 * POST /api/users
 * Create a new user.
 *
 * empCode and email are admin-provided (Zod schema enforces both as
 * required). No auto-generation — the admin owns the numbering scheme
 * and email assignments do not follow a pattern.
 */
const createUser = async (req, res) => {
  try {
    // BUG #13 fix: entranceLevel and currentLevel are part of the Zod
    // schema and the User model, but were previously dropped here —
    // admins setting these on create got a 201 with the fields silently
    // ignored.
    const {
      empCode, name, email, role, department, position, status, dropReason,
      entranceLevel, currentLevel, password,
    } = req.body;

    if (!password) {
      return res.status(400).json({ success: false, message: 'password is required' });
    }

    const user = await User.create({
      empCode,
      name,
      email,
      role,
      department,
      position,
      status,
      dropReason,
      entranceLevel,
      currentLevel,
      password,
    });

    // Return without password
    const userObj = user.toObject();
    delete userObj.password;

    auditService.record({
      req,
      action: 'created',
      entity: 'User',
      entityId: user._id,
      diff: { after: auditService.stripSensitive(userObj) },
    });

    invalidateAnalyticsCache();
    res.status(201).json({ success: true, data: userObj });
  } catch (error) {
    handleError(res, error);
  }
};

/**
 * PUT /api/users/:id
 * Update a user
 *
 * IMPORTANT: Uses findOneAndUpdate which triggers the
 * Auto-Release middleware in User.js when status → 'Dropped'
 */
const updateUser = async (req, res) => {
  try {
    // BUG #13 fix: include entranceLevel + currentLevel — previously
    // updates to these fields via API were silent no-ops.
    const {
      empCode, name, email, role, department, position, status, dropReason,
      entranceLevel, currentLevel,
    } = req.body;
    const updateData = {};

    if (empCode !== undefined) updateData.empCode = empCode;
    if (name !== undefined) updateData.name = name;
    if (email !== undefined) updateData.email = email;
    if (role !== undefined) updateData.role = role;
    if (department !== undefined) updateData.department = department;
    if (position !== undefined) updateData.position = position;
    if (status !== undefined) updateData.status = status;
    if (dropReason !== undefined) updateData.dropReason = dropReason;
    if (entranceLevel !== undefined) updateData.entranceLevel = entranceLevel;
    if (currentLevel !== undefined) updateData.currentLevel = currentLevel;

    // Snapshot before-state for audit diff (lean to keep it cheap).
    const before = await User.findById(req.params.id).lean();
    if (!before) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // ── BUG #9 fix: Re-auth gate on sensitive privilege changes ──
    // Previously any Admin could reset another user's password or change
    // anyone's role without re-authenticating, so a single compromised
    // admin session = full org takeover. Now: when the target user is
    // SOMEONE ELSE and the request mutates `password` or `role`, the
    // acting admin must re-prove their identity by supplying their own
    // `currentPassword` in the request body.
    const isSelf = before._id.toString() === req.user._id.toString();
    const sensitiveChange =
      !!req.body.password ||
      (role !== undefined && role !== before.role);

    if (!isSelf && sensitiveChange) {
      if (!req.body.currentPassword) {
        return res.status(403).json({
          success: false,
          message: 'currentPassword is required to change password or role for another user',
          requiresReauth: true,
        });
      }
      // Verify the acting admin's password. Use `+password` because the
      // User schema hides password by default.
      const acting = await User.findById(req.user._id).select('+password');
      if (!acting) {
        return res.status(401).json({ success: false, message: 'Session user not found' });
      }
      const ok = await bcrypt.compare(req.body.currentPassword, acting.password || '');
      if (!ok) {
        // Note: audit log captures the failed re-auth attempt.
        auditService.record({
          req,
          action: 'reauth-failed',
          entity: 'User',
          entityId: before._id,
          note: 'currentPassword verification failed for privilege change',
        });
        return res.status(403).json({
          success: false,
          message: 'currentPassword does not match',
          requiresReauth: true,
        });
      }
    }

    // If password is being changed, hash it manually
    // (pre-save hooks don't run on findOneAndUpdate)
    if (req.body.password) {
      const salt = await bcrypt.genSalt(12);
      updateData.password = await bcrypt.hash(req.body.password, salt);
      updateData.passwordChangedAt = new Date();
    }

    const user = await User.findOneAndUpdate(
      { _id: req.params.id },
      updateData,
      { new: true, runValidators: true, select: '-password' }
    );

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Invalidate auth cache so status changes take effect immediately
    invalidateUserCache(user._id);

    auditService.record({
      req,
      action: 'updated',
      entity: 'User',
      entityId: user._id,
      diff: auditService.diff(before, user.toObject()),
    });

    invalidateAnalyticsCache();
    res.json({ success: true, data: user });
  } catch (error) {
    handleError(res, error);
  }
};

/**
 * DELETE /api/users/:id
 * Delete a user — GUARD + CASCADE.
 *
 * Guards:
 *   - BLOCKS deletion if user is a Team Leader (must reassign first)
 *
 * Cascade:
 *   1. Pull user from all Teams' members arrays
 *   2. Pull user from all Schedules' enrolledUsers + decrement enrolledCount
 *   3. Delete all Attendance records for this user
 *   4. Delete the user
/**
 * DELETE /api/users/:id
 * SOFT DELETE — marks user as deleted but preserves all data.
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

        // Step 2: Pull from future Schedule.enrolledUsers
        const schedResult = await Schedule.updateMany(
          { enrolledUsers: user._id },
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
        await User.collection.updateOne(
          { _id: user._id },
          { $set: { isDeleted: true, deletedAt: new Date(), status: 'Dropped' } },
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
      .select('+isDeleted +deletedAt')
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Deleted user not found. Either the ID is invalid or the user was not soft-deleted.',
      });
    }

    await User.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(req.params.id) },
      { $set: { isDeleted: false, deletedAt: null, status: 'Inactive' } }
    );

    invalidateUserCache(req.params.id);

    auditService.record({
      req,
      action: 'restored',
      entity: 'User',
      entityId: user._id,
    });

    invalidateAnalyticsCache();
    res.json({
      success: true,
      message: `User ${user.empCode} restored (status set to Inactive — admin can re-activate)`,
    });
  } catch (error) {
    handleError(res, error);
  }
};

/**
 * GET /api/users/deleted
 * List all soft-deleted users (Admin trash view).
 */
const getDeletedUsers = async (req, res) => {
  try {
    const users = await User.find({ isDeleted: true })
      .select('+isDeleted +deletedAt')
      .sort({ deletedAt: -1 })
      .lean();

    res.json({ success: true, count: users.length, data: users });
  } catch (error) {
    handleError(res, error);
  }
};

/**
 * GET /api/users/:id/progress
 */
const getUserProgress = async (req, res) => {
  try {
    const userId = req.params.id;
    const user = await User.findById(userId).select('-password').lean();
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const enrollments = await Enrollment.find({ userId })
      .populate('teamId')
      .populate('classId', 'classCode courseName')
      .lean();
      
    // Fallback: Check for teams where user is a member but missing an Enrollment record
    const activeTeams = await Team.find({ members: userId })
      .populate('classId', 'classCode courseName')
      .lean();
      
    const enrolledTeamIds = enrollments.map(e => e.teamId?._id?.toString());
    
    for (const team of activeTeams) {
      if (!enrolledTeamIds.includes(team._id.toString())) {
        enrollments.push({
          _id: `mock-${team._id}`,
          userId,
          teamId: team,
          classId: team.classId,
          status: 'Active',
          joinedAt: team.createdAt || new Date(),
        });
      }
    }
      
    const teamIds = enrollments.map(e => e.teamId?._id).filter(Boolean);

    const schedules = await Schedule.find({ bookedTeamId: { $in: teamIds } })
      .sort({ startTime: 1 })
      .populate('classId', 'classCode courseName')
      .populate('bookedTeamId', 'name')
      .lean();

    const scheduleIds = schedules.map(s => s._id);
    const attendances = await Attendance.find({ 
      scheduleId: { $in: scheduleIds },
      userId 
    }).lean();

    res.json({
      success: true,
      data: {
        user,
        enrollments,
        schedules,
        attendances,
      }
    });
  } catch (error) {
    handleError(res, error);
  }
};

module.exports = { getUsers, getUserById, createUser, updateUser, deleteUser, restoreUser, getDeletedUsers, getUserProgress };
