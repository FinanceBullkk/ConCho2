const { getApp, getSeedData, teardown } = require('../setup');
const LearningProgram = require('../../models/LearningProgram');
const Class = require('../../models/Class');
const Certificate = require('../../models/Certificate');
const Enrollment = require('../../models/Enrollment');
const {
  completedProgramUserIds,
  hasCompletedProgram,
} = require('../../domains/learning/enrollment/prerequisites');

// Audit P1: the org-wide compliance report fanned out hasCompletedProgram PER
// learner (unbounded by department size). completedProgramUserIds batches the
// cheap discriminators + parallelizes the residual completion evaluations. This
// test proves the batched result is IDENTICAL to the per-user path it replaces.

let app, seed;

beforeAll(async () => {
  app = await getApp();
  seed = getSeedData();
});

afterAll(async () => {
  await teardown();
});

describe('completedProgramUserIds — batched == per-user hasCompletedProgram (audit P1)', () => {
  test('matches the per-user result across cert / enrolled-incomplete / unrelated learners', async () => {
    const stamp = Date.now();
    const program = await LearningProgram.create({
      code: `TEST_CMP_${stamp}`,
      name: 'Compliance Batch Test',
      category: 'onboarding',
      defaultSessionCount: 3,
      schedulingMode: 'admin_scheduled',
      // Require an assessment so an enrolled-but-unassessed learner is genuinely
      // NOT complete (without a policy, the engine treats a session-less cohort
      // as vacuously complete — 0% attendance meets the default 0% threshold).
      completionPolicy: { requiresAssessment: true },
    });
    const cohort = await Class.create({
      classCode: `CMP_TEST_${stamp}`,
      courseName: program.name,
      programId: program._id,
      totalSessions: 3,
      status: 'Ongoing',
    });

    // leader: Issued program-level certificate → complete via the cert fast-path.
    await Certificate.create({
      certificateNumber: `CERT-CMP-${stamp}`,
      verificationCode: `cmp-${stamp}`,
      userId: seed.leader._id,
      cohortId: cohort._id,
      programId: program._id,
      status: 'Issued',
      issuedAt: new Date(),
    });
    // member1: enrolled in the cohort but NO completion evidence → not complete
    // (exercises participation discovery + the completion engine returning false).
    await Enrollment.create({
      userId: seed.member1._id,
      classId: cohort._id,
      status: 'Active',
      joinedAt: new Date(),
    });
    // member2: no cert, no participation → not complete.

    const userIds = [seed.leader._id, seed.member1._id, seed.member2._id];

    // Per-user truth — the original code path (still exported).
    const expected = new Set();
    for (const id of userIds) {
      // eslint-disable-next-line no-await-in-loop -- test fixture is tiny
      if (await hasCompletedProgram(id, program._id)) expected.add(String(id));
    }

    const batched = await completedProgramUserIds(userIds, program._id);

    // Identical to the per-user result it replaces.
    expect([...batched].sort()).toEqual([...expected].sort());
    // And the expected per-branch outcomes.
    expect(batched.has(String(seed.leader._id))).toBe(true);
    expect(batched.has(String(seed.member1._id))).toBe(false);
    expect(batched.has(String(seed.member2._id))).toBe(false);
  });

  test('empty inputs are safe', async () => {
    expect((await completedProgramUserIds([], seed.class1._id)).size).toBe(0);
    expect((await completedProgramUserIds([seed.member1._id], null)).size).toBe(0);
  });
});
