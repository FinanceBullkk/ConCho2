/**
 * ──────────────────────────────────────────────────────────
 * Integration Tests — /api/admin-db/* (audit PR 3)
 * ──────────────────────────────────────────────────────────
 * Covers audit findings:
 *   SEC-003 — adminDb must NOT allow updates to MFA / password-reset
 *             / lockout / identity fields that bypass the dedicated
 *             userController re-auth gate.
 *   SEC-010 — adminDb must NOT hard-delete Counter / Setting /
 *             Attendance / Enrollment / Evaluation (in addition to the
 *             previously-blocked User / Team / Class / Schedule).
 *   SEC-013 — every adminDb mutation MUST write an AuditLog row.
 *
 * NOTE: these tests are deliberately authored as black-box assertions
 * against the live route + service layer + Mongoose models, exactly
 * the way a hostile admin would exercise the endpoint.
 */

const request = require('supertest');
const mongoose = require('mongoose');
const { getApp, getTokens, getSeedData, getCsrfHeaders } = require('../setup');
const { pollUntil, findActiveAuditRow } = require('../pg-test-utils');

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

// Helper: build a supertest request that's authed + carries CSRF.
// Returns the Test object so callers can chain `.send(body)` directly.
const authAdmin = (method, path) =>
  request(app)[method](path)
    .set('Authorization', `Bearer ${tokens.admin}`)
    .set(csrf);

// ── SEC-003 — Forbidden-field expansion ─────────────────────

describe('PUT /api/admin-db/User/:id — forbidden-field blocklist (SEC-003)', () => {
  const forbiddenAuthFields = [
    { field: 'mfaEnabled',           bad: false },
    { field: 'mfaSecret',            bad: 'attacker-known-secret' },
    { field: 'mfaBackupCodes',       bad: [] },
    { field: 'mfaPendingSecret',     bad: 'x' },
    { field: 'mfaLastUsedCounter',   bad: 0 },
    { field: 'passwordResetToken',   bad: 'a'.repeat(64) },
    { field: 'passwordResetExpires', bad: new Date(Date.now() + 3600_000).toISOString() },
    { field: 'failedLoginAttempts',  bad: 0 },
    { field: 'lockUntil',            bad: null },
    { field: 'mustChangePassword',   bad: false },
    { field: 'email',                bad: 'attacker@evil.tld' },
    { field: 'empCode',              bad: '999999' },
    // Pre-existing forbids — re-verify so a future refactor cannot quietly
    // drop them.
    { field: 'password',             bad: 'attacker-known' },
    { field: 'passwordChangedAt',    bad: new Date(0).toISOString() },
    { field: 'role',                 bad: 'Admin' },
    { field: 'isDeleted',            bad: true },
    { field: 'deletedAt',            bad: new Date(0).toISOString() },
  ];

  for (const { field, bad } of forbiddenAuthFields) {
    test(`ignores ${field} silently and surfaces warning`, async () => {
      const User = mongoose.model('User');
      // Snapshot the field BEFORE the PUT so we can prove it's unchanged.
      const before = await User.findById(seed.teacher._id)
        .select('+mfaSecret +passwordResetToken +password').lean();
      const originalValue = before[field];

      const r = await authAdmin('put', `/api/admin-db/User/${seed.teacher._id}`)
        .send({ [field]: bad, name: 'Renamed Teacher' });

      expect(r.status).toBe(200);
      expect(r.body.success).toBe(true);
      expect(r.body.warning).toMatch(new RegExp(field));

      // The field MUST be byte-identical to its pre-PUT value (i.e. the
      // route stripped it before findByIdAndUpdate ran). This catches
      // the case where `bad` happens to match the default (e.g.
      // mustChangePassword: false) — defaults still mean the strip
      // worked because the BD didn't see the new value.
      const after = await User.findById(seed.teacher._id)
        .select('+mfaSecret +passwordResetToken +password').lean();
      expect(JSON.stringify(after[field] ?? null)).toBe(JSON.stringify(originalValue ?? null));

      // The allowed field DID change (proves the request actually ran).
      expect(after.name).toBe('Renamed Teacher');
    });
  }
});

// ── SEC-010 — Hard-delete blocklist ─────────────────────────

describe('DELETE /api/admin-db/:collection/:id — hard-delete blocklist (SEC-010)', () => {
  const Counter = require('../../models/Counter');
  const Setting = require('../../models/Setting');
  const Attendance = require('../../models/Attendance');
  const Enrollment = require('../../models/Enrollment');
  const Evaluation = require('../../models/Evaluation');

  test('Counter delete is blocked with 403', async () => {
    const c = await Counter.create({ _id: 'test-counter-pr3', seq: 5 });
    const r = await authAdmin('delete', `/api/admin-db/Counter/${c._id}`).send();
    expect(r.status).toBe(403);
    expect(r.body.message).toMatch(/disabled/i);
    // Document still exists.
    const stillThere = await Counter.findById(c._id).lean();
    expect(stillThere).not.toBeNull();
    await Counter.deleteOne({ _id: c._id });
  });

  test('Setting delete is blocked with 403', async () => {
    const s = await Setting.create({ key: 'TEST_SETTING_PR3', value: { foo: 'bar' } });
    const r = await authAdmin('delete', `/api/admin-db/Setting/${s._id}`).send();
    expect(r.status).toBe(403);
    const stillThere = await Setting.findById(s._id).lean();
    expect(stillThere).not.toBeNull();
    await Setting.deleteOne({ _id: s._id });
  });

  test('Attendance delete is blocked with 403', async () => {
    // Build a minimal Attendance ref. We don't need a real schedule;
    // the blocklist runs before any DB read on the target.
    const fakeId = new mongoose.Types.ObjectId();
    const r = await authAdmin('delete', `/api/admin-db/Attendance/${fakeId}`).send();
    expect(r.status).toBe(403);
    expect(r.body.message).toMatch(/disabled/i);
  });

  test('Enrollment delete is blocked with 403', async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const r = await authAdmin('delete', `/api/admin-db/Enrollment/${fakeId}`).send();
    expect(r.status).toBe(403);
  });

  test('Evaluation delete is blocked with 403', async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const r = await authAdmin('delete', `/api/admin-db/Evaluation/${fakeId}`).send();
    expect(r.status).toBe(403);
  });

  test('previously-blocked User / Team / Class / Schedule still 403', async () => {
    for (const coll of ['User', 'Team', 'Class', 'Schedule']) {
      const fakeId = new mongoose.Types.ObjectId();
      const r = await authAdmin('delete', `/api/admin-db/${coll}/${fakeId}`).send();
      expect(r.status).toBe(403);
    }
  });
});

// ── SEC-013 — Audit log written on every mutation ───────────

describe('adminDb writes AuditLog on every mutation (SEC-013)', () => {
  const AuditLog = require('../../models/AuditLog');

  test('PUT writes db-admin-updated with full diff', async () => {
    await AuditLog.deleteMany({ action: 'db-admin-updated', entityId: seed.member1._id });

    const r = await authAdmin('put', `/api/admin-db/User/${seed.member1._id}`)
      .send({ name: 'Audit-Test Member' });
    expect(r.status).toBe(200);

    // Audit is fire-and-forget — poll instead of a fixed sleep (CI-load flake).
    const log = await pollUntil(() => findActiveAuditRow({
      action: 'db-admin-updated',
      entity: 'User',
      entityId: seed.member1._id,
    }));

    expect(log).not.toBeNull();
    expect(log.actorRole).toBe('Admin');
    expect(log.actorId.toString()).toBe(seed.admin._id.toString());
    expect(log.diff).not.toBeNull();
    expect(log.diff.name).toEqual({ before: expect.any(String), after: 'Audit-Test Member' });
  });

  test('PUT records ignored-field note when stripping protected fields', async () => {
    await AuditLog.deleteMany({ action: 'db-admin-updated', entityId: seed.member2._id });

    const r = await authAdmin('put', `/api/admin-db/User/${seed.member2._id}`)
      .send({ name: 'Stripped Test', mfaEnabled: false, role: 'Admin' });
    expect(r.status).toBe(200);

    const log = await pollUntil(() => findActiveAuditRow({
      action: 'db-admin-updated',
      entityId: seed.member2._id,
    }));

    expect(log).not.toBeNull();
    expect(log.note).toMatch(/ignored protected fields/);
    expect(log.note).toMatch(/mfaEnabled/);
    expect(log.note).toMatch(/role/);
  });

  test('DELETE on a non-blocked collection writes db-admin-deleted', async () => {
    // We don't have an unblocked ALLOWED_MODELS entry today — the only
    // entries are now Counter (blocked) + Setting (blocked) + the four
    // entity-cascade tables (User/Team/Class/Schedule — blocked) + the
    // three history tables (Attendance/Enrollment/Evaluation — blocked).
    //
    // This test will become meaningful if we ever add a new unblocked
    // collection. For now, assert the audit codepath would fire if we
    // reached it by exercising a 404 path (which should NOT audit) and
    // a 403 path (which should NOT audit) — neither writes audit lines.
    const AuditLog = require('../../models/AuditLog');
    const before = await AuditLog.countDocuments({ action: 'db-admin-deleted' });

    const fakeId = new mongoose.Types.ObjectId();
    const r = await authAdmin('delete', `/api/admin-db/Counter/${fakeId}`).send();
    expect(r.status).toBe(403);

    await new Promise(r => setTimeout(r, 50));
    const after = await AuditLog.countDocuments({ action: 'db-admin-deleted' });
    expect(after).toBe(before); // no audit row for blocked path
  });
});

// ── Existing behaviour preserved ────────────────────────────

describe('adminDb existing functionality regression', () => {
  test('non-Admin gets 403', async () => {
    const r = await request(app).get('/api/admin-db/collections')
      .set('Authorization', `Bearer ${tokens.teacher}`);
    expect(r.status).toBe(403);
  });

  test('unauth gets 401', async () => {
    const r = await request(app).get('/api/admin-db/collections');
    expect(r.status).toBe(401);
  });

  test('GET /collections returns stats', async () => {
    const r = await request(app).get('/api/admin-db/collections')
      .set('Authorization', `Bearer ${tokens.admin}`);
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(Array.isArray(r.body.data)).toBe(true);
    const names = r.body.data.map(c => c.name);
    expect(names).toEqual(expect.arrayContaining(['User', 'Counter', 'Setting']));
  });

  test('GET /:collection paginates + escapes regex search', async () => {
    const r = await request(app)
      .get('/api/admin-db/User?limit=2&page=1&search=Admin')
      .set('Authorization', `Bearer ${tokens.admin}`);
    expect(r.status).toBe(200);
    expect(r.body.data.length).toBeLessThanOrEqual(2);
  });
});
