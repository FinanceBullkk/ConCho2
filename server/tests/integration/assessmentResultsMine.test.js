const request = require('supertest');
const jwt = require('jsonwebtoken');
const { getApp, getSeedData, teardown } = require('../setup');
const Assessment = require('../../models/Assessment');
const AssessmentAttempt = require('../../models/AssessmentAttempt');
const Evaluation = require('../../models/Evaluation');

// Rearchitecture Phase 1 — the unified assessment-results read. ONE self-scoped
// surface returns BOTH assessment modes: learner-attempted quiz results and
// instructor-scored English evaluations (the legacy rubric, adapted).

let app, seed, memberToken;

beforeAll(async () => {
  app = await getApp();
  seed = getSeedData();
  memberToken = jwt.sign({ id: seed.member1._id.toString() }, process.env.JWT_SECRET, { expiresIn: '1h' });
});

afterAll(async () => { await teardown(); });

afterEach(async () => {
  await Promise.all([
    Assessment.deleteMany({}),
    AssessmentAttempt.deleteMany({}),
    Evaluation.deleteMany({}),
  ]);
});

const getMine = (token) =>
  request(app).get('/api/assessment/results/mine').set('Authorization', `Bearer ${token}`);

describe('GET /api/assessment/results/mine — unified assessment results (Phase 1)', () => {
  test('returns an empty list when the learner has no results', async () => {
    const res = await getMine(memberToken);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual([]);
  });

  test('includes an instructor-scored English evaluation as one result', async () => {
    await Evaluation.create({
      classId: seed.class1._id, userId: seed.member1._id,
      grammarScore: 8, vocabularyScore: 7, pronunciationScore: 9, fluencyScore: 6,
      level: 'B2', createdBy: seed.teacher._id,
    });
    const res = await getMine(memberToken);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    const r = res.body.data[0];
    expect(r.source).toBe('evaluation');
    expect(r.averageScore).toBe(7.5);   // (8+7+9+6)/4
    expect(r.scorePercent).toBe(75);    // avg * 10
    expect(r.passed).toBe(true);
    expect(r.title).toMatch(/evaluation/i);
  });

  test('includes a learner-attempted quiz result', async () => {
    const quiz = await Assessment.create({ title: 'Unit 1 Quiz', cohortId: seed.class1._id, items: [{ type: 'single_choice', prompt: 'Q', options: ['a', 'b'], correctOptionIndexes: [0], points: 1 }] });
    await AssessmentAttempt.create({
      assessmentId: quiz._id, userId: seed.member1._id, cohortId: seed.class1._id,
      score: 9, maxScore: 10, scorePercent: 90, passed: true,
    });
    const res = await getMine(memberToken);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    const r = res.body.data[0];
    expect(r.source).toBe('quiz');
    expect(r.title).toBe('Unit 1 Quiz');
    expect(r.scorePercent).toBe(90);
    expect(r.passed).toBe(true);
  });

  test('merges BOTH modes into one list', async () => {
    const quiz = await Assessment.create({ title: 'Quiz', cohortId: seed.class1._id, items: [{ type: 'single_choice', prompt: 'Q', options: ['a', 'b'], correctOptionIndexes: [0], points: 1 }] });
    await AssessmentAttempt.create({
      assessmentId: quiz._id, userId: seed.member1._id, cohortId: seed.class1._id,
      scorePercent: 80, passed: true,
    });
    await Evaluation.create({
      classId: seed.class1._id, userId: seed.member1._id,
      grammarScore: 5, vocabularyScore: 5, pronunciationScore: 5, fluencyScore: 5,
    });
    const res = await getMine(memberToken);
    expect(res.body.data).toHaveLength(2);
    const sources = res.body.data.map((r) => r.source).sort();
    expect(sources).toEqual(['evaluation', 'quiz']);
  });

  test('is self-scoped — another learner\'s results never leak', async () => {
    const quiz = await Assessment.create({ title: 'Other Quiz', cohortId: seed.class1._id, items: [{ type: 'single_choice', prompt: 'Q', options: ['a', 'b'], correctOptionIndexes: [0], points: 1 }] });
    await AssessmentAttempt.create({
      assessmentId: quiz._id, userId: seed.member2._id, cohortId: seed.class1._id,
      scorePercent: 100, passed: true,
    });
    await Evaluation.create({
      classId: seed.class1._id, userId: seed.member2._id,
      grammarScore: 9, vocabularyScore: 9, pronunciationScore: 9, fluencyScore: 9,
    });
    const res = await getMine(memberToken);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]); // member1 owns nothing here
  });
});
