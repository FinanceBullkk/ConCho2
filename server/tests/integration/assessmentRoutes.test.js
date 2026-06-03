const request = require('supertest');
const jwt = require('jsonwebtoken');
const { getApp, getTokens, getSeedData, getCsrfHeaders, teardown } = require('../setup');
const Assessment = require('../../models/Assessment');
const AssessmentAttempt = require('../../models/AssessmentAttempt');
const Schedule = require('../../models/Schedule');
const Class = require('../../models/Class');
const LearningProgram = require('../../models/LearningProgram');

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

afterEach(async () => {
  await Promise.all([
    Assessment.deleteMany({}),
    AssessmentAttempt.deleteMany({}),
    Schedule.deleteMany({}),
    LearningProgram.deleteMany({}),
  ]);
  await Class.updateMany(
    { _id: { $in: [seed.class1._id, seed.class2._id] } },
    { $set: { programId: null } },
  );
});

let rosterSlot = 0;
const seedRoster = (userId) => {
  const base = new Date('2026-03-02T03:00:00Z').getTime();
  const startTime = new Date(base + rosterSlot++ * 86400000);
  return Schedule.create({
    classId: seed.class1._id,
    bookedTeamId: seed.team._id,
    startTime,
    endTime: new Date(startTime.getTime() + 3600000),
    enrolledUsers: [userId],
  });
};

const member1Token = () =>
  jwt.sign({ id: seed.member1._id.toString() }, process.env.JWT_SECRET, { expiresIn: '1h' });

// Build a 1-item single_choice assessment body.
const quizBody = (overrides = {}) => ({
  title: 'Module 1 Quiz',
  cohortId: seed.class1._id.toString(),
  isPublished: true,
  passingScorePercent: 100,
  items: [
    { type: 'single_choice', prompt: '2+2?', options: ['3', '4', '5'], correctOptionIndexes: [1] },
  ],
  ...overrides,
});

const createQuiz = (token, overrides) =>
  request(app)
    .post('/api/assessment/assessments')
    .set('Authorization', `Bearer ${token}`)
    .set(csrf)
    .send(quizBody(overrides));

const attempt = (token, assessmentId, answers) =>
  request(app)
    .post(`/api/assessment/assessments/${assessmentId}/attempts`)
    .set('Authorization', `Bearer ${token}`)
    .set(csrf)
    .send({ answers });

describe('Assessment API — authoring, attempts, grading', () => {
  test('admin creates an assessment (201, answers visible to author)', async () => {
    const res = await createQuiz(tokens.admin);
    expect(res.status).toBe(201);
    expect(res.body.data.itemCount).toBe(1);
    expect(res.body.data.items[0].correctOptionIndexes).toEqual([1]);
    expect(res.body.data.items[0].id).toBeTruthy();
  });

  test('a participant cannot author an assessment (403); a teacher can (201)', async () => {
    await seedRoster(seed.leader._id);
    const blocked = await createQuiz(tokens.leader);
    expect(blocked.status).toBe(403);

    const teacher = await createQuiz(tokens.teacher);
    expect(teacher.status).toBe(201);
  });

  test('a learner sees published assessments but never the correct answers', async () => {
    await createQuiz(tokens.admin);
    const list = await request(app)
      .get(`/api/assessment/assessments?cohortId=${seed.class1._id}`)
      .set('Authorization', `Bearer ${tokens.leader}`);
    expect(list.status).toBe(200);
    expect(list.body.count).toBe(1);
    expect(list.body.data[0].items[0].correctOptionIndexes).toBeUndefined();
    expect(list.body.data[0].items[0].options).toEqual(['3', '4', '5']);
  });

  test('a learner cannot see an unpublished assessment (404)', async () => {
    const created = await createQuiz(tokens.admin, { isPublished: false });
    const res = await request(app)
      .get(`/api/assessment/assessments/${created.body.data.id}`)
      .set('Authorization', `Bearer ${tokens.leader}`);
    expect(res.status).toBe(404);
  });

  test('a cohort participant submits a correct attempt and passes (201)', async () => {
    await seedRoster(seed.leader._id);
    const created = await createQuiz(tokens.admin);
    const itemId = created.body.data.items[0].id;

    const res = await attempt(tokens.leader, created.body.data.id, [
      { itemId, selectedOptionIndexes: [1] },
    ]);
    expect(res.status).toBe(201);
    expect(res.body.data.scorePercent).toBe(100);
    expect(res.body.data.passed).toBe(true);
  });

  test('a wrong attempt fails the passing threshold', async () => {
    await seedRoster(seed.leader._id);
    const created = await createQuiz(tokens.admin);
    const itemId = created.body.data.items[0].id;

    const res = await attempt(tokens.leader, created.body.data.id, [
      { itemId, selectedOptionIndexes: [0] },
    ]);
    expect(res.status).toBe(201);
    expect(res.body.data.passed).toBe(false);
  });

  test('a non-participant cannot attempt (403)', async () => {
    const created = await createQuiz(tokens.admin); // leader not on roster
    const itemId = created.body.data.items[0].id;
    const res = await attempt(tokens.leader, created.body.data.id, [
      { itemId, selectedOptionIndexes: [1] },
    ]);
    expect(res.status).toBe(403);
  });

  test('attempting an unpublished assessment is rejected (422)', async () => {
    await seedRoster(seed.leader._id);
    const created = await createQuiz(tokens.admin, { isPublished: false });
    const itemId = created.body.data.items[0].id;
    const res = await attempt(tokens.leader, created.body.data.id, [
      { itemId, selectedOptionIndexes: [1] },
    ]);
    expect(res.status).toBe(422);
  });

  test('maxAttempts caps the number of attempts (409)', async () => {
    await seedRoster(seed.leader._id);
    const created = await createQuiz(tokens.admin, { maxAttempts: 1 });
    const itemId = created.body.data.items[0].id;
    const first = await attempt(tokens.leader, created.body.data.id, [{ itemId, selectedOptionIndexes: [1] }]);
    expect(first.status).toBe(201);
    const second = await attempt(tokens.leader, created.body.data.id, [{ itemId, selectedOptionIndexes: [1] }]);
    expect(second.status).toBe(409);
  });

  test('a learner only sees their own attempts in the list', async () => {
    await seedRoster(seed.leader._id);
    await seedRoster(seed.member1._id);
    const created = await createQuiz(tokens.admin);
    const itemId = created.body.data.items[0].id;
    await attempt(tokens.leader, created.body.data.id, [{ itemId, selectedOptionIndexes: [1] }]);
    await attempt(member1Token(), created.body.data.id, [{ itemId, selectedOptionIndexes: [0] }]);

    const mine = await request(app)
      .get(`/api/assessment/attempts?cohortId=${seed.class1._id}`)
      .set('Authorization', `Bearer ${member1Token()}`);
    expect(mine.body.count).toBe(1);
    expect(mine.body.data[0].learner.id).toBe(seed.member1._id.toString());

    const all = await request(app)
      .get(`/api/assessment/attempts?cohortId=${seed.class1._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`);
    expect(all.body.count).toBe(2);
  });

  test('archiving soft-deletes the assessment (hidden from lists, record retained)', async () => {
    const created = await createQuiz(tokens.admin);
    const del = await request(app)
      .delete(`/api/assessment/assessments/${created.body.data.id}`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf);
    expect(del.status).toBe(200);

    const list = await request(app)
      .get(`/api/assessment/assessments?cohortId=${seed.class1._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`);
    expect(list.body.count).toBe(0);
    const stored = await Assessment.findById(created.body.data.id).lean();
    expect(stored.isDeleted).toBe(true);
  });

  test('a passing attempt satisfies completionPolicy.requiresAssessment', async () => {
    const program = await LearningProgram.create({
      code: `ASMT_${Date.now()}`,
      name: 'Assessment Program',
      completionPolicy: { attendanceThresholdPercent: 0, requiresAssessment: true },
    });
    await Class.findByIdAndUpdate(seed.class1._id, { programId: program._id });
    await seedRoster(seed.leader._id);

    const before = await request(app)
      .get(`/api/learning/completion?cohortId=${seed.class1._id}&learnerId=${seed.leader._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`);
    expect(before.body.data.assessment.met).toBe(false);
    expect(before.body.data.complete).toBe(false);

    const created = await createQuiz(tokens.admin);
    const itemId = created.body.data.items[0].id;
    await attempt(tokens.leader, created.body.data.id, [{ itemId, selectedOptionIndexes: [1] }]);

    const after = await request(app)
      .get(`/api/learning/completion?cohortId=${seed.class1._id}&learnerId=${seed.leader._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`);
    expect(after.body.data.assessment.met).toBe(true);
    expect(after.body.data.assessment.attemptScorePercent).toBe(100);
    expect(after.body.data.complete).toBe(true);
  });
});
