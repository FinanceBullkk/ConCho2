/**
 * ──────────────────────────────────────────────────────────
 * Integration Tests — Password Reset Flow
 * POST /api/auth/forgot-password
 * POST /api/auth/reset-password
 * ──────────────────────────────────────────────────────────
 */

// Mock mailer BEFORE any imports so the module cache gets the mock
jest.mock('../../lib/mailer', () => ({
  sendMail: jest.fn().mockResolvedValue({ messageId: 'test-message-id' }),
}));

const request = require('supertest');
const crypto = require('crypto');
const { getApp, getTokens, getSeedData, teardown, getCsrfHeaders } = require('../setup');
const { sendMail } = require('../../lib/mailer');

let app, tokens, seed;

beforeAll(async () => {
  app = await getApp();
  tokens = getTokens();
  seed = getSeedData();
});

afterAll(async () => {
  await teardown();
});

beforeEach(() => {
  jest.clearAllMocks();
});

// ── POST /api/auth/forgot-password ───────────────────────

// BUG #15 fix made forgot-password async — response returns immediately,
// then the token mint + DB save + email send run on the background tick
// via `setImmediate`. Tests must await the queued microtask drain before
// asserting on persisted state and mock invocations.
// The background flow does: User.findOne (1 await) → save (1 await) →
// sendMail mock (1 await) → save again on failure path (1 await).
// 50ms is generous on an in-memory replica set.
const flushBackground = () => new Promise((r) => setTimeout(r, 50));

describe('POST /api/auth/forgot-password', () => {
  test('returns 200 with valid empCode that has an email on file', async () => {
    // Give the admin user an email so the reset path is triggered
    const User = require('../../models/User');
    await User.findByIdAndUpdate(seed.admin._id, { email: 'admin@test.com' });

    const csrf = await getCsrfHeaders(app);
    const res = await request(app)
      .post('/api/auth/forgot-password')
      .set(csrf)
      .send({ empCode: '000001' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toMatch(/If that employee code exists/);

    // Wait for the deferred background work to commit.
    await flushBackground();

    // Token should have been stored on the user
    const user = await User.findById(seed.admin._id);
    expect(user.passwordResetToken).toBeTruthy();
    expect(user.passwordResetExpires).toBeTruthy();

    // Email should have been sent
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'admin@test.com' })
    );
  });

  test('returns 200 (anti-enumeration) for unknown empCode', async () => {
    const csrf = await getCsrfHeaders(app);
    const res = await request(app)
      .post('/api/auth/forgot-password')
      .set(csrf)
      .send({ empCode: '999999' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // Should NOT reveal whether the user exists
    expect(res.body.message).toMatch(/If that employee code exists/);

    // Allow background no-op to settle, then verify sendMail was NOT called.
    await flushBackground();
    expect(sendMail).not.toHaveBeenCalled();
  });

  test('returns 200 (anti-enumeration) for empCode with no email', async () => {
    // teacher user has no email set by default in seed
    const User = require('../../models/User');
    await User.findByIdAndUpdate(seed.teacher._id, { email: null });

    const csrf = await getCsrfHeaders(app);
    const res = await request(app)
      .post('/api/auth/forgot-password')
      .set(csrf)
      .send({ empCode: '000002' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    await flushBackground();
    expect(sendMail).not.toHaveBeenCalled();
  });

  test('returns 400 when body is missing empCode', async () => {
    const csrf = await getCsrfHeaders(app);
    const res = await request(app)
      .post('/api/auth/forgot-password')
      .set(csrf)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('BUG #15 fix: response time for valid vs unknown empCode is similar (anti-enumeration)', async () => {
    // The fix moves all real work to a background tick — the HTTP
    // response should leave the handler in ~constant time regardless of
    // whether the user exists. We don't assert ms-level equality (CI
    // variance), but the spread should be small: under 50ms.
    const csrf = await getCsrfHeaders(app);
    const samples = 3;
    const valid = [];
    const unknown = [];

    for (let i = 0; i < samples; i += 1) {
      const t1 = Date.now();
      await request(app).post('/api/auth/forgot-password').set(csrf).send({ empCode: '000001' });
      valid.push(Date.now() - t1);

      const t2 = Date.now();
      await request(app).post('/api/auth/forgot-password').set(csrf).send({ empCode: '999999' });
      unknown.push(Date.now() - t2);
    }

    const avg = (a) => a.reduce((s, x) => s + x, 0) / a.length;
    const avgValid = avg(valid);
    const avgUnknown = avg(unknown);

    // The CPU-bound work (bcrypt-equivalent) is no longer on the hot path;
    // both branches should be close to wire latency. Allow generous slack
    // for CI: difference < 75ms.
    expect(Math.abs(avgValid - avgUnknown)).toBeLessThan(75);
  });
});

// ── POST /api/auth/reset-password ───────────────────────

describe('POST /api/auth/reset-password', () => {
  // Helper: plant a known token directly on a user (bypasses crypto.randomBytes)
  const plantResetToken = async (userId, { expiredIn } = {}) => {
    const User = require('../../models/User');
    const rawToken = 'test-reset-token-abcdef1234567890abcdef1234567890';
    const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expires = expiredIn
      ? new Date(Date.now() - Math.abs(expiredIn)) // expired in the past
      : new Date(Date.now() + 60 * 60 * 1000);     // valid for 1 hour

    await User.findByIdAndUpdate(userId, {
      passwordResetToken: hashedToken,
      passwordResetExpires: expires,
    });

    return rawToken;
  };

  test('returns 200 and resets password with a valid token', async () => {
    const rawToken = await plantResetToken(seed.leader._id);

    const csrf = await getCsrfHeaders(app);
    const res = await request(app)
      .post('/api/auth/reset-password')
      .set(csrf)
      .send({ token: rawToken, password: 'newpassword123' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toMatch(/Password reset successful/);

    // Token should be cleared from the user document
    const User = require('../../models/User');
    const user = await User.findById(seed.leader._id);
    expect(user.passwordResetToken).toBeNull();
    expect(user.passwordResetExpires).toBeNull();
  });

  test('returns 400 with an invalid (non-existent) token', async () => {
    const csrf = await getCsrfHeaders(app);
    const res = await request(app)
      .post('/api/auth/reset-password')
      .set(csrf)
      .send({ token: 'completely-invalid-token-that-does-not-exist', password: 'newpassword123' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/invalid or has expired/);
  });

  test('returns 400 with an expired token', async () => {
    const rawToken = await plantResetToken(seed.member1._id, { expiredIn: 2 * 60 * 60 * 1000 });

    const csrf = await getCsrfHeaders(app);
    const res = await request(app)
      .post('/api/auth/reset-password')
      .set(csrf)
      .send({ token: rawToken, password: 'newpassword123' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/invalid or has expired/);
  });

  test('returns 400 when new password is too short (under 10 chars)', async () => {
    const rawToken = await plantResetToken(seed.member2._id);

    const csrf = await getCsrfHeaders(app);
    const res = await request(app)
      .post('/api/auth/reset-password')
      .set(csrf)
      .send({ token: rawToken, password: 'short' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/at least 10 characters/);
  });

  test('returns 400 when token or password fields are missing', async () => {
    const csrf = await getCsrfHeaders(app);
    const res = await request(app)
      .post('/api/auth/reset-password')
      .set(csrf)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('token is consumed — second use returns 400', async () => {
    // Use a fresh active user so the save() in resetPassword succeeds cleanly.
    // Re-use member1 (Active, Participant) — no special validators that could
    // interfere with the password save.
    const User = require('../../models/User');

    // Plant a unique token for this sub-test to avoid collisions with other tests
    const rawToken2 = 'second-use-token-abcdef1234567890abcdef1234';
    const hashedToken2 = crypto.createHash('sha256').update(rawToken2).digest('hex');
    await User.findByIdAndUpdate(seed.member1._id, {
      passwordResetToken: hashedToken2,
      passwordResetExpires: new Date(Date.now() + 60 * 60 * 1000),
    });

    const csrf1 = await getCsrfHeaders(app);
    // First use — succeeds
    const first = await request(app)
      .post('/api/auth/reset-password')
      .set(csrf1)
      .send({ token: rawToken2, password: 'newpassword123' });

    expect(first.status).toBe(200);

    const csrf2 = await getCsrfHeaders(app);
    // Second use — same token is now cleared from DB
    const second = await request(app)
      .post('/api/auth/reset-password')
      .set(csrf2)
      .send({ token: rawToken2, password: 'newpassword123' });

    expect(second.status).toBe(400);
    expect(second.body.success).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────
// SEC-005 — token in URL path (not query string)
// ──────────────────────────────────────────────────────────

describe('POST /api/auth/reset-password/:token (SEC-005 path-style)', () => {
  const User = require('../../models/User');

  const plantToken = async (userId, raw) => {
    const hashed = crypto.createHash('sha256').update(raw).digest('hex');
    await User.findByIdAndUpdate(userId, {
      passwordResetToken: hashed,
      passwordResetExpires: new Date(Date.now() + 3600_000),
    });
  };

  test('path-style endpoint accepts token from URL params', async () => {
    const raw = 'sec005-path-token-' + crypto.randomBytes(8).toString('hex');
    await plantToken(seed.member1._id, raw);

    const csrf = await getCsrfHeaders(app);
    const res = await request(app)
      .post(`/api/auth/reset-password/${raw}`)
      .set(csrf)
      .send({ password: 'newpassword12345' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // token consumed
    const after = await User.findById(seed.member1._id);
    expect(after.passwordResetToken).toBeNull();
  });

  test('legacy body-style endpoint still works (backward compat)', async () => {
    const raw = 'sec005-body-token-' + crypto.randomBytes(8).toString('hex');
    await plantToken(seed.member2._id, raw);

    const csrf = await getCsrfHeaders(app);
    const res = await request(app)
      .post('/api/auth/reset-password')
      .set(csrf)
      .send({ token: raw, password: 'newpassword12345' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('forgot-password email URL uses /reset-password/<token> path-style', async () => {
    // Give admin an email + clear any cooldown state left by earlier tests
    // (the 5-min cooldown skips overwrite if a token is already valid).
    await User.findByIdAndUpdate(seed.admin._id, {
      email: 'admin-sec005@test.com',
      passwordResetToken: null,
      passwordResetExpires: null,
    });

    const csrf = await getCsrfHeaders(app);
    const res = await request(app)
      .post('/api/auth/forgot-password')
      .set(csrf)
      .send({ empCode: seed.admin.empCode });

    expect(res.status).toBe(200);
    await flushBackground();
    await flushBackground();

    expect(sendMail).toHaveBeenCalledTimes(1);
    const arg = sendMail.mock.calls[0][0];
    // The link in both text + html must be path-style, not ?token=
    expect(arg.text).toMatch(/\/reset-password\/[a-f0-9]{64}/);
    expect(arg.text).not.toMatch(/\?token=/);
    expect(arg.html).toMatch(/\/reset-password\/[a-f0-9]{64}/);
    expect(arg.html).not.toMatch(/\?token=/);
  });
});

// ──────────────────────────────────────────────────────────
// SEC-008 — log scrub (no raw empCode in info logs)
// ──────────────────────────────────────────────────────────

describe('forgot-password logger scrub (SEC-008)', () => {
  const logger = require('../../lib/logger');
  const User = require('../../models/User');

  let infoSpy;
  let warnSpy;

  beforeEach(() => {
    infoSpy = jest.spyOn(logger, 'info').mockImplementation(() => {});
    warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    infoSpy.mockRestore();
    warnSpy.mockRestore();
  });

  const allLogPayloads = () =>
    [...infoSpy.mock.calls, ...warnSpy.mock.calls].map((c) => c[0] || {});

  test('no logger call records the raw empCode', async () => {
    // Make a known empCode "stand out" so we'd notice if it appears anywhere.
    const distinctive = 'SEC008-XYZ-' + crypto.randomBytes(2).toString('hex').toUpperCase();
    await User.findByIdAndUpdate(seed.member1._id, { empCode: distinctive, email: 'm1@test.com' });

    const csrf = await getCsrfHeaders(app);
    await request(app).post('/api/auth/forgot-password').set(csrf).send({ empCode: distinctive });
    await flushBackground();
    await flushBackground();

    const payloads = allLogPayloads();
    expect(payloads.length).toBeGreaterThan(0);
    for (const p of payloads) {
      const serialised = JSON.stringify(p);
      expect(serialised).not.toMatch(new RegExp(distinctive));
    }
    // And at least one payload should carry the hashed form.
    const hashed = payloads.some((p) => typeof p.empCodeHash === 'string' && p.empCodeHash.length === 12);
    expect(hashed).toBe(true);
  });

  test('found and not-found branches emit IDENTICAL message text', async () => {
    // Found branch
    await User.findByIdAndUpdate(seed.member2._id, { email: 'm2@test.com' });
    const csrf1 = await getCsrfHeaders(app);
    await request(app).post('/api/auth/forgot-password').set(csrf1).send({ empCode: seed.member2.empCode });
    await flushBackground();
    await flushBackground();

    // Not-found branch
    const csrf2 = await getCsrfHeaders(app);
    await request(app).post('/api/auth/forgot-password').set(csrf2).send({ empCode: 'NOPE_SEC008_NOPE' });
    await flushBackground();
    await flushBackground();

    const messages = infoSpy.mock.calls.map((c) => c[1]).filter(Boolean);
    const distinct = Array.from(new Set(messages));
    // All distinct messages should be "Forgot-password: completed background flow"
    expect(distinct).toContain('Forgot-password: completed background flow');
    // The old leaky strings must NOT be in the message list.
    expect(distinct).not.toContain('Forgot-password: no matching user (no-op)');
    expect(distinct).not.toContain('Forgot-password: cooldown active — skipping token overwrite');
    expect(distinct).not.toContain('Password reset email sent');
  });
});

// ──────────────────────────────────────────────────────────
// SEC-016 — DB failures must emit at error severity (audit PR W)
//
// The whole point of this fix is that operators get an Sentry / log-alert
// ping when the background flow silently corrupts state (token saved but
// not delivered, or token-mint save itself failing). The HTTP response
// stays 200 OK either way so the anti-enumeration property is preserved
// — only the log severity changed.
// ──────────────────────────────────────────────────────────

describe('forgot-password DB failure severity (SEC-016)', () => {
  const logger = require('../../lib/logger');
  const User = require('../../models/User');

  let errorSpy;
  let warnSpy;
  let infoSpy;

  beforeEach(() => {
    errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => {});
    warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {});
    infoSpy = jest.spyOn(logger, 'info').mockImplementation(() => {});
  });
  afterEach(() => {
    errorSpy.mockRestore();
    warnSpy.mockRestore();
    infoSpy.mockRestore();
  });

  test('DB lookup failure logs at error severity (caller still gets 200)', async () => {
    // Force the very first User.findOne in the background flow to reject.
    // Any other model lookups outside this request are untouched because we
    // use mockImplementationOnce.
    const findOneSpy = jest.spyOn(User, 'findOne').mockImplementationOnce(() => {
      const err = new Error('simulated mongo network error');
      err.name = 'MongoNetworkError';
      throw err;
    });

    const csrf = await getCsrfHeaders(app);
    const res = await request(app)
      .post('/api/auth/forgot-password')
      .set(csrf)
      .send({ empCode: '000001' });

    // Anti-enumeration: response is still 200 with the same message.
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    await flushBackground();
    await flushBackground();

    // Ops sees an error-severity log, not a warn.
    expect(errorSpy).toHaveBeenCalled();
    const errorMsgs = errorSpy.mock.calls.map((c) => c[1]);
    expect(errorMsgs.some((m) => /DB lookup failed/.test(m))).toBe(true);

    findOneSpy.mockRestore();
  });

  test('token persist failure logs at error severity and aborts BEFORE sendMail', async () => {
    const distinctive = 'SEC016-PERSIST-' + crypto.randomBytes(2).toString('hex').toUpperCase();
    await User.findByIdAndUpdate(seed.member2._id, {
      empCode: distinctive,
      email: 'persist-fail@test.com',
      passwordResetToken: null,
      passwordResetExpires: null,
    });

    // Reject the first save (the token-mint persist). Any later save (none
    // expected, since we should return early) would use the real impl.
    const saveSpy = jest.spyOn(User.prototype, 'save')
      .mockRejectedValueOnce(new Error('simulated write conflict'));

    const csrf = await getCsrfHeaders(app);
    const res = await request(app)
      .post('/api/auth/forgot-password')
      .set(csrf)
      .send({ empCode: distinctive });

    expect(res.status).toBe(200);
    await flushBackground();
    await flushBackground();

    // Error-severity log for the persist failure.
    expect(errorSpy).toHaveBeenCalled();
    const errorMsgs = errorSpy.mock.calls.map((c) => c[1]);
    expect(errorMsgs.some((m) => /token persist failed/.test(m))).toBe(true);

    // Critical: we MUST NOT send a reset email if the token never persisted —
    // the user would receive a link that does not work.
    expect(sendMail).not.toHaveBeenCalled();

    saveSpy.mockRestore();
  });

  test('email-send failure stays at warn severity (retry-able, not data corruption)', async () => {
    const distinctive = 'SEC016-EMAIL-' + crypto.randomBytes(2).toString('hex').toUpperCase();
    await User.findByIdAndUpdate(seed.member1._id, {
      empCode: distinctive,
      email: 'mail-fail@test.com',
      passwordResetToken: null,
      passwordResetExpires: null,
    });

    sendMail.mockRejectedValueOnce(new Error('simulated SMTP outage'));

    const csrf = await getCsrfHeaders(app);
    const res = await request(app)
      .post('/api/auth/forgot-password')
      .set(csrf)
      .send({ empCode: distinctive });

    expect(res.status).toBe(200);
    await flushBackground();
    await flushBackground();

    // Email failure is warn (operationally retry-able, not data corruption).
    expect(warnSpy).toHaveBeenCalled();
    const warnMsgs = warnSpy.mock.calls.map((c) => c[1]);
    expect(warnMsgs.some((m) => /email failed/i.test(m))).toBe(true);

    // And specifically NOT an error log for the DB-side paths — the
    // rollback save succeeded normally.
    const errorMsgs = errorSpy.mock.calls.map((c) => c[1]);
    expect(errorMsgs.some((m) => /token persist failed/.test(m))).toBe(false);
    expect(errorMsgs.some((m) => /DB lookup failed/.test(m))).toBe(false);
  });
});
