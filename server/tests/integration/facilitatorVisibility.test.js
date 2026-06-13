/**
 * Integration Tests — facilitatorPolicy.visibility = 'assigned_only'
 *
 * For an assigned_only program, a Teacher reaches its sessions (list / detail /
 * attendance) ONLY when named on that session (sessionInstructorIds) — the
 * standing cohort-teacher binding (Class.teacherIds) does NOT grant access.
 * The default (all_facilitators) keeps the cohort-binding UNION unchanged.
 *
 * Run: npm test -- --testPathPatterns=facilitatorVisibility
 */

const request = require('supertest');
const { getApp, getTokens, getSeedData, teardown } = require('../setup');
const Schedule = require('../../models/Schedule');
const Class = require('../../models/Class');
const LearningProgram = require('../../models/LearningProgram');

let app, tokens, seed, program, named, unnamed;

const future = (offsetDays) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 14 + offsetDays);
  d.setUTCHours(3, 0, 0, 0);
  return { start: d, end: new Date(d.getTime() + 60 * 60 * 1000) };
};

beforeAll(async () => {
  app = await getApp();
  tokens = getTokens();
  seed = getSeedData();
});

afterAll(async () => {
  await Class.updateMany(
    { _id: seed.class1._id }, { $set: { teacherIds: [], programId: null } },
  );
  await teardown();
});

beforeEach(async () => {
  program = await LearningProgram.create({
    code: 'AO100', name: 'Assigned Only Program', schedulingMode: 'admin_scheduled',
    facilitatorPolicy: { visibility: 'assigned_only' },
  });
  // seed.teacher is BOUND to the cohort, and NAMED on `named` only.
  await Class.findByIdAndUpdate(seed.class1._id, {
    programId: program._id, teacherIds: [seed.teacher._id],
  });
  const a = future(0); const b = future(1);
  named = await Schedule.create({
    classId: seed.class1._id, startTime: a.start, endTime: a.end,
    enrolledUsers: [seed.member1._id], sessionInstructorIds: [seed.teacher._id],
  });
  unnamed = await Schedule.create({
    classId: seed.class1._id, startTime: b.start, endTime: b.end,
    enrolledUsers: [seed.member1._id], sessionInstructorIds: [],
  });
});

afterEach(async () => {
  await Schedule.deleteMany({});
  await Class.updateMany({ _id: seed.class1._id }, { $set: { teacherIds: [], programId: null } });
  await LearningProgram.deleteMany({});
});

const asTeacher = (method, path) =>
  request(app)[method](path).set('Authorization', `Bearer ${tokens.teacher}`);

describe('assigned_only — session list', () => {
  test('a bound teacher sees only the session they are named on', async () => {
    const res = await asTeacher('get', `/api/learning/sessions?cohortId=${seed.class1._id}`);
    expect(res.status).toBe(200);
    const ids = res.body.data.map((s) => String(s.scheduleId || s._id || s.id));
    expect(ids).toContain(String(named._id));
    expect(ids).not.toContain(String(unnamed._id));
  });
});

describe('assigned_only — session detail', () => {
  test('named session → 200; bound-but-unnamed session → 403', async () => {
    const ok = await asTeacher('get', `/api/learning/sessions/${named._id}`);
    expect(ok.status).toBe(200);
    const denied = await asTeacher('get', `/api/learning/sessions/${unnamed._id}`);
    expect(denied.status).toBe(403);
  });
});

describe('assigned_only — attendance read authz', () => {
  test('named session roster readable; unnamed session blocked (403)', async () => {
    const ok = await asTeacher('get', `/api/attendance/schedule/${named._id}`);
    expect(ok.status).toBe(200);
    const denied = await asTeacher('get', `/api/attendance/schedule/${unnamed._id}`);
    expect(denied.status).toBe(403);
  });

  test('Admin is unaffected by assigned_only', async () => {
    const res = await request(app)
      .get(`/api/attendance/schedule/${unnamed._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`);
    expect(res.status).toBe(200);
  });
});

describe('default visibility (all_facilitators) is unchanged', () => {
  test('a bound teacher sees + reads an unnamed session when not assigned_only', async () => {
    await LearningProgram.findByIdAndUpdate(program._id, {
      'facilitatorPolicy.visibility': 'all_facilitators',
    });

    const list = await asTeacher('get', `/api/learning/sessions?cohortId=${seed.class1._id}`);
    const ids = list.body.data.map((s) => String(s.scheduleId || s._id || s.id));
    expect(ids).toContain(String(unnamed._id)); // binding grants visibility again

    const read = await asTeacher('get', `/api/attendance/schedule/${unnamed._id}`);
    expect(read.status).toBe(200);
  });
});
