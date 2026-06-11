/**
 * Unit tests for csrfProtection middleware (double-submit cookie pattern).
 *
 * The middleware:
 *   1. Reads/sets the csrf-token cookie.
 *   2. Passes safe methods (GET, HEAD, OPTIONS) without verification.
 *   3. Passes /api/cron/* routes without verification.
 *   4. Rejects state-changing requests where X-CSRF-Token header ≠ cookie.
 *   5. Passes state-changing requests where header === cookie.
 */

// Mock pino logger used inside csrfProtection so tests don't produce log output.
jest.mock('../../lib/logger', () => ({
  warn: jest.fn(),
  info: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

// QA-014: csrfProtection audits mismatches fire-and-forget (AuditLog.save()).
// In a unit test that write outlives the case and fires AFTER the Jest env
// is torn down ("ReferenceError: import after teardown" noise on every full
// run). Mock it out here — the real csrf-failed audit row is asserted in
// tests/integration/auditWriteSide.test.js.
jest.mock('../../services/auditService', () => ({ record: jest.fn() }));

const { csrfProtection, getCsrfToken } = require('../../middleware/csrfProtection');

const CSRF_COOKIE = 'csrf-token';
const CSRF_HEADER = 'x-csrf-token';
const VALID_TOKEN = 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890'; // 64-char hex

function mockReq({ method = 'GET', path = '/api/test', cookies = {}, headers = {} } = {}) {
  return { method, path, originalUrl: path, cookies, headers, ip: '127.0.0.1' };
}

function mockRes() {
  const res = {
    statusCode: 200,
    _cookies: {},
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    cookie(name, value, _opts) { this._cookies[name] = value; },
  };
  return res;
}

// ── Safe HTTP methods ──────────────────────────────────────

describe('csrfProtection — safe methods pass through', () => {
  test('GET passes without CSRF check', () => {
    const req = mockReq({ method: 'GET' });
    const res = mockRes();
    const next = jest.fn();
    csrfProtection(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
  });

  test('HEAD passes without CSRF check', () => {
    const req = mockReq({ method: 'HEAD' });
    const res = mockRes();
    const next = jest.fn();
    csrfProtection(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('OPTIONS passes without CSRF check', () => {
    const req = mockReq({ method: 'OPTIONS' });
    const res = mockRes();
    const next = jest.fn();
    csrfProtection(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});

// ── Exempt routes ─────────────────────────────────────────
// csrfProtection exempts cron routes by checking req.originalUrl
// (full path, never stripped). EXEMPT_PREFIXES = ['/api/cron/'].

describe('csrfProtection — cron routes are exempt', () => {
  test('POST /api/cron/reconcile passes without X-CSRF-Token', () => {
    const req = mockReq({
      method: 'POST',
      path: '/cron/reconcile',         // Express-stripped path (kept for reference)
      cookies: { [CSRF_COOKIE]: VALID_TOKEN },
      headers: {},
    });
    // Override originalUrl to the full path the middleware now checks
    req.originalUrl = '/api/cron/reconcile';
    const res = mockRes();
    const next = jest.fn();
    csrfProtection(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
  });

  test('POST /api/cron/health passes without X-CSRF-Token', () => {
    const req = mockReq({
      method: 'POST',
      path: '/cron/health',
      cookies: { [CSRF_COOKIE]: VALID_TOKEN },
      headers: {},
    });
    req.originalUrl = '/api/cron/health';
    const res = mockRes();
    const next = jest.fn();
    csrfProtection(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});

// ── Missing / mismatched token ────────────────────────────

describe('csrfProtection — POST without valid X-CSRF-Token is rejected', () => {
  test('POST with no X-CSRF-Token header returns 403', () => {
    const req = mockReq({
      method: 'POST',
      path: '/api/users',
      cookies: { [CSRF_COOKIE]: VALID_TOKEN },
      headers: {},
    });
    const res = mockRes();
    const next = jest.fn();
    csrfProtection(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ success: false });
  });

  test('POST with mismatched X-CSRF-Token returns 403', () => {
    const req = mockReq({
      method: 'POST',
      path: '/api/users',
      cookies: { [CSRF_COOKIE]: VALID_TOKEN },
      headers: { [CSRF_HEADER]: 'wrong-token' },
    });
    const res = mockRes();
    const next = jest.fn();
    csrfProtection(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });

  test('PUT with mismatched X-CSRF-Token returns 403', () => {
    const req = mockReq({
      method: 'PUT',
      path: '/api/users/1',
      cookies: { [CSRF_COOKIE]: VALID_TOKEN },
      headers: { [CSRF_HEADER]: 'another-wrong-token' },
    });
    const res = mockRes();
    const next = jest.fn();
    csrfProtection(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });

  test('DELETE with no X-CSRF-Token returns 403', () => {
    const req = mockReq({
      method: 'DELETE',
      path: '/api/users/1',
      cookies: { [CSRF_COOKIE]: VALID_TOKEN },
      headers: {},
    });
    const res = mockRes();
    const next = jest.fn();
    csrfProtection(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });
});

// ── Matching token ────────────────────────────────────────

describe('csrfProtection — POST with matching X-CSRF-Token passes', () => {
  test('POST with header === cookie calls next()', () => {
    const req = mockReq({
      method: 'POST',
      path: '/api/bookings',
      cookies: { [CSRF_COOKIE]: VALID_TOKEN },
      headers: { [CSRF_HEADER]: VALID_TOKEN },
    });
    const res = mockRes();
    const next = jest.fn();
    csrfProtection(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
  });

  test('PATCH with header === cookie calls next()', () => {
    const req = mockReq({
      method: 'PATCH',
      path: '/api/attendance/1',
      cookies: { [CSRF_COOKIE]: VALID_TOKEN },
      headers: { [CSRF_HEADER]: VALID_TOKEN },
    });
    const res = mockRes();
    const next = jest.fn();
    csrfProtection(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});

// ── Cookie is set when absent ─────────────────────────────

describe('csrfProtection — sets cookie when not present', () => {
  test('sets csrf-token cookie when request has no cookie', () => {
    const req = mockReq({ method: 'GET', cookies: {} });
    const res = mockRes();
    const next = jest.fn();
    csrfProtection(req, res, next);
    expect(res._cookies[CSRF_COOKIE]).toBeDefined();
    expect(typeof res._cookies[CSRF_COOKIE]).toBe('string');
    expect(res._cookies[CSRF_COOKIE].length).toBeGreaterThan(0);
  });

  test('does NOT override an existing csrf-token cookie', () => {
    const req = mockReq({
      method: 'GET',
      cookies: { [CSRF_COOKIE]: VALID_TOKEN },
    });
    const res = mockRes();
    const next = jest.fn();
    csrfProtection(req, res, next);
    // res.cookie was not called because the cookie already existed
    expect(res._cookies[CSRF_COOKIE]).toBeUndefined();
  });
});

// ── getCsrfToken endpoint ─────────────────────────────────

describe('getCsrfToken handler', () => {
  test('returns token from existing cookie', () => {
    const req = { cookies: { [CSRF_COOKIE]: VALID_TOKEN } };
    const res = mockRes();
    getCsrfToken(req, res);
    expect(res.body).toEqual({ success: true, data: { csrfToken: VALID_TOKEN } });
  });

  test('generates and sets a new token when cookie is absent', () => {
    const req = { cookies: {} };
    const res = mockRes();
    getCsrfToken(req, res);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.data.csrfToken).toBe('string');
    expect(res.body.data.csrfToken.length).toBeGreaterThan(0);
    // also sets the cookie
    expect(res._cookies[CSRF_COOKIE]).toBe(res.body.data.csrfToken);
  });
});
