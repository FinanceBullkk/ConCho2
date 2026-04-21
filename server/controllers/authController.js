const jwt = require('jsonwebtoken');
const User = require('../models/User');

// ──────────────────────────────────────────────────────────
// Auth Controller
// ──────────────────────────────────────────────────────────

/**
 * Generate JWT token
 */
const generateToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '7d',
  });
};

/**
 * POST /api/auth/login
 * Login with empCode + password
 *
 * PERFORMANCE NOTE:
 *   empCode is stored as uppercase (schema setter) with a
 *   unique index. The query below normalizes input to match,
 *   then does a simple exact-match equality lookup — this
 *   hits the B-tree index directly: O(log n), no regex.
 */
const login = async (req, res) => {
  try {
    const { empCode, password } = req.body;

    if (!empCode || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide empCode and password',
      });
    }

    // Normalize input: trim whitespace + uppercase to match stored format
    const normalizedCode = empCode.trim().toUpperCase();

    // Exact-match query → uses the unique index on empCode
    const user = await User.findOne({ empCode: normalizedCode }).select(
      '+password'
    );

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials',
      });
    }

    // Check status
    if (user.status !== 'Active') {
      return res.status(403).json({
        success: false,
        message: `Account is ${user.status}. Contact admin.`,
      });
    }

    // Compare password
    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials',
      });
    }

    const token = generateToken(user._id);

    res.json({
      success: true,
      data: {
        token,
        user: {
          _id: user._id,
          empCode: user.empCode,
          name: user.name,
          role: user.role,
          department: user.department,
          status: user.status,
        },
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /api/auth/me
 * Get current logged-in user
 */
const getMe = async (req, res) => {
  res.json({ success: true, data: req.user });
};

module.exports = { login, getMe };
