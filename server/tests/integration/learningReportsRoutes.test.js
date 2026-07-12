const request = require('supertest');
const { getApp, getTokens, getSeedData, getCsrfHeaders, teardown } = require('../setup');
const { deleteActiveRowsWhere, updateActiveRow } = require('../pg-test-utils');
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
    deleteActiveRowsWhere('Schedule', {}),
    deleteActiveRowsWhere('Attendance', {}),
    deleteActiveRowsWhere('Certificate', {}),
    deleteActiveRowsWhere('Evaluation', {}),
    deleteActiveRowsWhere('Feedback', {}),
    deleteActiveRowsWhere('AssessmentAttempt', {}),
    deleteActiveRowsWhere('LearningProgram', {}),
  ]);
  await Promise.all([
    updateActiveRow('Class', seed.class1._id, { programId: null, teacherIds: [] }),
    updateActiveRow('Class', seed.class2._id, { programId: null, teacherIds: [] }),
  ]);
});

// Seed `total` sessions for class1 with [member1, member2] on the roster, and
// mark member1 Present on `m1Attended` of them (member2 attends none).
const seedCohort = async (total, m1Attended) => {
  const base = new Date('2026-04-06T03:00:00Z').getTime();
  // Promise.all preserves array order → created[i] maps to session i.
  const created = await Promise.all(
    Array.from({ length: total }, (_, i) => fx.createSchedule({
      classId: seed.class1._id,
      bookedTeamId: seed.team._id,
      startTime: new Date(base + i * 86400000),
      endTime: new Date(base + i * 86400000 + 3600000),
      enrolledUsers: [seed.member1._id, seed.member2._id],
    })),
  );
  await Promise.all(
    created.slice(0, m1Attended).map((s) =>
      fx.createAttendance({ scheduleId: s._id, userId: seed.member1._id, status: 'P' })),
  );
};

const linkProgram = async (completionPolicy) => {
  const program = await fx.createLearningProgram({
    code: `RPT_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    name: 'Report Program',
    completionPolicy,
  });
  await updateActiveRow('Class', seed.class1._id, { programId: program._id });
  return program;
};

const report = (token) =>
  request(app)
    .get(`/api/learning/reports/completion?cohortId=${seed.class1._id}`)
    .set('Authorization', `Bearer ${token}`);

const rollup = (token) =>
  request(app)
    .get('/api/learning/reports/completion/rollup')
    .set('Authorization', `Bearer ${token}`);

describe('Learning Platform API — completion reports', () => {
  test('report aggregates cohort learners with per-learner completion + summary', async () => {
    await linkProgram({ attendanceThresholdPercent: 50 });
    await seedCohort(4, 2); // member1 = 50% (complete), member2 = 0% (incomplete)

    const res = await report(tokens.admin);
    expect(res.status).toBe(200);
    expect(res.body.data.summary.total).toBe(2);
    expect(res.body.data.summary.complete).toBe(1);
    expect(res.body.data.summary.completionRate).toBe(50);

    const byId = Object.fromEntries(res.body.data.rows.map((r) => [r.learner.id, r]));
    expect(byId[seed.member1._id.toString()].complete).toBe(true);
    expect(byId[seed.member1._id.toString()].attendancePercent).toBe(50);
    expect(byId[seed.member2._id.toString()].complete).toBe(false);
  });

  test('certificate status is reflected in the report', async () => {
    await linkProgram({ attendanceThresholdPercent: 50 });
    await seedCohort(4, 2);

    await request(app)
      .post('/api/learning/certificates')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({ cohortId: seed.class1._id.toString(), userId: seed.member1._id.toString() });

    const res = await report(tokens.admin);
    expect(res.body.data.summary.certificatesIssued).toBe(1);
    const m1 = res.body.data.rows.find((r) => r.learner.id === seed.member1._id.toString());
    expect(m1.certificate.status).toBe('Issued');
    expect(m1.certificate.number).toMatch(/^CERT-\d{4}-\d{6}$/);
  });

  test('QB-009: soft-deleted (offboarded) learners are excluded from the denominator', async () => {
    await linkProgram({ attendanceThresholdPercent: 50 });

    // A throwaway learner who will be offboarded mid-cohort.
    const ghost = await fx.createUser({
      empCode: 'QB9-' + Math.random().toString(16).slice(2, 7),
      name: 'Offboarded Learner',
      role: 'Participant',
      password: 'qb9-offb-pwd-123',
    });

    // One session: member1 present (100% → complete), ghost on roster but absent.
    const start = new Date('2026-04-06T03:00:00Z');
    const sched = await fx.createSchedule({
      classId: seed.class1._id,
      bookedTeamId: seed.team._id,
      startTime: start,
      endTime: new Date(start.getTime() + 3600000),
      enrolledUsers: [seed.member1._id, ghost._id],
    });
    await fx.createAttendance({ scheduleId: sched._id, userId: seed.member1._id, status: 'P' });

    // Before offboarding: both learners count → total 2.
    const before = await report(tokens.admin);
    expect(before.body.data.summary.total).toBe(2);

    // Offboard ghost: soft-delete directly on the active backend (bypass
    // userController) — the exact state QB-009 is about, id still on the roster.
    await updateActiveRow('User', ghost._id, { isDeleted: true, deletedAt: new Date() });

    // After: ghost is dropped from rows + denominator; rate reflects active only.
    const after = await report(tokens.admin);
    expect(after.body.data.summary.total).toBe(1);
    expect(after.body.data.rows.map((r) => r.learner.id)).not.toContain(ghost._id.toString());
    expect(after.body.data.summary.completionRate).toBe(100);

    await deleteActiveRowsWhere('User', { _id: ghost._id });
  });

  test('a participant cannot read cohort reports (403); a teacher can (200)', async () => {
    await linkProgram({ attendanceThresholdPercent: 0 });
    await seedCohort(1, 0);

    expect((await report(tokens.leader)).status).toBe(403);
    expect((await report(tokens.teacher)).status).toBe(200);
  });

  test('QB-007: teacher completion reports are scoped to bound cohorts', async () => {
    await linkProgram({ attendanceThresholdPercent: 50 });
    await seedCohort(1, 1);
    // Array id fields go to PG as STRING ids (batch-15 lesson).
    await Promise.all([
      updateActiveRow('Class', seed.class1._id, { teacherIds: [seed.admin._id.toString()] }),
      updateActiveRow('Class', seed.class2._id, { teacherIds: [seed.admin._id.toString()] }),
    ]);

    expect((await report(tokens.admin)).status).toBe(200);
    expect((await report(tokens.teacher)).status).toBe(403);

    const exported = await request(app)
      .get(`/api/learning/reports/completion/export?cohortId=${seed.class1._id}`)
      .set('Authorization', `Bearer ${tokens.teacher}`)
      .buffer(true);
    expect(exported.status).toBe(403);

    const scopedRollup = await rollup(tokens.teacher);
    expect(scopedRollup.status).toBe(200);
    expect(scopedRollup.body.data.summary.cohorts).toBe(0);
    expect(scopedRollup.body.data.summary.learners).toBe(0);
  });

  test('rollup aggregates completion by program and department', async () => {
    await linkProgram({ attendanceThresholdPercent: 50 });
    await seedCohort(4, 2);

    const res = await rollup(tokens.admin);
    expect(res.status).toBe(200);
    expect(res.body.data.summary.learners).toBeGreaterThanOrEqual(2);
    expect(res.body.data.summary.complete).toBeGreaterThanOrEqual(1);

    const program = res.body.data.programs.find((row) => row.label === 'Report Program');
    expect(program.learners).toBe(2);
    expect(program.complete).toBe(1);
    expect(program.completionRate).toBe(50);

    const departmentsTotal = res.body.data.departments.reduce((sum, row) => sum + row.learners, 0);
    expect(departmentsTotal).toBe(res.body.data.summary.learners);
  });

  test('rollup uses batched completion signals instead of per-learner reports', async () => {
    const program = await linkProgram({
      attendanceThresholdPercent: 50,
      requiresAssessment: true,
      requiresFeedback: true,
    });
    await seedCohort(4, 2);
    await fx.createEvaluation({
      classId: seed.class1._id,
      userId: seed.member1._id,
      grammarScore: 8,
      vocabularyScore: 8,
      pronunciationScore: 8,
      fluencyScore: 8,
    });
    await fx.createFeedback({
      cohortId: seed.class1._id,
      programId: program._id,
      userId: seed.member1._id,
      rating: 5,
    });

    const completionUseCases = require('../../domains/learning/completion/use-cases');
    const spy = jest.spyOn(completionUseCases, 'evaluateCompletion');

    const res = await rollup(tokens.admin);
    expect(res.status).toBe(200);
    expect(spy).not.toHaveBeenCalled();

    const programRow = res.body.data.programs.find((row) => row.label === 'Report Program');
    expect(programRow.learners).toBe(2);
    expect(programRow.complete).toBe(1);
    expect(programRow.completionRate).toBe(50);

    spy.mockRestore();
  });

  test('rollup counts a passing assessment attempt toward assessment-required completion', async () => {
    await linkProgram({
      attendanceThresholdPercent: 50,
      requiresAssessment: true,
    });
    await seedCohort(4, 2);
    await fx.createAssessmentAttempt({
      assessmentId: seed.class1._id,
      cohortId: seed.class1._id,
      userId: seed.member1._id,
      answers: [],
      score: 1,
      maxScore: 1,
      scorePercent: 100,
      passed: true,
    });

    const res = await rollup(tokens.admin);
    expect(res.status).toBe(200);

    const programRow = res.body.data.programs.find((row) => row.label === 'Report Program');
    expect(programRow.learners).toBe(2);
    expect(programRow.complete).toBe(1);
    expect(programRow.completionRate).toBe(50);
  });

  test('a participant cannot read rollups (403); a teacher can (200)', async () => {
    await linkProgram({ attendanceThresholdPercent: 0 });
    await seedCohort(1, 0);

    expect((await rollup(tokens.leader)).status).toBe(403);
    expect((await rollup(tokens.teacher)).status).toBe(200);
  });

  test('export returns an xlsx attachment with the learner count header', async () => {
    await linkProgram({ attendanceThresholdPercent: 50 });
    await seedCohort(2, 1);

    const res = await request(app)
      .get(`/api/learning/reports/completion/export?cohortId=${seed.class1._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .buffer(true);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('spreadsheetml.sheet');
    expect(res.headers['content-disposition']).toContain('completion-');
    expect(res.headers['x-tms-record-count']).toBe('2');
  });

  test('unknown cohort → 404', async () => {
    const res = await request(app)
      .get('/api/learning/reports/completion?cohortId=64b000000000000000000000')
      .set('Authorization', `Bearer ${tokens.admin}`);
    expect(res.status).toBe(404);
  });
});
