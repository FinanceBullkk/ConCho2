const request = require('supertest');
const { getApp, getTokens, getSeedData, getCsrfHeaders, teardown } = require('../setup');
const Assignment = require('../../models/Assignment');
const Attendance = require('../../models/Attendance');
const Certificate = require('../../models/Certificate');
const Class = require('../../models/Class');
const LearningProgram = require('../../models/LearningProgram');
const Schedule = require('../../models/Schedule');
// The certificate is issued through the ported completion PG repo (PG-only on
// the lane), so a Mongoose findByIdAndUpdate to backdate validUntil is a no-op —
// shift it on the active backend so the report sees the expired state.
const { updateActiveRow } = require('../pg-test-utils');

let app, tokens, seed, csrf;
let seq = 0;

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
    Assignment.deleteMany({}),
    Attendance.deleteMany({}),
    Certificate.deleteMany({}),
    LearningProgram.deleteMany({}),
    Schedule.deleteMany({}),
  ]);
  await Class.updateMany(
    { _id: { $in: [seed.class1._id, seed.class2._id] } },
    { $set: { programId: null, teacherIds: [] } },
  );
});

const createProgram = (overrides = {}) =>
  LearningProgram.create({
    code: `EXP_${Date.now()}_${seq++}`,
    name: 'Expiry Program',
    completionPolicy: { attendanceThresholdPercent: 0 },
    ...overrides,
  });

const seedCompleteCohort = async (program) => {
  await Class.findByIdAndUpdate(seed.class1._id, { programId: program._id });
  const start = new Date('2026-06-01T03:00:00.000Z');
  const schedule = await Schedule.create({
    classId: seed.class1._id,
    bookedTeamId: seed.team._id,
    startTime: start,
    endTime: new Date(start.getTime() + 3600000),
    enrolledUsers: [seed.member1._id],
  });
  await Attendance.create({ scheduleId: schedule._id, userId: seed.member1._id, status: 'P' });
};

const issueCertificate = () =>
  request(app)
    .post('/api/learning/certificates')
    .set('Authorization', `Bearer ${tokens.admin}`)
    .set(csrf)
    .send({ cohortId: seed.class1._id.toString(), userId: seed.member1._id.toString() });

describe('Learning Platform API — certificate expiry state', () => {
  test('issuing snapshots program certificate validity', async () => {
    const program = await createProgram({ certificateValidityDays: 90 });
    await seedCompleteCohort(program);

    const res = await issueCertificate();
    expect(res.status).toBe(201);
    expect(res.body.data.validityDays).toBe(90);
    expect(res.body.data.validFrom).toBeTruthy();
    expect(res.body.data.validUntil).toBeTruthy();
    expect(res.body.data.certificateState).toBe('issued');

    const issuedAt = new Date(res.body.data.issuedAt).getTime();
    const validUntil = new Date(res.body.data.validUntil).getTime();
    expect(validUntil - issuedAt).toBe(90 * 86400000);
  });

  test('completion and compliance reports expose expired certificate state', async () => {
    const program = await createProgram({ certificateValidityDays: 90 });
    await seedCompleteCohort(program);
    const issued = await issueCertificate();
    await updateActiveRow('Certificate', issued.body.data.id, {
      validUntil: new Date('2026-01-01T00:00:00.000Z'),
    });
    await Assignment.create({
      title: 'Expiry compliance',
      targetType: 'program',
      programId: program._id,
      dueDate: new Date(Date.now() + 7 * 86400000),
      userIds: [seed.member1._id],
    });

    const completion = await request(app)
      .get(`/api/learning/reports/completion?cohortId=${seed.class1._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`);
    expect(completion.status).toBe(200);
    expect(completion.body.data.rows[0].certificate).toMatchObject({
      status: 'Issued',
      state: 'expired',
    });

    const compliance = await request(app)
      .get('/api/learning/reports/compliance?certificateState=expired')
      .set('Authorization', `Bearer ${tokens.admin}`);
    expect(compliance.status).toBe(200);
    expect(compliance.body.data.summary).toMatchObject({ rows: 1, expired: 1 });
    expect(compliance.body.data.rows[0].certificate).toMatchObject({
      status: 'Issued',
      state: 'expired',
    });
  });
});
