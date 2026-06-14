const request = require('supertest');
const { getApp, getTokens, getCsrfHeaders, teardown } = require('../setup');
const Role = require('../../models/Role');
const {
  roleHasCapability, setLiveGrants, ROLE_CAPABILITIES, ALL_CAPABILITIES, CAPABILITIES,
} = require('../../policy/capabilities');
const { seedSystemRoles, loadGrantsIntoMemory } = require('../../domains/access/grants-loader');

// TMS.update gap #2 P3-S2 — editable roles + custom roles over /api/access/roles.
// role.manage (Admin); every write refreshes the live grants → authz follows.

let app, tokens, csrf;
beforeAll(async () => { app = await getApp(); tokens = getTokens(); csrf = await getCsrfHeaders(app); });
beforeEach(async () => { await Role.deleteMany({}); await seedSystemRoles(); await loadGrantsIntoMemory(); });
afterAll(async () => { await Role.deleteMany({}); setLiveGrants(ROLE_CAPABILITIES); await teardown(); });

const asAdmin = (m, p) => request(app)[m](p).set('Authorization', `Bearer ${tokens.admin}`).set(csrf);

describe('Access — roles CRUD (gap #2)', () => {
  it('lists system roles with grants + the capability catalog', async () => {
    const res = await asAdmin('get', '/api/access/roles');
    expect(res.status).toBe(200);
    expect(res.body.data.roles.map((r) => r.key).sort()).toEqual(['Admin', 'Coordinator', 'Participant', 'Teacher']);
    expect(res.body.data.roles.find((r) => r.key === 'Admin').system).toBe(true);
    expect(res.body.data.capabilities).toContain(CAPABILITIES.PROGRAM_MANAGE);
  });

  it('edits a system role grant → reflected in live authz', async () => {
    const res = await asAdmin('put', '/api/access/roles/Teacher').send({ capabilities: [CAPABILITIES.PROGRAM_MANAGE] });
    expect(res.status).toBe(200);
    expect(res.body.data.capabilities).toEqual([CAPABILITIES.PROGRAM_MANAGE]);
    expect(roleHasCapability('Teacher', CAPABILITIES.PROGRAM_MANAGE)).toBe(true);
    expect(roleHasCapability('Teacher', CAPABILITIES.ENROLLMENT_READ)).toBe(false);
  });

  it('keeps Admin grants immutable (coerced back to the full set)', async () => {
    const res = await asAdmin('put', '/api/access/roles/Admin').send({ capabilities: [] });
    expect(res.status).toBe(200);
    expect(res.body.data.capabilities.length).toBe(ALL_CAPABILITIES.length);
    expect(roleHasCapability('Admin', CAPABILITIES.PROGRAM_MANAGE)).toBe(true);
  });

  it('creates + archives a custom role; live authz follows both', async () => {
    const create = await asAdmin('post', '/api/access/roles')
      .send({ key: 'Auditor', name: 'Auditor', capabilities: [CAPABILITIES.AUDIT_READ, CAPABILITIES.REPORT_READ] });
    expect(create.status).toBe(201);
    expect(roleHasCapability('Auditor', CAPABILITIES.AUDIT_READ)).toBe(true);

    const del = await asAdmin('delete', '/api/access/roles/Auditor');
    expect(del.status).toBe(200);
    expect(roleHasCapability('Auditor', CAPABILITIES.AUDIT_READ)).toBe(false);
  });

  it('refuses to delete a system role (400)', async () => {
    const res = await asAdmin('delete', '/api/access/roles/Teacher');
    expect(res.status).toBe(400);
  });

  it('rejects an unknown capability id (400) and a non-admin (403)', async () => {
    const bad = await asAdmin('post', '/api/access/roles').send({ key: 'Bad', name: 'Bad', capabilities: ['made.up'] });
    expect(bad.status).toBe(400);

    const teacher = await request(app).get('/api/access/roles').set('Authorization', `Bearer ${tokens.teacher}`);
    expect(teacher.status).toBe(403);
  });
});
