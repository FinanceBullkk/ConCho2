/**
 * Integration Tests — GET /api/learning/assignments/mine (Cohesion P3)
 *
 * Learner self view: active assignments targeting me (direct or via my
 * department) with MY derived status and an enroll-CTA suggestion when the
 * program is self_enroll with an Ongoing cohort.
 *
 * Run: npm test -- --testPathPatterns=assignments-mine
 */

const request = require('supertest');
const { getApp, getTokens, getSeedData, teardown } = require('../setup');
const Assignment = require('../../models/Assignment');
const Class = require('../../models/Class');
const Department = require('../../models/Department');
const LearningProgram = require('../../models/LearningProgram');
const User = require('../../models/User');

let app, tokens, seed;
let selfEnrollProgram, selfEnrollCohort, teamProgram, dept;

const inDays = (days) => new Date(Date.now() + days * 86400000);

beforeAll(async () => {
  app = await getApp();
  tokens = getTokens();
  seed = getSeedData();

  selfEnrollProgram = await LearningProgram.create({
    code: 'SE01', name: 'Self Enroll Course', category: 'compliance',
    defaultSessionCount: 2, schedulingMode: 'self_enroll',
  });
  selfEnrollCohort = await Class.create({
    classCode: 'SE001', courseName: 'Self Enroll Course',
    totalSessions: 2, programId: selfEnrollProgram._id, status: 'Ongoing',
  });
  teamProgram = await LearningProgram.create({
    code: 'TB01', name: 'Team Booking Course', category: 'english',
    defaultSessionCount: 2, schedulingMode: 'leader_booking',
  });

  dept = await Department.create({ code: 'SALES', name: 'Sales' });
  await User.updateOne({ _id: seed.leader._id }, { departmentId: dept._id });
});

afterAll(async () => {
  await teardown();
});

afterEach(async () => {
  await Assignment.deleteMany({});
});

const mine = (token) =>
  request(app).get('/api/learning/assignments/mine').set('Authorization', `Bearer ${token}`);

describe('GET /api/learning/assignments/mine', () => {
  test('requires auth', async () => {
    await request(app).get('/api/learning/assignments/mine').expect(401);
  });

  test('direct-targeted assignment returns own status + enrollable self_enroll cohort', async () => {
    await Assignment.create({
      title: 'Do the compliance course', targetType: 'program',
      programId: selfEnrollProgram._id, dueDate: inDays(10),
      userIds: [seed.leader._id], departmentIds: [],
    });

    const res = await mine(tokens.leader).expect(200);
    expect(res.body.data).toHaveLength(1);
    const row = res.body.data[0];
    expect(row.title).toBe('Do the compliance course');
    expect(row.status).toBe('not_started');
    expect(row.programName).toBe('Self Enroll Course');
    expect(String(row.enrollableCohortId)).toBe(String(selfEnrollCohort._id));
    expect(row.enrollableCohortCode).toBe('SE001');
  });

  test('department-targeted assignment is visible to a member of that department', async () => {
    await Assignment.create({
      title: 'Dept-wide training', targetType: 'program',
      programId: selfEnrollProgram._id, dueDate: inDays(5),
      userIds: [], departmentIds: [dept._id],
    });

    const res = await mine(tokens.leader).expect(200);
    expect(res.body.data.map((r) => r.title)).toContain('Dept-wide training');
  });

  test('non-self_enroll program yields NO enroll suggestion', async () => {
    await Assignment.create({
      title: 'English class duty', targetType: 'program',
      programId: teamProgram._id, dueDate: inDays(10),
      userIds: [seed.leader._id], departmentIds: [],
    });

    const res = await mine(tokens.leader).expect(200);
    expect(res.body.data[0].enrollableCohortId).toBeNull();
  });

  test('past-due assignment derives overdue status', async () => {
    await Assignment.create({
      title: 'Late training', targetType: 'program',
      programId: selfEnrollProgram._id, dueDate: inDays(-3),
      userIds: [seed.leader._id], departmentIds: [],
    });

    const res = await mine(tokens.leader).expect(200);
    expect(res.body.data[0].status).toBe('overdue');
  });

  test('assignments targeting OTHER users/departments are not visible', async () => {
    await Assignment.create({
      title: 'Someone else duty', targetType: 'program',
      programId: selfEnrollProgram._id, dueDate: inDays(10),
      userIds: [seed.member1._id], departmentIds: [],
    });

    const res = await mine(tokens.leader).expect(200);
    expect(res.body.data).toHaveLength(0);
  });

  test('teacher can read their own (empty) list — assignment.self is role-wide', async () => {
    const res = await mine(tokens.teacher).expect(200);
    expect(res.body.data).toEqual([]);
  });
});
