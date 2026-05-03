const authService = require('../services/authService');
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
const logout = async (_req, res) => {
  res.clearCookie('tms_token', { path: '/' });
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
    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    handleError(res, error);
  }
};

module.exports = { login, logout, getMe, changePassword };
