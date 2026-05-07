const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');

// In test environment, disable rate limiting entirely so test suites
// that make many requests for the same user don't get throttled.
const IS_TEST = process.env.NODE_ENV === 'test';
// Disable rate-limit validation checks in test only. In production we
// keep validation ON; the IPv6 concern is handled by always using
// `ipKeyGenerator(req)` (never raw `req.ip`) inside custom keyGenerators
// — which is the library-recommended fix for ERR_ERL_KEY_GEN_IPV6.
const validateOpts = IS_TEST ? false : true;
const skipInTest = () => IS_TEST;

// Helper: produce a stable rate-limit key for an authenticated user,
// falling back to a properly-bucketed IP (handles IPv6 /64 collapsing).
const userOrIpKey = (req) =>
  (req.user ? req.user._id.toString() : ipKeyGenerator(req));

// ──────────────────────────────────────────────────────────
// Rate Limiters (SEC-04 + SEC-RL-01/02)
// ──────────────────────────────────────────────────────────

/**
 * Global API rate limiter: max 200 requests/min per IP.
 * Prevents scraping, enumeration, and brute-force across all endpoints.
 * SEC-RL-02
 */
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  message: { success: false, message: 'Too many requests. Please slow down.' },
  validate: validateOpts,
});

/**
 * Global write rate limiter: max 60 write requests/min per user/IP.
 * Covers all POST/PUT/PATCH/DELETE requests that aren't covered by
 * specific limiters. SEC-RL-01
 */
const globalWriteLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => IS_TEST || req.method === 'GET',
  message: { success: false, message: 'Too many write requests. Please slow down.' },
  validate: validateOpts,
  keyGenerator: userOrIpKey,
});
// ──────────────────────────────────────────────────────────
// Rate Limiters for Write Endpoints (SEC-04)
// ──────────────────────────────────────────────────────────
// WHY: Without rate limiting, an attacker can use automated
// tools to spam write endpoints (booking, import) and flood
// the database with garbage data or cause a CPU spike (bcrypt
// hashing in bulk import).
//
// Each limiter is tuned to the expected usage pattern:
//   - Booking:    a leader books at most a few times per session
//   - Import:     admin runs bulk import rarely (once per batch)
//   - Attendance: teacher marks attendance once per class
//   - Sync:       admin syncs from Google Sheets occasionally
// ──────────────────────────────────────────────────────────

/**
 * Booking: max 10 requests per minute per IP.
 * Normal usage: 1–2 bookings per session.
 */
const bookingLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  message: { success: false, message: 'Too many booking requests. Please wait a moment before trying again.' },
  validate: validateOpts,
  keyGenerator: userOrIpKey,
});

/**
 * Import: max 5 requests per 15 minutes per IP.
 * Normal usage: 1 bulk import per batch session.
 * Low limit because each request can trigger thousands of bcrypt hashes.
 */
const importLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  message: { success: false, message: 'Too many import requests. Please wait before importing again.' },
  validate: validateOpts,
  keyGenerator: userOrIpKey,
});

/**
 * Attendance: max 30 requests per minute per IP.
 * Normal usage: teacher submits once per class, maybe a few corrections.
 */
const attendanceLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  message: { success: false, message: 'Too many attendance submissions. Please slow down.' },
  validate: validateOpts,
  keyGenerator: userOrIpKey,
});

/**
 * Login: max 5 attempts per 15 min per (IP + empCode) pair.
 *
 * Why combine IP and empCode:
 *   - IP-only lets an attacker rotate usernames behind the same IP
 *     (credential stuffing) until they get lucky.
 *   - empCode-only lets a botnet brute-force one account from many IPs.
 *   - Combining catches both. Pair with DB-backed lockout in authService
 *     for defense in depth across distributed instances.
 *
 * Successful logins are NOT counted (skipSuccessfulRequests) so legitimate
 * users with sticky fingers don't lock themselves out.
 */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  message: {
    success: false,
    message: 'Too many login attempts. Please try again in 15 minutes.',
  },
  validate: validateOpts,
  keyGenerator: (req) => {
    const empCode = (req.body?.empCode || '').toString().trim().toUpperCase();
    return `${ipKeyGenerator(req)}|${empCode}`;
  },
});

/**
 * Sync: max 3 requests per 15 minutes per IP.
 * Normal usage: admin triggers sync once after updating the sheet.
 */
const syncLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  message: { success: false, message: 'Too many sync requests. Please wait before syncing again.' },
  validate: validateOpts,
  keyGenerator: userOrIpKey,
});

/**
 * Change-password: max 10 attempts per 15 minutes per IP.
 * Prevents brute-forcing the current-password field.
 */
const changePasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  message: { success: false, message: 'Too many password change attempts. Please try again later.' },
  validate: validateOpts,
  keyGenerator: (req) => ipKeyGenerator(req),
});

/**
 * MFA endpoints: max 20 requests per 15 minutes per IP.
 * Covers verify, setup, verify-setup, disable, and admin-disable routes.
 */
const mfaLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  message: { success: false, message: 'Too many MFA requests. Please try again later.' },
  validate: validateOpts,
  keyGenerator: (req) => ipKeyGenerator(req),
});

module.exports = {
  globalLimiter,
  globalWriteLimiter,
  bookingLimiter,
  importLimiter,
  attendanceLimiter,
  syncLimiter,
  loginLimiter,
  changePasswordLimiter,
  mfaLimiter,
};
