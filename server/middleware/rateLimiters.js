const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const jwt = require('jsonwebtoken');

// Cookie name must stay in sync with authService.MFA_PENDING_COOKIE.
// We duplicate the string here to avoid importing authService (would create
// a circular dependency chain: rateLimiters → authService → models → ...).
const MFA_PENDING_COOKIE = 'tms_mfa_pending';

// ── Redis note (#10) ───────────────────────────────────────────────────────
// All limiters below use the default in-process MemoryStore. This is correct
// for single-instance deploys (Render free tier). If the app ever scales to
// multiple server instances, the per-instance counters become independent and
// an attacker can spread requests to bypass limits.
//
// To switch to a shared Redis store when that time comes:
//   npm install rate-limit-redis ioredis
//   const RedisStore = require('rate-limit-redis');
//   const Redis = require('ioredis');
//   const redisClient = new Redis(process.env.REDIS_URL);
//   store: new RedisStore({ sendCommand: (...args) => redisClient.call(...args) })
// Add REDIS_URL to Render env vars and the above store: option to each limiter.
// ──────────────────────────────────────────────────────────────────────────

// In test environment, disable rate limiting entirely so test suites
// that make many requests for the same user don't get throttled.
const IS_TEST = process.env.NODE_ENV === 'test';
// E2E escape hatch (QA-018 / PR #59): Playwright drives a REAL dev-mode server
// (NODE_ENV=test would skip the auto-start in server.js), and the suite's
// AGGREGATE traffic trips globalLimiter's 200 req/min long before any single
// flow misbehaves — the theme.spec login 429'd mid-run once booking.spec was
// added. e2e trades limiter realism for determinism: the limiter layer has its
// own dedicated gate (tests/unit/rateLimiterWiring.test.js). The flag is NEVER
// honored in production, no matter what the env says.
const RATE_LIMITS_DISABLED =
  IS_TEST ||
  (process.env.DISABLE_RATE_LIMITS === 'true' && process.env.NODE_ENV !== 'production');
// Disable rate-limit validation checks in test only. In production we
// keep validation ON; the IPv6 concern is handled by always using
// `ipKeyGenerator(req)` (never raw `req.ip`) inside custom keyGenerators
// — which is the library-recommended fix for ERR_ERL_KEY_GEN_IPV6.
const validateOpts = IS_TEST ? false : true;
const skipInTest = () => RATE_LIMITS_DISABLED;

// Helper: produce a stable rate-limit key for an authenticated user,
// falling back to a properly-bucketed IP (handles IPv6 /64 collapsing).
const userOrIpKey = (req) =>
  (req.user ? req.user._id.toString() : ipKeyGenerator(req));

// ──────────────────────────────────────────────────────────
// Rate Limiters (SEC-04 + SEC-RL-01/02)
// ──────────────────────────────────────────────────────────

// Cron routes are exempt from both global limiters because:
//   1. They authenticate via CRON_TOKEN (cronAuth middleware) — not user sessions.
//   2. cron-job.org fires from shared egress IPs; those IPs would otherwise
//      exhaust the per-IP write budget and get 429 despite being legitimate.
//   3. The reconcile route has its own reconcileLimiter (10/hour).
// NOTE: these middlewares are mounted at app.use('/api', ...) so req.path
// is relative to /api — use '/cron/' not '/api/cron/'.
const skipCron = (req) => req.path.startsWith('/cron/');

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
  skip: (req) => RATE_LIMITS_DISABLED || skipCron(req),
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
  skip: (req) => RATE_LIMITS_DISABLED || req.method === 'GET' || skipCron(req),
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

/**
 * forgotPasswordLimiter — dedicated limiter for the forgot-password endpoint.
 * More lenient than loginLimiter since it's not a security-sensitive brute-force
 * target, but still throttled to prevent email flooding.
 * 5 requests per 15 minutes per IP.
 */
const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => ipKeyGenerator(req),
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  message: { success: false, message: 'Too many password reset requests. Please try again in 15 minutes.' },
  skipSuccessfulRequests: false, // count all requests (anti-abuse)
  validate: validateOpts,
});

/**
 * exportLimiter — throttle expensive export operations.
 * Excel generation is CPU-intensive; prevent repeated abuse.
 * 10 requests per hour per authenticated user (or IP fallback).
 *
 * BUG #16 fix: previously keyed on `req.user?.id` which is undefined
 * (User docs use `_id`, and the cached user is a plain `.lean()` object
 * with no `id` virtual). The fallback to `req.ip` meant users behind a
 * shared NAT all shared the same export bucket — one abusive user
 * blocked legitimate exports for everyone on the same egress.
 */
const exportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  keyGenerator: (req) => userOrIpKey(req),
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  message: { success: false, message: 'Export rate limit reached. Please wait before exporting again.' },
  validate: validateOpts,
});

/**
 * reconcileLimiter — protect the cron/reconcile endpoint from abuse.
 * Reconciliation runs DB-wide aggregations; limit to 10 per hour per IP.
 */
const reconcileLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  keyGenerator: (req) => ipKeyGenerator(req),
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  message: { success: false, message: 'Reconciliation rate limit reached.' },
  validate: validateOpts,
});

/**
 * mfaVerifyLimiter — dedicated limiter for POST /auth/mfa/verify.
 *
 * Keys on the userId embedded inside the `mfaPendingToken` JWT body field,
 * falling back to IP if the token is absent or unparseable. This correctly
 * throttles per-user even when multiple users share the same IP (office NAT),
 * and closes the P2 degradation bug where `loginLimiter` was keyed on
 * `req.body.empCode` — a field that /mfa/verify doesn't send.
 *
 * We only jwt.decode() (no signature verification) here: the limiter fires
 * BEFORE the route handler, and we only need the userId for bucketing.
 * Full verification still happens inside verifyMfaLogin().
 *
 * 5 failed attempts per 15 minutes per user (mirrors loginLimiter).
 */
const mfaVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  message: {
    success: false,
    message: 'Too many MFA attempts. Please try again in 15 minutes.',
  },
  validate: validateOpts,
  keyGenerator: (req) => {
    try {
      // P3 fix: token is now an HttpOnly cookie, not a body field.
      const raw = req.cookies?.[MFA_PENDING_COOKIE];
      if (raw) {
        const payload = jwt.decode(raw);
        if (payload?.id) return `mfa|${payload.id}`;
      }
    } catch (_) { /* fall through to IP */ }
    return `mfa|${ipKeyGenerator(req)}`;
  },
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
  mfaVerifyLimiter,
  forgotPasswordLimiter,
  exportLimiter,
  reconcileLimiter,
};
