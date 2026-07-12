/**
 * ──────────────────────────────────────────────────────────
 * Integration Tests — Authentication Flow
 * ──────────────────────────────────────────────────────────
 */

const request = require('supertest');
const { getApp, getTokens, getSeedData, getCsrfHeaders, teardown } = require('../setup');
const { readActiveRow } = require('../pg-test-utils');
const fx = require('../fixtures/pg-fixtures');

let app, tokens, seed, csrf;

beforeAll(async () => {
  app = await getApp();
  tokens = getTokens();
  seed = getSeedData();
  // CSRF double-submit required on login / logout / mfa / change-password.
  csrf = await getCsrfHeaders(app);
});

afterAll(async () => {
  await teardown();
});

// ── Login ────────────────────────────────────────────────

describe('POST /api/auth/login', () => {
  test('succeeds with valid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set(csrf)
      .send({ empCode: '000001', password: 'admin12345' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.role).toBe('Admin');
    expect(res.body.data.user.empCode).toBe('000001');
    // Token is set as HttpOnly cookie only — not in response body (SEC-01)
    expect(res.body.data.token).toBeUndefined();
    expect(res.headers['set-cookie']).toBeDefined();
    expect(res.headers['set-cookie'][0]).toMatch(/tms_token/);
  });

  test('rejects wrong password with 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set(csrf)
      .send({ empCode: '000001', password: 'wrongpassword' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/Invalid credentials/);
  });

  test('rejects non-existent empCode with 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set(csrf)
      .send({ empCode: '999999', password: 'whatever' });

    expect(res.status).toBe(401);
  });

  test('rejects inactive user with 403', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set(csrf)
      .send({ empCode: '000099', password: 'inactive12345' });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/Inactive/);
  });

  test('rejects missing fields', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set(csrf)
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
      .set('Authorization', `Bearer ${tokens.admin}`).set(csrf);

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
      .set('Authorization', `Bearer ${tokens.admin}`).set(csrf);

    expect(res.status).toBe(200);
  });

  test('Participant cannot access admin-only routes (403)', async () => {
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${tokens.leader}`).set(csrf);

    expect(res.status).toBe(403);
  });

  test('Teacher cannot access admin-only routes (403)', async () => {
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${tokens.teacher}`).set(csrf);

    expect(res.status).toBe(403);
  });
});

// ── Forced password change ─────────────────────────────────

describe('Forced password change enforcement', () => {
  test('surfaces mustChangePassword and blocks non-auth routes until password is changed', async () => {
    const jwt = require('jsonwebtoken');

    const forced = await fx.createUser({
      empCode: `9${Date.now().toString().slice(-5)}`,
      name: 'Forced Change Admin',
      role: 'Admin',
      department: 'Security',
      password: 'temporary12345',
      mustChangePassword: true,
    });
    const forcedToken = jwt.sign({ id: forced._id.toString() }, process.env.JWT_SECRET, { expiresIn: '1h' });

    const me = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${forcedToken}`);

    expect(me.status).toBe(200);
    expect(me.body.data.mustChangePassword).toBe(true);

    const blocked = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${forcedToken}`);

    expect(blocked.status).toBe(403);
    expect(blocked.body.mustChangePassword).toBe(true);

    const changed = await request(app)
      .put('/api/auth/change-password')
      .set('Authorization', `Bearer ${forcedToken}`)
      .set(csrf)
      .send({ currentPassword: 'temporary12345', newPassword: 'rotated12345' });

    expect(changed.status).toBe(200);

    // The password change persists through the ported auth repo (PG-only on
    // the pg lane), so read the active backend, not Mongoose.
    const after = await readActiveRow('User', forced._id);
    expect(after.mustChangePassword).toBe(false);
  });
});
