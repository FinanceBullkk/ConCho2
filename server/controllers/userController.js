const User = require('../models/User');
const { getNextSequence } = require('../helpers/counter');
const { parsePagination, paginatedResponse } = require('../helpers/pagination');
const { escapeRegex } = require('../helpers/escapeRegex');

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
      { new: true, runValidators: true }
    );

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({ success: true, data: user });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

/**
 * DELETE /api/users/:id
 * Delete a user (hard delete — use status change for soft delete)
 */
const deleteUser = async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    res.json({ success: true, message: `User ${user.empCode} deleted` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { getUsers, getUserById, createUser, updateUser, deleteUser };
