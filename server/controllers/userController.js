const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Team = require('../models/Team');
const Schedule = require('../models/Schedule');
const Attendance = require('../models/Attendance');
const Enrollment = require('../models/Enrollment');
const Evaluation = require('../models/Evaluation');
const { getNextSequence } = require('../helpers/counter');
const { parsePagination, paginatedResponse } = require('../helpers/pagination');
const { escapeRegex } = require('../helpers/escapeRegex');
const { invalidateUserCache } = require('../middleware/auth');
const { handleError } = require('../helpers/handleError');

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
    const [users, total] = await Promise.all([
      User.find(filter).sort({ empCode: 1 }).skip(skip).limit(limit),
      User.countDocuments(filter),
    ]);

    // Compute lastActive date for each user via attendance records
    const userIds = users.map(u => u._id);
    const lastActiveAgg = await Attendance.aggregate([
      { $match: { userId: { $in: userIds } } },
      { $group: { _id: '$userId', lastDate: { $max: '$createdAt' } } },
    ]);
    const lastActiveMap = {};
    for (const a of lastActiveAgg) {
      lastActiveMap[a._id.toString()] = a.lastDate;
    }

    // Merge lastActive into user objects
    const enrichedUsers = users.map(u => {
      const obj = u.toObject();
      const lastDate = lastActiveMap[u._id.toString()] || null;
      obj.lastActive = lastDate;
      if (lastDate) {
        obj.daysSince = Math.floor((Date.now() - new Date(lastDate).getTime()) / (1000 * 60 * 60 * 24));
      } else {
        obj.daysSince = null;
      }
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
 * Create a new user
 *
 * empCode is auto-generated using an atomic counter UNLESS
 * explicitly provided in the request body (for migration/seeding).
 */
const createUser = async (req, res) => {
  try {
    const { name, role, department, position, status, dropReason, password } = req.body;
    let { empCode } = req.body;

    // Auto-generate empCode if not provided
    if (!empCode) {
      const seq = await getNextSequence('empCode');
      empCode = seq.toString().padStart(6, '0');
    }

    if (!password) {
      return res.status(400).json({ success: false, message: 'password is required' });
    }

    const user = await User.create({
      empCode,
      name,
      role,
      department,
      position,
      status,
      dropReason,
      password,
    });

    // Return without password
    const userObj = user.toObject();
    delete userObj.password;

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
    const { empCode, name, role, department, position, status, dropReason } = req.body;
    const updateData = {};

    if (empCode !== undefined) updateData.empCode = empCode;
    if (name !== undefined) updateData.name = name;
    if (role !== undefined) updateData.role = role;
    if (department !== undefined) updateData.department = department;
    if (position !== undefined) updateData.position = position;
    if (status !== undefined) updateData.status = status;
    if (dropReason !== undefined) updateData.dropReason = dropReason;

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
