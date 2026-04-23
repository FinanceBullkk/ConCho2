const jwt = require('jsonwebtoken');
const User = require('../models/User');
const NodeCache = require('node-cache');

// ── User cache for auth middleware ────────────────────────
// Short TTL (2 min) to avoid DB query on every request.
// Invalidated immediately when user status changes via
// invalidateUserCache(userId).
const userCache = new NodeCache({ stdTTL: 120, checkperiod: 60 });

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

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Cached user lookup — avoids DB query on every request
    // Use lean() to cache plain objects instead of heavy Mongoose documents
    const cacheKey = decoded.id.toString();
    let user = userCache.get(cacheKey);
    if (!user) {
      user = await User.findById(decoded.id)
        .select('_id empCode name role department status')
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
