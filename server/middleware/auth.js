const jwt = require('jsonwebtoken');
const User = require('../models/User');
const NodeCache = require('node-cache');
const { isTokenRevoked } = require('../services/authService');

// ── User cache for auth middleware ────────────────────────
// Short TTL (30s) to minimise the window where a demoted user
// retains old privileges (SYNC-03). invalidateUserCache() is
// called on every updateUser, so role changes are immediate.
const userCache = new NodeCache({ stdTTL: 30, checkperiod: 15 });

/**
 * Invalidate a specific user from the auth cache.
 * Call this after status change or user update.
 */
const invalidateUserCache = (userId) => {
  userCache.del(userId.toString());
};

/**
 * JWT Authentication Middleware (Hardened + Cached)
 * ────────────────────────────────────────────────────
 * Reads JWT from TWO sources (in priority order):
 *   1. HttpOnly cookie 'tms_token'    ← XSS-proof (primary)
 *   2. Authorization: Bearer <token>  ← backward compat / API clients
 *
 * User lookups are cached (2 min TTL) to reduce DB load.
 *
 * Usage: router.get('/protected', protect, handler)
 */
const protect = async (req, res, next) => {
  try {
    let token;

    // Priority 1: HttpOnly cookie (XSS-safe)
    if (req.cookies && req.cookies.tms_token) {
      token = req.cookies.tms_token;
    }

    // Priority 2: Authorization header (backward compat / Postman / API)
    if (
      !token &&
      req.headers.authorization &&
      req.headers.authorization.startsWith('Bearer')
    ) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized — no token provided',
      });
    }

    // Verify token. Algorithm is pinned to HS256 to prevent algorithm-confusion
    // attacks (e.g. 'none' or RS256-with-public-key-as-secret).
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });

    // Reject MFA-pending tokens on normal protected routes.
    // A pending token only authorizes /api/auth/mfa/verify; using it
    // anywhere else would defeat the second factor.
    if (decoded.mfa === 'pending') {
      return res.status(401).json({
        success: false,
        message: 'MFA challenge incomplete. Submit your second-factor code.',
      });
    }

    // Enrollment-required tokens (issued when MFA enforcement triggers)
    // are restricted to a tiny whitelist of endpoints — the user can see
    // their identity, log out, or complete MFA enrollment, and that's it.
    // Hitting anything else returns 403 with mfaEnrollmentRequired so the
    // frontend knows to redirect to the settings page.
    if (decoded.mfa === 'enrollment-required') {
      const path = (req.originalUrl || req.url || '').split('?')[0];
      const ENROLLMENT_ALLOWED = new Set([
        '/api/auth/me',
        '/api/auth/logout',
        '/api/auth/change-password',
        '/api/auth/mfa/setup',
        '/api/auth/mfa/verify-setup',
      ]);
      if (!ENROLLMENT_ALLOWED.has(path)) {
        return res.status(403).json({
          success: false,
          message: 'MFA enrollment is required by policy. Complete enrollment to continue.',
          mfaEnrollmentRequired: true,
        });
      }
      // Mark request so downstream code (e.g. mfaVerifySetup) can detect
      // the post-enrollment moment and swap in a fresh full-session token.
      req.mfaEnrollmentRequired = true;
    }

    // Reject revoked tokens (Phase 1.4). Tokens issued before this
    // change have no JTI — those are still accepted (graceful rollout).
    // Once all old tokens have expired you could optionally enforce
    // JTI presence here.
    if (decoded.jti && (await isTokenRevoked(decoded.jti))) {
      return res.status(401).json({
        success: false,
        message: 'Session has been revoked. Please log in again.',
      });
    }

    // Expose the JTI + exp so the logout handler can revoke this exact token.
    req.tokenJti = decoded.jti || null;
    req.tokenExp = decoded.exp || null;

    // Cached user lookup — avoids DB query on every request
    // Use lean() to cache plain objects instead of heavy Mongoose documents
    const cacheKey = decoded.id.toString();
    let user = userCache.get(cacheKey);
    if (!user) {
      user = await User.findById(decoded.id)
        .select('_id empCode name role department status passwordChangedAt mfaEnabled mustChangePassword')
        .lean();
      if (user) userCache.set(cacheKey, user);
    }

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized — user no longer exists',
      });
    }

    if (user.status !== 'Active') {
      return res.status(403).json({
        success: false,
        message: `Account is ${user.status}. Contact admin.`,
      });
    }

    // Reject tokens issued before the last password change.
    // decoded.iat is in seconds; passwordChangedAt is a Date.
    if (user.passwordChangedAt) {
      const changedAt = Math.floor(new Date(user.passwordChangedAt).getTime() / 1000);
      if (decoded.iat < changedAt) {
        return res.status(401).json({
          success: false,
          message: 'Password was recently changed. Please log in again.',
        });
      }
    }

    // Force default-password users into the password-change flow at the
    // API layer. The frontend modal is helpful UX, but this server guard
    // prevents direct API clients from using the app before rotating.
    if (user.mustChangePassword) {
      const path = (req.originalUrl || req.url || '').split('?')[0];
      const PASSWORD_CHANGE_ALLOWED = new Set([
        '/api/auth/me',
        '/api/auth/logout',
        '/api/auth/change-password',
      ]);
      if (!PASSWORD_CHANGE_ALLOWED.has(path)) {
        return res.status(403).json({
          success: false,
          message: 'Password change is required before continuing.',
          mustChangePassword: true,
        });
      }
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ success: false, message: 'Invalid token' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Token expired' });
    }
    next(error);
  }
};

module.exports = { protect, invalidateUserCache };
