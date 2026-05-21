/**
 * CSRF Protection — Double-Submit Cookie Pattern
 *
 * GET  /api/auth/csrf  → generates a random token, sets it as a readable
 *                         (non-HttpOnly) cookie so the SPA can read it.
 * All state-changing requests (POST/PUT/PATCH/DELETE) under /api/ must
 * include the same token in the X-CSRF-Token header.
 *
 * Exempt routes:
 *   - /api/cron/*  (uses CRON_TOKEN bearer auth instead)
 *   - GET / HEAD / OPTIONS (read-only, safe methods)
 */
const crypto = require('crypto');
const logger = require('../lib/logger');

const CSRF_COOKIE = 'csrf-token';
const CSRF_HEADER = 'x-csrf-token';
const TOKEN_BYTES = 32;
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
// NOTE: This middleware is mounted at app.use('/api', ...) so req.path is
// relative to /api. Use paths WITHOUT the /api prefix here.
const EXEMPT_PREFIXES = ['/cron/'];

/**
 * Generates a cryptographically random hex token.
 */
function generateToken() {
  return crypto.randomBytes(TOKEN_BYTES).toString('hex');
}

/**
 * Express middleware that enforces the double-submit cookie pattern.
 * - Sets a csrf-token cookie on every response that doesn't already have one.
 * - Rejects state-changing requests where the X-CSRF-Token header doesn't
 *   match the csrf-token cookie.
 */
const csrfProtection = (req, res, next) => {
  // Always refresh / set the cookie so new sessions get a token immediately.
  let token = req.cookies[CSRF_COOKIE];
  if (!token) {
    token = generateToken();
    res.cookie(CSRF_COOKIE, token, {
      httpOnly: false,      // Must be readable by JS so the SPA can send it
      sameSite: 'strict',   // Still protected from third-party requests
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000, // 24 h
    });
  }

  // Safe methods don't need verification.
  if (SAFE_METHODS.has(req.method)) return next();

  // Exempt specific routes (cron endpoints use their own token auth).
  if (EXEMPT_PREFIXES.some((prefix) => req.path.startsWith(prefix))) {
    return next();
  }

  // Verify header matches cookie.
  const headerToken = req.headers[CSRF_HEADER];
  if (!headerToken || headerToken !== token) {
    logger.warn(
      { ip: req.ip, method: req.method, path: req.originalUrl },
      'CSRF token mismatch'
    );
    return res.status(403).json({
      success: false,
      message: 'CSRF token invalid or missing',
    });
  }

  next();
};

/**
 * GET /api/auth/csrf
 * Endpoint the SPA hits on app boot to obtain (or refresh) its CSRF token.
 * The token is also set as a cookie by csrfProtection middleware, so this
 * endpoint mainly exists so the SPA can confirm the token is in place.
 */
const getCsrfToken = (req, res) => {
  // Token was already set by csrfProtection middleware above.
  // Return it in the body so the client can also store it in memory.
  const token = req.cookies[CSRF_COOKIE] || (() => {
    const t = generateToken();
    res.cookie(CSRF_COOKIE, t, {
      httpOnly: false,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000,
    });
    return t;
  })();
  res.json({ success: true, data: { csrfToken: token } });
};

/**
 * Force-rotate the CSRF cookie. Call this after any session boundary —
 * login success, MFA second-leg success, and logout — so the pre-login
 * CSRF token cannot be reused in the new (or cleared) session.
 *
 * The SPA must read the new cookie value and update its in-memory copy.
 * It can do this either by listening to Set-Cookie on the login response,
 * or by calling GET /api/auth/csrf immediately after login/logout.
 *
 * @param {import('express').Response} res
 * @returns {string} The new token (also set as a cookie on `res`)
 */
const rotateCsrfToken = (res) => {
  const token = generateToken();
  res.cookie(CSRF_COOKIE, token, {
    httpOnly: false,      // Readable by JS — required for double-submit pattern
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000,
  });
  return token;
};

module.exports = { csrfProtection, getCsrfToken, rotateCsrfToken };
