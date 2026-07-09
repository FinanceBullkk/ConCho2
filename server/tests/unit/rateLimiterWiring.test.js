/**
 * QA-011 (audit round 6): rate-limit WIRING inventory.
 *
 * Every limiter in middleware/rateLimiters.js is disabled in the test env
 * (`skip: skipInTest`), so no behavioral test can ever catch an unmounted or
 * re-budgeted limiter — the one mandatory security layer with no gate.
 *
 * This suite closes that hole structurally: express-rate-limit is mocked so
 * each limiter middleware carries its config (`_rlOpts`); we then walk the
 * real routers' stacks and assert each security-critical route still mounts
 * a limiter with the expected {windowMs, max} budget. Removing a limiter
 * from a route, or silently changing its budget, fails here.
 *
 * The two GLOBAL limiters (globalLimiter / globalWriteLimiter) are mounted in
 * server.js (boot file — requiring it would connect to Mongo), so they are
 * covered by asserting their exported configs instead of their mount.
 */

// Must be declared before anything that pulls middleware/rateLimiters.
jest.mock('express-rate-limit', () => {
  const actual = jest.requireActual('express-rate-limit');
  const mockRateLimit = (opts = {}) => {
    const mw = (req, res, next) => next();
    mw._rlOpts = opts; // tag the instance with its config for inspection
    return mw;
  };
  mockRateLimit.rateLimit = mockRateLimit;
  mockRateLimit.default = mockRateLimit;
  // Keep the REAL ipKeyGenerator so keyGenerator unit tests below exercise
  // the genuine IPv6-bucketing helper the production code uses.
  mockRateLimit.ipKeyGenerator = actual.ipKeyGenerator;
  return mockRateLimit;
});

const jwt = require('jsonwebtoken');
const { ipKeyGenerator } = require('express-rate-limit');
const limiters = require('../../middleware/rateLimiters');

// ── helpers ────────────────────────────────────────────────

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

/** All limiter budgets ({windowMs,max}) found on one route's middleware stack. */
function limitersOn(router, method, path) {
  const layer = router.stack.find(
    (l) => l.route && l.route.path === path && l.route.methods[method],
  );
  if (!layer) return null; // route itself is gone — assertions surface this
  return layer.route.stack
    .map((s) => s.handle)
    .filter((h) => h && h._rlOpts)
    .map((h) => ({ windowMs: h._rlOpts.windowMs, max: h._rlOpts.max }));
}

const budget = (windowMs, max) => [{ windowMs, max }];

// ── wiring inventory ───────────────────────────────────────

describe('rate-limiter wiring — auth routes', () => {
  const router = require('../../routes/authRoutes');

  test('POST /login carries loginLimiter (5 / 15 min)', () => {
    expect(limitersOn(router, 'post', '/login')).toEqual(budget(15 * MIN, 5));
  });

  test('PUT /change-password carries changePasswordLimiter (10 / 15 min)', () => {
    expect(limitersOn(router, 'put', '/change-password')).toEqual(budget(15 * MIN, 10));
  });

  test('POST /mfa/verify carries BOTH mfaLimiter (20/15m, IP) and mfaVerifyLimiter (5/15m, per-user)', () => {
    expect(limitersOn(router, 'post', '/mfa/verify')).toEqual([
      { windowMs: 15 * MIN, max: 20 },
      { windowMs: 15 * MIN, max: 5 },
    ]);
  });

  test.each(['/mfa/setup', '/mfa/verify-setup', '/mfa/disable'])(
    'POST %s carries mfaLimiter (20 / 15 min)',
    (path) => {
      expect(limitersOn(router, 'post', path)).toEqual(budget(15 * MIN, 20));
    },
  );

  test.each(['/forgot-password', '/reset-password', '/reset-password/:token'])(
    'POST %s carries forgotPasswordLimiter (5 / 15 min)',
    (path) => {
      expect(limitersOn(router, 'post', path)).toEqual(budget(15 * MIN, 5));
    },
  );
});

describe('rate-limiter wiring — write/abuse surfaces', () => {
  test('booking: POST /book-slot + waitlist join/leave carry bookingLimiter (10 / min)', () => {
    const router = require('../../domains/schedule/routes');
    expect(limitersOn(router, 'post', '/book-slot')).toEqual(budget(MIN, 10));
    expect(limitersOn(router, 'post', '/:id/waitlist')).toEqual(budget(MIN, 10));
    expect(limitersOn(router, 'delete', '/:id/waitlist')).toEqual(budget(MIN, 10));
  });

  test('learning session booking: POST /sessions/book-slot carries bookingLimiter (10 / min)', () => {
    const router = require('../../domains/learning/routes');
    expect(limitersOn(router, 'post', '/sessions/book-slot')).toEqual(budget(MIN, 10));
  });

  test('attendance: POST /:scheduleId carries attendanceLimiter (30 / min)', () => {
    const router = require('../../domains/attendance/routes');
    expect(limitersOn(router, 'post', '/:scheduleId')).toEqual(budget(MIN, 30));
  });

  test('import: POST /users, /classes, /history carry importLimiter (5 / 15 min)', () => {
    const router = require('../../routes/importRoutes');
    for (const path of ['/users', '/classes', '/history']) {
      expect(limitersOn(router, 'post', path)).toEqual(budget(15 * MIN, 5));
    }
  });

  test('export: GET /attendance + /evaluations carry exportLimiter (10 / hour)', () => {
    const router = require('../../routes/exportRoutes');
    expect(limitersOn(router, 'get', '/attendance')).toEqual(budget(HOUR, 10));
    expect(limitersOn(router, 'get', '/evaluations')).toEqual(budget(HOUR, 10));
  });

  test('sync: POST /google-sheets carries syncLimiter (3 / 15 min)', () => {
    const router = require('../../routes/syncRoutes');
    expect(limitersOn(router, 'post', '/google-sheets')).toEqual(budget(15 * MIN, 3));
  });
});

describe('DISABLE_RATE_LIMITS escape hatch (e2e-only)', () => {
  const ORIG = { ...process.env };
  afterEach(() => { process.env = { ...ORIG }; });

  // Re-require rateLimiters with a fresh module registry so the env
  // permutation is read at module-init time, the way production boots.
  const freshSkip = () => {
    let skip;
    jest.isolateModules(() => {
      skip = require('../../middleware/rateLimiters').bookingLimiter._rlOpts.skip;
    });
    return skip;
  };

  test('flag is IGNORED in production — limiters stay armed', () => {
    process.env.NODE_ENV = 'production';
    process.env.DISABLE_RATE_LIMITS = 'true';
    expect(freshSkip()({})).toBe(false);
  });

  test('flag disables limiters outside production (CI e2e server)', () => {
    process.env.NODE_ENV = 'development';
    process.env.DISABLE_RATE_LIMITS = 'true';
    expect(freshSkip()({})).toBe(true);
  });

  test('without the flag, a development server keeps limiters armed', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.DISABLE_RATE_LIMITS;
    expect(freshSkip()({})).toBe(false);
  });
});

describe('rate-limiter configs — global limiters (mounted in server.js)', () => {
  test('globalLimiter is 200 req / min', () => {
    expect(limiters.globalLimiter._rlOpts).toMatchObject({ windowMs: MIN, max: 200 });
  });

  test('globalWriteLimiter is 60 writes / min and skips GET', () => {
    const opts = limiters.globalWriteLimiter._rlOpts;
    expect(opts).toMatchObject({ windowMs: MIN, max: 60 });
    expect(opts.skip({ method: 'GET', path: '/x' })).toBe(true);
  });
});

// ── keyGenerator units (the BUG #16 regression class) ──────

describe('rate-limiter keyGenerators', () => {
  test('loginLimiter keys on IP + normalized empCode (credential-stuffing guard)', () => {
    const keyGen = limiters.loginLimiter._rlOpts.keyGenerator;
    const req = { ip: '203.0.113.7', body: { empCode: '  ab0042 ' } };
    expect(keyGen(req)).toBe(`${ipKeyGenerator(req)}|AB0042`);
    // empCode missing → still keyed (IP-only bucket), never throws
    expect(keyGen({ ip: '203.0.113.7', body: {} })).toBe(`${ipKeyGenerator(req)}|`);
  });

  test('mfaVerifyLimiter keys on userId from the pending-MFA cookie, IP fallback', () => {
    const keyGen = limiters.mfaVerifyLimiter._rlOpts.keyGenerator;
    const token = jwt.sign({ id: 'user-123' }, 'irrelevant-for-decode');
    expect(keyGen({ cookies: { tms_mfa_pending: token }, ip: '203.0.113.7' })).toBe('mfa|user-123');
    const ipReq = { cookies: {}, ip: '203.0.113.7' };
    expect(keyGen(ipReq)).toBe(`mfa|${ipKeyGenerator(ipReq)}`);
    // Garbage cookie → IP fallback, never throws
    expect(keyGen({ cookies: { tms_mfa_pending: 'not-a-jwt' }, ip: '203.0.113.7' }))
      .toBe(`mfa|${ipKeyGenerator(ipReq)}`);
  });

  test('exportLimiter keys on authenticated user id, IP fallback (BUG #16 regression)', () => {
    const keyGen = limiters.exportLimiter._rlOpts.keyGenerator;
    expect(keyGen({ user: { _id: 'u-77' }, ip: '203.0.113.7' })).toBe('u-77');
    const anonReq = { ip: '203.0.113.7' };
    expect(keyGen(anonReq)).toBe(ipKeyGenerator(anonReq));
  });
});
