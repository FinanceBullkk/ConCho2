/**
 * ──────────────────────────────────────────────────────────
 * Integration Tests — Coordinator authz regression (escalation guard)
 * ──────────────────────────────────────────────────────────
 * Freezes the CURRENT-CORRECT behaviour that a Coordinator CANNOT manage
 * enrollments or classes. These legacy write routes use roleGuard('Admin')
 * and the route-permission matrix documents them Admin-only — BUT the
 * capability layer holds enrollment.manage / cohort.manage for Coordinator.
 * So a future naive roleGuard→requireCapability swap (the deferred "finish
 * authz" item) would SILENTLY grant Coordinator manage rights — a privilege
 * escalation masquerading as hygiene (expert-panel finding, 2026-06-20).
 *
 * This suite is cheap insurance: any such regression fails CI before it ships.
 * Mirrors the Coordinator→403 pattern in officeRoutes.test.js.
 * ──────────────────────────────────────────────────────────
 */

const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { getApp, getTokens, getSeedData, getCsrfHeaders, teardown } = require('../setup');

let app, tokens, csrf, coordinatorToken;

beforeAll(async () => {
  app = await getApp();
  tokens = getTokens();
  getSeedData();
  csrf = await getCsrfHeaders(app);

  // Shared setup seeds Admin/Teacher/Participants only — mint a Coordinator.
  // Unique empCode so the suite is order-independent against the shared DB.
  const User = require('../../models/User');
  const coordinator = await User.create({
    empCode: String(Date.now()).slice(-6),
    name: 'Coordinator Authz Test',
    role: 'Coordinator',
    department: 'HR',
    password: 'coord123456',
  });
  coordinatorToken = jwt.sign(
    { id: coordinator._id.toString() },
    process.env.JWT_SECRET,
    { expiresIn: '1h' },
  );
});

afterAll(async () => {
  await teardown();
});

const asCoordinator = (method, path) =>
  request(app)[method](path).set('Authorization', `Bearer ${coordinatorToken}`).set(csrf);

const fakeId = () => new mongoose.Types.ObjectId().toString();

// roleGuard runs BEFORE validate/handlers, so a fake id + minimal body still
// reaches the 403 (the denial is the role gate, not validation/not-found).

describe('Coordinator cannot manage enrollments (/api/enrollments roleGuard Admin)', () => {
  test('PATCH /bulk-status → 403', async () => {
    const res = await asCoordinator('patch', '/api/enrollments/bulk-status')
      .send({ enrollmentIds: [fakeId()], status: 'Dropped' });
    expect(res.status).toBe(403);
  });

  test('PUT /:id → 403', async () => {
    const res = await asCoordinator('put', `/api/enrollments/${fakeId()}`)
      .send({ status: 'Completed' });
    expect(res.status).toBe(403);
  });

  test('POST /:id/transfer → 403', async () => {
    const res = await asCoordinator('post', `/api/enrollments/${fakeId()}/transfer`)
      .send({ toTeamId: fakeId() });
    expect(res.status).toBe(403);
  });

  test('GET / (list is Admin-only too) → 403', async () => {
    const res = await request(app)
      .get('/api/enrollments')
      .set('Authorization', `Bearer ${coordinatorToken}`);
    expect(res.status).toBe(403);
  });
});

describe('Coordinator cannot manage classes (/api/classes write roleGuard Admin)', () => {
  test('POST / → 403', async () => {
    const res = await asCoordinator('post', '/api/classes')
      .send({ classCode: 'X', courseName: 'Foundation' });
    expect(res.status).toBe(403);
  });

  test('PUT /:id → 403', async () => {
    const res = await asCoordinator('put', `/api/classes/${fakeId()}`)
      .send({ status: 'Completed' });
    expect(res.status).toBe(403);
  });

  test('DELETE /:id → 403', async () => {
    const res = await asCoordinator('delete', `/api/classes/${fakeId()}`);
    expect(res.status).toBe(403);
  });
});

// Sanity: the SAME routes are reachable by Admin (proves each 403 above is the
// role gate, not a broken/unmounted route). Admin may 400/404 on the fake id —
// we only assert it is NOT the 403 role denial.
describe('Admin is NOT blocked by the role gate (control)', () => {
  test('Admin PUT /api/enrollments/:id is not 403', async () => {
    const res = await request(app)
      .put(`/api/enrollments/${fakeId()}`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({ status: 'Completed' });
    expect(res.status).not.toBe(403);
  });

  test('Admin DELETE /api/classes/:id is not 403', async () => {
    const res = await request(app)
      .delete(`/api/classes/${fakeId()}`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf);
    expect(res.status).not.toBe(403);
  });
});
