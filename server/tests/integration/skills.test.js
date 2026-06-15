const request = require('supertest');
const mongoose = require('mongoose');
const { getApp, getTokens, getSeedData, getCsrfHeaders, teardown } = require('../setup');
const Skill = require('../../models/Skill');
const Certificate = require('../../models/Certificate');
const LearningProgram = require('../../models/LearningProgram');

// TMS.update gap #4 — skills/competency framework: CRUD over /api/skills
// (skill.manage), derived learner proficiency + role gap (skill.read,
// self-or-manage), and workforce role profiles.

let app, tokens, seed, csrf;
beforeAll(async () => { app = await getApp(); tokens = getTokens(); seed = getSeedData(); csrf = await getCsrfHeaders(app); });
afterEach(async () => {
  await Skill.deleteMany({});
  await Certificate.deleteMany({});
  await LearningProgram.deleteMany({});
});
afterAll(async () => { await teardown(); });

const asAdmin = (m, p) => request(app)[m](p).set('Authorization', `Bearer ${tokens.admin}`).set(csrf);
const asLeader = (m, p) => request(app)[m](p).set('Authorization', `Bearer ${tokens.leader}`).set(csrf);
const asTeacher = (m, p) => request(app)[m](p).set('Authorization', `Bearer ${tokens.teacher}`).set(csrf);

let certSeq = 0;
const issueCert = (userId, programId) => Certificate.create({
  certificateNumber: `CERT-T-${++certSeq}`,
  verificationCode: `vc-${certSeq}-${Math.random().toString(36).slice(2)}`,
  userId, cohortId: seed.class1._id, programId, status: 'Issued',
});
const mkProgram = (code, name) => LearningProgram.create({ code, name });

describe('Skills — CRUD + authz', () => {
  it('creates a skill (admin), rejects a duplicate name (409), and lists with categories', async () => {
    const create = await asAdmin('post', '/api/skills')
      .send({ name: 'Business English', category: 'Language', programIds: [], targetByRole: { Participant: 3 } });
    expect(create.status).toBe(201);
    expect(create.body.data.name).toBe('Business English');

    const dup = await asAdmin('post', '/api/skills').send({ name: 'business english' });
    expect(dup.status).toBe(409); // case-insensitive uniqueness

    const list = await asAdmin('get', '/api/skills');
    expect(list.status).toBe(200);
    expect(list.body.data.skills).toHaveLength(1);
    expect(list.body.data.categories).toContain('Language');
  });

  it('updates and soft-deletes a skill (audited paths)', async () => {
    const c = await asAdmin('post', '/api/skills').send({ name: 'Data analysis' });
    const id = c.body.data._id;

    const upd = await asAdmin('put', `/api/skills/${id}`).send({ category: 'Technical', maxLevel: 4 });
    expect(upd.body.data.category).toBe('Technical');
    expect(upd.body.data.maxLevel).toBe(4);

    const del = await asAdmin('delete', `/api/skills/${id}`);
    expect(del.status).toBe(200);
    const after = await Skill.findById(id).lean();
    expect(after.isDeleted).toBe(true);
  });

  it('denies skill management to non-admins (Teacher 403) and rejects anon (401)', async () => {
    const teacher = await asTeacher('post', '/api/skills').send({ name: 'X' });
    expect(teacher.status).toBe(403);
    const anon = await request(app).get('/api/skills');
    expect(anon.status).toBe(401);
  });
});

describe('Skills — learner proficiency + role gap', () => {
  it('derives level from issued certificates and computes the role gap', async () => {
    const prog = await mkProgram('LEAD', 'Leadership Essentials');
    await asAdmin('post', '/api/skills')
      .send({ name: 'People management', category: 'Leadership', programIds: [prog._id.toString()], targetByRole: { Participant: 2 } });
    await issueCert(seed.leader._id, prog._id);

    const res = await asAdmin('get', `/api/skills/learner/${seed.leader._id}`);
    expect(res.status).toBe(200);
    const skill = res.body.data.skills.find((s) => s.name === 'People management');
    expect(skill.level).toBe(1);
    expect(skill.via).toContain('Leadership Essentials');
    expect(res.body.data.kpis.skills).toBe(1);
    const gap = res.body.data.roleProfile.required.find((r) => r.name === 'People management');
    expect(gap).toMatchObject({ target: 2, level: 1, gap: 1 });
  });

  it('lets a learner read their OWN skills but not another learner’s (403)', async () => {
    const self = await asLeader('get', `/api/skills/learner/${seed.leader._id}`);
    expect(self.status).toBe(200);
    const other = await asLeader('get', `/api/skills/learner/${seed.member1._id}`);
    expect(other.status).toBe(403); // Participant lacks skill.manage
  });

  it('404s an unknown learner', async () => {
    const res = await asAdmin('get', `/api/skills/learner/${new mongoose.Types.ObjectId()}`);
    expect(res.status).toBe(404);
  });
});

describe('Skills — role profiles (workforce coverage)', () => {
  it('returns required-skill coverage per role (admin), and 403s non-managers', async () => {
    const prog = await mkProgram('CX', 'Customer Excellence');
    await asAdmin('post', '/api/skills')
      .send({ name: 'Customer empathy', programIds: [prog._id.toString()], targetByRole: { Participant: 1 } });
    await issueCert(seed.leader._id, prog._id); // 1 of N participants meets target

    const res = await asAdmin('get', '/api/skills/role-profiles');
    expect(res.status).toBe(200);
    const participant = res.body.data.find((p) => p.role === 'Participant');
    expect(participant).toBeTruthy();
    expect(participant.skills.some((s) => s.name === 'Customer empathy')).toBe(true);
    expect(participant.coverage).toBeGreaterThanOrEqual(0);
    expect(participant.coverage).toBeLessThanOrEqual(100);
    expect(participant.userCount).toBeGreaterThanOrEqual(3);

    const teacher = await asTeacher('get', '/api/skills/role-profiles');
    expect(teacher.status).toBe(403); // skill.read is not enough — needs skill.manage
  });
});
