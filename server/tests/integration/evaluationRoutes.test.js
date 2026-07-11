/**
 * ──────────────────────────────────────────────────────────
 * Integration Tests — Evaluation Routes
 * POST   /api/evaluations           (Admin + Teacher)
 * GET    /api/evaluations           (all roles, scoped for Participant)
 * GET    /api/evaluations/:id       (Admin + Teacher)
 * DELETE /api/evaluations/:id       (Admin only)
 * ──────────────────────────────────────────────────────────
 * Key check: SEC-IDOR-01 — Participants see only their own records.
 * ──────────────────────────────────────────────────────────
 */

const request = require('supertest');
const { getApp, getTokens, getSeedData, getCsrfHeaders, teardown } = require('../setup');
const fx = require('../fixtures/pg-fixtures');
// Slice-4 ports write through DB_BACKEND repos — assert on the ACTIVE backend.
const { readActiveRow, countActiveRowsWhere } = require('../pg-test-utils');

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

// Seed an evaluation directly (PG-native) — bypasses upsert quirks.
const seedEval = async ({ classId, userId, overrides = {} }) =>
  fx.createEvaluation({
    classId, userId,
    grammarScore: 7, vocabularyScore: 8, pronunciationScore: 6, fluencyScore: 7,
    teacherComment: 'Solid progress',
    ...overrides,
  });

let evalCounter = 0;
const seedFreshClass = async () => {
  evalCounter += 1;
  return fx.createClass({
    classCode: `EVAL_${Date.now()}_${evalCounter}`,
    courseName: 'Evaluation Test Class',
    totalSessions: 10,
  });
};

// ── POST /api/evaluations ────────────────────────────────

describe('POST /api/evaluations', () => {
  test('Admin can upsert an evaluation (create branch)', async () => {
    const cls = await seedFreshClass();
    const res = await request(app)
      .post('/api/evaluations')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({
        classId: cls._id.toString(),
        userId: seed.member1._id.toString(),
        grammarScore: 8, vocabularyScore: 7, pronunciationScore: 7, fluencyScore: 8,
        teacherComment: 'Good',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.grammarScore).toBe(8);
  });

  test('upsert updates an existing evaluation (update branch)', async () => {
    const cls = await seedFreshClass();
    await seedEval({ classId: cls._id, userId: seed.member1._id });

    const res = await request(app)
      .post('/api/evaluations')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({
        classId: cls._id.toString(),
        userId: seed.member1._id.toString(),
        grammarScore: 10, vocabularyScore: 10, pronunciationScore: 10, fluencyScore: 10,
        teacherComment: 'Updated',
      });

    expect(res.status).toBe(200);
    expect(res.body.data.grammarScore).toBe(10);
    expect(res.body.data.teacherComment).toBe('Updated');

    // Verify only one record (unique index on classId+userId)
    const count = await countActiveRowsWhere('Evaluation', { classId: cls._id, userId: seed.member1._id });
    expect(count).toBe(1);
  });

  test('Teacher can upsert an evaluation', async () => {
    const cls = await seedFreshClass();
    const res = await request(app)
      .post('/api/evaluations')
      .set('Authorization', `Bearer ${tokens.teacher}`)
      .set(csrf)
      .send({
        classId: cls._id.toString(),
        userId: seed.member2._id.toString(),
        grammarScore: 5, vocabularyScore: 5, pronunciationScore: 5, fluencyScore: 5,
      });

    expect(res.status).toBe(200);
  });

  test('Participant cannot upsert (403)', async () => {
    const cls = await seedFreshClass();
    const res = await request(app)
      .post('/api/evaluations')
      .set('Authorization', `Bearer ${tokens.leader}`)
      .set(csrf)
      .send({
        classId: cls._id.toString(),
        userId: seed.member1._id.toString(),
        grammarScore: 5, vocabularyScore: 5, pronunciationScore: 5, fluencyScore: 5,
      });

    expect(res.status).toBe(403);
  });

  test('rejects out-of-range score (>10)', async () => {
    const cls = await seedFreshClass();
    const res = await request(app)
      .post('/api/evaluations')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({
        classId: cls._id.toString(),
        userId: seed.member1._id.toString(),
        grammarScore: 15, vocabularyScore: 8, pronunciationScore: 7, fluencyScore: 7,
      });

    expect([400, 422, 500]).toContain(res.status);
  });

  test('returns 401 without auth', async () => {
    const cls = await seedFreshClass();
    const res = await request(app)
      .post('/api/evaluations')
      .set(csrf)
      .send({
        classId: cls._id.toString(),
        userId: seed.member1._id.toString(),
      });
    expect(res.status).toBe(401);
  });
});

// ── GET /api/evaluations ─────────────────────────────────

describe('GET /api/evaluations', () => {
  test('Admin sees all evaluations', async () => {
    const cls = await seedFreshClass();
    await seedEval({ classId: cls._id, userId: seed.member1._id });
    await seedEval({ classId: cls._id, userId: seed.member2._id });

    const res = await request(app)
      .get(`/api/evaluations?classId=${cls._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(2);
  });

  test('Teacher sees evaluations when classId is supplied', async () => {
    const cls = await seedFreshClass();
    await seedEval({ classId: cls._id, userId: seed.member1._id });
    await seedEval({ classId: cls._id, userId: seed.member2._id });

    const res = await request(app)
      .get(`/api/evaluations?classId=${cls._id}`)
      .set('Authorization', `Bearer ${tokens.teacher}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(2);
  });

  test('BUG #3 fix: Teacher without classId is rejected (400) — prevents org-wide enumeration', async () => {
    const cls = await seedFreshClass();
    await seedEval({ classId: cls._id, userId: seed.member1._id });

    const res = await request(app)
      .get('/api/evaluations')
      .set('Authorization', `Bearer ${tokens.teacher}`);

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/classId/i);
  });

  test('Admin without classId is allowed (sees all)', async () => {
    const cls = await seedFreshClass();
    await seedEval({ classId: cls._id, userId: seed.member1._id });

    const res = await request(app)
      .get('/api/evaluations')
      .set('Authorization', `Bearer ${tokens.admin}`);

    expect(res.status).toBe(200);
  });

  test('BUG #3 fix: upsert records createdBy on first insert', async () => {
    const cls = await seedFreshClass();
    const res = await request(app)
      .post('/api/evaluations')
      .set('Authorization', `Bearer ${tokens.teacher}`)
      .set(csrf)
      .send({
        classId: cls._id.toString(),
        userId: seed.member1._id.toString(),
        grammarScore: 5, vocabularyScore: 5, pronunciationScore: 5, fluencyScore: 5,
      });

    expect(res.status).toBe(200);
    const created = await readActiveRow('Evaluation', res.body.data._id);
    expect(created.createdBy?.toString()).toBe(seed.teacher._id.toString());
  });

  test('BUG #3 fix: createdBy is NOT overwritten on subsequent updates by a different user', async () => {
    const cls = await seedFreshClass();
    // First write by Teacher
    await request(app)
      .post('/api/evaluations')
      .set('Authorization', `Bearer ${tokens.teacher}`)
      .set(csrf)
      .send({
        classId: cls._id.toString(),
        userId: seed.member1._id.toString(),
        grammarScore: 5, vocabularyScore: 5, pronunciationScore: 5, fluencyScore: 5,
      });

    // Update by Admin
    const upd = await request(app)
      .post('/api/evaluations')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({
        classId: cls._id.toString(),
        userId: seed.member1._id.toString(),
        grammarScore: 10, vocabularyScore: 10, pronunciationScore: 10, fluencyScore: 10,
      });

    expect(upd.status).toBe(200);
    const after = await readActiveRow('Evaluation', upd.body.data._id);
    // Original Teacher is preserved as createdBy — Admin update is captured by audit log instead.
    expect(after.createdBy?.toString()).toBe(seed.teacher._id.toString());
    expect(after.grammarScore).toBe(10);
  });

  test('SEC-IDOR-01: Participant only sees own evaluations', async () => {
    const cls = await seedFreshClass();
    // Seed evaluations for the leader (acting Participant) AND member1
    await seedEval({ classId: cls._id, userId: seed.leader._id });
    await seedEval({ classId: cls._id, userId: seed.member1._id });

    const res = await request(app)
      .get(`/api/evaluations?classId=${cls._id}`)
      .set('Authorization', `Bearer ${tokens.leader}`);

    expect(res.status).toBe(200);
    // Even though the query did NOT include userId, the middleware should
    // force userId = current user.id, so only the leader's own record appears.
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].userId._id.toString()).toBe(seed.leader._id.toString());
  });

  test('SEC-IDOR-01: Participant cannot fetch another user\'s evaluations by userId override', async () => {
    const cls = await seedFreshClass();
    await seedEval({ classId: cls._id, userId: seed.leader._id });
    await seedEval({ classId: cls._id, userId: seed.member1._id });

    // Try to query member1's evaluation as leader — middleware overrides userId
    const res = await request(app)
      .get(`/api/evaluations?classId=${cls._id}&userId=${seed.member1._id}`)
      .set('Authorization', `Bearer ${tokens.leader}`);

    expect(res.status).toBe(200);
    expect(res.body.data.every(e => e.userId._id.toString() === seed.leader._id.toString())).toBe(true);
  });

  test('returns 401 without auth', async () => {
    const res = await request(app).get('/api/evaluations');
    expect(res.status).toBe(401);
  });
});

// ── GET /api/evaluations/:id ─────────────────────────────

describe('GET /api/evaluations/:id', () => {
  test('Admin can fetch any evaluation by id', async () => {
    const cls = await seedFreshClass();
    const ev = await seedEval({ classId: cls._id, userId: seed.member1._id });

    const res = await request(app)
      .get(`/api/evaluations/${ev._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`);

    expect(res.status).toBe(200);
    expect(res.body.data._id).toBe(ev._id.toString());
  });

  test('Teacher can fetch any evaluation by id', async () => {
    const cls = await seedFreshClass();
    const ev = await seedEval({ classId: cls._id, userId: seed.member1._id });

    const res = await request(app)
      .get(`/api/evaluations/${ev._id}`)
      .set('Authorization', `Bearer ${tokens.teacher}`);

    expect(res.status).toBe(200);
  });

  test('Participant cannot fetch by id (403 — Admin/Teacher only)', async () => {
    const cls = await seedFreshClass();
    const ev = await seedEval({ classId: cls._id, userId: seed.leader._id });

    const res = await request(app)
      .get(`/api/evaluations/${ev._id}`)
      .set('Authorization', `Bearer ${tokens.leader}`);

    expect(res.status).toBe(403);
  });

  test('returns 404 for unknown id', async () => {
    const fakeId = fx.genId();
    const res = await request(app)
      .get(`/api/evaluations/${fakeId}`)
      .set('Authorization', `Bearer ${tokens.admin}`);
    expect(res.status).toBe(404);
  });
});

// ── DELETE /api/evaluations/:id ──────────────────────────

describe('DELETE /api/evaluations/:id', () => {
  test('Admin can delete an evaluation', async () => {
    const cls = await seedFreshClass();
    const ev = await seedEval({ classId: cls._id, userId: seed.member1._id });

    const res = await request(app)
      .delete(`/api/evaluations/${ev._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // readActiveRow bypasses the soft-delete hook — assert the trash flag
    // (the row persists as recoverable trash; a hook-scoped read hides it).
    const exists = await readActiveRow('Evaluation', ev._id);
    expect(exists.isDeleted).toBe(true);
  });

  test('Teacher cannot delete (403 — Admin only)', async () => {
    const cls = await seedFreshClass();
    const ev = await seedEval({ classId: cls._id, userId: seed.member1._id });

    const res = await request(app)
      .delete(`/api/evaluations/${ev._id}`)
      .set('Authorization', `Bearer ${tokens.teacher}`)
      .set(csrf);

    expect(res.status).toBe(403);
  });

  test('Participant cannot delete (403)', async () => {
    const cls = await seedFreshClass();
    const ev = await seedEval({ classId: cls._id, userId: seed.leader._id });

    const res = await request(app)
      .delete(`/api/evaluations/${ev._id}`)
      .set('Authorization', `Bearer ${tokens.leader}`)
      .set(csrf);

    expect(res.status).toBe(403);
  });

  test('returns 404 for unknown id', async () => {
    const fakeId = fx.genId();
    const res = await request(app)
      .delete(`/api/evaluations/${fakeId}`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf);
    expect(res.status).toBe(404);
  });
});

// ── SEC-014 (audit 2026-06-11): malformed ids → 400, never a CastError 500 ──

describe('SEC-014 — malformed ObjectId answers 400', () => {
  test('GET /api/evaluations/:id with garbage id → 400 (zod param gate)', async () => {
    const res = await request(app)
      .get('/api/evaluations/not-an-object-id')
      .set('Authorization', `Bearer ${tokens.admin}`);
    expect(res.status).toBe(400);
  });

  test('DELETE /api/evaluations/:id with garbage id → 400 (zod param gate)', async () => {
    const res = await request(app)
      .delete('/api/evaluations/not-an-object-id')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf);
    expect(res.status).toBe(400);
  });

  test('GET /api/evaluations?classId=garbage → 400 (handleError CastError branch)', async () => {
    // No zod on this query — the garbage value reaches Mongoose and casts;
    // the new CastError branch must turn that into a 400, not a 500.
    const res = await request(app)
      .get('/api/evaluations?classId=not-an-object-id')
      .set('Authorization', `Bearer ${tokens.admin}`);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/invalid value/i);
  });
});

// ── DATA-014 (audit round 2): delete is SOFT — golden rule for evaluations ──

describe('DATA-014 — evaluation delete is soft + re-upsert revives', () => {
  test('delete hides the row, keeps it recoverable, and re-upsert revives the same slot', async () => {
    const cls = await seedFreshClass();
    const ev = await seedEval({ classId: cls._id, userId: seed.member1._id });

    const del = await request(app)
      .delete(`/api/evaluations/${ev._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`).set(csrf);
    expect(del.status).toBe(200);

    // Hidden from API reads...
    const byId = await request(app)
      .get(`/api/evaluations/${ev._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`);
    expect(byId.status).toBe(404);
    // ...but still in the DB as a recoverable trash row (golden rule).
    const trashed = await readActiveRow('Evaluation', ev._id);
    expect(trashed.isDeleted).toBe(true);

    // Second delete → 404 (the soft-delete hook scopes the flip to live rows).
    const again = await request(app)
      .delete(`/api/evaluations/${ev._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`).set(csrf);
    expect(again.status).toBe(404);

    // Re-evaluating the same (class, user) REVIVES the trashed row in place —
    // no E11000 against the full {classId,userId} unique index.
    const revive = await request(app)
      .post('/api/evaluations')
      .set('Authorization', `Bearer ${tokens.admin}`).set(csrf)
      .send({
        classId: cls._id.toString(),
        userId: seed.member1._id.toString(),
        grammarScore: 9, vocabularyScore: 8, pronunciationScore: 7, fluencyScore: 6,
      });
    expect(revive.status).toBe(200);
    expect(String(revive.body.data._id)).toBe(String(ev._id)); // same logical slot

    const revived = await readActiveRow('Evaluation', ev._id); // hook-visible again
    expect(revived).not.toBeNull();
    expect(revived.isDeleted).toBe(false);
    expect(revived.grammarScore).toBe(9);
  });
});
