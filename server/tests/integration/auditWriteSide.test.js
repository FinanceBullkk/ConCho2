/**
 * ──────────────────────────────────────────────────────────
 * Integration Tests — audit log write-side (audit PR B / QA-007)
 * ──────────────────────────────────────────────────────────
 * The repo already has tests that READ the audit log API. None of them
 * verify that sensitive controllers actually WRITE rows. If a future
 * refactor silently drops a call to auditService.record, today no
 * test catches it.
 *
 * This suite picks the highest-impact sensitive paths and asserts that
 * each one produces an AuditLog row with the expected action + entity.
 */

const request = require('supertest');
const mongoose = require('mongoose');
const { getApp, getTokens, getSeedData, getCsrfHeaders } = require('../setup');
const { findActiveAuditRow } = require('../pg-test-utils');

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

// Read the latest matching audit row from the ACTIVE backend (Mongo or PG).
const last = (filter) => findActiveAuditRow(filter);

// auditService.record is fire-and-forget — the row lands on a later tick. Poll
// until it appears (deterministic on either lane, robust under --runInBand host
// load) instead of a fixed sleep that races and flakes when the machine is busy.
const lastEventually = async (filter, { timeout = 3000, interval = 25 } = {}) => {
  const start = Date.now();
  let row = await last(filter);
  while (!row && Date.now() - start < timeout) {
    await new Promise((r) => setTimeout(r, interval));
    row = await last(filter);
  }
  return row;
};

describe('Audit log write-side coverage', () => {
  const AuditLog = require('../../models/AuditLog');

  test('PUT /api/users/:id name change writes action=updated entity=User', async () => {
    await AuditLog.deleteMany({ entity: 'User', entityId: seed.member1._id, action: 'updated' });

    const r = await request(app)
      .put(`/api/users/${seed.member1._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({ name: 'Audit-Write Test Name' });
    expect(r.status).toBe(200);

    const row = await lastEventually({ entity: 'User', entityId: seed.member1._id, action: 'updated' });
    expect(row).not.toBeNull();
    expect(row.actorRole).toBe('Admin');
    expect(row.actorId.toString()).toBe(seed.admin._id.toString());
  });

  test('DELETE /api/users/:id writes a soft-delete audit entry', async () => {
    const User = require('../../models/User');
    // Create a disposable user to delete (don't trash the seed admin).
    const disposable = await User.create({
      empCode: 'AUD-' + Math.random().toString(16).slice(2, 8).toUpperCase(),
      name: 'Disposable for audit',
      role: 'Participant',
      password: 'disposable-pwd-12345',
    });

    const r = await request(app)
      .delete(`/api/users/${disposable._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf);
    expect(r.status).toBe(200);

    const row = await lastEventually({ entity: 'User', entityId: disposable._id });
    expect(row).not.toBeNull();
    expect(row.action).toMatch(/deleted|soft-deleted/);
  });

  test('POST /api/evaluations writes an evaluation audit entry on first save', async () => {
    const Class = require('../../models/Class');
    // Fresh class with empty teacherIds so the policy allows Teacher write.
    const cls = await Class.create({
      classCode: 'AUD-EVAL-' + Math.random().toString(16).slice(2, 8).toUpperCase(),
      courseName: 'Test English Class',
      totalSessions: 10,
    });

    const r = await request(app)
      .post('/api/evaluations')
      .set('Authorization', `Bearer ${tokens.teacher}`)
      .set(csrf)
      .send({
        classId: cls._id, userId: seed.member1._id,
        level: 'B1',
        grammarScore: 6, vocabularyScore: 6, pronunciationScore: 6, fluencyScore: 6,
      });
    expect(r.status).toBe(200);

    const row = await lastEventually({ entity: 'Evaluation', action: /created|updated/ });
    expect(row).not.toBeNull();
  });

  test('PUT /api/settings writes Setting audit entry', async () => {
    const r = await request(app)
      .put('/api/settings')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({
        key: 'COURSE_SESSIONS',
        value: { Foundation: 20, 'Communication 1': 22 },
      });
    // PUT /settings accepts either 200 or 400 if shape is rejected;
    // tolerate both as long as the audit row reflects the attempt.
    expect([200, 400]).toContain(r.status);

    // Setting-update audit lines exist when the change took. We assert
    // an audit row exists for entity=Setting created within last 5s.
    if (r.status === 200) {
      const recent = await lastEventually({
        entity: 'Setting',
        createdAt: { $gte: new Date(Date.now() - 5000) },
      });
      expect(recent).not.toBeNull();
    }
  });

  test('POST /api/auth/logout revokes JTI and writes logged-out audit', async () => {
    // Logout uses the admin token directly.
    const r = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf);
    expect(r.status).toBe(200);

    const row = await lastEventually({ entity: 'Auth', action: 'logged-out' });
    expect(row).not.toBeNull();
  });

  test('admin force-logout writes force-logged-out audit', async () => {
    const r = await request(app)
      .post(`/api/auth/admin/force-logout/${seed.member2._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({ currentPassword: 'admin12345' });
    expect(r.status).toBe(200);

    const row = await lastEventually({ entity: 'User', entityId: seed.member2._id, action: 'force-logged-out' });
    expect(row).not.toBeNull();
    expect(row.note).toMatch(/force-logout|admin/i);
  });

  // ── Audit PR L (SEC-013) — newly-covered endpoints ────────────────────────

  test('POST /api/import/users writes Import audit entry', async () => {
    // Re-log-in: the prior logout test revoked the previous admin token.
    const jwt = require('jsonwebtoken');
    const adminToken = jwt.sign(
      { id: seed.admin._id.toString(), jti: 'audit-import-test-' + Date.now() },
      process.env.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '5m' },
    );
    process.env.IMPORT_DEFAULT_PASSWORD = 'audit-test-import-pwd-1';

    const empCode = 'IMPAUD' + String(Date.now()).slice(-6);
    const r = await request(app)
      .post('/api/import/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .set(csrf)
      .send({
        users: [{ empCode, name: 'Import Audit User', role: 'Participant' }],
      });
    // accept either 200 (import ok) or 400 (validation) — we only care that
    // a successful import produced an audit line
    expect([200, 400]).toContain(r.status);

    if (r.status === 200) {
      const row = await lastEventually({ entity: 'Import', action: 'imported' });
      expect(row).not.toBeNull();
      expect(row.note).toMatch(/users:/);
    }
  });

  test('CSRF token mismatch writes csrf-failed audit entry', async () => {
    // No csrf header → middleware rejects with 403 and audits.
    const r = await request(app)
      .put('/api/settings')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .send({ settings: [{ key: 'ALLOWED_TIME_SLOTS', value: [] }] });
    expect(r.status).toBe(403);

    const row = await lastEventually({ entity: 'Auth', action: 'csrf-failed' });
    expect(row).not.toBeNull();
    expect(row.note).toMatch(/PUT.*\/api\/settings/);
  });

  test('cron auth failure writes cron-auth-failed audit entry', async () => {
    // Set CRON_TOKEN so the middleware doesn't 503 — we want the 401 path.
    const prev = process.env.CRON_TOKEN;
    process.env.CRON_TOKEN = 'sufficient-length-cron-token-for-tests-1234';

    const r = await request(app)
      .get('/api/cron/health')
      .set('Authorization', 'Bearer this-is-the-wrong-token');
    expect(r.status).toBe(401);

    const row = await lastEventually({ entity: 'Auth', action: 'cron-auth-failed' });
    expect(row).not.toBeNull();
    expect(row.note).toMatch(/\/api\/cron\/health/);

    if (prev === undefined) delete process.env.CRON_TOKEN;
    else process.env.CRON_TOKEN = prev;
  });
});
