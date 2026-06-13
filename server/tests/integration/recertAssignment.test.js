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
const Certificate = require('../../models/Certificate');
const LearningProgram = require('../../models/LearningProgram');
const Assignment = require('../../models/Assignment');
const { createRecertificationAssignments } = require('../../domains/learning/completion/recert-assignment-service');

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-07-01T00:00:00.000Z');
const inDays = (n) => new Date(NOW.getTime() + n * DAY_MS);

let seed, seq = 0;

beforeAll(async () => {
  await getApp();
  seed = getSeedData();
  await Assignment.init(); // build the sourceCertificateId partial unique index
});

afterAll(async () => {
  await teardown();
});

afterEach(async () => {
  await Certificate.deleteMany({});
  await Assignment.deleteMany({});
  await LearningProgram.deleteMany({});
});

const makeProgram = (autoAssign) =>
  LearningProgram.create({
    code: `RC${seq += 1}`, name: `Recert Program ${seq}`,
    schedulingMode: 'admin_scheduled',
    recertifyPolicy: { autoAssign },
  });

const makeCert = (programId, over = {}) => {
  seq += 1;
  return Certificate.create({
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
    const a = await Assignment.findOne({ sourceCertificateId: cert._id }).lean();
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
    expect(await Assignment.countDocuments({ sourceCertificateId: { $ne: null } })).toBe(1);
  });

  test('an archived recert assignment is NOT recreated (respects admin intent)', async () => {
    const program = await makeProgram(true);
    const cert = await makeCert(program._id);
    await createRecertificationAssignments({ now: NOW });
    await Assignment.updateOne(
      { sourceCertificateId: cert._id }, { $set: { isDeleted: true, deletedAt: NOW } },
    );

    const summary = await createRecertificationAssignments({ now: NOW });

    expect(summary.created).toBe(0);
    expect(summary.skipped).toBe(1);
    expect(await Assignment.countDocuments({ sourceCertificateId: cert._id })).toBe(1);
  });

  test('a program without autoAssign is untouched', async () => {
    const program = await makeProgram(false);
    await makeCert(program._id);

    const summary = await createRecertificationAssignments({ now: NOW });

    expect(summary.scanned).toBe(0);
    expect(summary.created).toBe(0);
    expect(await Assignment.countDocuments({})).toBe(0);
  });

  test('a cert outside the 30-day window is ignored', async () => {
    const program = await makeProgram(true);
    await makeCert(program._id, { validUntil: inDays(60) }); // too far
    await makeCert(program._id, { cohortId: seed.class2._id, validUntil: inDays(-5) }); // expired

    const summary = await createRecertificationAssignments({ now: NOW });

    expect(summary.scanned).toBe(0);
    expect(await Assignment.countDocuments({})).toBe(0);
  });
});
