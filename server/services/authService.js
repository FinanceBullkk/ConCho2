const jwt = require('jsonwebtoken');
const User = require('../models/User');
const logger = require('../lib/logger');

// ──────────────────────────────────────────────────────────
// Auth Service
// ──────────────────────────────────────────────────────────

const { ServiceError } = require('../helpers/ServiceError');

// Defense-in-depth lockout. The express-rate-limit `loginLimiter` blocks
// *requests* per IP+empCode; this lock is per-account, durable in DB,
// and survives instance restarts. After MAX_FAILED consecutive failures,
// the account is locked for LOCK_MINUTES regardless of source IP.
const MAX_FAILED_ATTEMPTS = Number(process.env.LOGIN_MAX_FAILED || 10);
const LOCK_MINUTES = Number(process.env.LOGIN_LOCK_MINUTES || 15);

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

  const user = await User.findOne({ empCode: normalizedCode })
    .select('+password +failedLoginAttempts +lockUntil');
  if (!user) {
    // Generic message — do not reveal whether the account exists.
    throw new ServiceError('Invalid credentials', 401);
  }

  // Honor active lockout. Generic 401 (not 423) so attackers can't
  // distinguish "locked" from "wrong password" via status code.
  if (user.lockUntil && user.lockUntil > new Date()) {
    logger.warn({ empCode: normalizedCode, lockUntil: user.lockUntil }, 'Login attempt on locked account');
    throw new ServiceError('Invalid credentials', 401);
  }

  if (user.status !== 'Active') {
    throw new ServiceError(`Account is ${user.status}. Contact admin.`, 403);
  }

  const isMatch = await user.matchPassword(password);
  if (!isMatch) {
    // Atomically increment failed attempts; lock on threshold.
    const newAttempts = (user.failedLoginAttempts || 0) + 1;
    const update = { $set: { failedLoginAttempts: newAttempts } };
    if (newAttempts >= MAX_FAILED_ATTEMPTS) {
      update.$set.lockUntil = new Date(Date.now() + LOCK_MINUTES * 60 * 1000);
      update.$set.failedLoginAttempts = 0; // reset for next window
      logger.warn(
        { empCode: normalizedCode, attempts: newAttempts },
        'Account locked due to repeated failed login attempts'
      );
    }
    await User.updateOne({ _id: user._id }, update);
    throw new ServiceError('Invalid credentials', 401);
  }

  // Successful login — clear any failure state.
  if (user.failedLoginAttempts > 0 || user.lockUntil) {
    await User.updateOne(
      { _id: user._id },
      { $set: { failedLoginAttempts: 0, lockUntil: null } }
    );
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
