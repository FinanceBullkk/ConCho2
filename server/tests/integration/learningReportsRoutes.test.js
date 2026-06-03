const request = require('supertest');
const { getApp, getTokens, getSeedData, getCsrfHeaders, teardown } = require('../setup');
const Schedule = require('../../models/Schedule');
const Attendance = require('../../models/Attendance');
const Certificate = require('../../models/Certificate');
const Class = require('../../models/Class');
const LearningProgram = require('../../models/LearningProgram');

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
    Schedule.deleteMany({}),
    Attendance.deleteMany({}),
    Certificate.deleteMany({}),
    LearningProgram.deleteMany({}),
  ]);
  await Class.updateMany(
    { _id: { $in: [seed.class1._id, seed.class2._id] } },
    { $set: { programId: null } },
  );
});

// Seed `total` sessions for class1 with [member1, member2] on the roster, and
// mark member1 Present on `m1Attended` of them (member2 attends none).
const seedCohort = async (total, m1Attended) => {
  const base = new Date('2026-04-06T03:00:00Z').getTime();
  const schedules = [];
  for (let i = 0; i < total; i += 1) {
    schedules.push({
      classId: seed.class1._id,
      bookedTeamId: seed.team._id,
      startTime: new Date(base + i * 86400000),
      endTime: new Date(base + i * 86400000 + 3600000),
      enrolledUsers: [seed.member1._id, seed.member2._id],
    });
  }
  const created = await Schedule.create(schedules);
  await Attendance.create(
    created.slice(0, m1Attended).map((s) => ({
      scheduleId: s._id, userId: seed.member1._id, status: 'P',
    })),
  );
};

const linkProgram = async (completionPolicy) => {
  const program = await LearningProgram.create({
    code: `RPT_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    name: 'Report Program',
    completionPolicy,
  });
  await Class.findByIdAndUpdate(seed.class1._id, { programId: program._id });
  return program;
};

const report = (token) =>
  request(app)
    .get(`/api/learning/reports/completion?cohortId=${seed.class1._id}`)
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

  test('a participant cannot read cohort reports (403); a teacher can (200)', async () => {
    await linkProgram({ attendanceThresholdPercent: 0 });
    await seedCohort(1, 0);

    expect((await report(tokens.leader)).status).toBe(403);
    expect((await report(tokens.teacher)).status).toBe(200);
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
