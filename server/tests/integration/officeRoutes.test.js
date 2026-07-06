/**
 * ──────────────────────────────────────────────────────────
 * Integration Tests — Offices + Coordinator role (re-center Phase 1)
 *   /api/org/offices               (Admin/Coordinator-managed CRUD)
 *   /api/org/users/:id/assignment  (officeId leg — Admin only)
 *   Coordinator boundary: training-ops yes, user/security no.
 * ──────────────────────────────────────────────────────────
 */

const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { getApp, getTokens, getSeedData, getCsrfHeaders, teardown } = require('../setup');
const { findActiveRowWhere } = require('../pg-test-utils');

let app, tokens, seed, csrf, coordinator, coordinatorToken;

beforeAll(async () => {
  app = await getApp();
  tokens = getTokens();
  seed = getSeedData();
  csrf = await getCsrfHeaders(app);

  // The shared setup seeds Admin/Teacher/Participants only — mint a
  // Coordinator here (re-center Phase 1 role).
  const User = require('../../models/User');
  coordinator = await User.create({
    empCode: '000020', name: 'Coordinator Test', role: 'Coordinator',
    department: 'HR', password: 'coord123456',
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

const as = (token) => (method, path) =>
  request(app)[method](path).set('Authorization', `Bearer ${token}`).set(csrf);

// Audit writes are fire-and-forget — poll briefly instead of a fixed sleep.
// Read from the active backend: audit rows land in PG only on the pg lane.
const waitForAudit = async (filter, tries = 20) => {
  for (let i = 0; i < tries; i += 1) {
    // eslint-disable-next-line no-await-in-loop -- bounded poll for an async fire-and-forget write
    const row = await findActiveRowWhere('AuditLog', filter);
    if (row) return row;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 50));
  }
  return null;
};

// ── Offices CRUD + authz ──────────────────────────────────
describe('Offices CRUD + authz', () => {
  let officeId;

  test('Admin creates an office (201, code uppercased)', async () => {
    const res = await as(tokens.admin)('post', '/api/org/offices')
      .send({ name: 'Ho Chi Minh Office', code: 'hcm', address: 'District 1', timezone: 'Asia/Ho_Chi_Minh' });
    expect(res.status).toBe(201);
    expect(res.body.data.code).toBe('HCM');
    expect(res.body.data.timezone).toBe('Asia/Ho_Chi_Minh');
    officeId = res.body.data._id;
  });

  test('office create is audited (pins the AuditLog entity enum fix)', async () => {
    const row = await waitForAudit({ entity: 'Office', action: 'created' });
    expect(row).not.toBeNull();
    expect(String(row.entityId)).toBe(String(officeId));
  });

  test('duplicate code → 409', async () => {
    const res = await as(tokens.admin)('post', '/api/org/offices').send({ name: 'HCM 2', code: 'hcm' });
    expect(res.status).toBe(409);
  });

  test('Coordinator can create an office (office.manage)', async () => {
    const res = await as(coordinatorToken)('post', '/api/org/offices')
      .send({ name: 'Ha Noi Office', code: 'HN' });
    expect(res.status).toBe(201);
    expect(res.body.data.code).toBe('HN');
  });

  test('Coordinator can update an office', async () => {
    const res = await as(coordinatorToken)('put', `/api/org/offices/${officeId}`)
      .send({ address: 'District 3, HCMC' });
    expect(res.status).toBe(200);
    expect(res.body.data.address).toBe('District 3, HCMC');
  });

  test('Coordinator-performed mutation is audited with actorRole Coordinator', async () => {
    const row = await waitForAudit({ entity: 'Office', action: 'updated', actorRole: 'Coordinator' });
    expect(row).not.toBeNull();
  });

  test('Teacher can list offices (office.read)', async () => {
    const res = await request(app)
      .get('/api/org/offices')
      .set('Authorization', `Bearer ${tokens.teacher}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(2);
  });

  test('Teacher cannot create an office (no office.manage) → 403', async () => {
    const res = await as(tokens.teacher)('post', '/api/org/offices').send({ name: 'Nope', code: 'NOPE' });
    expect(res.status).toBe(403);
  });

  test('Participant cannot list offices (no office.read) → 403', async () => {
    const res = await request(app)
      .get('/api/org/offices')
      .set('Authorization', `Bearer ${tokens.leader}`); // leader is a Participant
    expect(res.status).toBe(403);
  });

  test('archive blocked while a user is assigned (409), allowed after (200)', async () => {
    await as(tokens.admin)('put', `/api/org/users/${seed.member2._id}/assignment`).send({ officeId });
    const blocked = await as(tokens.admin)('delete', `/api/org/offices/${officeId}`);
    expect(blocked.status).toBe(409);

    await as(tokens.admin)('put', `/api/org/users/${seed.member2._id}/assignment`).send({ officeId: null });
    const ok = await as(tokens.admin)('delete', `/api/org/offices/${officeId}`);
    expect(ok.status).toBe(200);
  });

  test('assignment with an unknown office → 422', async () => {
    const res = await as(tokens.admin)('put', `/api/org/users/${seed.member1._id}/assignment`)
      .send({ officeId: new mongoose.Types.ObjectId().toString() });
    expect(res.status).toBe(422);
  });
});

// ── Coordinator boundary — training-ops yes, user/security no ──
describe('Coordinator boundary (no user/security surfaces)', () => {
  test('Coordinator can list departments (department.read)', async () => {
    const res = await request(app)
      .get('/api/org/departments')
      .set('Authorization', `Bearer ${coordinatorToken}`);
    expect(res.status).toBe(200);
  });

  test('Coordinator cannot create a department (department.manage is Admin) → 403', async () => {
    const res = await as(coordinatorToken)('post', '/api/org/departments')
      .send({ name: 'Nope', code: 'NOPE' });
    expect(res.status).toBe(403);
  });

  test('Coordinator cannot place users in the org tree (org.manage) → 403', async () => {
    const res = await as(coordinatorToken)('put', `/api/org/users/${seed.member1._id}/assignment`)
      .send({ officeId: null });
    expect(res.status).toBe(403);
  });

  test('Coordinator cannot list user accounts (legacy roleGuard Admin) → 403', async () => {
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${coordinatorToken}`);
    expect(res.status).toBe(403);
  });

  test('Coordinator cannot read the audit log (Admin-only) → 403', async () => {
    const res = await request(app)
      .get('/api/admin/audit')
      .set('Authorization', `Bearer ${coordinatorToken}`);
    expect(res.status).toBe(403);
  });

  test('Coordinator CAN create a learning program (program.manage)', async () => {
    const res = await as(coordinatorToken)('post', '/api/learning/programs')
      .send({ code: 'COORD_TEST_PROGRAM', name: 'Coordinator Authored Program', category: 'soft_skills' });
    expect(res.status).toBe(201);
  });
});
