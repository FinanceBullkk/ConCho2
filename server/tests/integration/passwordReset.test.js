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
