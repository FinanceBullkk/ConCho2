/**
 * ──────────────────────────────────────────────────────────
 * Integration Tests — MFA full flow (audit PR B / QA-002)
 * ──────────────────────────────────────────────────────────
 * Covers the entire TOTP + backup-code flow end-to-end:
 *   setup → verify-setup → login (pending) → verify → replay guard →
 *   backup code consume + single-use → admin disable + re-auth gate.
 *
 * Real speakeasy library generates real TOTP codes against the secret
 * the server returns from /mfa/setup, so the assertions exercise the
 * actual production code paths (no mocking of mfaService).
 */

const request = require('supertest');
const speakeasy = require('speakeasy');
const mongoose = require('mongoose');
const { getApp, getTokens, getSeedData, getCsrfHeaders } = require('../setup');

let app, tokens, seed, csrf;

beforeAll(async () => {
  app = await getApp();
  tokens = getTokens();
  seed = getSeedData();
  csrf = await getCsrfHeaders(app);
});

afterAll(async () => {
  await mongoose.disconnect();
});

const ADMIN_PASSWORD = 'admin12345'; // seed value, matches setup.js

// Helper: pull the named cookie value from a supertest response's Set-Cookie.
const cookieValue = (res, name) => {
  const setCookie = res.headers['set-cookie'] || [];
  for (const c of setCookie) {
    const m = c.match(new RegExp(`${name}=([^;]+)`));
    if (m) return m[1];
  }
  return null;
};

// Helper: produce a valid TOTP for a given secret right now.
const totpFor = (base32) => speakeasy.totp({ secret: base32, encoding: 'base32' });

// ──────────────────────────────────────────────────────────

describe('MFA setup → verify-setup', () => {
  const User = require('../../models/User');

  test('POST /mfa/setup returns QR + base32 secret and stores pending secret', async () => {
    const r = await request(app)
      .post('/api/auth/mfa/setup')
      .set('Authorization', `Bearer ${tokens.leader}`)
      .set(csrf);

    expect(r.status).toBe(200);
    expect(r.body.data.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);
    expect(r.body.data.secretBase32).toMatch(/^[A-Z2-7]+$/);

    // Pending secret is now persisted on the user — but mfaEnabled stays false.
    const u = await User.findById(seed.leader._id).select('+mfaPendingSecret mfaEnabled').lean();
    expect(u.mfaPendingSecret).toBe(r.body.data.secretBase32);
    expect(u.mfaEnabled).toBe(false);
  });

  test('POST /mfa/verify-setup with wrong code returns 401 and does NOT enable MFA', async () => {
    const r = await request(app)
      .post('/api/auth/mfa/verify-setup')
      .set('Authorization', `Bearer ${tokens.leader}`)
      .set(csrf)
      .send({ code: '000000' });
    expect(r.status).toBe(401);

    const u = await User.findById(seed.leader._id).lean();
    expect(u.mfaEnabled).toBeFalsy();
  });

  test('POST /mfa/verify-setup with valid code enables MFA and returns backup codes', async () => {
    // Re-fetch the pending secret (the previous test didn't clear it).
    const before = await User.findById(seed.leader._id).select('+mfaPendingSecret').lean();
    expect(before.mfaPendingSecret).toBeTruthy();

    const code = totpFor(before.mfaPendingSecret);

    const r = await request(app)
      .post('/api/auth/mfa/verify-setup')
      .set('Authorization', `Bearer ${tokens.leader}`)
      .set(csrf)
      .send({ code });

    expect(r.status).toBe(200);
    expect(Array.isArray(r.body.data.backupCodes)).toBe(true);
    expect(r.body.data.backupCodes.length).toBeGreaterThanOrEqual(8);

    const after = await User.findById(seed.leader._id).select('+mfaSecret +mfaBackupCodes mfaEnabled').lean();
    expect(after.mfaEnabled).toBe(true);
    expect(after.mfaSecret).toBe(before.mfaPendingSecret);
    expect(after.mfaBackupCodes.length).toBe(r.body.data.backupCodes.length);
  });
});

describe('MFA login flow', () => {
  const User = require('../../models/User');
  let mfaSecret, backupCodes;

  beforeAll(async () => {
    // The previous describe block enabled MFA for seed.leader and returned
    // the backup codes via the response body. We need both for the login
    // tests. Re-pull the secret from DB; backup codes are now bcrypt-hashed
    // so we generate a new set by directly setting them here.
    const mfaService = require('../../services/mfaService');
    const codes = await mfaService.generateBackupCodes();
    backupCodes = codes.plain;
    const u = await User.findById(seed.leader._id).select('+mfaSecret');
    mfaSecret = u.mfaSecret;
    u.mfaBackupCodes = codes.hashed;
    await u.save();
  });

  test('POST /login with MFA-enabled user returns mfaRequired:true and sets pending cookie', async () => {
    const r = await request(app)
      .post('/api/auth/login')
      .set(csrf)
      .send({ empCode: seed.leader.empCode, password: 'leader12345' });

    expect(r.status).toBe(200);
    expect(r.body.data.mfaRequired).toBe(true);
    expect(cookieValue(r, 'tms_mfa_pending')).toBeTruthy();
    // No full-session cookie yet.
    expect(cookieValue(r, 'tms_token')).toBeFalsy();
  });

  test('POST /mfa/verify with valid TOTP returns full session', async () => {
    // Login to get pending cookie
    const login = await request(app)
      .post('/api/auth/login')
      .set(csrf)
      .send({ empCode: seed.leader.empCode, password: 'leader12345' });
    const pending = cookieValue(login, 'tms_mfa_pending');

    const code = totpFor(mfaSecret);
    const r = await request(app)
      .post('/api/auth/mfa/verify')
      .set('Cookie', [`tms_mfa_pending=${pending}`, csrf.Cookie])
      .set('X-CSRF-Token', csrf['X-CSRF-Token'])
      .send({ code });

    expect(r.status).toBe(200);
    expect(r.body.data.user._id).toBe(String(seed.leader._id));
    expect(cookieValue(r, 'tms_token')).toBeTruthy();
  });

  test('POST /mfa/verify with replayed TOTP within the same window returns 401', async () => {
    // The previous test consumed the current 30-s TOTP and bumped
    // mfaLastUsedCounter, so trying it here would always reject as
    // replay. Reset the counter so this test exercises the replay-
    // protection branch on a fresh code.
    await User.updateOne({ _id: seed.leader._id }, { $set: { mfaLastUsedCounter: null } });

    // First verification — should succeed.
    const login1 = await request(app)
      .post('/api/auth/login').set(csrf)
      .send({ empCode: seed.leader.empCode, password: 'leader12345' });
    const pending1 = cookieValue(login1, 'tms_mfa_pending');
    const code = totpFor(mfaSecret);

    const first = await request(app)
      .post('/api/auth/mfa/verify')
      .set('Cookie', [`tms_mfa_pending=${pending1}`, csrf.Cookie])
      .set('X-CSRF-Token', csrf['X-CSRF-Token'])
      .send({ code });
    expect(first.status).toBe(200);

    // Re-login (new pending cookie) but submit the SAME TOTP we just used.
    // verifyTokenWithReplay should reject because mfaLastUsedCounter was bumped.
    const login2 = await request(app)
      .post('/api/auth/login').set(csrf)
      .send({ empCode: seed.leader.empCode, password: 'leader12345' });
    const pending2 = cookieValue(login2, 'tms_mfa_pending');

    const replay = await request(app)
      .post('/api/auth/mfa/verify')
      .set('Cookie', [`tms_mfa_pending=${pending2}`, csrf.Cookie])
      .set('X-CSRF-Token', csrf['X-CSRF-Token'])
      .send({ code });

    expect(replay.status).toBe(401);
    expect(cookieValue(replay, 'tms_token')).toBeFalsy();
  });

  test('POST /mfa/verify with backup code consumes it on first use', async () => {
    const login = await request(app)
      .post('/api/auth/login').set(csrf)
      .send({ empCode: seed.leader.empCode, password: 'leader12345' });
    const pending = cookieValue(login, 'tms_mfa_pending');

    const oneCode = backupCodes[0];
    const r = await request(app)
      .post('/api/auth/mfa/verify')
      .set('Cookie', [`tms_mfa_pending=${pending}`, csrf.Cookie])
      .set('X-CSRF-Token', csrf['X-CSRF-Token'])
      .send({ code: oneCode });

    expect(r.status).toBe(200);
    expect(r.body.data.backupCodeUsed).toBe(true);

    // Backup code count should drop by 1.
    const after = await User.findById(seed.leader._id).select('+mfaBackupCodes').lean();
    expect(after.mfaBackupCodes.length).toBe(backupCodes.length - 1);
  });

  test('POST /mfa/verify with already-consumed backup code returns 401', async () => {
    const login = await request(app)
      .post('/api/auth/login').set(csrf)
      .send({ empCode: seed.leader.empCode, password: 'leader12345' });
    const pending = cookieValue(login, 'tms_mfa_pending');

    // Reuse the same code from the previous test — should be rejected.
    const r = await request(app)
      .post('/api/auth/mfa/verify')
      .set('Cookie', [`tms_mfa_pending=${pending}`, csrf.Cookie])
      .set('X-CSRF-Token', csrf['X-CSRF-Token'])
      .send({ code: backupCodes[0] });

    expect(r.status).toBe(401);
  });
});

describe('MFA admin-disable (re-auth gate from PR 7 / SEC-009)', () => {
  const User = require('../../models/User');

  test('admin can disable MFA with currentPassword; MFA fields are cleared', async () => {
    // Sanity: leader still has MFA enabled from the setup block.
    const before = await User.findById(seed.leader._id).select('+mfaSecret +mfaBackupCodes mfaEnabled').lean();
    expect(before.mfaEnabled).toBe(true);

    const r = await request(app)
      .post(`/api/auth/mfa/admin-disable/${seed.leader._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({ currentPassword: ADMIN_PASSWORD });

    expect(r.status).toBe(200);

    const after = await User.findById(seed.leader._id).select('+mfaSecret +mfaBackupCodes mfaEnabled').lean();
    expect(after.mfaEnabled).toBe(false);
    expect(after.mfaSecret).toBeNull();
    expect((after.mfaBackupCodes ?? []).length).toBe(0);
  });
});
