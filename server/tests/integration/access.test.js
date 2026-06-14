/**
 * Integration — /api/access/capability-matrix (Studio ▸ Roles & access)
 *
 * Read-only surface over the live coarse-authz matrix (policy/capabilities.js).
 * Admin-only (SETTINGS_MANAGE). Asserts the matrix reflects real enforcement:
 * Admin holds every capability; a Participant holds session.book but NOT
 * program.manage. Non-admins are denied.
 */

const request = require('supertest');
const mongoose = require('mongoose');
const { getApp, getTokens } = require('../setup');
const { ALL_CAPABILITIES } = require('../../policy/capabilities');

let app, tokens;

beforeAll(async () => {
  app = await getApp();
  tokens = getTokens();
});

afterAll(async () => {
  await mongoose.disconnect();
});

const get = (token) =>
  request(app).get('/api/access/capability-matrix').set('Authorization', `Bearer ${token}`);

describe('GET /api/access/capability-matrix', () => {
  it('returns the live role × capability matrix for an admin', async () => {
    const res = await get(tokens.admin);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const { roles, capabilities, grants } = res.body.data;
    expect(roles).toEqual(['Admin', 'Coordinator', 'Teacher', 'Participant']);
    // Every enforced capability is surfaced.
    expect(capabilities.sort()).toEqual([...ALL_CAPABILITIES].sort());

    // Admin is the superuser — holds every capability.
    expect(grants.Admin.sort()).toEqual([...ALL_CAPABILITIES].sort());

    // Participant can book sessions / self-enroll but cannot manage programs.
    expect(grants.Participant).toContain('session.book');
    expect(grants.Participant).not.toContain('program.manage');

    // Coordinator manages programs; Teacher does not.
    expect(grants.Coordinator).toContain('program.manage');
    expect(grants.Teacher).not.toContain('program.manage');
  });

  it('denies a non-admin (Teacher) with 403', async () => {
    const res = await get(tokens.teacher);
    expect(res.status).toBe(403);
  });

  it('rejects an unauthenticated request with 401', async () => {
    const res = await request(app).get('/api/access/capability-matrix');
    expect(res.status).toBe(401);
  });
});
