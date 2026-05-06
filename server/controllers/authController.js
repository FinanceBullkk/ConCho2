const authService = require('../services/authService');
const auditService = require('../services/auditService');
const { handleError } = require('../helpers/handleError');

// ──────────────────────────────────────────────────────────
// Auth Controller (Thin — delegates to Service Layer)
// ──────────────────────────────────────────────────────────

/**
 * POST /api/auth/login
 */
const login = async (req, res) => {
  try {
    const { empCode, password } = req.body;
    const { token, user, cookieOptions } = await authService.authenticate(empCode, password);

    // Set HttpOnly cookie (primary auth)
    res.cookie('tms_token', token, cookieOptions);

    // Audit successful login. Failure cases are logged via the warn-level
    // logger inside authService — we don't audit failed logins to avoid
    // an attack vector that pollutes the audit collection.
    auditService.record({
      req: { ...req, user: { _id: user._id, role: user.role, empCode: user.empCode } },
      action: 'logged-in',
      entity: 'Auth',
      entityId: user._id,
    });

    res.json({
      success: true,
      data: { user },
    });
  } catch (error) {
    handleError(res, error);
  }
};

/**
 * POST /api/auth/logout
 */
const logout = async (req, res) => {
  // Revoke the current token by adding its JTI to the blocklist so it
  // can't be reused even if the cookie is stolen post-logout.
  if (req.tokenJti && req.tokenExp) {
    try {
      await authService.revokeToken(req.tokenJti, req.tokenExp, {
        userId: req.user?._id,
        reason: 'logout',
      });
    } catch (err) {
      // Revocation is best-effort. Log but don't block the user.
      const log = req.log || require('../lib/logger');
      log.warn({ err: err.message, jti: req.tokenJti }, 'Token revocation failed on logout');
    }
  }

  res.clearCookie('tms_token', { path: '/' });

  auditService.record({
    req,
    action: 'logged-out',
    entity: 'Auth',
    entityId: req.user?._id,
  });

  res.json({ success: true, message: 'Logged out' });
};

/**
 * GET /api/auth/me
 */
const getMe = async (req, res) => {
  // Strip internal fields before sending to client.
  const { passwordChangedAt, ...safeUser } = req.user;
  res.json({ success: true, data: safeUser });
};
/**
 * PUT /api/auth/change-password
 */
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const User = require('../models/User');
    const user = await User.findById(req.user._id).select('+password');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    const isMatch = await user.matchPassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Current password is incorrect' });
    }
    user.password = newPassword;
    user.passwordChangedAt = new Date();
    await user.save();
    // Invalidate auth cache — forces re-read with new passwordChangedAt on next request.
    // This also immediately rejects the current token (iat < changedAt).
    const { invalidateUserCache } = require('../middleware/auth');
    invalidateUserCache(user._id);

    auditService.record({
      req,
      action: 'password-changed',
      entity: 'User',
      entityId: user._id,
    });

    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    handleError(res, error);
  }
};

/**
 * POST /api/auth/admin/force-logout/:userId
 *
 * Admin-only kill switch. Invalidates ALL active tokens for the target
 * user by bumping passwordChangedAt — the existing auth middleware
 * already rejects tokens whose `iat < passwordChangedAt`. This is more
 * complete than per-JTI revocation since it catches tokens we don't know
 * about (e.g. issued before the blocklist existed).
 */
const adminForceLogout = async (req, res) => {
  try {
    const User = require('../models/User');
    const { userId } = req.params;
    const user = await User.findById(userId).select('_id empCode role');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    await User.updateOne(
      { _id: userId },
      { $set: { passwordChangedAt: new Date() } }
    );

    const { invalidateUserCache } = require('../middleware/auth');
    invalidateUserCache(user._id);

    auditService.record({
      req,
      action: 'force-logged-out',
      entity: 'User',
      entityId: user._id,
      note: `Admin force-logout of ${user.empCode}`,
    });

    res.json({ success: true, message: `All sessions for ${user.empCode} invalidated` });
  } catch (error) {
    handleError(res, error);
  }
};

module.exports = { login, logout, getMe, changePassword, adminForceLogout };
