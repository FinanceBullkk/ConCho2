const User = require('../models/User');
const Team = require('../models/Team');
const Schedule = require('../models/Schedule');
const Attendance = require('../models/Attendance');
const { getNextSequence } = require('../helpers/counter');
const { parsePagination, paginatedResponse } = require('../helpers/pagination');
const { escapeRegex } = require('../helpers/escapeRegex');
const { invalidateUserCache } = require('../middleware/auth');

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

    const { page, limit, skip } = parsePagination(req);
    const [users, total] = await Promise.all([
      User.find(filter).sort({ empCode: 1 }).skip(skip).limit(limit),
      User.countDocuments(filter),
    ]);

    res.json(paginatedResponse({ data: users, total, page, limit }));
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
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
    res.status(500).json({ success: false, message: error.message });
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
    const { name, role, department, status, password } = req.body;
    let { empCode } = req.body;

    // Auto-generate empCode if not provided
    if (!empCode) {
      const seq = await getNextSequence('empCode');
      empCode = seq.toString().padStart(6, '0');
    }

    const user = await User.create({
      empCode,
      name,
      role,
      department,
      status,
      password: password || 'default123',
    });

    // Return without password
    const userObj = user.toObject();
    delete userObj.password;

    res.status(201).json({ success: true, data: userObj });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
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
    const { empCode, name, role, department, status } = req.body;
    const updateData = {};

    if (empCode !== undefined) updateData.empCode = empCode;
    if (name !== undefined) updateData.name = name;
    if (role !== undefined) updateData.role = role;
    if (department !== undefined) updateData.department = department;
    if (status !== undefined) updateData.status = status;

    // If password is being changed, hash it manually
    // (pre-save hooks don't run on findOneAndUpdate)
    if (req.body.password) {
      const bcrypt = require('bcryptjs');
      const salt = await bcrypt.genSalt(12);
      updateData.password = await bcrypt.hash(req.body.password, salt);
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
    res.status(400).json({ success: false, message: error.message });
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

    // Cascade Step 1: Pull from Team.members
    await Team.updateMany(
      { members: user._id },
      { $pull: { members: user._id } }
    );

    // Cascade Step 2: Pull from Schedule.enrolledUsers
    await Schedule.updateMany(
      { enrolledUsers: user._id },
      { $pull: { enrolledUsers: user._id }, $inc: { enrolledCount: -1 } }
    );

    // Cascade Step 3: Delete Attendance records
    const attResult = await Attendance.deleteMany({ userId: user._id });

    // Step 4: Delete the user
    await User.findByIdAndDelete(user._id);

    res.json({
      success: true,
      message: `User ${user.empCode} deleted`,
      cascade: { deletedAttendance: attResult.deletedCount },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { getUsers, getUserById, createUser, updateUser, deleteUser };
