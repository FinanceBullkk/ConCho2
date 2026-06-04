const request = require('supertest');
const { getApp, getTokens, getSeedData, getCsrfHeaders, teardown } = require('../setup');
const LearningProgram = require('../../models/LearningProgram');
const Class = require('../../models/Class');
const Enrollment = require('../../models/Enrollment');
const Certificate = require('../../models/Certificate');

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
    Enrollment.deleteMany({ teamId: null }),
    Certificate.deleteMany({}),
    LearningProgram.deleteMany({}),
    Class.deleteMany({ classCode: /^PRQ/ }),
  ]);
});

let seq = 0;
const uniq = () => `${Date.now()}_${seq++}`;

// Create prereq program A, self-enroll program B (requires A), and a cohort for
// each. Returns { progA, progB, cohortA, cohortB }.
const setupPrograms = async () => {
  const progA = await LearningProgram.create({
    code: `PREQA_${uniq()}`, name: `Prereq A ${uniq()}`, schedulingMode: 'self_enroll',
  });
  const progB = await LearningProgram.create({
    code: `PREQB_${uniq()}`, name: `Program B ${uniq()}`, schedulingMode: 'self_enroll',
    prerequisitePrograms: [progA._id],
  });
  const cohortA = await Class.create({
    classCode: `PRQA${seq++}`, courseName: progA.name, programId: progA._id, totalSessions: 1,
  });
  const cohortB = await Class.create({
    classCode: `PRQB${seq++}`, courseName: progB.name, programId: progB._id, totalSessions: 1,
  });
  return { progA, progB, cohortA, cohortB };
};

const selfEnroll = (cohortId, token) =>
  request(app)
    .post('/api/learning/enrollments')
    .set('Authorization', `Bearer ${token}`)
    .set(csrf)
    .send({ cohortId: cohortId.toString() });

const issueCertFor = (userId, programId, cohortId) =>
  Certificate.create({
    certificateNumber: `CERT-TEST-${uniq()}`,
    verificationCode: `vc_${uniq()}`,
    userId, programId, cohortId, status: 'Issued',
  });

describe('Learning Platform API — prerequisite gating', () => {
  test('self-enroll is blocked (422) when a prerequisite program is not completed', async () => {
    const { progA, cohortB } = await setupPrograms();
    const res = await selfEnroll(cohortB._id, tokens.leader);
    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain(progA.name); // names the unmet prerequisite
  });

  test('self-enroll succeeds once the prerequisite is completed (Issued certificate)', async () => {
    const { progA, cohortA, cohortB } = await setupPrograms();
    await issueCertFor(seed.leader._id, progA._id, cohortA._id);

    const res = await selfEnroll(cohortB._id, tokens.leader);
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('Active');
  });

  test('an Admin may enroll a learner despite unmet prerequisites (override)', async () => {
    const { cohortB } = await setupPrograms();
    const res = await request(app)
      .post('/api/learning/enrollments')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({ cohortId: cohortB._id.toString(), userId: seed.member1._id.toString() });
    expect(res.status).toBe(201);
  });

  test('a program with no prerequisites self-enrolls freely', async () => {
    const prog = await LearningProgram.create({
      code: `NOPRQ_${uniq()}`, name: `No Prereq ${uniq()}`, schedulingMode: 'self_enroll',
    });
    const cohort = await Class.create({
      classCode: `PRQN${seq++}`, courseName: prog.name, programId: prog._id, totalSessions: 1,
    });
    const res = await selfEnroll(cohort._id, tokens.leader);
    expect(res.status).toBe(201);
  });

  test('program DTO exposes prerequisitePrograms', async () => {
    const { progA, progB } = await setupPrograms();
    const res = await request(app)
      .get(`/api/learning/programs/${progB._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`);
    expect(res.status).toBe(200);
    expect(res.body.data.prerequisitePrograms).toEqual([progA._id.toString()]);
  });
});
