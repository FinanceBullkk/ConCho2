const request = require('supertest');
const { getApp, getTokens, getSeedData, teardown } = require('../setup');
const { deleteActiveRowsWhere } = require('../pg-test-utils');
const fx = require('../fixtures/pg-fixtures');

// Converge Phase 4 — slice C1: the staff grading-queue read. ONE feed lists
// gradable UNITS across BOTH modes — quiz assessments needing manual review +
// rubric/English classes — scoped to what the actor can grade. Gated by
// assessment.manage (the grader/union gate).

let app, tokens, seed;

beforeAll(async () => {
  app = await getApp();
  tokens = getTokens();
  seed = getSeedData();
});

afterAll(async () => { await teardown(); });

afterEach(async () => {
  await Promise.all([
    deleteActiveRowsWhere('Assessment', {}),
    deleteActiveRowsWhere('AssessmentAttempt', {}),
    deleteActiveRowsWhere('Evaluation', {}),
  ]);
});

const getQueue = (token) =>
  request(app).get('/api/assessment/grading-queue').set('Authorization', `Bearer ${token}`);

describe('GET /api/assessment/grading-queue — staff grading queue (C1)', () => {
  test('quiz units = published short_text assessments + attempt counts; choice-only excluded', async () => {
    const shortQuiz = await fx.createAssessment({
      title: 'Writing Task', cohortId: seed.class1._id, isPublished: true,
      items: [{ type: 'short_text', prompt: 'Essay', points: 5 }],
    });
    await fx.createAssessmentAttempt({
      assessmentId: shortQuiz._id, userId: seed.member1._id, cohortId: seed.class1._id,
      scorePercent: 0, passed: false,
    });
    const choiceQuiz = await fx.createAssessment({
      title: 'MCQ', cohortId: seed.class1._id, isPublished: true,
      items: [{ type: 'single_choice', prompt: 'Q', options: ['a', 'b'], correctOptionIndexes: [0], points: 1 }],
    });

    const res = await getQueue(tokens.admin);
    expect(res.status).toBe(200);
    const quizIds = res.body.data.quiz.map((q) => q.id);
    expect(quizIds).toContain(shortQuiz._id.toString());
    expect(quizIds).not.toContain(choiceQuiz._id.toString());
    const unit = res.body.data.quiz.find((q) => q.id === shortQuiz._id.toString());
    expect(unit.mode).toBe('quiz');
    expect(unit.attemptCount).toBe(1);
  });

  test('unpublished short_text assessments are not in the queue', async () => {
    const draft = await fx.createAssessment({
      title: 'Draft', cohortId: seed.class1._id, isPublished: false,
      items: [{ type: 'short_text', prompt: 'Essay', points: 5 }],
    });
    const res = await getQueue(tokens.admin);
    expect(res.status).toBe(200);
    expect(res.body.data.quiz.map((q) => q.id)).not.toContain(draft._id.toString());
  });

  test('rubric units = team-world classes + evaluation counts; cohort-world excluded', async () => {
    await fx.createEvaluation({
      classId: seed.class1._id, userId: seed.member1._id,
      grammarScore: 6, vocabularyScore: 6, pronunciationScore: 6, fluencyScore: 6,
    });
    const prog = await fx.createLearningProgram({ code: 'PROG-C1', name: 'Cohort C1', schedulingMode: 'self_enroll' });
    const cohortClass = await fx.createClass({
      classCode: 'COHORTC1', courseName: 'Cohort C1 Class', totalSessions: 4, programId: prog._id,
    });

    const res = await getQueue(tokens.admin);
    expect(res.status).toBe(200);
    const rubricIds = res.body.data.rubric.map((r) => r.classId);
    expect(rubricIds).toContain(seed.class1._id.toString());       // team-world → included
    expect(rubricIds).not.toContain(cohortClass._id.toString());   // cohort-world → excluded
    const unit = res.body.data.rubric.find((r) => r.classId === seed.class1._id.toString());
    expect(unit.mode).toBe('rubric');
    expect(unit.evaluatedCount).toBeGreaterThanOrEqual(1);

    await deleteActiveRowsWhere('Class', { _id: cohortClass._id });
    await deleteActiveRowsWhere('LearningProgram', { _id: prog._id });
  });

  test('a learner (no assessment.manage) is denied', async () => {
    const res = await getQueue(tokens.leader);
    expect(res.status).toBe(403);
  });
});
