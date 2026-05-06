const rateLimit = require('express-rate-limit');

// In test environment, disable rate limiting entirely so test suites
// that make many requests for the same user don't get throttled.
const IS_TEST = process.env.NODE_ENV === 'test';
// Disable rate-limit validation checks:
//   - In test: disable everything (no rate limiting)
//   - In prod: disable ip + default checks to avoid ERR_ERL_KEY_GEN_IPV6
//     (our custom keyGenerators use req.user._id with req.ip as fallback,
//      which is fine behind a reverse proxy like Render/Nginx)
const validateOpts = IS_TEST ? false : { ip: false, default: false };
const skipInTest = () => IS_TEST;

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
  keyGenerator: (req) => (req.user ? req.user._id.toString() : req.ip),
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
  keyGenerator: (req) => (req.user ? req.user._id.toString() : req.ip),
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
  keyGenerator: (req) => (req.user ? req.user._id.toString() : req.ip),
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
  keyGenerator: (req) => (req.user ? req.user._id.toString() : req.ip),
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
  keyGenerator: (req) => (req.user ? req.user._id.toString() : req.ip),
});

module.exports = {
  globalLimiter,
  globalWriteLimiter,
  bookingLimiter,
  importLimiter,
  attendanceLimiter,
  syncLimiter,
};
