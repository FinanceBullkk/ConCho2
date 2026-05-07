const crypto = require('crypto');
const logger = require('../lib/logger');

// ──────────────────────────────────────────────────────────
// Cron Auth Middleware
// ──────────────────────────────────────────────────────────
// External pingers (cron-job.org, EasyCron, GitHub Actions schedules)
// can't carry an admin session cookie, so we authenticate them with a
// shared secret instead. Configure CRON_TOKEN in the server env and
// include it in the pinger as either:
//
//   Header:  Authorization: Bearer <CRON_TOKEN>
//   Header:  X-Cron-Token: <CRON_TOKEN>
//   Query:   ?token=<CRON_TOKEN>   (last resort — leaks in access logs)
//
// Comparison is constant-time to defeat timing attacks. The endpoint
// returns 503 if CRON_TOKEN is unset (refusing to expose itself rather
// than failing open). Requests are logged at info level for audit.
// ──────────────────────────────────────────────────────────

const constantTimeEqual = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
};

const cronAuth = (req, res, next) => {
  const expected = process.env.CRON_TOKEN;
  if (!expected || expected.length < 16) {
    logger.warn('Cron endpoint hit but CRON_TOKEN is unset or too short — refusing');
    return res.status(503).json({
      success: false,
      message: 'Cron endpoint not configured on this server',
    });
  }

  // Pull token from any of the supported channels
  let provided = null;
  const auth = req.headers.authorization;
  if (auth && auth.toLowerCase().startsWith('bearer ')) {
    provided = auth.slice(7).trim();
  } else if (req.headers['x-cron-token']) {
    provided = String(req.headers['x-cron-token']).trim();
  } else if (req.query.token) {
    provided = String(req.query.token).trim();
  }

  if (!provided || !constantTimeEqual(provided, expected)) {
    logger.warn(
      { ip: req.ip, ua: req.headers['user-agent'], path: req.originalUrl },
      'Cron auth failed'
    );
    return res.status(401).json({ success: false, message: 'Invalid cron token' });
  }

  logger.info(
    { ip: req.ip, ua: req.headers['user-agent'], path: req.originalUrl },
    'Cron auth ok'
  );
  next();
};

module.exports = { cronAuth };
