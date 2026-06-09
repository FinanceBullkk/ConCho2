// ──────────────────────────────────────────────────────────
// Auth Controller (facade — thin; delegates to the service layer)
// ──────────────────────────────────────────────────────────
// The legacy 704-line authController was split by concern (Phase 1
// modular-monolith refactor) into controllers/auth/*:
//   - auth-session.js        → login / mfa-verify-login / logout / me / change-password
//   - auth-mfa.js            → self-service MFA setup / verify-setup / disable
//   - auth-admin.js          → admin overrides (mfa-admin-disable, force-logout)
//   - auth-password-reset.js → forgot-password (anti-enumeration) / reset-password
// This module re-exports the same 12-handler surface so authRoutes.js is
// unchanged.

const {
  login, mfaVerifyLogin, logout, getMe, changePassword,
} = require('./auth/auth-session');
const { mfaSetup, mfaVerifySetup, mfaDisable } = require('./auth/auth-mfa');
const { mfaAdminDisable, adminForceLogout } = require('./auth/auth-admin');
const { forgotPassword, resetPassword } = require('./auth/auth-password-reset');

module.exports = {
  login,
  logout,
  getMe,
  changePassword,
  adminForceLogout,
  mfaVerifyLogin,
  mfaSetup,
  mfaVerifySetup,
  mfaDisable,
  mfaAdminDisable,
  forgotPassword,
  resetPassword,
};
