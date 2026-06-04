/**
 * ──────────────────────────────────────────────────────────
 * Integration Tests — Org model (Wave D3)
 *   /api/org/departments        (Admin-managed CRUD)
 *   /api/org/users/:id/assignment (manager + department)
 *   /api/org/my-team            (self-scoped manager dashboard)
 * ──────────────────────────────────────────────────────────
 */

const request = require('supertest');
const mongoose = require('mongoose');
const { getApp, getTokens, getSeedData, getCsrfHeaders, teardown } = require('../setup');

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

const asAdmin = (method, path) =>
  request(app)[method](path).set('Authorization', `Bearer ${tokens.admin}`).set(csrf);

// ── Departments ───────────────────────────────────────────
describe('Departments CRUD + authz', () => {
  let deptId;

  test('Admin creates a department (201)', async () => {
    const res = await asAdmin('post', '/api/org/departments')
      .send({ name: 'Engineering', code: 'eng', description: 'Builds things' });
    expect(res.status).toBe(201);
    expect(res.body.data.code).toBe('ENG'); // uppercased
    deptId = res.body.data._id;
  });

  test('duplicate code → 409', async () => {
    const res = await asAdmin('post', '/api/org/departments').send({ name: 'Eng 2', code: 'eng' });
    expect(res.status).toBe(409);
  });

  test('Teacher can list departments (department.read)', async () => {
    const res = await request(app)
      .get('/api/org/departments')
      .set('Authorization', `Bearer ${tokens.teacher}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  test('Participant cannot list departments (no department.read) → 403', async () => {
    const res = await request(app)
      .get('/api/org/departments')
      .set('Authorization', `Bearer ${tokens.leader}`); // leader is a Participant
    expect(res.status).toBe(403);
  });

  test('Teacher cannot create a department (no department.manage) → 403', async () => {
    const res = await request(app)
      .post('/api/org/departments')
      .set('Authorization', `Bearer ${tokens.teacher}`)
      .set(csrf)
      .send({ name: 'Sales', code: 'sales' });
    expect(res.status).toBe(403);
  });

  test('Admin updates a department (200)', async () => {
    const res = await asAdmin('put', `/api/org/departments/${deptId}`).send({ name: 'Engineering Dept' });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Engineering Dept');
  });

  test('archive blocked while a user is assigned (409), allowed after (200)', async () => {
    // Assign a user to the department first.
    await asAdmin('put', `/api/org/users/${seed.member2._id}/assignment`).send({ departmentId: deptId });
    const blocked = await asAdmin('delete', `/api/org/departments/${deptId}`);
    expect(blocked.status).toBe(409);

    // Clear the assignment, then archive succeeds.
    await asAdmin('put', `/api/org/users/${seed.member2._id}/assignment`).send({ departmentId: null });
    const ok = await asAdmin('delete', `/api/org/departments/${deptId}`);
    expect(ok.status).toBe(200);
  });
});

// ── Assignment guards ─────────────────────────────────────
describe('User assignment guards', () => {
  test('Admin assigns a manager (200) + audits', async () => {
    const res = await asAdmin('put', `/api/org/users/${seed.member1._id}/assignment`)
      .send({ managerId: seed.leader._id.toString() });
    expect(res.status).toBe(200);
    expect(String(res.body.data.managerId)).toBe(seed.leader._id.toString());
  });

  test('self-manager → 422', async () => {
    const res = await asAdmin('put', `/api/org/users/${seed.member1._id}/assignment`)
      .send({ managerId: seed.member1._id.toString() });
    expect(res.status).toBe(422);
  });

  test('cycle → 422', async () => {
    // member1 already reports to leader. Making leader report to member1 closes a cycle.
    const res = await asAdmin('put', `/api/org/users/${seed.leader._id}/assignment`)
      .send({ managerId: seed.member1._id.toString() });
    expect(res.status).toBe(422);
  });

  test('unknown manager → 422', async () => {
    const res = await asAdmin('put', `/api/org/users/${seed.member1._id}/assignment`)
      .send({ managerId: new mongoose.Types.ObjectId().toString() });
    expect(res.status).toBe(422);
  });

  test('non-admin (Teacher) cannot assign → 403', async () => {
    const res = await request(app)
      .put(`/api/org/users/${seed.member1._id}/assignment`)
      .set('Authorization', `Bearer ${tokens.teacher}`)
      .set(csrf)
      .send({ managerId: seed.leader._id.toString() });
    expect(res.status).toBe(403);
  });
});

// ── Manager dashboard ─────────────────────────────────────
describe('GET /api/org/my-team — self-scoped + rollup', () => {
  test('manager sees only their direct reports with a training rollup', async () => {
    // member1 reports to leader (set in the assignment suite). Seed an active
    // enrollment + an Issued certificate for member1 so the rollup is non-zero.
    const Enrollment = require('../../models/Enrollment');
    const Certificate = require('../../models/Certificate');
    await Enrollment.create({ userId: seed.member1._id, classId: seed.class1._id, status: 'Active' });
    await Certificate.create({
      certificateNumber: `CERT-TEST-${Date.now()}`,
      verificationCode: `vc-${Date.now()}`,
      userId: seed.member1._id,
      cohortId: seed.class1._id,
      programId: new mongoose.Types.ObjectId(),
      status: 'Issued',
    });

    const res = await request(app)
      .get('/api/org/my-team')
      .set('Authorization', `Bearer ${tokens.leader}`);

    expect(res.status).toBe(200);
    const ids = res.body.data.reports.map((r) => String(r._id));
    expect(ids).toContain(seed.member1._id.toString());
    const m1 = res.body.data.reports.find((r) => String(r._id) === seed.member1._id.toString());
    expect(m1.training.activeEnrollments).toBeGreaterThanOrEqual(1);
    expect(m1.training.certificates).toBeGreaterThanOrEqual(1);
    expect(m1.training.completedPrograms).toBeGreaterThanOrEqual(1);
  });

  test('a user with no direct reports gets an empty team (200, count 0)', async () => {
    const res = await request(app)
      .get('/api/org/my-team')
      .set('Authorization', `Bearer ${tokens.teacher}`);
    expect(res.status).toBe(200);
    expect(res.body.data.count).toBe(0);
    expect(res.body.data.reports).toEqual([]);
  });

  test('requires auth → 401', async () => {
    const res = await request(app).get('/api/org/my-team');
    expect(res.status).toBe(401);
  });
});
