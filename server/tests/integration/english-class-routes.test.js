/**
 * Integration Tests — English-class separation (read surface + mode filters)
 *
 * Covers:
 *  - GET /api/english/classes|schedules|attendance-calendar (team world only,
 *    forced server-side; gating parity with the delegated endpoints)
 *  - mode=team|cohort filter on GET /api/learning/cohorts and /api/schedules
 *  - program-less legacy classes land in the TEAM world (fallback parity with
 *    repository.findClassSchedulingMode)
 *
 * Run: npm test -- --testPathPatterns=english-class
 */

const request = require('supertest');
const { getApp, getTokens, getSeedData, teardown } = require('../setup');
const Schedule = require('../../models/Schedule');
const Class = require('../../models/Class');
const LearningProgram = require('../../models/LearningProgram');

let app, tokens, seed;
let cohortProgram, cohortClass, teamProgram, teamClass;
let teamSchedule, cohortSchedule;

const futureAt = (offsetDays, hourUtc) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  d.setUTCHours(hourUtc, 0, 0, 0);
  return d;
};

beforeAll(async () => {
  app = await getApp();
  tokens = getTokens();
  seed = getSeedData();

  // Cohort world: self_enroll program + linked class.
  cohortProgram = await LearningProgram.create({
    code: 'COMP101', name: 'Compliance 101', category: 'compliance',
    defaultSessionCount: 4, schedulingMode: 'self_enroll',
  });
  cohortClass = await Class.create({
    classCode: 'COH001', courseName: 'Compliance 101',
    totalSessions: 4, programId: cohortProgram._id,
  });

  // Team world via explicit program (leader_booking).
  teamProgram = await LearningProgram.create({
    code: 'ENGF01', name: 'English Foundation', category: 'english',
    defaultSessionCount: 20, schedulingMode: 'leader_booking',
  });
  teamClass = await Class.create({
    classCode: 'ENG001', courseName: 'English Foundation',
    totalSessions: 20, programId: teamProgram._id,
  });

  // seed.class1 / seed.class2 are PROGRAM-LESS → team world by fallback.
  const start1 = futureAt(7, 3);
  teamSchedule = await Schedule.create({
    classId: seed.class1._id, bookedTeamId: seed.team._id,
    startTime: start1, endTime: new Date(start1.getTime() + 3600000),
    enrolledUsers: [seed.leader._id, seed.member1._id],
  });
  const start2 = futureAt(8, 3);
  cohortSchedule = await Schedule.create({
    classId: cohortClass._id,
    startTime: start2, endTime: new Date(start2.getTime() + 3600000),
    enrolledUsers: [seed.member2._id],
  });
});

afterAll(async () => {
  await teardown();
});

const codesOf = (rows) => rows.map((r) => r.cohortCode || r.classCode);

describe('GET /api/english/classes', () => {
  test('requires auth', async () => {
    await request(app).get('/api/english/classes').expect(401);
  });

  test('returns ONLY team-world classes, including program-less legacy ones', async () => {
    const res = await request(app)
      .get('/api/english/classes')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .expect(200);
    const codes = codesOf(res.body.data);
    expect(codes).toEqual(expect.arrayContaining(['TEST001', 'TEST002', 'ENG001']));
    expect(codes).not.toContain('COH001');
  });
});

describe('GET /api/learning/cohorts?mode=', () => {
  test('mode=cohort returns only cohort-world classes', async () => {
    const res = await request(app)
      .get('/api/learning/cohorts?mode=cohort')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .expect(200);
    const codes = codesOf(res.body.data);
    expect(codes).toContain('COH001');
    expect(codes).not.toContain('ENG001');
    expect(codes).not.toContain('TEST001');
  });

  test('no mode keeps combined legacy behavior', async () => {
    const res = await request(app)
      .get('/api/learning/cohorts')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .expect(200);
    const codes = codesOf(res.body.data);
    expect(codes).toEqual(expect.arrayContaining(['COH001', 'ENG001', 'TEST001']));
  });

  test('rejects an invalid mode value', async () => {
    await request(app)
      .get('/api/learning/cohorts?mode=banana')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .expect(400);
  });
});

describe('GET /api/english/schedules and /api/schedules?mode=', () => {
  test('english schedules return only team-world sessions', async () => {
    const res = await request(app)
      .get('/api/english/schedules')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .expect(200);
    const ids = res.body.data.map((s) => s._id);
    expect(ids).toContain(teamSchedule._id.toString());
    expect(ids).not.toContain(cohortSchedule._id.toString());
  });

  test('mode=cohort on /api/schedules returns only cohort-world sessions', async () => {
    const res = await request(app)
      .get('/api/schedules?mode=cohort')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .expect(200);
    const ids = res.body.data.map((s) => s._id);
    expect(ids).toContain(cohortSchedule._id.toString());
    expect(ids).not.toContain(teamSchedule._id.toString());
  });

  test('participant scope still applies on /api/english/schedules (enrolled-only)', async () => {
    const res = await request(app)
      .get('/api/english/schedules')
      .set('Authorization', `Bearer ${tokens.leader}`)
      .expect(200);
    const ids = res.body.data.map((s) => s._id);
    expect(ids).toContain(teamSchedule._id.toString());
    // cohortSchedule excluded twice over (mode + not enrolled)
    expect(ids).not.toContain(cohortSchedule._id.toString());
  });
});

describe('GET /api/english/attendance-calendar', () => {
  test('participant is rejected by roleGuard', async () => {
    await request(app)
      .get('/api/english/attendance-calendar')
      .set('Authorization', `Bearer ${tokens.leader}`)
      .expect(403);
  });

  test('admin sees only team-world rows', async () => {
    const res = await request(app)
      .get('/api/english/attendance-calendar')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .expect(200);
    const ids = res.body.data.map((s) => s._id);
    expect(ids).toContain(teamSchedule._id.toString());
    expect(ids).not.toContain(cohortSchedule._id.toString());
  });

  test('mode=cohort on the generic attendance-calendar excludes team rows', async () => {
    const res = await request(app)
      .get('/api/schedules/attendance-calendar?mode=cohort')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .expect(200);
    const ids = res.body.data.map((s) => s._id);
    expect(ids).toContain(cohortSchedule._id.toString());
    expect(ids).not.toContain(teamSchedule._id.toString());
  });
});
