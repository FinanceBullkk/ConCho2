const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * JWT Authentication Middleware (Hardened)
 * ────────────────────────────────────────
 * Reads JWT from TWO sources (in priority order):
 *   1. HttpOnly cookie 'tms_token'    ← XSS-proof (primary)
 *   2. Authorization: Bearer <token>  ← backward compat / API clients
 *
 * This dual approach allows the frontend to migrate from
 * localStorage to cookies without breaking existing sessions.
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

    // Attach user (exclude password)
    const user = await User.findById(decoded.id);
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

module.exports = { protect };
