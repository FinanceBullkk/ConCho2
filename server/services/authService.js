// ──────────────────────────────────────────────────────────
// Auth Service (facade)
// ──────────────────────────────────────────────────────────
// The legacy 413-line authService was split by concern (Phase 1
// modular-monolith refactor) into services/auth/*:
//   - auth-tokens.js → JWT minting, cookie options, JTI blocklist,
//                      MFA-required-role policy
//   - auth-login.js  → authenticate (with durable lockout) + verifyMfaLogin
// This module re-exports the same surface so authController (controllers/auth/*),
// middleware/auth.js (isTokenRevoked), and the auth tests are unchanged.

const { ServiceError } = require('../helpers/ServiceError');
const {
  generateToken,
  getCookieOptions,
  getMfaPendingCookieOptions,
  MFA_PENDING_COOKIE,
  isMfaRequiredForRole,
  revokeToken,
  isTokenRevoked,
} = require('./auth/auth-tokens');
const { authenticate, verifyMfaLogin } = require('./auth/auth-login');

module.exports = {
  ServiceError,
  authenticate,
  verifyMfaLogin,
  getCookieOptions,
  MFA_PENDING_COOKIE,
  getMfaPendingCookieOptions,
  generateToken,
  revokeToken,
  isTokenRevoked,
  isMfaRequiredForRole,
};
