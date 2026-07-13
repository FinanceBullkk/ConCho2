const request = require('supertest');
const jwt = require('jsonwebtoken');
const { getApp, getTokens, getSeedData, getCsrfHeaders, teardown } = require('../setup');
const { readActiveRow, deleteActiveRowsWhere, updateActiveRow } = require('../pg-test-utils');
const fx = require('../fixtures/pg-fixtures');

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
    deleteActiveRowsWhere('Assessment', {}),
    deleteActiveRowsWhere('AssessmentAttempt', {}),
    deleteActiveRowsWhere('AssessmentQuestion', {}),
    deleteActiveRowsWhere('Schedule', {}),
    deleteActiveRowsWhere('LearningProgram', {}),
  ]);
  await Promise.all([
    updateActiveRow('Class', seed.class1._id, { programId: null, teacherIds: [] }),
    updateActiveRow('Class', seed.class2._id, { programId: null, teacherIds: [] }),
  ]);
});

let rosterSlot = 0;
const seedRoster = (userId) => {
  const base = new Date('2026-03-02T03:00:00Z').getTime();
  const startTime = new Date(base + rosterSlot++ * 86400000);
  return fx.createSchedule({
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

const createShortTextQuiz = (token, overrides = {}) =>
  createQuiz(token, {
    passingScorePercent: 100,
    items: [
      {
        type: 'short_text',
        prompt: 'Explain the safety rule',
        acceptedAnswers: ['wear goggles'],
        points: 2,
      },
    ],
    ...overrides,
  });

const questionBody = (overrides = {}) => ({
  type: 'single_choice',
  prompt: 'What does LMS stand for?',
  options: ['Learning Management System', 'Lesson Map Sheet'],
  correctOptionIndexes: [0],
  points: 2,
  tags: ['lms'],
  ...overrides,
});

const createQuestion = (token, overrides) =>
  request(app)
    .post('/api/assessment/question-bank')
    .set('Authorization', `Bearer ${token}`)
    .set(csrf)
    .send(questionBody(overrides));

const attempt = (token, assessmentId, answers) =>
  request(app)
    .post(`/api/assessment/assessments/${assessmentId}/attempts`)
    .set('Authorization', `Bearer ${token}`)
    .set(csrf)
    .send({ answers });

const manualGrade = (token, attemptId, answers) =>
  request(app)
    .put(`/api/assessment/attempts/${attemptId}/manual-grade`)
    .set('Authorization', `Bearer ${token}`)
    .set(csrf)
    .send({ answers });

describe('Assessment API — authoring, attempts, grading', () => {
  test('admin manages question-bank items; participant is blocked', async () => {
    const blocked = await createQuestion(tokens.leader);
    expect(blocked.status).toBe(403);

    const created = await createQuestion(tokens.admin);
    expect(created.status).toBe(201);
    expect(created.body.data.correctOptionIndexes).toEqual([0]);
    expect(created.body.data.tags).toEqual(['lms']);

    const updated = await request(app)
      .put(`/api/assessment/question-bank/${created.body.data.id}`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send(questionBody({ prompt: 'Updated prompt', tags: ['updated'] }));
    expect(updated.status).toBe(200);
    expect(updated.body.data.prompt).toBe('Updated prompt');

    const list = await request(app)
      .get('/api/assessment/question-bank?tag=updated')
      .set('Authorization', `Bearer ${tokens.admin}`);
    expect(list.status).toBe(200);
    expect(list.body.count).toBe(1);

    const archived = await request(app)
      .delete(`/api/assessment/question-bank/${created.body.data.id}`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf);
    expect(archived.status).toBe(200);

    const hidden = await request(app)
      .get('/api/assessment/question-bank')
      .set('Authorization', `Bearer ${tokens.admin}`);
    expect(hidden.body.count).toBe(0);
  });

  test('admin creates an assessment by importing question-bank items', async () => {
    const q = await createQuestion(tokens.admin);
    const res = await createQuiz(tokens.admin, {
      items: undefined,
      questionBankItemIds: [q.body.data.id],
    });

    expect(res.status).toBe(201);
    expect(res.body.data.itemCount).toBe(1);
    expect(res.body.data.items[0].prompt).toBe('What does LMS stand for?');
    expect(res.body.data.items[0].questionBankItemId).toBe(q.body.data.id);
    expect(res.body.data.items[0].correctOptionIndexes).toEqual([0]);
  });

  test('archived question-bank items cannot be imported', async () => {
    const q = await createQuestion(tokens.admin);
    await request(app)
      .delete(`/api/assessment/question-bank/${q.body.data.id}`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf);

    const res = await createQuiz(tokens.admin, {
      items: undefined,
      questionBankItemIds: [q.body.data.id],
    });
    expect(res.status).toBe(404);
  });

  test('admin creates an assessment (201, answers visible to author)', async () => {
    const res = await createQuiz(tokens.admin);
    expect(res.status).toBe(201);
    expect(res.body.data.itemCount).toBe(1);
    expect(res.body.data.items[0].correctOptionIndexes).toEqual([1]);
    expect(res.body.data.items[0].id).toBeTruthy();
  });

  test('exam settings (timeLimit/shuffle/showAnswers) round-trip through create', async () => {
    const res = await createQuiz(tokens.admin, {
      timeLimitMinutes: 30,
      shuffleQuestions: true,
      showAnswersAfter: true,
    });
    expect(res.status).toBe(201);
    expect(res.body.data.timeLimitMinutes).toBe(30);
    expect(res.body.data.shuffleQuestions).toBe(true);
    expect(res.body.data.showAnswersAfter).toBe(true);
  });

  test('exam settings default to off when omitted', async () => {
    const res = await createQuiz(tokens.admin);
    expect(res.status).toBe(201);
    expect(res.body.data.timeLimitMinutes).toBe(0);
    expect(res.body.data.shuffleQuestions).toBe(false);
    expect(res.body.data.showAnswersAfter).toBe(false);
  });

  test('a participant cannot author an assessment (403); a teacher can (201)', async () => {
    await seedRoster(seed.leader._id);
    const blocked = await createQuiz(tokens.leader);
    expect(blocked.status).toBe(403);

    const teacher = await createQuiz(tokens.teacher);
    expect(teacher.status).toBe(201);
  });

  test('QB-007: teacher assessment read/manage is scoped to bound cohorts', async () => {
    await updateActiveRow('Class', seed.class1._id, { teacherIds: [seed.admin._id.toString()] });
    await seedRoster(seed.leader._id);

    const createDenied = await createQuiz(tokens.teacher);
    expect(createDenied.status).toBe(403);

    const created = await createShortTextQuiz(tokens.admin);
    const itemId = created.body.data.items[0].id;

    const listDenied = await request(app)
      .get(`/api/assessment/assessments?cohortId=${seed.class1._id}`)
      .set('Authorization', `Bearer ${tokens.teacher}`);
    expect(listDenied.status).toBe(403);

    const getDenied = await request(app)
      .get(`/api/assessment/assessments/${created.body.data.id}`)
      .set('Authorization', `Bearer ${tokens.teacher}`);
    expect(getDenied.status).toBe(403);

    const updateDenied = await request(app)
      .put(`/api/assessment/assessments/${created.body.data.id}`)
      .set('Authorization', `Bearer ${tokens.teacher}`)
      .set(csrf)
      .send(quizBody({ title: 'Should not update' }));
    expect(updateDenied.status).toBe(403);

    const submitted = await attempt(tokens.leader, created.body.data.id, [{ itemId, text: 'review me' }]);
    expect(submitted.status).toBe(201);

    const attemptsDenied = await request(app)
      .get(`/api/assessment/attempts?cohortId=${seed.class1._id}`)
      .set('Authorization', `Bearer ${tokens.teacher}`);
    expect(attemptsDenied.status).toBe(403);

    const gradeDenied = await manualGrade(tokens.teacher, submitted.body.data.id, [
      { itemId, pointsEarned: 1 },
    ]);
    expect(gradeDenied.status).toBe(403);

    const archiveDenied = await request(app)
      .delete(`/api/assessment/assessments/${created.body.data.id}`)
      .set('Authorization', `Bearer ${tokens.teacher}`)
      .set(csrf);
    expect(archiveDenied.status).toBe(403);
  });

  test('admin updates assessment metadata and items; participant cannot update', async () => {
    const created = await createQuiz(tokens.admin);
    const body = quizBody({
      title: 'Updated quiz',
      isPublished: false,
      passingScorePercent: 80,
      items: [
        {
          type: 'multiple_choice',
          prompt: 'Pick even numbers',
          options: ['1', '2', '4'],
          correctOptionIndexes: [1, 2],
          points: 2,
        },
      ],
    });

    const blocked = await request(app)
      .put(`/api/assessment/assessments/${created.body.data.id}`)
      .set('Authorization', `Bearer ${tokens.leader}`)
      .set(csrf)
      .send(body);
    expect(blocked.status).toBe(403);

    const updated = await request(app)
      .put(`/api/assessment/assessments/${created.body.data.id}`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send(body);
    expect(updated.status).toBe(200);
    expect(updated.body.data.title).toBe('Updated quiz');
    expect(updated.body.data.isPublished).toBe(false);
    expect(updated.body.data.items[0].type).toBe('multiple_choice');
    expect(updated.body.data.items[0].correctOptionIndexes).toEqual([1, 2]);

    const stored = await readActiveRow('Assessment', created.body.data.id);
    expect(stored.items).toHaveLength(1);
    expect(stored.items[0].prompt).toBe('Pick even numbers');
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

  test('admin manually grades a short_text answer and recomputes pass state', async () => {
    await seedRoster(seed.leader._id);
    const created = await createShortTextQuiz(tokens.admin);
    const itemId = created.body.data.items[0].id;
    const submitted = await attempt(tokens.leader, created.body.data.id, [
      { itemId, text: 'almost right' },
    ]);
    expect(submitted.body.data.passed).toBe(false);

    const graded = await manualGrade(tokens.admin, submitted.body.data.id, [
      { itemId, pointsEarned: 2, note: 'Accepted by reviewer' },
    ]);
    expect(graded.status).toBe(200);
    expect(graded.body.data.score).toBe(2);
    expect(graded.body.data.scorePercent).toBe(100);
    expect(graded.body.data.passed).toBe(true);
    expect(graded.body.data.answers[0].manualPointsEarned).toBe(2);
    expect(graded.body.data.answers[0].manualNote).toBe('Accepted by reviewer');

    const stored = await readActiveRow('AssessmentAttempt', submitted.body.data.id);
    expect(stored.passed).toBe(true);
    expect(stored.answers[0].manualGradedBy.toString()).toBe(seed.admin._id.toString());
  });

  test('teacher can manually grade; participant cannot', async () => {
    await seedRoster(seed.leader._id);
    const created = await createShortTextQuiz(tokens.admin);
    const itemId = created.body.data.items[0].id;
    const submitted = await attempt(tokens.leader, created.body.data.id, [{ itemId, text: 'no' }]);

    const blocked = await manualGrade(tokens.leader, submitted.body.data.id, [{ itemId, pointsEarned: 1 }]);
    expect(blocked.status).toBe(403);

    const teacher = await manualGrade(tokens.teacher, submitted.body.data.id, [{ itemId, pointsEarned: 1 }]);
    expect(teacher.status).toBe(200);
    expect(teacher.body.data.score).toBe(1);
  });

  test('manual grading rejects choice items and out-of-range scores', async () => {
    await seedRoster(seed.leader._id);
    const choice = await createQuiz(tokens.admin);
    const choiceItemId = choice.body.data.items[0].id;
    const choiceAttempt = await attempt(tokens.leader, choice.body.data.id, [
      { itemId: choiceItemId, selectedOptionIndexes: [0] },
    ]);
    const rejectedType = await manualGrade(tokens.admin, choiceAttempt.body.data.id, [
      { itemId: choiceItemId, pointsEarned: 1 },
    ]);
    expect(rejectedType.status).toBe(422);

    const short = await createShortTextQuiz(tokens.admin);
    const shortItemId = short.body.data.items[0].id;
    const shortAttempt = await attempt(tokens.leader, short.body.data.id, [{ itemId: shortItemId, text: 'no' }]);
    const rejectedScore = await manualGrade(tokens.admin, shortAttempt.body.data.id, [
      { itemId: shortItemId, pointsEarned: 3 },
    ]);
    expect(rejectedScore.status).toBe(422);
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
    const stored = await readActiveRow('Assessment', created.body.data.id);
    expect(stored.isDeleted).toBe(true);
  });

  test('a passing attempt satisfies completionPolicy.requiresAssessment', async () => {
    const program = await fx.createLearningProgram({
      code: `ASMT_${Date.now()}`,
      name: 'Assessment Program',
      completionPolicy: { attendanceThresholdPercent: 0, requiresAssessment: true },
    });
    await updateActiveRow('Class', seed.class1._id, { programId: program._id });
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

  test('manual grading can make a short_text attempt satisfy completion', async () => {
    const program = await fx.createLearningProgram({
      code: `MGR_${Date.now()}`,
      name: 'Manual Grade Program',
      completionPolicy: { attendanceThresholdPercent: 0, requiresAssessment: true },
    });
    await updateActiveRow('Class', seed.class1._id, { programId: program._id });
    await seedRoster(seed.leader._id);

    const created = await createShortTextQuiz(tokens.admin);
    const itemId = created.body.data.items[0].id;
    const submitted = await attempt(tokens.leader, created.body.data.id, [{ itemId, text: 'wrong' }]);

    const before = await request(app)
      .get(`/api/learning/completion?cohortId=${seed.class1._id}&learnerId=${seed.leader._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`);
    expect(before.body.data.assessment.met).toBe(false);

    await manualGrade(tokens.admin, submitted.body.data.id, [{ itemId, pointsEarned: 2 }]);

    const after = await request(app)
      .get(`/api/learning/completion?cohortId=${seed.class1._id}&learnerId=${seed.leader._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`);
    expect(after.body.data.assessment.met).toBe(true);
    expect(after.body.data.assessment.attemptScorePercent).toBe(100);
    expect(after.body.data.complete).toBe(true);
  });
});
