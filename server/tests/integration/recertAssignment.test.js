/**
 * Integration Tests — Recertification auto-assignment (D6)
 *
 * For a program that opts in (recertifyPolicy.autoAssign), an expiring
 * certificate auto-creates a recert Assignment (due at validUntil). Idempotent
 * per certificate (incl. archived). Opt-out programs are untouched.
 *
 * Run: npm test -- --testPathPatterns=recertAssignment
 */

const { getApp, getSeedData, teardown } = require('../setup');
const { createRecertificationAssignments } = require('../../domains/learning/completion/recert-assignment-service');
// Active-backend readers (phase-05 A2): the recert service now writes/reads
// through the dual repositories — a Mongoose read is stale on the PG lane.
// Fixtures INSERT straight into PG.
const {
  findActiveRowWhere, countActiveRowsWhere, updateActiveRow, deleteActiveRowsWhere,
} = require('../pg-test-utils');
const fx = require('../fixtures/pg-fixtures');

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-07-01T00:00:00.000Z');
const inDays = (n) => new Date(NOW.getTime() + n * DAY_MS);

let seed, seq = 0;

beforeAll(async () => {
  await getApp();
  seed = getSeedData();
});

afterAll(async () => {
  await teardown();
});

afterEach(async () => {
  await Promise.all([
    deleteActiveRowsWhere('Certificate', {}),
    deleteActiveRowsWhere('Assignment', {}),
    deleteActiveRowsWhere('LearningProgram', {}),
  ]);
});

const makeProgram = (autoAssign) =>
  fx.createLearningProgram({
    code: `RC${seq += 1}`, name: `Recert Program ${seq}`,
    schedulingMode: 'admin_scheduled',
    recertifyPolicy: { autoAssign },
  });

const makeCert = (programId, over = {}) => {
  seq += 1;
  return fx.createCertificate({
    certificateNumber: `CERT-RC-${seq}`,
    verificationCode: `vrc-${seq}-${Math.random().toString(36).slice(2)}`,
    userId: seed.member1._id,
    cohortId: seed.class1._id,
    programId,
    programName: 'Recert Program',
    status: 'Issued',
    issuedAt: NOW,
    validUntil: inDays(10),
    ...over,
  });
};

describe('createRecertificationAssignments', () => {
  test('an expiring cert for an autoAssign program creates a recert assignment', async () => {
    const program = await makeProgram(true);
    const cert = await makeCert(program._id);

    const summary = await createRecertificationAssignments({ now: NOW });

    expect(summary.created).toBe(1);
    const a = await findActiveRowWhere('Assignment', { sourceCertificateId: cert._id });
    expect(a).toBeTruthy();
    expect(a.targetType).toBe('program');
    expect(String(a.programId)).toBe(String(program._id));
    expect(a.userIds.map(String)).toEqual([String(seed.member1._id)]);
    expect(new Date(a.dueDate).toISOString()).toBe(cert.validUntil.toISOString());
    expect(a.status).toBe('active');
  });

  test('is idempotent — a second run does not duplicate', async () => {
    const program = await makeProgram(true);
    await makeCert(program._id);

    await createRecertificationAssignments({ now: NOW });
    const second = await createRecertificationAssignments({ now: NOW });

    expect(second.created).toBe(0);
    expect(second.skipped).toBe(1);
    // Only recert assignments exist in this test → count-all ≡ the old $ne:null count.
    expect(await countActiveRowsWhere('Assignment', {})).toBe(1);
  });

  test('an archived recert assignment is NOT recreated (respects admin intent)', async () => {
    const program = await makeProgram(true);
    const cert = await makeCert(program._id);
    await createRecertificationAssignments({ now: NOW });
    // Archive on the ACTIVE backend — the assignment row lives where the app wrote it.
    const created = await findActiveRowWhere('Assignment', { sourceCertificateId: cert._id });
    await updateActiveRow('Assignment', created._id, { isDeleted: true, deletedAt: NOW });

    const summary = await createRecertificationAssignments({ now: NOW });

    expect(summary.created).toBe(0);
    expect(summary.skipped).toBe(1);
    expect(await countActiveRowsWhere('Assignment', { sourceCertificateId: cert._id })).toBe(1);
  });

  test('a program without autoAssign is untouched', async () => {
    const program = await makeProgram(false);
    await makeCert(program._id);

    const summary = await createRecertificationAssignments({ now: NOW });

    expect(summary.scanned).toBe(0);
    expect(summary.created).toBe(0);
    expect(await countActiveRowsWhere('Assignment', {})).toBe(0);
  });

  test('a cert outside the 30-day window is ignored', async () => {
    const program = await makeProgram(true);
    await makeCert(program._id, { validUntil: inDays(60) }); // too far
    await makeCert(program._id, { cohortId: seed.class2._id, validUntil: inDays(-5) }); // expired

    const summary = await createRecertificationAssignments({ now: NOW });

    expect(summary.scanned).toBe(0);
    expect(await countActiveRowsWhere('Assignment', {})).toBe(0);
  });
});
