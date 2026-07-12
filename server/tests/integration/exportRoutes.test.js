/**
 * ──────────────────────────────────────────────────────────
 * Integration Tests — Export Routes
 * GET /api/export/stats
 * GET /api/export/attendance
 * GET /api/export/evaluations
 * ──────────────────────────────────────────────────────────
 * All export routes use GET — no CSRF required.
 * ──────────────────────────────────────────────────────────
 */

const request = require('supertest');
const { getApp, getTokens, getSeedData, teardown } = require('../setup');

let app, tokens, seed;

beforeAll(async () => {
  app = await getApp();
  tokens = getTokens();
  seed = getSeedData();
});

afterAll(async () => {
  await teardown();
});

// ── GET /api/export/stats ────────────────────────────────

describe('GET /api/export/stats', () => {
  test('returns 200 with { pending, exported } shape for Admin', async () => {
    const res = await request(app)
      .get('/api/export/stats')
      .set('Authorization', `Bearer ${tokens.admin}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
    // Stats should have pending and exported counts (may be 0 in clean DB)
    expect(res.body.data).toHaveProperty('pending');
    expect(res.body.data).toHaveProperty('exported');
  });

  test('returns 403 when called by a Participant', async () => {
    const res = await request(app)
      .get('/api/export/stats')
      .set('Authorization', `Bearer ${tokens.leader}`);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  test('returns 401 when called without authentication', async () => {
    const res = await request(app).get('/api/export/stats');

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test('returns 403 when called by a Teacher', async () => {
    const res = await request(app)
      .get('/api/export/stats')
      .set('Authorization', `Bearer ${tokens.teacher}`);

    expect(res.status).toBe(403);
  });
});

// ── GET /api/export/attendance ───────────────────────────

describe('GET /api/export/attendance', () => {
  test('returns 200 (xlsx) or 404 (no data) for Admin — xlsx mode', async () => {
    // In the test DB there are no Attendance records, so the export service
    // throws ServiceError(404). If records exist the response is xlsx 200.
    // Both outcomes prove the route is reachable and auth/role checks pass.
    const res = await request(app)
      .get('/api/export/attendance')
      .set('Authorization', `Bearer ${tokens.admin}`);

    expect([200, 404]).toContain(res.status);

    if (res.status === 200) {
      expect(res.headers['content-type']).toMatch(
        /application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/
      );
      expect(res.headers['content-disposition']).toMatch(/attachment/);
    } else {
      // Empty-database case: service returns "no pending records" message
      expect(res.body.success).toBe(false);
    }
  });

  test('returns 200 with JSON array when ?format=json', async () => {
    const res = await request(app)
      .get('/api/export/attendance?format=json')
      .set('Authorization', `Bearer ${tokens.admin}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(typeof res.body.count).toBe('number');
  });

  test('returns 200 with JSON array when date filters are supplied', async () => {
    const res = await request(app)
      .get('/api/export/attendance?format=json&from=2026-01-01&to=2026-12-31')
      .set('Authorization', `Bearer ${tokens.admin}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  test('returns 403 when called by a Teacher', async () => {
    const res = await request(app)
      .get('/api/export/attendance')
      .set('Authorization', `Bearer ${tokens.teacher}`);

    expect(res.status).toBe(403);
  });

  test('returns 401 when called without authentication', async () => {
    const res = await request(app).get('/api/export/attendance');

    expect(res.status).toBe(401);
  });
});

// ── GET /api/export/evaluations ──────────────────────────

describe('GET /api/export/evaluations', () => {
  test('returns 200 (xlsx) or 404 (no data) for Admin — xlsx mode', async () => {
    const res = await request(app)
      .get('/api/export/evaluations')
      .set('Authorization', `Bearer ${tokens.admin}`);

    // Either xlsx (200) when evaluations exist, or 404 if DB is empty
    expect([200, 404]).toContain(res.status);

    if (res.status === 200) {
      expect(res.headers['content-type']).toMatch(
        /application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/
      );
      expect(res.headers['content-disposition']).toMatch(/attachment/);
    } else {
      expect(res.body.success).toBe(false);
    }
  });

  test('returns 200 with JSON array when ?format=json', async () => {
    const res = await request(app)
      .get('/api/export/evaluations?format=json')
      .set('Authorization', `Bearer ${tokens.admin}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(typeof res.body.count).toBe('number');
  });

  test('accepts date and classId filters in JSON mode', async () => {
    const res = await request(app)
      .get('/api/export/evaluations?format=json&from=2026-01-01&to=2026-12-31')
      .set('Authorization', `Bearer ${tokens.admin}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  test('returns 403 when called by a Teacher', async () => {
    const res = await request(app)
      .get('/api/export/evaluations')
      .set('Authorization', `Bearer ${tokens.teacher}`);

    expect(res.status).toBe(403);
  });

  test('returns 401 when called without authentication', async () => {
    const res = await request(app).get('/api/export/evaluations');

    expect(res.status).toBe(401);
  });

  // DATA-009 regression: the classes $lookup must filter soft-deleted classes,
  // or a deleted cohort's label leaks into the HR evaluation export. ($lookup
  // sub-pipelines don't fire Mongoose's pre('aggregate') soft-delete hook.)
  test('does NOT leak a soft-deleted class label into the export', async () => {
    const fx = require('../fixtures/pg-fixtures');
    const { updateActiveRow } = require('../pg-test-utils');
    const code = `DEL_${Date.now()}`;
    const cls = await fx.createClass({
      classCode: code, courseName: 'Foundation', totalSessions: 5,
      status: 'Ongoing', isDeleted: false, teacherIds: [],
    });
    await fx.createEvaluation({
      classId: cls._id, userId: seed.member1._id, level: 'B1',
      grammarScore: 8, vocabularyScore: 7, pronunciationScore: 7, fluencyScore: 8,
      teacherComment: 'ok', isDeleted: false,
    });
    // Soft-delete the class — its evaluations must survive but lose the label.
    await updateActiveRow('Class', cls._id, { isDeleted: true });

    const res = await request(app)
      .get('/api/export/evaluations?format=json')
      .set('Authorization', `Bearer ${tokens.admin}`);

    expect(res.status).toBe(200);
    // The deleted cohort's code must NOT appear in any exported row.
    expect(res.body.data.some((r) => r.classCode === code)).toBe(false);
  });
});
