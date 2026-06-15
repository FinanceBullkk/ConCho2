/**
 * ──────────────────────────────────────────────────────────
 * Integration Tests — Global Search
 * GET /api/search?q=...&limit=...
 * ──────────────────────────────────────────────────────────
 * Verifies role-scoped results (Admin/Teacher/Participant) and
 * input sanitization (regex escaping).
 * ──────────────────────────────────────────────────────────
 */

const request = require('supertest');
const { getApp, getTokens, getSeedData, teardown } = require('../setup');
const LearningProgram = require('../../models/LearningProgram');
const Department = require('../../models/Department');

let app, tokens, seed, searchProgram, searchDept;

beforeAll(async () => {
  app = await getApp();
  tokens = getTokens();
  seed = getSeedData();
  // Programs + departments aren't in the shared seed — create distinctive
  // fixtures so the staff-only search branches have something to find.
  searchProgram = await LearningProgram.create({ code: 'SRCHPROG', name: 'Searchable Leadership Program' });
  searchDept = await Department.create({ name: 'Searchable Robotics Dept', code: 'SRCHDEPT' });
});

afterAll(async () => {
  await teardown();
});

describe('GET /api/search', () => {
  test('returns 401 without auth', async () => {
    const res = await request(app).get('/api/search?q=admin');
    expect(res.status).toBe(401);
  });

  test('returns empty result when q is too short', async () => {
    const res = await request(app)
      .get('/api/search?q=a')
      .set('Authorization', `Bearer ${tokens.admin}`);

    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(0);
    expect(res.body.data.users).toEqual([]);
    expect(res.body.data.teams).toEqual([]);
    expect(res.body.data.classes).toEqual([]);
  });

  test('Admin: finds users by name', async () => {
    const res = await request(app)
      .get('/api/search?q=Admin')
      .set('Authorization', `Bearer ${tokens.admin}`);

    expect(res.status).toBe(200);
    expect(res.body.data.users.some(u => u.name.includes('Admin'))).toBe(true);
  });

  test('Admin: finds users by empCode', async () => {
    const res = await request(app)
      .get(`/api/search?q=${seed.member1.empCode}`)
      .set('Authorization', `Bearer ${tokens.admin}`);

    expect(res.status).toBe(200);
    expect(res.body.data.users.some(u => u._id === seed.member1._id.toString())).toBe(true);
  });

  test('Admin: finds team by name', async () => {
    const res = await request(app)
      .get(`/api/search?q=${encodeURIComponent(seed.team.name)}`)
      .set('Authorization', `Bearer ${tokens.admin}`);

    expect(res.status).toBe(200);
    expect(res.body.data.teams.some(t => t._id === seed.team._id.toString())).toBe(true);
  });

  test('Admin: finds class by classCode', async () => {
    const res = await request(app)
      .get(`/api/search?q=${seed.class1.classCode}`)
      .set('Authorization', `Bearer ${tokens.admin}`);

    expect(res.status).toBe(200);
    expect(res.body.data.classes.some(c => c._id === seed.class1._id.toString())).toBe(true);
  });

  test('respects per-entity limit', async () => {
    const res = await request(app)
      .get('/api/search?q=e&limit=2')
      .set('Authorization', `Bearer ${tokens.admin}`);

    expect(res.status).toBe(200);
    expect(res.body.data.users.length).toBeLessThanOrEqual(2);
    expect(res.body.data.teams.length).toBeLessThanOrEqual(2);
    expect(res.body.data.classes.length).toBeLessThanOrEqual(2);
  });

  test('clamps absurd limit values', async () => {
    const res = await request(app)
      .get('/api/search?q=member&limit=9999')
      .set('Authorization', `Bearer ${tokens.admin}`);

    expect(res.status).toBe(200);
    // Hard cap is 25 per entity
    expect(res.body.data.users.length).toBeLessThanOrEqual(25);
  });

  test('regex metacharacters are escaped (no ReDoS / no all-match)', async () => {
    const res = await request(app)
      .get('/api/search?q=.*')
      .set('Authorization', `Bearer ${tokens.admin}`);

    expect(res.status).toBe(200);
    // ".*" should be treated as a literal — no user has a "." then "*" in
    // their name/empCode, so no matches in seed data.
    expect(res.body.data.total).toBe(0);
  });

  test('Teacher: finds only Participants (not Admins/Teachers)', async () => {
    const res = await request(app)
      .get('/api/search?q=User')
      .set('Authorization', `Bearer ${tokens.teacher}`);

    expect(res.status).toBe(200);
    expect(res.body.data.users.every(u => u.role === 'Participant')).toBe(true);
  });

  test('Participant: sees only their own user record', async () => {
    // Leader is a Participant — search for "User" which would match many
    // names in seed, but Participant scope should limit to self only.
    const res = await request(app)
      .get('/api/search?q=Member')
      .set('Authorization', `Bearer ${tokens.leader}`);

    expect(res.status).toBe(200);
    // Leader's own name is "Team Leader" — searching "Member" won't match
    // the leader himself, so users should be empty even though "Member One/Two"
    // exist in the DB.
    expect(res.body.data.users.length).toBe(0);
  });

  test('Participant: sees their own record when name matches', async () => {
    const res = await request(app)
      .get('/api/search?q=Leader')
      .set('Authorization', `Bearer ${tokens.leader}`);

    expect(res.status).toBe(200);
    // Should find themselves
    expect(res.body.data.users.length).toBe(1);
    expect(res.body.data.users[0]._id).toBe(seed.leader._id.toString());
  });

  test('Participant: sees teams they belong to', async () => {
    const res = await request(app)
      .get(`/api/search?q=${encodeURIComponent(seed.team.name)}`)
      .set('Authorization', `Bearer ${tokens.leader}`);

    expect(res.status).toBe(200);
    expect(res.body.data.teams.some(t => t._id === seed.team._id.toString())).toBe(true);
  });

  test('Admin: finds programs by name (staff-only entity)', async () => {
    const res = await request(app)
      .get('/api/search?q=Searchable')
      .set('Authorization', `Bearer ${tokens.admin}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.programs)).toBe(true);
    expect(res.body.data.programs.some(p => p._id === searchProgram._id.toString())).toBe(true);
  });

  test('Admin: finds departments by name (staff-only entity)', async () => {
    const res = await request(app)
      .get('/api/search?q=Searchable')
      .set('Authorization', `Bearer ${tokens.admin}`);

    expect(res.status).toBe(200);
    expect(res.body.data.departments.some(d => d._id === searchDept._id.toString())).toBe(true);
  });

  test('Participant: never sees programs or departments (staff-only)', async () => {
    const res = await request(app)
      .get('/api/search?q=Searchable')
      .set('Authorization', `Bearer ${tokens.leader}`);

    expect(res.status).toBe(200);
    expect(res.body.data.programs).toEqual([]);
    expect(res.body.data.departments).toEqual([]);
  });
});
