/**
 * ──────────────────────────────────────────────────────────
 * Integration Tests — Audit Log Routes
 * GET /api/admin/audit
 * GET /api/admin/audit/entity/:entity/:entityId
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

// ── GET /api/admin/audit ─────────────────────────────────

describe('GET /api/admin/audit', () => {
  test('returns 200 with paginated results for Admin', async () => {
    const res = await request(app)
      .get('/api/admin/audit')
      .set('Authorization', `Bearer ${tokens.admin}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // Paginated response shape
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(typeof res.body.total).toBe('number');
    expect(typeof res.body.page).toBe('number');
    expect(typeof res.body.limit).toBe('number');
  });

  test('returns 403 when called by a Teacher', async () => {
    const res = await request(app)
      .get('/api/admin/audit')
      .set('Authorization', `Bearer ${tokens.teacher}`);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  test('returns 403 when called by a Participant', async () => {
    const res = await request(app)
      .get('/api/admin/audit')
      .set('Authorization', `Bearer ${tokens.leader}`);

    expect(res.status).toBe(403);
  });

  test('returns 401 without authentication', async () => {
    const res = await request(app).get('/api/admin/audit');

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test('accepts entity filter and returns 200', async () => {
    const res = await request(app)
      .get('/api/admin/audit?entity=User&page=1&limit=10')
      .set('Authorization', `Bearer ${tokens.admin}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    // All returned entries (if any) should match the requested entity
    res.body.data.forEach((entry) => {
      expect(entry.entity).toBe('User');
    });
  });

  test('respects page and limit query params', async () => {
    const res = await request(app)
      .get('/api/admin/audit?page=1&limit=5')
      .set('Authorization', `Bearer ${tokens.admin}`);

    expect(res.status).toBe(200);
    // parsePagination reads query strings — page/limit may come back as strings
    expect(Number(res.body.page)).toBe(1);
    expect(Number(res.body.limit)).toBeLessThanOrEqual(5);
    // Returned data should not exceed the requested limit
    expect(res.body.data.length).toBeLessThanOrEqual(5);
  });
});

// ── GET /api/admin/audit/entity/:entity/:entityId ────────

describe('GET /api/admin/audit/entity/:entity/:entityId', () => {
  test('returns 200 with history array for a known entity + id (Admin)', async () => {
    const entityId = seed.admin._id.toString();

    const res = await request(app)
      .get(`/api/admin/audit/entity/User/${entityId}`)
      .set('Authorization', `Bearer ${tokens.admin}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(typeof res.body.count).toBe('number');
    // count must equal data length
    expect(res.body.count).toBe(res.body.data.length);
  });

  test('returns 200 with empty array for an entity that has no log entries', async () => {
    // Use a freshly generated ObjectId that has no audit entries
    const mongoose = require('mongoose');
    const fakeId = new mongoose.Types.ObjectId().toString();

    const res = await request(app)
      .get(`/api/admin/audit/entity/User/${fakeId}`)
      .set('Authorization', `Bearer ${tokens.admin}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual([]);
    expect(res.body.count).toBe(0);
  });

  test('returns 403 when called by a Teacher', async () => {
    const entityId = seed.admin._id.toString();

    const res = await request(app)
      .get(`/api/admin/audit/entity/User/${entityId}`)
      .set('Authorization', `Bearer ${tokens.teacher}`);

    expect(res.status).toBe(403);
  });

  test('returns 401 without authentication', async () => {
    const entityId = seed.admin._id.toString();

    const res = await request(app)
      .get(`/api/admin/audit/entity/User/${entityId}`);

    expect(res.status).toBe(401);
  });
});
