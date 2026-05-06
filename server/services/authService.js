const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const User = require('../models/User');
const TokenBlocklist = require('../models/TokenBlocklist');
const mfaService = require('./mfaService');
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
 *
 * Includes a JTI (JWT ID) so individual tokens can be revoked without
 * invalidating every token for the user (which is what passwordChangedAt
 * would do).
 */
const generateToken = (userId) => {
  return jwt.sign(
    { id: userId, jti: uuidv4() },
    process.env.JWT_SECRET,
    { expiresIn: JWT_EXPIRE }
  );
};

/**
 * Generate a short-lived MFA-pending token. Carries `mfa: 'pending'`
 * so the auth middleware (and helpers) can refuse to treat it as a
 * fully-authenticated session. 5-minute TTL caps the exchange window.
 */
const MFA_PENDING_EXPIRE = '5m';
const generateMfaPendingToken = (userId) => {
  return jwt.sign(
    { id: userId, jti: uuidv4(), mfa: 'pending' },
    process.env.JWT_SECRET,
    { expiresIn: MFA_PENDING_EXPIRE }
  );
};

/**
 * Add a token JTI to the blocklist. Called on explicit logout and when
 * an admin force-logs-out a user.
 *
 * @param {string} jti
 * @param {number} expSeconds - the JWT `exp` claim in seconds since epoch
 * @param {Object} [opts]
 * @param {string} [opts.userId]
 * @param {string} [opts.reason] - 'logout' | 'force-logout' | 'admin-action'
 */
const revokeToken = async (jti, expSeconds, opts = {}) => {
  if (!jti || !expSeconds) return;
  // upsert so a duplicate revocation (e.g. double-logout-click) is a no-op.
  await TokenBlocklist.updateOne(
    { jti },
    {
      $setOnInsert: {
        jti,
        userId: opts.userId || null,
        expiresAt: new Date(expSeconds * 1000),
        reason: opts.reason || 'logout',
      },
    },
    { upsert: true }
  );
};

/**
 * Check whether a JTI has been revoked. Returns boolean.
 * Auth middleware calls this on every request, so it's a single
 * indexed lookup (~1ms with the unique index on jti).
 */
const isTokenRevoked = async (jti) => {
  if (!jti) return false;
  const hit = await TokenBlocklist.findOne({ jti }).select('_id').lean();
  return !!hit;
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
    .select('+password +failedLoginAttempts +lockUntil +mfaSecret');
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

  // If MFA is enabled, do NOT issue a full session. Issue a short-lived
  // pending token; the client must call /api/auth/mfa/verify with a TOTP
  // (or backup) code to complete login.
  if (user.mfaEnabled) {
    return {
      mfaRequired: true,
      mfaPendingToken: generateMfaPendingToken(user._id),
    };
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

/**
 * Second leg of MFA-protected login. Caller passes the mfa-pending token
 * (issued by authenticate()) plus a 6-digit TOTP code or a backup code.
 *
 * On success: returns the same shape as a normal authenticate() response.
 */
const verifyMfaLogin = async (mfaPendingToken, code) => {
  if (!mfaPendingToken || !code) {
    throw new ServiceError('mfaPendingToken and code are required');
  }

  let decoded;
  try {
    decoded = jwt.verify(mfaPendingToken, process.env.JWT_SECRET);
  } catch (err) {
    throw new ServiceError('MFA challenge expired. Please log in again.', 401);
  }
  if (decoded.mfa !== 'pending') {
    throw new ServiceError('Invalid MFA challenge token', 401);
  }

  const user = await User.findById(decoded.id)
    .select('+mfaSecret +mfaBackupCodes');
  if (!user || !user.mfaEnabled || !user.mfaSecret) {
    // Don't leak whether the account exists or has MFA configured.
    throw new ServiceError('Invalid MFA challenge', 401);
  }

  // Try TOTP first; fall back to backup codes.
  let ok = mfaService.verifyToken(user.mfaSecret, code);
  let backupCodeUsed = false;
  if (!ok) {
    const remaining = await mfaService.consumeBackupCode(user.mfaBackupCodes || [], code);
    if (remaining) {
      user.mfaBackupCodes = remaining;
      await user.save();
      backupCodeUsed = true;
      ok = true;
      logger.warn(
        { userId: user._id.toString(), remaining: remaining.length },
        'MFA backup code consumed'
      );
    }
  }

  if (!ok) {
    throw new ServiceError('Invalid MFA code', 401);
  }

  const token = generateToken(user._id);

  return {
    token,
    cookieOptions: getCookieOptions(),
    backupCodeUsed,
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

module.exports = {
  ServiceError,
  authenticate,
  verifyMfaLogin,
  getCookieOptions,
  revokeToken,
  isTokenRevoked,
};
