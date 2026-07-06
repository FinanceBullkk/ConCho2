/**
 * Integration — GOLDEN PATH smoke test (core L&D loop, end to end via the API).
 *
 * Quality-consolidation guard (2026-06-17): one happy-path that drives every
 * stage of the core flow through real HTTP endpoints, so a regression ANYWHERE
 * in the chain trips this single test:
 *
 *   create program → enrol learner → schedule a cohort session → mark attendance
 *   → completion is met → issue certificate → public verification is valid
 *
 * Only environment scaffolding touches the DB directly (the ALLOWED_TIME_SLOTS
 * setting, an Office, the program→cohort link, and shifting the booked session
 * into the past so attendance can be marked — simulating time passing). Every
 * business step is a real request through the same stack production serves.
 */
const request = require('supertest');
const { getApp, getTokens, getSeedData, getCsrfHeaders, teardown } = require('../setup');
const { updateActiveRow } = require('../pg-test-utils');
const Schedule = require('../../models/Schedule');
const Attendance = require('../../models/Attendance');
const Enrollment = require('../../models/Enrollment');
const Certificate = require('../../models/Certificate');
const LearningProgram = require('../../models/LearningProgram');
const NotificationLog = require('../../models/NotificationLog');
const Setting = require('../../models/Setting');
const Office = require('../../models/Office');
const Class = require('../../models/Class');

let app, tokens, seed, csrf, office;

beforeAll(async () => {
  app = await getApp();
  tokens = getTokens();
  seed = getSeedData();
  csrf = await getCsrfHeaders(app);
  // A bookable VN slot (10:00–11:00 VN = 03:00 UTC) + an Office for the cohort session.
  await Setting.findOneAndUpdate(
    { key: 'ALLOWED_TIME_SLOTS' },
    { $addToSet: { value: { sh: 10, sm: 0, eh: 11, em: 0 } } },
    { upsert: true },
  );
  office = await Office.create({ name: 'Golden Office', code: 'GOLD' });
});

afterAll(async () => {
  await teardown();
});

afterEach(async () => {
  await Promise.all([
    Schedule.deleteMany({}),
    Attendance.deleteMany({}),
    Enrollment.deleteMany({}),
    Certificate.deleteMany({}),
    LearningProgram.deleteMany({}),
    NotificationLog.deleteMany({}),
  ]);
  await Class.findByIdAndUpdate(seed.class1._id, { programId: null });
  require('../../domains/schedule/session-order').sessionOrderCache.flushAll();
});

// Next-Monday 03:00 UTC (= 10:00 VN) — matches the seeded ALLOWED_TIME_SLOTS slot.
const vnSlot = () => {
  const d = new Date();
  const dow = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + (dow === 0 ? 1 : 8 - dow));
  d.setUTCHours(3, 0, 0, 0);
  return { start: new Date(d), end: new Date(d.getTime() + 60 * 60 * 1000) };
};

const admin = (req) => req.set('Authorization', `Bearer ${tokens.admin}`).set(csrf);

describe('Golden path — core L&D loop end to end', () => {
  test('program → enrol → schedule → attendance → completion → certificate → verify', async () => {
    // 1 ── Create a self-enrol program with a 50%-attendance completion gate.
    const prog = await admin(request(app).post('/api/learning/programs')).send({
      code: `GP${Date.now().toString().slice(-7)}`,
      name: 'Golden Path Program',
      schedulingMode: 'self_enroll',
      completionPolicy: { attendanceThresholdPercent: 50 },
    });
    expect(prog.status).toBe(201);
    const programId = prog.body.data.id || prog.body.data._id;
    expect(programId).toBeTruthy();

    // Link the program to the cohort (no API sets a Class's programId today).
    await Class.findByIdAndUpdate(seed.class1._id, { programId });

    // 2 ── Enrol a learner into the cohort (the cohort-enrolment surface).
    const enr = await admin(request(app).post('/api/learning/enrollments')).send({
      cohortId: seed.class1._id.toString(),
      userId: seed.member1._id.toString(),
    });
    expect(enr.status).toBe(201);
    expect(enr.body.data.status).toBe('Active');

    // 3 ── Schedule a cohort session; it enrols the cohort's active learners.
    const { start, end } = vnSlot();
    const sess = await admin(request(app).post('/api/learning/sessions/book-slot')).send({
      cohortId: seed.class1._id.toString(),
      officeId: office._id.toString(),
      startTime: start.toISOString(),
      endTime: end.toISOString(),
    });
    expect(sess.status).toBe(201);
    expect(sess.body.data.enrolledLearnerCount).toBe(1);
    const scheduleId = sess.body.data.scheduleId;

    // Move the booked session into the past so attendance is markable. The
    // session was created through the ported booking path (PG-only on the lane),
    // so a Mongoose findByIdAndUpdate would miss it — shift it on the active backend.
    const past = new Date(Date.now() - 7 * 86400000);
    await updateActiveRow('Schedule', scheduleId, {
      startTime: past,
      endTime: new Date(past.getTime() + 60 * 60 * 1000),
    });

    // 4 ── Mark the learner Present.
    const att = await admin(request(app).post(`/api/attendance/${scheduleId}`)).send({
      records: [{ userId: seed.member1._id.toString(), status: 'P' }],
    });
    expect(att.status).toBe(200);

    // 5 ── Completion is met (1/1 present = 100% ≥ 50%).
    const comp = await request(app)
      .get(`/api/learning/completion?cohortId=${seed.class1._id}&learnerId=${seed.member1._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`);
    expect(comp.status).toBe(200);
    expect(comp.body.data.attendance.percent).toBe(100);
    expect(comp.body.data.complete).toBe(true);

    // 6 ── Issue a certificate for the now-complete learner.
    const cert = await admin(request(app).post('/api/learning/certificates')).send({
      cohortId: seed.class1._id.toString(),
      userId: seed.member1._id.toString(),
    });
    expect(cert.status).toBe(201);
    expect(cert.body.data.certificateNumber).toMatch(/^CERT-\d{4}-\d{6}$/);
    expect(cert.body.data.status).toBe('Issued');
    const code = cert.body.data.verificationCode;

    // 7 ── Public verification reports the certificate valid (the proof/report step).
    const verify = await request(app).get(`/api/learning/certificates/verify/${code}`);
    expect(verify.status).toBe(200);
    expect(verify.body.data.valid).toBe(true);
    expect(verify.body.data.certificateNumber).toBe(cert.body.data.certificateNumber);
  });
});
