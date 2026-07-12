const request = require('supertest');
const { getApp, getTokens, getSeedData, getCsrfHeaders, teardown } = require('../setup');
// The certificate is issued through the ported completion PG repo (PG-only on
// the lane), so mutate/clean the active backend, not Mongoose. Fixtures INSERT
// straight into PG.
const { updateActiveRow, deleteActiveRowsWhere } = require('../pg-test-utils');
const fx = require('../fixtures/pg-fixtures');

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
    deleteActiveRowsWhere('Assignment', {}),
    deleteActiveRowsWhere('Attendance', {}),
    deleteActiveRowsWhere('Certificate', {}),
    deleteActiveRowsWhere('LearningProgram', {}),
    deleteActiveRowsWhere('Schedule', {}),
  ]);
  await Promise.all([
    updateActiveRow('Class', seed.class1._id, { programId: null, teacherIds: [] }),
    updateActiveRow('Class', seed.class2._id, { programId: null, teacherIds: [] }),
  ]);
});

const createProgram = (overrides = {}) =>
  fx.createLearningProgram({
    code: `EXP_${Date.now()}_${seq++}`,
    name: 'Expiry Program',
    completionPolicy: { attendanceThresholdPercent: 0 },
    ...overrides,
  });

const seedCompleteCohort = async (program) => {
  await updateActiveRow('Class', seed.class1._id, { programId: program._id });
  const start = new Date('2026-06-01T03:00:00.000Z');
  const schedule = await fx.createSchedule({
    classId: seed.class1._id,
    bookedTeamId: seed.team._id,
    startTime: start,
    endTime: new Date(start.getTime() + 3600000),
    enrolledUsers: [seed.member1._id],
  });
  await fx.createAttendance({ scheduleId: schedule._id, userId: seed.member1._id, status: 'P' });
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
    await fx.createAssignment({
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
