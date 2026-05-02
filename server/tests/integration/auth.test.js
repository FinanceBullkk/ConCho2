/**
 * ──────────────────────────────────────────────────────────
 * Integration Tests — Authentication Flow
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

// ── Login ────────────────────────────────────────────────

describe('POST /api/auth/login', () => {
  test('succeeds with valid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ empCode: '000001', password: 'admin12345' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeTruthy();
    expect(res.body.data.user.role).toBe('Admin');
    expect(res.body.data.user.empCode).toBe('000001');
    // Should set HttpOnly cookie
    expect(res.headers['set-cookie']).toBeDefined();
    expect(res.headers['set-cookie'][0]).toMatch(/tms_token/);
  });

  test('rejects wrong password with 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ empCode: '000001', password: 'wrongpassword' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/Invalid credentials/);
  });

  test('rejects non-existent empCode with 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ empCode: '999999', password: 'whatever' });

    expect(res.status).toBe(401);
  });

  test('rejects inactive user with 403', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ empCode: '000099', password: 'inactive12345' });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/Inactive/);
  });

  test('rejects missing fields', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({});

    expect(res.status).toBe(400);
  });
});

// ── Protected Routes ─────────────────────────────────────

describe('Protected Route Access', () => {
  test('rejects unauthenticated request with 401', async () => {
    const res = await request(app).get('/api/users');
    expect(res.status).toBe(401);
  });

  test('accepts valid Bearer token', async () => {
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${tokens.admin}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('rejects invalid token with 401', async () => {
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', 'Bearer invalid.token.here');

    expect(res.status).toBe(401);
  });
});

// ── Role-based Access ────────────────────────────────────

describe('Role-based Access Control', () => {
  test('Admin can access admin-only routes', async () => {
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${tokens.admin}`);

    expect(res.status).toBe(200);
  });

  test('Participant cannot access admin-only routes (403)', async () => {
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${tokens.leader}`);

    expect(res.status).toBe(403);
  });

  test('Teacher cannot access admin-only routes (403)', async () => {
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${tokens.teacher}`);

    expect(res.status).toBe(403);
  });
});
