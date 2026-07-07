/**
 * ──────────────────────────────────────────────────────────
 * Integration Tests — Session Trainers (re-center Phase 3, DELTA B)
 *   PUT /api/schedules/:id/trainers   (Admin/Coordinator, session.assign-trainer)
 *   internal trainer → attendance UNION; external trainer → invite/display only
 * ──────────────────────────────────────────────────────────
 */

const request = require('supertest');
const jwt = require('jsonwebtoken');
const { getApp, getTokens, getSeedData, getCsrfHeaders, teardown } = require('../setup');
const Schedule = require('../../models/Schedule');
// Trainer edits write through the ported schedule chokepoint (PG-only on the
// lane) — read the stored session from the active backend. externalTrainer is a
// top-level field on Mongo but lives in the schedules.meta jsonb on PG, so
// normalise across both.
const { readActiveRow } = require('../pg-test-utils');
const storedExternalTrainer = (row) => row.externalTrainer ?? row.meta?.externalTrainer ?? null;
const Setting = require('../../models/Setting');
const Class = require('../../models/Class');
const LearningProgram = require('../../models/LearningProgram');
const Enrollment = require('../../models/Enrollment');
const Office = require('../../models/Office');
const User = require('../../models/User');

let app, tokens, seed, csrf, office, coordinatorToken, teacher2, teacher2Token;

beforeAll(async () => {
  app = await getApp();
  tokens = getTokens();
  seed = getSeedData();
  csrf = await getCsrfHeaders(app);

  await Setting.findOneAndUpdate(
    { key: 'ALLOWED_TIME_SLOTS' },
    { $addToSet: { value: { sh: 10, sm: 0, eh: 11, em: 0 } } },
  );

  office = await Office.create({ name: 'Trainer Office', code: 'TRNOF' });
  const coordinator = await User.create({
    empCode: '000050', name: 'Coordinator Trainer', role: 'Coordinator',
    department: 'HR', password: 'coord123456',
  });
  coordinatorToken = jwt.sign({ id: coordinator._id.toString() }, process.env.JWT_SECRET, { expiresIn: '1h' });

  // A second Teacher — NOT bound to the cohort's class — used to prove the UNION.
  teacher2 = await User.create({
    empCode: '000051', name: 'Guest Trainer', role: 'Teacher',
    department: 'English', password: 'teacher12345', email: 'guest.trainer@example.com',
  });
  teacher2Token = jwt.sign({ id: teacher2._id.toString() }, process.env.JWT_SECRET, { expiresIn: '1h' });
});

afterAll(async () => {
  await teardown();
});

afterEach(async () => {
  await Schedule.deleteMany({});
  await Enrollment.deleteMany({});
  await Class.updateMany(
    { _id: { $in: [seed.class1._id, seed.class2._id] } },
    { $set: { teacherIds: [], programId: null } },
  );
  await LearningProgram.deleteMany({});
});

const as = (token) => (method, path) =>
  request(app)[method](path).set('Authorization', `Bearer ${token}`).set(csrf);

const vnSlot = () => {
  const d = new Date();
  const dayOfWeek = d.getUTCDay();
  const daysToNextMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
  d.setUTCDate(d.getUTCDate() + daysToNextMonday);
  d.setUTCHours(3, 0, 0, 0);
  return { start: new Date(d), end: new Date(d.getTime() + 60 * 60 * 1000) };
};

// Build a self_enroll cohort on class1 (teacher = seed.teacher bound) with the
// LEADER enrolled (so tokens.leader can view), then schedule a cohort session.
const scheduleCohortSession = async () => {
  const program = await LearningProgram.create({
    code: 'TRN_SE', name: 'Trainer Self Enroll', schedulingMode: 'self_enroll',
  });
  await Class.findByIdAndUpdate(seed.class1._id, {
    programId: program._id, teacherIds: [seed.teacher._id],
  });
  await Enrollment.create({ userId: seed.leader._id, classId: seed.class1._id, teamId: null, status: 'Active' });

  const { start, end } = vnSlot();
  const res = await as(coordinatorToken)('post', '/api/learning/sessions/book-slot').send({
    cohortId: seed.class1._id.toString(),
    officeId: office._id.toString(),
    startTime: start.toISOString(),
    endTime: end.toISOString(),
  });
  expect(res.status).toBe(201);
  return res.body.data.scheduleId;
};

describe('PUT /api/schedules/:id/trainers — authz', () => {
  test('Teacher cannot assign trainers (roleGuard) → 403', async () => {
    const scheduleId = await scheduleCohortSession();
    const res = await as(tokens.teacher)('put', `/api/schedules/${scheduleId}/trainers`)
      .send({ internalIds: [teacher2._id.toString()] });
    expect(res.status).toBe(403);
  });

  test('Participant cannot assign trainers → 403', async () => {
    const scheduleId = await scheduleCohortSession();
    const res = await as(tokens.leader)('put', `/api/schedules/${scheduleId}/trainers`)
      .send({ internalIds: [teacher2._id.toString()] });
    expect(res.status).toBe(403);
  });

  test('duplicate internalIds → 400', async () => {
    const scheduleId = await scheduleCohortSession();
    const res = await as(coordinatorToken)('put', `/api/schedules/${scheduleId}/trainers`)
      .send({ internalIds: [teacher2._id.toString(), teacher2._id.toString()] });
    expect(res.status).toBe(400);
  });

  test('a Participant id is not a valid internal trainer → 400', async () => {
    const scheduleId = await scheduleCohortSession();
    const res = await as(coordinatorToken)('put', `/api/schedules/${scheduleId}/trainers`)
      .send({ internalIds: [seed.member1._id.toString()] });
    expect(res.status).toBe(400);
  });
});

describe('Internal trainer joins the attendance UNION', () => {
  // Attendance can only be marked on a PAST session, so create one directly
  // (booking validation requires a future slot). class1 is bound to seed.teacher
  // so the cohort binding is effective (not the permissive empty-list case).
  const makePastSession = async () => {
    await Class.findByIdAndUpdate(seed.class1._id, { teacherIds: [seed.teacher._id] });
    const past = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const sched = await Schedule.create({
      classId: seed.class1._id, bookedTeamId: null, officeId: office._id,
      startTime: past, endTime: new Date(past.getTime() + 60 * 60 * 1000),
      enrolledUsers: [seed.leader._id],
    });
    return sched._id.toString();
  };

  test('a named instructor (not the cohort teacher) gains mark access; cohort teacher kept; stranger denied', async () => {
    const scheduleId = await makePastSession();
    const mark = (token, status) => as(token)('post', `/api/attendance/${scheduleId}`)
      .send({ records: [{ userId: seed.leader._id.toString(), status }] });

    // Before assignment: teacher2 is not bound to class1 → 403.
    expect((await mark(teacher2Token, 'P')).status).toBe(403);

    // Coordinator names teacher2 as a session instructor.
    const assign = await as(coordinatorToken)('put', `/api/schedules/${scheduleId}/trainers`)
      .send({ internalIds: [teacher2._id.toString()] });
    expect(assign.status).toBe(200);

    // Now teacher2 can mark via the UNION; the cohort teacher is never revoked.
    expect((await mark(teacher2Token, 'P')).status).toBe(200);
    expect((await mark(tokens.teacher, 'L')).status).toBe(200);
  });

  test('a stranger teacher (neither bound nor named) stays denied → 403', async () => {
    const scheduleId = await makePastSession();
    // teacher2 is not assigned here → still 403.
    const res = await as(teacher2Token)('post', `/api/attendance/${scheduleId}`)
      .send({ records: [{ userId: seed.leader._id.toString(), status: 'P' }] });
    expect(res.status).toBe(403);
  });
});

describe('External trainer — invite/display only, no access, no leak', () => {
  test('assign external trainer → 200; no User created; learner DTO hides email; admin DTO shows it', async () => {
    const scheduleId = await scheduleCohortSession();

    const res = await as(coordinatorToken)('put', `/api/schedules/${scheduleId}/trainers`).send({
      externalTrainer: { name: 'Vendor Pro', email: 'vendor@external.com', org: 'ACME Training' },
    });
    expect(res.status).toBe(200);

    // No User account was created for the external trainer.
    expect(await User.countDocuments({ email: 'vendor@external.com' })).toBe(0);

    // Learner (enrolled leader) sees name + org only — no email/phone.
    const learnerView = await request(app)
      .get(`/api/learning/sessions/${scheduleId}`)
      .set('Authorization', `Bearer ${tokens.leader}`);
    expect(learnerView.status).toBe(200);
    expect(learnerView.body.data.externalTrainer).toMatchObject({ name: 'Vendor Pro', org: 'ACME Training' });
    expect(learnerView.body.data.externalTrainer.email).toBeUndefined();

    // Admin sees the full contact.
    const adminView = await request(app)
      .get(`/api/learning/sessions/${scheduleId}`)
      .set('Authorization', `Bearer ${tokens.admin}`);
    expect(adminView.body.data.externalTrainer.email).toBe('vendor@external.com');
  });

  test('clearing trainers ([] + null) → 200, both removed', async () => {
    const scheduleId = await scheduleCohortSession();
    await as(coordinatorToken)('put', `/api/schedules/${scheduleId}/trainers`).send({
      internalIds: [teacher2._id.toString()],
      externalTrainer: { name: 'Temp', email: 'temp@external.com' },
    });

    const clear = await as(coordinatorToken)('put', `/api/schedules/${scheduleId}/trainers`)
      .send({ internalIds: [], externalTrainer: null });
    expect(clear.status).toBe(200);

    const stored = await readActiveRow('Schedule', scheduleId);
    expect(stored.sessionInstructorIds).toHaveLength(0);
    expect(storedExternalTrainer(stored)).toBeNull();
  });
});
