/**
 * ──────────────────────────────────────────────────────────
 * Integration Tests — PR E (SEC-006, SEC-011, PERF-002)
 * ──────────────────────────────────────────────────────────
 * Covers:
 *   SEC-006 — production CORS guard rejects no-origin writes on /api/*
 *   SEC-011 — enrollment Zod schemas reject bad inputs at 400
 *   PERF-002 — /dashboard/alerts returns a `cached: true` flag on hit
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

// ── SEC-006 ────────────────────────────────────────────────

describe('SEC-006 — production no-origin guard', () => {
  let originalEnv;
  let originalBypass;

  beforeEach(() => {
    originalEnv = process.env.NODE_ENV;
    originalBypass = process.env.CORS_BYPASS_NO_ORIGIN;
    // Activate the production guard for THIS suite, and remove the
    // global test bypass so we can observe the real behaviour.
    process.env.NODE_ENV = 'production';
    delete process.env.CORS_BYPASS_NO_ORIGIN;
  });
  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    if (originalBypass !== undefined) process.env.CORS_BYPASS_NO_ORIGIN = originalBypass;
  });

  test('POST /api/users without Origin returns 403 in production', async () => {
    const r = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({
        empCode: 'SEC006-' + Math.random().toString(16).slice(2, 8),
        name: 'no-origin test',
        email: 'no-origin@test.com',
        password: 'no-origin-pwd-12345',
      });
    expect(r.status).toBe(403);
    expect(r.body.message).toMatch(/Origin header/i);
  });

  test('GET /api/users without Origin is ALLOWED (safe method, browser nav)', async () => {
    const r = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${tokens.admin}`);
    expect([200, 304]).toContain(r.status);
  });

  test('GET /ready without Origin is ALLOWED (Render probe path)', async () => {
    const r = await request(app).get('/ready');
    expect([200, 503]).toContain(r.status); // Mongo may or may not be ready in test mode
  });

  test('POST /api/users WITH Origin is allowed (real browser)', async () => {
    const r = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set('Origin', 'http://localhost:5173')
      .set(csrf)
      .send({
        empCode: 'SEC006OK-' + Math.random().toString(16).slice(2, 8),
        name: 'origin OK',
        email: 'origin-ok@test.com',
        password: 'origin-ok-pwd-12345',
      });
    expect([201, 400]).toContain(r.status); // 201 normal; 400 if any other validation fails
    expect(r.status).not.toBe(403);
  });
});

// ── SEC-011 ────────────────────────────────────────────────

describe('SEC-011 — enrollment Zod validation', () => {
  test('PATCH /bulk-status with empty enrollmentIds returns 400', async () => {
    const r = await request(app)
      .patch('/api/enrollments/bulk-status')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({ enrollmentIds: [], status: 'Active' });
    expect(r.status).toBe(400);
  });

  test('PATCH /bulk-status with oversize enrollmentIds returns 400', async () => {
    const huge = new Array(201).fill(0)
      .map(() => new mongoose.Types.ObjectId().toString());
    const r = await request(app)
      .patch('/api/enrollments/bulk-status')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({ enrollmentIds: huge, status: 'Active' });
    expect(r.status).toBe(400);
  });

  test('PUT /:id with unknown field returns 400 (strict mode)', async () => {
    const r = await request(app)
      .put(`/api/enrollments/${new mongoose.Types.ObjectId()}`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({ status: 'Active', mongoEvilOp: { $unset: { 'foo': 1 } } });
    expect(r.status).toBe(400);
  });

  test('PUT /:id with invalid status returns 400', async () => {
    const r = await request(app)
      .put(`/api/enrollments/${new mongoose.Types.ObjectId()}`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({ status: 'NotARealStatus' });
    expect(r.status).toBe(400);
  });
});

// ── PERF-002 ───────────────────────────────────────────────

describe('PERF-002 — /dashboard/alerts cache', () => {
  test('first call returns cached:false; second within 30s returns cached:true', async () => {
    const r1 = await request(app)
      .get('/api/dashboard/alerts')
      .set('Authorization', `Bearer ${tokens.admin}`);
    expect(r1.status).toBe(200);
    expect(r1.body.cached).toBe(false);
    expect(r1.body.data.lookbackDays).toBeDefined();

    const r2 = await request(app)
      .get('/api/dashboard/alerts')
      .set('Authorization', `Bearer ${tokens.admin}`);
    expect(r2.status).toBe(200);
    expect(r2.body.cached).toBe(true);
  });
});
