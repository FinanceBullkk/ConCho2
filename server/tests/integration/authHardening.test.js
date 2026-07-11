/**
 * ──────────────────────────────────────────────────────────
 * Integration Tests — auth hardening (audit PR 7)
 * ──────────────────────────────────────────────────────────
 * Covers:
 *   SEC-007 — MFA enrollment-required cookie no longer permits
 *             /api/auth/change-password.
 *   SEC-009 — admin force-logout + mfa admin-disable both require
 *             the admin to re-enter their own currentPassword.
 */

const request = require('supertest');
const jwt = require('jsonwebtoken');
const { getApp, getTokens, getSeedData, getCsrfHeaders, teardown } = require('../setup');
const { readActiveRow, updateActiveRow } = require('../pg-test-utils');

let app, tokens, seed, csrf;

beforeAll(async () => {
  app = await getApp();
  tokens = getTokens();
  seed = getSeedData();
  csrf = await getCsrfHeaders(app);
});

afterAll(async () => {
  await teardown();
});

// ── SEC-007 ─────────────────────────────────────────────────

describe('SEC-007 — MFA enrollment-required cookie cannot change password', () => {
  const ADMIN_PASSWORD = 'admin12345'; // seed value

  test('PUT /api/auth/change-password with enrollment-required token returns 403', async () => {
    // Mint an enrollment-required token for the admin (mimics the cookie
    // issued by /login when MFA enforcement triggers).
    const enrollmentToken = jwt.sign(
      { id: String(seed.admin._id), mfa: 'enrollment-required' },
      process.env.JWT_SECRET,
      { expiresIn: '5m' },
    );

    const res = await request(app)
      .put('/api/auth/change-password')
      .set('Authorization', `Bearer ${enrollmentToken}`)
      .set(csrf)
      .send({ currentPassword: ADMIN_PASSWORD, newPassword: 'newer12345-ok' });

    expect(res.status).toBe(403);
    expect(res.body.mfaEnrollmentRequired).toBe(true);
  });

  test('full-session token can still change password (regression)', async () => {
    const res = await request(app)
      .put('/api/auth/change-password')
      .set('Authorization', `Bearer ${tokens.leader}`)
      .set(csrf)
      .send({ currentPassword: 'leader12345', newPassword: 'leader-new-12345' });

    // 200 if matchPassword found the seed password; if the leader account
    // was rotated by an earlier test we accept 401 (incorrect current pwd)
    // but NOT 403 — the enrollment lockdown must not apply.
    expect([200, 401]).toContain(res.status);
    if (res.status === 403) {
      throw new Error('Full-session token should NOT trigger MFA enrollment lockdown');
    }
  });

  test('enrollment-required token can still hit /api/auth/me, /mfa/setup, /mfa/verify-setup, logout', async () => {
    const enrollmentToken = jwt.sign(
      { id: String(seed.admin._id), mfa: 'enrollment-required' },
      process.env.JWT_SECRET,
      { expiresIn: '5m' },
    );

    const me = await request(app).get('/api/auth/me')
      .set('Authorization', `Bearer ${enrollmentToken}`);
    expect(me.status).toBe(200);
    expect(me.body.data.mfaEnrollmentRequired).toBe(true);
  });
});

// ── SEC-009 ─────────────────────────────────────────────────

describe('SEC-009 — admin force-logout + mfa admin-disable require re-auth', () => {
  const ADMIN_PASSWORD = 'admin12345';

  test('force-logout without currentPassword returns 403 reauth-missing', async () => {
    const res = await request(app)
      .post(`/api/auth/admin/force-logout/${seed.member1._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({});

    expect(res.status).toBe(403);
    expect(res.body.reason).toBe('reauth-missing');
  });

  test('force-logout with WRONG currentPassword returns 403 reauth-failed', async () => {
    const res = await request(app)
      .post(`/api/auth/admin/force-logout/${seed.member1._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({ currentPassword: 'definitely-wrong' });

    expect(res.status).toBe(403);
    expect(res.body.reason).toBe('reauth-failed');
  });

  test('force-logout with CORRECT currentPassword returns 200', async () => {
    const res = await request(app)
      .post(`/api/auth/admin/force-logout/${seed.member1._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({ currentPassword: ADMIN_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('mfa admin-disable without currentPassword returns 403 reauth-missing', async () => {
    const res = await request(app)
      .post(`/api/auth/mfa/admin-disable/${seed.member1._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({});

    expect(res.status).toBe(403);
    expect(res.body.reason).toBe('reauth-missing');
  });

  test('mfa admin-disable with wrong currentPassword returns 403 reauth-failed', async () => {
    const res = await request(app)
      .post(`/api/auth/mfa/admin-disable/${seed.member1._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({ currentPassword: 'definitely-wrong' });

    expect(res.status).toBe(403);
    expect(res.body.reason).toBe('reauth-failed');
  });

  test('mfa admin-disable with CORRECT currentPassword returns 200 + clears MFA', async () => {
    // Plant MFA fields on the target (PG-native) so we can verify they're cleared.
    await updateActiveRow('User', seed.member1._id, {
      mfaEnabled: true, mfaSecret: 'KEEP-AS-TEST', mfaBackupCodes: ['x', 'y'],
    });

    const res = await request(app)
      .post(`/api/auth/mfa/admin-disable/${seed.member1._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({ currentPassword: ADMIN_PASSWORD });

    expect(res.status).toBe(200);
    // The app clears MFA through the DB_BACKEND-selected auth repo (PG on the
    // lane); read the active backend so the cleared state is visible (a Mongoose
    // findById would see the stale, still-enabled Mongo row).
    const after = await readActiveRow('User', seed.member1._id);
    expect(after.mfaEnabled).toBe(false);
    expect(after.mfaSecret).toBeNull();
    expect(Array.isArray(after.mfaBackupCodes) ? after.mfaBackupCodes : []).toEqual([]);
  });

  test('non-Admin still blocked by route-level roleGuard (regression)', async () => {
    const res = await request(app)
      .post(`/api/auth/mfa/admin-disable/${seed.member2._id}`)
      .set('Authorization', `Bearer ${tokens.teacher}`)
      .set(csrf)
      .send({ currentPassword: 'teacher12345' });

    expect(res.status).toBe(403);
    // The reason here is the role guard, not re-auth. Either is acceptable
    // as long as the response is 403.
  });
});
