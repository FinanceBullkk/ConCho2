const jwt = require('jsonwebtoken');
const User = require('../models/User');

// ──────────────────────────────────────────────────────────
// Auth Service
// ──────────────────────────────────────────────────────────

const { ServiceError } = require('../helpers/ServiceError');

const JWT_EXPIRE = process.env.JWT_EXPIRE || '7d';

/**
 * Parse JWT_EXPIRE string (e.g. '7d', '1h') into milliseconds.
 */
const parseExpireToMs = (expire) => {
  const match = expire.match(/^(\d+)([dhms])$/);
  if (!match) return 7 * 24 * 60 * 60 * 1000;
  const value = parseInt(match[1], 10);
  const unit = match[2];
  const multipliers = { d: 86400000, h: 3600000, m: 60000, s: 1000 };
  return value * (multipliers[unit] || 86400000);
};

/**
 * Generate a JWT token for a user.
 */
const generateToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: JWT_EXPIRE,
  });
};

/**
 * Get cookie options for the JWT.
 */
const getCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'Strict',
  maxAge: parseExpireToMs(JWT_EXPIRE),
  path: '/',
});

/**
 * Authenticate a user with empCode + password.
 *
 * @param {string} empCode
 * @param {string} password
 * @returns {Object} { token, user, cookieOptions }
 */
const authenticate = async (empCode, password) => {
  if (!empCode || !password) {
    throw new ServiceError('Please provide empCode and password');
  }

  const normalizedCode = empCode.trim().toUpperCase();

  const user = await User.findOne({ empCode: normalizedCode }).select('+password');
  if (!user) {
    throw new ServiceError('Invalid credentials', 401);
  }

  if (user.status !== 'Active') {
    throw new ServiceError(`Account is ${user.status}. Contact admin.`, 403);
  }

  const isMatch = await user.matchPassword(password);
  if (!isMatch) {
    throw new ServiceError('Invalid credentials', 401);
  }

  const token = generateToken(user._id);

  return {
    token,
    cookieOptions: getCookieOptions(),
    user: {
      _id: user._id,
      empCode: user.empCode,
      name: user.name,
      role: user.role,
      department: user.department,
      status: user.status,
    },
  };
};

module.exports = { ServiceError, authenticate, getCookieOptions };
