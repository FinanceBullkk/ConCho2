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
      data: { token, user },
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
  res.json({ success: true, data: req.user });
};

module.exports = { login, logout, getMe };
