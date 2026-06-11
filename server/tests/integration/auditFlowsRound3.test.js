/**
 * ──────────────────────────────────────────────────────────
 * Integration Tests — Audit Round 3 (Phase 03: Business Flows & UX)
 * ──────────────────────────────────────────────────────────
 * Regression coverage for the three fixes shipped this round:
 *
 *   FLOW-001  GET /api/evaluations/roster — Teacher-callable class roster.
 *             Before: the Add-evaluation learner picker used the Admin-only
 *             /api/users search → Teacher 403 → could never add an evaluation.
 *
 *   BUG-003a  GET /api/schedules — list rows carry enrolledCount.
 *             Before: `.lean({ virtuals:true })` is a no-op (no
 *             mongoose-lean-virtuals plugin) → enrolledCount undefined →
 *             admin grid rendered "/9" + a 0% bar.
 *
 *   BUG-003b  GET /api/learning/completion — assessment.averageScore present.
 *             Before: completion read the dropped averageScore virtual off a
 *             lean Evaluation → undefined in the compliance report.
 * ──────────────────────────────────────────────────────────
 */

const request = require('supertest');
const { getApp, getTokens, getSeedData, getCsrfHeaders, teardown } = require('../setup');

let app, tokens, seed, csrf;
let Class, Enrollment, Schedule, Evaluation;

beforeAll(async () => {
  app = await getApp();
  tokens = getTokens();
  seed = getSeedData();
  csrf = await getCsrfHeaders(app);
  Class = require('../../models/Class');
  Enrollment = require('../../models/Enrollment');
  Schedule = require('../../models/Schedule');
  Evaluation = require('../../models/Evaluation');
});

afterAll(async () => {
  await teardown();
});

let counter = 0;
const freshClass = async (over = {}) => {
  counter += 1;
  return Class.create({
    classCode: `R3_${Date.now()}_${counter}`,
    courseName: 'Round 3 Test Class',
    totalSessions: 10,
    ...over,
  });
};

// ── FLOW-001 — GET /api/evaluations/roster ───────────────────

describe('FLOW-001 — GET /api/evaluations/roster (class-scoped learner picker)', () => {
  let cls;

  beforeAll(async () => {
    cls = await freshClass();
    // Two Active enrolments + one Dropped (must be excluded from the roster).
    await Enrollment.create([
      { classId: cls._id, teamId: seed.team._id, userId: seed.member1._id, status: 'Active' },
      { classId: cls._id, teamId: seed.team._id, userId: seed.member2._id, status: 'Active' },
      { classId: cls._id, teamId: seed.team._id, userId: seed.leader._id, status: 'Dropped' },
    ]);
  });

  test('Teacher gets the roster (regression: was Admin-only 403 → empty picker)', async () => {
    const res = await request(app)
      .get('/api/evaluations/roster')
      .query({ classId: cls._id.toString() })
      .set('Authorization', `Bearer ${tokens.teacher}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const codes = res.body.data.map((u) => u.empCode);
    expect(codes).toContain(seed.member1.empCode);
    expect(codes).toContain(seed.member2.empCode);
    // Dropped enrolment excluded (status:'Active' filter).
    expect(codes).not.toContain(seed.leader.empCode);
    // Lightweight shape — no password / secrets leaked.
    expect(res.body.data[0]).toHaveProperty('name');
    expect(res.body.data[0]).not.toHaveProperty('password');
  });

  test('Admin gets the roster too', async () => {
    const res = await request(app)
      .get('/api/evaluations/roster')
      .query({ classId: cls._id.toString() })
      .set('Authorization', `Bearer ${tokens.admin}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(2);
  });

  test('Participant is denied (Admin/Teacher only)', async () => {
    const res = await request(app)
      .get('/api/evaluations/roster')
      .query({ classId: cls._id.toString() })
      .set('Authorization', `Bearer ${tokens.leader}`);
    expect(res.status).toBe(403);
  });

  test('missing classId → 400 (zod)', async () => {
    const res = await request(app)
      .get('/api/evaluations/roster')
      .set('Authorization', `Bearer ${tokens.teacher}`);
    expect(res.status).toBe(400);
  });

  test('malformed classId → 400 (zod objectId, never a CastError 500)', async () => {
    const res = await request(app)
      .get('/api/evaluations/roster')
      .query({ classId: 'not-an-object-id' })
      .set('Authorization', `Bearer ${tokens.teacher}`);
    expect(res.status).toBe(400);
  });

  test('valid but nonexistent classId → 404', async () => {
    const res = await request(app)
      .get('/api/evaluations/roster')
      .query({ classId: '0123456789abcdef01234567' })
      .set('Authorization', `Bearer ${tokens.admin}`);
    expect(res.status).toBe(404);
  });

  test('the picker is wired to a working upsert: Teacher can grade a rostered learner', async () => {
    // End-to-end: pick a learner from the roster, then upsert their scores.
    const upsert = await request(app)
      .post('/api/evaluations')
      .set('Authorization', `Bearer ${tokens.teacher}`)
      .set(csrf)
      .send({
        classId: cls._id.toString(),
        userId: seed.member1._id.toString(),
        grammarScore: 8, vocabularyScore: 7, pronunciationScore: 9, fluencyScore: 6,
      });
    expect(upsert.status).toBe(200);
    expect(upsert.body.data.userId.toString()).toBe(seed.member1._id.toString());
  });
});

// ── BUG-003a — GET /api/schedules carries enrolledCount ──────

describe('BUG-003a — GET /api/schedules returns enrolledCount', () => {
  let cls, schedule;

  beforeAll(async () => {
    cls = await freshClass();
    const start = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    schedule = await Schedule.create({
      classId: cls._id,
      bookedTeamId: seed.team._id,
      startTime: start,
      endTime: new Date(start.getTime() + 60 * 60 * 1000),
      enrolledUsers: [seed.member1._id, seed.member2._id],
    });
  });

  test('list row enrolledCount equals enrolledUsers.length (was undefined → "/9")', async () => {
    const res = await request(app)
      .get('/api/schedules')
      .query({ classId: cls._id.toString() })
      .set('Authorization', `Bearer ${tokens.admin}`);

    expect(res.status).toBe(200);
    const row = res.body.data.find((s) => s._id === schedule._id.toString());
    expect(row).toBeDefined();
    expect(row.enrolledCount).toBe(2);
  });
});

// ── BUG-003b — completion report carries averageScore ────────

describe('BUG-003b — GET /api/learning/completion averageScore', () => {
  let cls;

  beforeAll(async () => {
    cls = await freshClass();
    await Evaluation.create({
      classId: cls._id,
      userId: seed.member1._id,
      grammarScore: 8, vocabularyScore: 7, pronunciationScore: 9, fluencyScore: 6,
    });
  });

  test('averageScore computed from the 4 scores (was undefined off the dropped virtual)', async () => {
    const res = await request(app)
      .get('/api/learning/completion')
      .query({ cohortId: cls._id.toString(), learnerId: seed.member1._id.toString() })
      .set('Authorization', `Bearer ${tokens.admin}`);

    expect(res.status).toBe(200);
    // (8 + 7 + 9 + 6) / 4 = 7.5
    expect(res.body.data.assessment.averageScore).toBe(7.5);
  });
});
