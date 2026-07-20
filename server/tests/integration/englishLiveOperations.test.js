/**
 * Integration smoke — live English Operations on the shared domain model.
 *
 * Every business transition goes through the production HTTP stack. The only
 * direct fixture is a past Schedule: booking-grid behavior already has its own
 * integration coverage, while this test focuses on the English convergence
 * seam from a managed learner through attendance eligibility and final level.
 */
const request = require('supertest');
const {
  getApp, getTokens, getSeedData, getCsrfHeaders, teardown,
} = require('../setup');
const fx = require('../fixtures/pg-fixtures');
const { defaultEnglishPolicy } = require('../../domains/learning/english-policy');

let app;
let tokens;
let seed;
let csrf;

beforeAll(async () => {
  app = await getApp();
  tokens = getTokens();
  seed = getSeedData();
  csrf = await getCsrfHeaders(app);
});

afterAll(async () => {
  await teardown();
});

const authorized = (req, token) => req
  .set('Authorization', `Bearer ${token}`)
  .set(csrf);

describe('English Operations — shared-domain vertical flow', () => {
  test('managed learner → English run → attendance → eligibility → final level', async () => {
    const suffix = Date.now().toString().slice(-8);

    // P0: the learner is a real shared User, deliberately without login access.
    const person = await authorized(
      request(app).post('/api/english-training/managed-learners'),
      tokens.admin,
    ).send({
      empCode: `ENG${suffix}`,
      name: 'English Managed Learner',
      department: 'English Training',
    });

    expect(person.status).toBe(201);
    expect(person.body.data.canLogin).toBe(false);
    expect(person.body.data.password).toBeUndefined();
    const learnerId = person.body.data._id;

    const login = await request(app)
      .post('/api/auth/login')
      .set(csrf)
      .send({ empCode: person.body.data.empCode, password: 'not-a-credential' });
    expect(login.status).toBe(403);
    expect(login.body.message).toMatch(/disabled/i);

    // P1: English is a typed shared Program + Cohort with a policy snapshot.
    const program = await authorized(
      request(app).post('/api/learning/programs'),
      tokens.admin,
    ).send({
      code: `ENG_IT_${suffix}`,
      name: 'English Live Integration',
      category: 'english',
      defaultSessionCount: 1,
      deliveryMode: 'offline',
      schedulingMode: 'nomination',
      completionPolicy: {
        attendanceThresholdPercent: 0,
        requiresAssessment: true,
        requiresFeedback: false,
      },
      facilitatorPolicy: {
        assignmentRequired: true,
        visibility: 'all_facilitators',
      },
      englishPolicy: defaultEnglishPolicy(),
    });

    expect(program.status).toBe(201);
    expect(program.body.data.category).toBe('english');
    const programId = program.body.data._id;

    const cohort = await authorized(
      request(app).post('/api/learning/cohorts'),
      tokens.admin,
    ).send({
      cohortCode: `ENG-IT-${suffix}`,
      englishGroupCode: `ENGIT${suffix}`,
      programId,
      status: 'Completed',
      totalSessions: 1,
      teacherIds: [seed.teacher._id.toString()],
      englishPicDisplay: 'English Managed Learner',
    });

    expect(cohort.status).toBe(201);
    expect(cohort.body.data.program.category).toBe('english');
    expect(cohort.body.data.englishPolicySnapshot.maxAbsencesAllowed).toBe(2);
    const cohortId = cohort.body.data._id;

    const team = await authorized(
      request(app).post('/api/teams'),
      tokens.admin,
    ).send({
      name: `${cohort.body.data.englishGroupCode} · English Managed Learner`,
      classId: cohortId,
      leaderId: learnerId,
      members: [learnerId],
    });

    expect(team.status).toBe(201);
    expect(team.body.data.leaderId._id).toBe(learnerId);

    const roster = await request(app)
      .get(`/api/learning/enrollments?cohortId=${cohortId}`)
      .set('Authorization', `Bearer ${tokens.admin}`);
    expect(roster.status).toBe(200);
    expect(roster.body.data).toHaveLength(1);
    expect(roster.body.data[0].group).toEqual({
      id: team.body.data._id,
      name: `${cohort.body.data.englishGroupCode} · English Managed Learner`,
    });

    // P2/P3: the English session and mark live in the generic Schedule and
    // Attendance tables; the assigned cohort Teacher can perform the mark.
    const startTime = new Date(Date.now() - 7 * 86400000);
    const schedule = await fx.createSchedule({
      classId: cohortId,
      startTime,
      endTime: new Date(startTime.getTime() + 90 * 60000),
      enrolledUsers: [learnerId],
      status: 'scheduled',
    });

    const attendance = await authorized(
      request(app).post(`/api/attendance/${schedule._id}`),
      tokens.teacher,
    ).send({ records: [{ userId: learnerId, status: 'P' }] });

    expect(attendance.status).toBe(200);
    expect(attendance.body.data.total).toBe(1);

    // P4: eligibility derives from shared attendance, and evaluation stores a
    // categorical English level instead of forcing rubric scores.
    const eligibility = await request(app)
      .get(`/api/english-training/live/cohorts/${cohortId}/eligibility`)
      .set('Authorization', `Bearer ${tokens.teacher}`);

    expect(eligibility.status).toBe(200);
    expect(eligibility.body.data.learners).toHaveLength(1);
    expect(eligibility.body.data.learners[0].eligibility).toMatchObject({
      status: 'eligible',
      expectedCount: 1,
      markedCount: 1,
      absenceCount: 0,
    });

    const level = await authorized(
      request(app).post(`/api/english-training/live/cohorts/${cohortId}/evaluations`),
      tokens.teacher,
    ).send({
      userId: learnerId,
      levelCode: 'foundation',
      note: 'Integration smoke result',
    });

    expect(level.status).toBe(201);
    expect(level.body.data).toMatchObject({
      resultKind: 'english_level',
      levelCode: 'foundation',
      level: 'Foundation',
      grammarScore: null,
      averageScore: null,
    });

    const worklist = await request(app)
      .get(`/api/english-training/live/cohorts/${cohortId}/evaluations`)
      .set('Authorization', `Bearer ${tokens.teacher}`);

    expect(worklist.status).toBe(200);
    expect(worklist.body.data.learners[0].evaluation).toMatchObject({
      levelCode: 'foundation',
      resultKind: 'english_level',
    });

    // P5: test reset preserves the migration-owned archive-control singleton.
    const archive = await request(app)
      .get('/api/english-training/archive/status')
      .set('Authorization', `Bearer ${tokens.admin}`);
    expect(archive.status).toBe(200);
    expect(archive.body.data.isFrozen).toBe(false);
  });
});
