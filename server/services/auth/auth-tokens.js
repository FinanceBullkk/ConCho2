const jwt = require('jsonwebtoken');
// node:crypto randomUUID — the `uuid` package was dropped in the deps-light
// round (bcb0468); CI keeps devDeps so a transitive uuid masked this file's
// leftover require until the production (omit=dev) install on Render.
const { randomUUID } = require('crypto');
const TokenBlocklist = require('../../models/TokenBlocklist');

// ──────────────────────────────────────────────────────────
// Auth Service — token / cookie / MFA-policy helpers
// ──────────────────────────────────────────────────────────
// Split from the legacy authService (Phase 1 modular-monolith).
// JWT minting (session / mfa-pending / mfa-enrollment), cookie options,
// the JTI blocklist (revoke/check), and the MFA-required-role policy.
// The credential flows (authenticate / verifyMfaLogin) live in auth-login.

// 1d default (DOCS-003, audit round 8): the documented session policy is a
// 24h kill-window; the old '7d' fallback silently outlived it 7× on any
// deploy that forgot to set JWT_EXPIRE (render.yaml didn't).
const JWT_EXPIRE = process.env.JWT_EXPIRE || '1d';

/**
 * Parse JWT_EXPIRE string (e.g. '1d', '1h') into milliseconds.
 */
const parseExpireToMs = (expire) => {
  const match = expire.match(/^(\d+)([dhms])$/);
  if (!match) return 24 * 60 * 60 * 1000;
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
    { id: userId, jti: randomUUID() },
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
    { id: userId, jti: randomUUID(), mfa: 'pending' },
    process.env.JWT_SECRET,
    { expiresIn: MFA_PENDING_EXPIRE }
  );
};

/**
 * Cookie name for the MFA-pending token (P3 fix: stored as HttpOnly cookie
 * instead of JSON body so XSS cannot steal the pending token and attempt
 * the second factor from a different browser/device).
 */
const MFA_PENDING_COOKIE = 'tms_mfa_pending';

/**
 * Cookie options for the MFA-pending token.
 * Short TTL (5 min) mirrors the JWT's own expiry.
 * HttpOnly prevents JS access; sameSite Strict blocks CSRF on this cookie.
 */
const getMfaPendingCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'Strict',
  maxAge: 5 * 60 * 1000, // 5 minutes — same as MFA_PENDING_EXPIRE
  path: '/',
});

/**
 * Generate an enrollment-required token. Issued when a user logs in
 * with the right credentials but their role REQUIRES MFA and they have
 * not yet enrolled. The token authorizes ONLY: /me, /logout, /mfa/setup,
 * /mfa/verify-setup. After successful verify-setup, the controller
 * swaps it for a full-session token.
 *
 * 30-minute TTL — longer than mfa-pending because enrollment involves
 * scanning a QR code and configuring an authenticator app.
 */
const MFA_ENROLLMENT_EXPIRE = '30m';
const generateMfaEnrollmentToken = (userId) => {
  return jwt.sign(
    { id: userId, jti: randomUUID(), mfa: 'enrollment-required' },
    process.env.JWT_SECRET,
    { expiresIn: MFA_ENROLLMENT_EXPIRE }
  );
};

/**
 * Roles for which MFA is required (not just available).
 * Configured via MFA_REQUIRED_ROLES env (comma-separated, e.g. "Admin").
 * When a matching user logs in without MFA, they're forced through
 * enrollment before they can use any other feature.
 */
const MFA_REQUIRED_ROLES = (process.env.MFA_REQUIRED_ROLES || '')
  .split(',')
  .map((r) => r.trim())
  .filter(Boolean);

const isMfaRequiredForRole = (role) => MFA_REQUIRED_ROLES.includes(role);

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

module.exports = {
  generateToken,
  generateMfaPendingToken,
  generateMfaEnrollmentToken,
  getCookieOptions,
  getMfaPendingCookieOptions,
  MFA_PENDING_COOKIE,
  isMfaRequiredForRole,
  revokeToken,
  isTokenRevoked,
};
