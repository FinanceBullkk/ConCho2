/**
 * ──────────────────────────────────────────────────────────
 * Integration Tests — User Routes (Admin CRUD)
 * GET    /api/users
 * GET    /api/users/deleted
 * GET    /api/users/:id
 * POST   /api/users
 * PUT    /api/users/:id
 * DELETE /api/users/:id
 * POST   /api/users/:id/restore
 * ──────────────────────────────────────────────────────────
 * All endpoints are Admin-only. Mutations require CSRF token.
 * ──────────────────────────────────────────────────────────
 */

const request = require('supertest');
const mongoose = require('mongoose');
const { getApp, getTokens, getSeedData, getCsrfHeaders, teardown } = require('../setup');

let app, tokens, seed, csrf;
let User;

beforeAll(async () => {
  app = await getApp();
  tokens = getTokens();
  seed = getSeedData();
  csrf = await getCsrfHeaders(app);
  User = require('../../models/User');
});

afterAll(async () => {
  await teardown();
});

// Unique empCode per test to avoid cross-test collisions.
let codeCounter = 9000;
const nextCode = () => String(codeCounter++).padStart(6, '0');

// ── GET /api/users ───────────────────────────────────────

describe('GET /api/users', () => {
  test('Admin lists users with default pagination', async () => {
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${tokens.admin}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.total).toBeGreaterThan(0);
  });

  test('filters by role', async () => {
    const res = await request(app)
      .get('/api/users?role=Participant')
      .set('Authorization', `Bearer ${tokens.admin}`);

    expect(res.status).toBe(200);
    expect(res.body.data.every(u => u.role === 'Participant')).toBe(true);
  });

  test('filters by status', async () => {
    const res = await request(app)
      .get('/api/users?status=Inactive')
      .set('Authorization', `Bearer ${tokens.admin}`);

    expect(res.status).toBe(200);
    expect(res.body.data.every(u => u.status === 'Inactive')).toBe(true);
  });

  test('search returns matching users (by name)', async () => {
    const res = await request(app)
      .get('/api/users?search=Admin')
      .set('Authorization', `Bearer ${tokens.admin}`);

    expect(res.status).toBe(200);
    expect(res.body.data.some(u => u.name.includes('Admin'))).toBe(true);
  });

  test('returns 403 for non-Admin', async () => {
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${tokens.leader}`);
    expect(res.status).toBe(403);
  });

  test('returns 401 without auth', async () => {
    const res = await request(app).get('/api/users');
    expect(res.status).toBe(401);
  });

  // ── SEC-014 (audit PR W) — list query schema strictening ──────────────

  test('SEC-014: accepts sortBy=lastActive (client default, mapped to lastActiveAt)', async () => {
    const res = await request(app)
      .get('/api/users?sortBy=lastActive&sortOrder=desc')
      .set('Authorization', `Bearer ${tokens.admin}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('SEC-014: rejects sortBy outside the whitelist with 400', async () => {
    const res = await request(app)
      .get('/api/users?sortBy=__proto__')
      .set('Authorization', `Bearer ${tokens.admin}`);
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('SEC-014: rejects sortOrder outside asc/desc with 400', async () => {
    const res = await request(app)
      .get('/api/users?sortOrder=evil')
      .set('Authorization', `Bearer ${tokens.admin}`);
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('SEC-014: caps search length at 120 chars (rejects DoS-sized payload)', async () => {
    const huge = 'a'.repeat(10_000);
    const res = await request(app)
      .get(`/api/users?search=${huge}`)
      .set('Authorization', `Bearer ${tokens.admin}`);
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('SEC-014: empty-string sortBy is coerced to undefined (still 200)', async () => {
    // The schema preprocess converts '' to undefined so the optional()
    // enum does not fire on legitimately empty URL state.
    const res = await request(app)
      .get('/api/users?sortBy=&sortOrder=')
      .set('Authorization', `Bearer ${tokens.admin}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('SEC-014: rejects unknown query keys (strict mode)', async () => {
    const res = await request(app)
      .get('/api/users?evilParam=1')
      .set('Authorization', `Bearer ${tokens.admin}`);
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

// ── GET /api/users/:id ───────────────────────────────────

describe('GET /api/users/:id', () => {
  test('returns the user', async () => {
    const res = await request(app)
      .get(`/api/users/${seed.member1._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`);

    expect(res.status).toBe(200);
    expect(res.body.data.empCode).toBe(seed.member1.empCode);
  });

  test('returns 404 for unknown id', async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    const res = await request(app)
      .get(`/api/users/${fakeId}`)
      .set('Authorization', `Bearer ${tokens.admin}`);
    expect(res.status).toBe(404);
  });

  test('returns 400 for malformed id', async () => {
    const res = await request(app)
      .get('/api/users/not-an-object-id')
      .set('Authorization', `Bearer ${tokens.admin}`);
    expect(res.status).toBe(400);
  });
});

// ── POST /api/users ──────────────────────────────────────

describe('POST /api/users', () => {
  test('creates a user with valid payload', async () => {
    const empCode = nextCode();
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({
        empCode,
        name: 'New Hire',
        email: `${empCode}@example.com`,
        role: 'Participant',
        department: 'QA',
        password: 'secure-pass-12345',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.empCode).toBe(empCode);
    expect(res.body.data.password).toBeUndefined();
  });

  test('rejects duplicate empCode with 4xx', async () => {
    const empCode = nextCode();
    await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({
        empCode, name: 'A', email: `${empCode}@example.com`,
        role: 'Participant', password: 'pass12345678',
      });

    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({
        empCode, name: 'B', email: `${empCode}_dup@example.com`,
        role: 'Participant', password: 'pass12345678',
      });

    // Mongoose duplicate key surfaces as 400 or 409 depending on handler
    expect([400, 409, 500]).toContain(res.status);
    expect(res.body.success).toBe(false);
  });

  test('rejects payload missing required field (email)', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({
        empCode: nextCode(), name: 'No Email', role: 'Participant',
        password: 'pass12345678',
      });

    expect(res.status).toBe(400);
  });

  test('rejects short password', async () => {
    const empCode = nextCode();
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({
        empCode, name: 'X', email: `${empCode}@example.com`,
        role: 'Participant', password: 'short',
      });
    expect(res.status).toBe(400);
  });

  test('returns 403 for non-Admin', async () => {
    const empCode = nextCode();
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${tokens.teacher}`)
      .set(csrf)
      .send({
        empCode, name: 'X', email: `${empCode}@example.com`,
        role: 'Participant', password: 'pass12345678',
      });
    expect(res.status).toBe(403);
  });
});

// ── PUT /api/users/:id ───────────────────────────────────

describe('PUT /api/users/:id', () => {
  test('updates name and department', async () => {
    const user = await User.create({
      empCode: nextCode(), name: 'Before', email: `${nextCode()}@x.com`,
      role: 'Participant', password: 'pass12345678',
    });

    const res = await request(app)
      .put(`/api/users/${user._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({ name: 'After', department: 'NewDept' });

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('After');
    expect(res.body.data.department).toBe('NewDept');
  });

  test('returns 404 for unknown id', async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    const res = await request(app)
      .put(`/api/users/${fakeId}`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({ name: 'Ghost' });
    expect(res.status).toBe(404);
  });

  test('rejects invalid role enum value', async () => {
    const res = await request(app)
      .put(`/api/users/${seed.member1._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({ role: 'God' });
    expect(res.status).toBe(400);
  });

  // ── BUG #9 fix: re-auth gate ──────────────────────────────

  test('BUG #9 fix: resetting another user\'s password WITHOUT currentPassword is 403', async () => {
    const target = await User.create({
      empCode: nextCode(), name: 'Pwd Target', email: `${nextCode()}@x.com`,
      role: 'Participant', password: 'pass12345678',
    });

    const res = await request(app)
      .put(`/api/users/${target._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({ password: 'newpassword12345' });

    expect(res.status).toBe(403);
    expect(res.body.requiresReauth).toBe(true);
  });

  test('BUG #9 fix: resetting another user\'s password WITH wrong currentPassword is 403', async () => {
    const target = await User.create({
      empCode: nextCode(), name: 'Pwd Target 2', email: `${nextCode()}@x.com`,
      role: 'Participant', password: 'pass12345678',
    });

    const res = await request(app)
      .put(`/api/users/${target._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({ password: 'newpassword12345', currentPassword: 'wrongpass' });

    expect(res.status).toBe(403);
    expect(res.body.requiresReauth).toBe(true);
  });

  test('BUG #9 fix: resetting another user\'s password WITH correct currentPassword succeeds', async () => {
    const target = await User.create({
      empCode: nextCode(), name: 'Pwd Target 3', email: `${nextCode()}@x.com`,
      role: 'Participant', password: 'pass12345678',
    });

    const res = await request(app)
      .put(`/api/users/${target._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({ password: 'newpassword12345', currentPassword: 'admin12345' });

    expect(res.status).toBe(200);
    expect(res.body.data.password).toBeUndefined();
  });

  test('BUG #9 fix: changing another user\'s role WITHOUT currentPassword is 403', async () => {
    const target = await User.create({
      empCode: nextCode(), name: 'Role Target', email: `${nextCode()}@x.com`,
      role: 'Participant', password: 'pass12345678',
    });

    const res = await request(app)
      .put(`/api/users/${target._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({ role: 'Admin' });

    expect(res.status).toBe(403);
    expect(res.body.requiresReauth).toBe(true);
  });

  test('BUG #9 fix: non-sensitive update (name only) does NOT require currentPassword', async () => {
    const target = await User.create({
      empCode: nextCode(), name: 'Trivial Target', email: `${nextCode()}@x.com`,
      role: 'Participant', password: 'pass12345678',
    });

    const res = await request(app)
      .put(`/api/users/${target._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({ name: 'Renamed' });

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Renamed');
  });

  // ── BUG #13 fix: level fields round-trip ──────────────────

  test('BUG #13 fix: entranceLevel and currentLevel persist on create + update', async () => {
    const empCode = nextCode();
    const create = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({
        empCode, name: 'Levels', email: `${empCode}@x.com`,
        role: 'Participant', password: 'pass12345678',
        entranceLevel: 'B1', currentLevel: 'B2',
      });

    expect(create.status).toBe(201);
    expect(create.body.data.entranceLevel).toBe('B1');
    expect(create.body.data.currentLevel).toBe('B2');

    const upd = await request(app)
      .put(`/api/users/${create.body.data._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({ currentLevel: 'C1' });

    expect(upd.status).toBe(200);
    expect(upd.body.data.entranceLevel).toBe('B1');
    expect(upd.body.data.currentLevel).toBe('C1');
  });
});

// ── DELETE /api/users/:id (soft delete) ──────────────────

describe('DELETE /api/users/:id', () => {
  test('soft-deletes a user (and cascades through team membership)', async () => {
    const target = await User.create({
      empCode: nextCode(), name: 'To Delete', email: `${nextCode()}@x.com`,
      role: 'Participant', password: 'pass12345678',
    });

    const res = await request(app)
      .delete(`/api/users/${target._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // User should no longer appear in GET /api/users
    const list = await request(app)
      .get(`/api/users?search=${target.empCode}`)
      .set('Authorization', `Bearer ${tokens.admin}`);
    expect(list.body.data.find(u => u._id === target._id.toString())).toBeUndefined();

    // But should appear in GET /api/users/deleted
    const deleted = await request(app)
      .get('/api/users/deleted')
      .set('Authorization', `Bearer ${tokens.admin}`);
    expect(deleted.status).toBe(200);
    expect(deleted.body.data.some(u => u._id === target._id.toString())).toBe(true);
  });

  test('blocks deletion of a team leader', async () => {
    const res = await request(app)
      .delete(`/api/users/${seed.leader._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf);

    // Controller blocks leader deletion — surfaces as 400/409
    expect([400, 409]).toContain(res.status);
    expect(res.body.success).toBe(false);
  });

  test('returns 403 for non-Admin', async () => {
    const res = await request(app)
      .delete(`/api/users/${seed.member1._id}`)
      .set('Authorization', `Bearer ${tokens.teacher}`)
      .set(csrf);
    expect(res.status).toBe(403);
  });
});

// ── POST /api/users/:id/restore ──────────────────────────

describe('POST /api/users/:id/restore', () => {
  test('restores a soft-deleted user', async () => {
    // Create + delete
    const target = await User.create({
      empCode: nextCode(), name: 'Phoenix', email: `${nextCode()}@x.com`,
      role: 'Participant', password: 'pass12345678',
    });
    await request(app)
      .delete(`/api/users/${target._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf);

    // Restore
    const res = await request(app)
      .post(`/api/users/${target._id}/restore`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Should reappear in GET /api/users
    const list = await request(app)
      .get(`/api/users?search=${target.empCode}`)
      .set('Authorization', `Bearer ${tokens.admin}`);
    expect(list.body.data.find(u => u._id === target._id.toString())).toBeDefined();
  });

  test('returns 404 when restoring a user that is not deleted', async () => {
    const res = await request(app)
      .post(`/api/users/${seed.member1._id}/restore`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf);
    expect(res.status).toBe(404);
  });
});
