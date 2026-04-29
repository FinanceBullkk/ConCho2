const rateLimit = require('express-rate-limit');

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
  windowMs: 60 * 1000,   // 1 minute
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many booking requests. Please wait a moment before trying again.',
  },
  validate: { ip: false },
  keyGenerator: (req) => (req.user ? req.user._id.toString() : req.ip),
});

/**
 * Import: max 5 requests per 15 minutes per IP.
 * Normal usage: 1 bulk import per batch session.
 * Low limit because each request can trigger thousands of bcrypt hashes.
 */
const importLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many import requests. Please wait before importing again.',
  },
  validate: { ip: false },
  keyGenerator: (req) => (req.user ? req.user._id.toString() : req.ip),
});

/**
 * Attendance: max 30 requests per minute per IP.
 * Normal usage: teacher submits once per class, maybe a few corrections.
 */
const attendanceLimiter = rateLimit({
  windowMs: 60 * 1000,   // 1 minute
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many attendance submissions. Please slow down.',
  },
  validate: { ip: false },
  keyGenerator: (req) => (req.user ? req.user._id.toString() : req.ip),
});

/**
 * Sync: max 3 requests per 15 minutes per IP.
 * Normal usage: admin triggers sync once after updating the sheet.
 */
const syncLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many sync requests. Please wait before syncing again.',
  },
  validate: { ip: false },
  keyGenerator: (req) => (req.user ? req.user._id.toString() : req.ip),
});

module.exports = {
  bookingLimiter,
  importLimiter,
  attendanceLimiter,
  syncLimiter,
};
