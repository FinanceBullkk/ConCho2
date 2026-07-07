const request = require('supertest');
const { getApp, getTokens, getSeedData, getCsrfHeaders, teardown } = require('../setup');
const Schedule = require('../../models/Schedule');
const Attendance = require('../../models/Attendance');
const Evaluation = require('../../models/Evaluation');
const Certificate = require('../../models/Certificate');
const NotificationLog = require('../../models/NotificationLog');
const Class = require('../../models/Class');
const LearningProgram = require('../../models/LearningProgram');
// Certificates are written through the ported completion PG repo (PG-only on the
// lane) — count/read on the active backend, not Mongoose.
const { readActiveRow, findActiveRowWhere, countActiveRowsWhere } = require('../pg-test-utils');

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
    Evaluation.deleteMany({}),
    Certificate.deleteMany({}),
    LearningProgram.deleteMany({}),
    NotificationLog.deleteMany({}),
  ]);
  await Class.updateMany(
    { _id: { $in: [seed.class1._id, seed.class2._id] } },
    { $set: { programId: null } },
  );
});

// Create `n` sessions for class1 and mark `attended` of them Present for member1.
const seedAttendance = async (totalSessions, attended) => {
  const base = new Date('2026-01-05T03:00:00Z').getTime();
  const schedules = [];
  for (let i = 0; i < totalSessions; i += 1) {
    schedules.push({
      classId: seed.class1._id,
      bookedTeamId: seed.team._id,
      startTime: new Date(base + i * 86400000),
      endTime: new Date(base + i * 86400000 + 3600000),
      enrolledUsers: [seed.member1._id],
    });
  }
  const created = await Schedule.create(schedules);
  await Attendance.create(
    created.slice(0, attended).map((s) => ({
      scheduleId: s._id, userId: seed.member1._id, status: 'P',
    })),
  );
};

const linkProgram = async (completionPolicy) => {
  const program = await LearningProgram.create({
    code: `CMP_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    name: 'Completion Program',
    completionPolicy,
  });
  await Class.findByIdAndUpdate(seed.class1._id, { programId: program._id });
  return program;
};

const issue = (token) =>
  request(app)
    .post('/api/learning/certificates')
    .set('Authorization', `Bearer ${token}`)
    .set(csrf)
    .send({ cohortId: seed.class1._id.toString(), userId: seed.member1._id.toString() });

describe('Learning Platform API — completion & certificates', () => {
  test('completion is incomplete below the attendance threshold', async () => {
    await linkProgram({ attendanceThresholdPercent: 50 });
    await seedAttendance(4, 1); // 25%

    const res = await request(app)
      .get(`/api/learning/completion?cohortId=${seed.class1._id}&learnerId=${seed.member1._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`);

    expect(res.status).toBe(200);
    expect(res.body.data.attendance.percent).toBe(25);
    expect(res.body.data.attendance.met).toBe(false);
    expect(res.body.data.complete).toBe(false);
  });

  test('completion is met when attendance reaches the threshold (no assessment required)', async () => {
    await linkProgram({ attendanceThresholdPercent: 50 });
    await seedAttendance(4, 2); // 50%

    const res = await request(app)
      .get(`/api/learning/completion?cohortId=${seed.class1._id}&learnerId=${seed.member1._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`);

    expect(res.body.data.attendance.percent).toBe(50);
    expect(res.body.data.complete).toBe(true);
  });

  test('requiresAssessment blocks completion until an evaluation exists', async () => {
    await linkProgram({ attendanceThresholdPercent: 0, requiresAssessment: true });
    await seedAttendance(2, 0);

    const before = await request(app)
      .get(`/api/learning/completion?cohortId=${seed.class1._id}&learnerId=${seed.member1._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`);
    expect(before.body.data.assessment.met).toBe(false);
    expect(before.body.data.complete).toBe(false);

    await Evaluation.create({
      classId: seed.class1._id, userId: seed.member1._id,
      grammarScore: 8, vocabularyScore: 7, pronunciationScore: 6, fluencyScore: 9,
    });

    const after = await request(app)
      .get(`/api/learning/completion?cohortId=${seed.class1._id}&learnerId=${seed.member1._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`);
    expect(after.body.data.assessment.met).toBe(true);
    expect(after.body.data.complete).toBe(true);
  });

  test('a Participant requesting ANOTHER learner\'s completion is forbidden (403)', async () => {
    // tokens.leader is a Participant; member1 is a different learner. The
    // self-scoping guard in getCompletion must reject a cross-learner read.
    const res = await request(app)
      .get(`/api/learning/completion?cohortId=${seed.class1._id}&learnerId=${seed.member1._id}`)
      .set('Authorization', `Bearer ${tokens.leader}`);
    expect(res.status).toBe(403);
  });

  test('admin issues a certificate when complete; snapshot + verification code present', async () => {
    await linkProgram({ attendanceThresholdPercent: 50 });
    await seedAttendance(4, 2);

    const res = await issue(tokens.admin);
    expect(res.status).toBe(201);
    expect(res.body.data.certificateNumber).toMatch(/^CERT-\d{4}-\d{6}$/);
    expect(res.body.data.verificationCode).toBeTruthy();
    expect(res.body.data.status).toBe('Issued');
    expect(res.body.data.completion.attendancePercent).toBe(50);
    expect(res.body.data.learner.name).toBeTruthy();
    // Cohesion P5 follow-up: issuing a certificate writes an in-app notification.
    const note = await findActiveRowWhere('NotificationLog', {
      recipientUserId: seed.member1._id, type: 'certificate_issued',
    });
    expect(note).toBeTruthy();
    expect(note.channel).toBe('in_app');
  });

  test('issuing for an incomplete learner is rejected with 422', async () => {
    await linkProgram({ attendanceThresholdPercent: 80 });
    await seedAttendance(4, 1); // 25%

    const res = await issue(tokens.admin);
    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
  });

  test('a second active certificate for the same learner+cohort is rejected with 409', async () => {
    await linkProgram({ attendanceThresholdPercent: 0 });
    await seedAttendance(1, 0);

    expect((await issue(tokens.admin)).status).toBe(201);
    expect((await issue(tokens.admin)).status).toBe(409);
  });

  test('QB-008: concurrent issue requests create exactly one certificate (partial unique index)', async () => {
    await linkProgram({ attendanceThresholdPercent: 0 });
    await seedAttendance(1, 0);

    // Fire both before either resolves — both pass the findActiveCertificate
    // check, so only the DB partial unique index can keep them from both inserting.
    const [a, b] = await Promise.all([issue(tokens.admin), issue(tokens.admin)]);

    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([201, 409]);

    // DB truth: exactly one active certificate exists for this learner+cohort.
    const active = await countActiveRowsWhere('Certificate', {
      userId: seed.member1._id,
      cohortId: seed.class1._id,
      status: 'Issued',
      isDeleted: false,
    });
    expect(active).toBe(1);
  });

  test('revoke soft-changes status to Revoked (record retained)', async () => {
    await linkProgram({ attendanceThresholdPercent: 0 });
    await seedAttendance(1, 0);
    const issued = await issue(tokens.admin);
    const id = issued.body.data.id;

    const res = await request(app)
      .delete(`/api/learning/certificates/${id}`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({ reason: 'issued in error' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('Revoked');
    const stored = await readActiveRow('Certificate', id);
    expect(stored.status).toBe('Revoked');
    expect(stored.isDeleted).toBe(false);
  });

  test('public verification: issued → valid, revoked → invalid, unknown → not_found', async () => {
    await linkProgram({ attendanceThresholdPercent: 0 });
    await seedAttendance(1, 0);
    const issued = await issue(tokens.admin);
    const code = issued.body.data.verificationCode;

    // No auth header — endpoint is public.
    const valid = await request(app).get(`/api/learning/certificates/verify/${code}`);
    expect(valid.status).toBe(200);
    expect(valid.body.data.valid).toBe(true);
    expect(valid.body.data.certificateNumber).toBe(issued.body.data.certificateNumber);
    expect(valid.body.data.verificationCode).toBeUndefined(); // no internal leakage

    await request(app)
      .delete(`/api/learning/certificates/${issued.body.data.id}`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf);

    const revoked = await request(app).get(`/api/learning/certificates/verify/${code}`);
    expect(revoked.body.data.valid).toBe(false);
    expect(revoked.body.data.status).toBe('Revoked');

    const unknown = await request(app).get('/api/learning/certificates/verify/deadbeefdeadbeef');
    expect(unknown.status).toBe(200);
    expect(unknown.body.data.valid).toBe(false);
    expect(unknown.body.data.status).toBe('not_found');
  });

  test('teacher cannot issue a certificate (lacks certificate.manage) but can read completion', async () => {
    await linkProgram({ attendanceThresholdPercent: 0 });
    await seedAttendance(1, 0);

    const blocked = await issue(tokens.teacher);
    expect(blocked.status).toBe(403);

    const readable = await request(app)
      .get(`/api/learning/completion?cohortId=${seed.class1._id}&learnerId=${seed.member1._id}`)
      .set('Authorization', `Bearer ${tokens.teacher}`);
    expect(readable.status).toBe(200);
  });
});
