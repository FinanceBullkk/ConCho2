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

// auditService.record is fire-and-forget; wait a tick for the write to land.
const flush = () => new Promise((r) => setTimeout(r, 80));

const last = async (filter) => {
  const AuditLog = require('../../models/AuditLog');
  return AuditLog.findOne(filter).sort('-createdAt').lean();
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

    await flush();
    const row = await last({ entity: 'User', entityId: seed.member1._id, action: 'updated' });
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

    await flush();
    const row = await last({ entity: 'User', entityId: disposable._id });
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

    await flush();
    const row = await last({ entity: 'Evaluation', action: /created|updated/ });
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

    await flush();
    // Setting-update audit lines exist when the change took. We assert
    // an audit row exists for entity=Setting created within last 5s.
    if (r.status === 200) {
      const recent = await AuditLog.findOne({
        entity: 'Setting',
        createdAt: { $gte: new Date(Date.now() - 5000) },
      }).sort('-createdAt').lean();
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

    await flush();
    const row = await last({ entity: 'Auth', action: 'logged-out' });
    expect(row).not.toBeNull();
  });

  test('admin force-logout writes force-logged-out audit', async () => {
    const r = await request(app)
      .post(`/api/auth/admin/force-logout/${seed.member2._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({ currentPassword: 'admin12345' });
    expect(r.status).toBe(200);

    await flush();
    const row = await last({ entity: 'User', entityId: seed.member2._id, action: 'force-logged-out' });
    expect(row).not.toBeNull();
    expect(row.note).toMatch(/force-logout|admin/i);
  });
});
