const request = require('supertest');
const { getApp, getTokens, getCsrfHeaders, teardown } = require('../setup');
const Class = require('../../models/Class');
const LearningProgram = require('../../models/LearningProgram');

let app, tokens, csrf;

beforeAll(async () => {
  app = await getApp();
  tokens = getTokens();
  csrf = await getCsrfHeaders(app);
});

afterAll(async () => {
  await teardown();
});

afterEach(async () => {
  await LearningProgram.deleteMany({ code: /^TEST_/ });
  await Class.deleteMany({ classCode: /^LD_TEST_/ });
});

describe('Learning Platform API — programs', () => {
  test('authenticated users can list learning programs', async () => {
    await LearningProgram.create({
      code: 'TEST_ONBOARDING',
      name: 'Onboarding Basics',
      category: 'onboarding',
      defaultSessionCount: 3,
      deliveryMode: 'hybrid',
      schedulingMode: 'admin_scheduled',
    });

    const res = await request(app)
      .get('/api/learning/programs')
      .set('Authorization', `Bearer ${tokens.teacher}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.some((p) => p.code === 'TEST_ONBOARDING')).toBe(true);
  });

  test('admin can create a learning program', async () => {
    const res = await request(app)
      .post('/api/learning/programs')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({
        code: 'test_compliance',
        name: 'Compliance 101',
        category: 'compliance',
        defaultSessionCount: 2,
        deliveryMode: 'online',
        schedulingMode: 'admin_scheduled',
        completionPolicy: {
          attendanceThresholdPercent: 100,
          requiresAssessment: true,
        },
      });

    expect(res.status).toBe(201);
    expect(res.body.data.code).toBe('TEST_COMPLIANCE');
    expect(res.body.data.completionPolicy.requiresAssessment).toBe(true);
  });

  test('teacher cannot create a learning program', async () => {
    const res = await request(app)
      .post('/api/learning/programs')
      .set('Authorization', `Bearer ${tokens.teacher}`)
      .set(csrf)
      .send({
        code: 'TEST_TEACHER_BLOCK',
        name: 'Teacher Blocked Program',
        defaultSessionCount: 1,
      });

    expect(res.status).toBe(403);
  });
});

describe('Learning Platform API — cohorts', () => {
  test('admin can create a cohort from a learning program', async () => {
    const program = await LearningProgram.create({
      code: 'TEST_TECHNICAL',
      name: 'Technical Bootcamp',
      category: 'technical',
      defaultSessionCount: 4,
      deliveryMode: 'offline',
      schedulingMode: 'admin_scheduled',
    });

    const res = await request(app)
      .post('/api/learning/cohorts')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({
        cohortCode: 'LD_TEST_001',
        programId: program._id.toString(),
      });

    expect(res.status).toBe(201);
    expect(res.body.data.cohortCode).toBe('LD_TEST_001');
    expect(res.body.data.program.code).toBe('TEST_TECHNICAL');
    expect(res.body.data.totalSessions).toBe(4);

    const stored = await Class.findOne({ classCode: 'LD_TEST_001' }).lean();
    expect(stored.programId.toString()).toBe(program._id.toString());
    expect(stored.courseName).toBe('Technical Bootcamp');
  });

  test('legacy class course list is sourced from LearningProgram when catalog exists', async () => {
    await LearningProgram.create({
      code: 'TEST_WORKSHOP',
      name: 'Manager Workshop',
      category: 'workshop',
      defaultSessionCount: 1,
      deliveryMode: 'hybrid',
      schedulingMode: 'self_enroll',
    });

    const res = await request(app)
      .get('/api/classes/courses')
      .set('Authorization', `Bearer ${tokens.admin}`);

    expect(res.status).toBe(200);
    expect(res.body.data.source).toBe('learning-programs');
    expect(res.body.data.courseSessions['Manager Workshop']).toBe(1);
  });
});
