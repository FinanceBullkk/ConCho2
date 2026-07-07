jest.mock('../../lib/mailer', () => ({
  sendMail: jest.fn(),
}));

const request = require('supertest');
const { getApp, getSeedData, teardown } = require('../setup');
// The reminder service writes NotificationLog through the dual-backend repo
// (Phase 5 slice 3) — on the pg lane rows land in PG only, so asserts read
// the ACTIVE backend.
const { findActiveRowWhere, findActiveRowsWhere, countActiveRowsWhere, distinctActiveValues } = require('../pg-test-utils');
const { sendMail } = require('../../lib/mailer');
const Assignment = require('../../models/Assignment');
const Certificate = require('../../models/Certificate');
const Class = require('../../models/Class');
const CronRun = require('../../models/CronRun');
const Enrollment = require('../../models/Enrollment');
const LearningPath = require('../../models/LearningPath');
const LearningProgram = require('../../models/LearningProgram');
const NotificationLog = require('../../models/NotificationLog');
const User = require('../../models/User');
const { sendAssignmentReminders } = require('../../domains/learning/assignment/reminder-service');

const VALID_CRON_TOKEN = 'test-cron-token-32chars-minimum!!';
const DAY_MS = 24 * 60 * 60 * 1000;

let app, seed;
let seq = 0;

beforeAll(async () => {
  process.env['CRON_TOKEN'] = VALID_CRON_TOKEN;
  app = await getApp();
  seed = getSeedData();
  await NotificationLog.init();
});

afterAll(async () => {
  delete process.env['CRON_TOKEN'];
  await teardown();
});

afterEach(async () => {
  sendMail.mockReset();
  await Promise.all([
    NotificationLog.deleteMany({}),
    Assignment.deleteMany({}),
    Certificate.deleteMany({}),
    CronRun.deleteMany({ jobName: 'assignment-reminders' }),
    Enrollment.deleteMany({}),
    LearningPath.deleteMany({}),
    LearningProgram.deleteMany({}),
    Class.deleteMany({ classCode: /^ASGR/ }),
  ]);
  await User.updateMany(
    { _id: { $in: [seed.teacher._id, seed.member1._id, seed.member2._id] } },
    {
      $set: {
        email: null,
        managerId: null,
        departmentId: null,
        status: 'Active',
        isDeleted: false,
        deletedAt: null,
      },
    },
  );
});

beforeEach(() => {
  sendMail.mockResolvedValue({ messageId: 'assignment-reminder-test' });
});

const uniq = () => `${Date.now()}_${seq++}`;

const dateAtUtcStart = (isoDate) => new Date(`${isoDate}T00:00:00.000Z`);

const dateInUtcDays = (days) => {
  const now = new Date();
  return new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + days,
  ));
};

const setUser = (id, patch) => User.updateOne({ _id: id }, { $set: patch });

const createProgram = (overrides = {}) =>
  LearningProgram.create({
    code: `ASGRP_${uniq()}`,
    name: `Assignment Reminder Program ${uniq()}`,
    schedulingMode: 'self_enroll',
    ...overrides,
  });

const createCohort = (programId) =>
  Class.create({
    classCode: `ASGR${seq++}`,
    courseName: 'Assignment Reminder Course',
    programId,
    totalSessions: 1,
  });

const completeProgram = async (userId, programId) => {
  const cohort = await createCohort(programId);
  await Certificate.create({
    certificateNumber: `CERT-ASGR-${uniq()}`,
    verificationCode: `asgr-${uniq()}`,
    userId,
    programId,
    cohortId: cohort._id,
    status: 'Issued',
  });
};

const createAssignment = ({ title = 'Required safety training', programId, dueDate, userIds }) =>
  Assignment.create({
    title,
    targetType: 'program',
    programId,
    dueDate,
    userIds,
  });

describe('assignment reminder service', () => {
  test('due-soon job sends once at 7 days and skips rerun by idempotency log', async () => {
    await setUser(seed.member1._id, { email: 'member1@example.com' });
    const program = await createProgram();
    await createAssignment({
      programId: program._id,
      dueDate: dateAtUtcStart('2026-06-30'),
      userIds: [seed.member1._id],
    });

    const first = await sendAssignmentReminders({ now: new Date('2026-06-23T12:00:00.000Z') });
    const second = await sendAssignmentReminders({ now: new Date('2026-06-23T12:00:00.000Z') });

    expect(first.sent).toBe(1);
    expect(second.sent).toBe(0);
    expect(second.duplicates).toBe(1);
    expect(sendMail).toHaveBeenCalledTimes(1);
    const logs = await findActiveRowsWhere('NotificationLog', { cadenceKey: 'due_7' });
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ status: 'sent', type: 'assignment_due_soon' });
  });

  test('due-soon 1-day reminder does not collide with the 7-day key', async () => {
    await setUser(seed.member1._id, { email: 'member1@example.com' });
    const program = await createProgram();
    await createAssignment({
      programId: program._id,
      dueDate: dateAtUtcStart('2026-06-30'),
      userIds: [seed.member1._id],
    });

    await sendAssignmentReminders({ now: new Date('2026-06-23T12:00:00.000Z') });
    await sendAssignmentReminders({ now: new Date('2026-06-29T12:00:00.000Z') });

    expect(sendMail).toHaveBeenCalledTimes(2);
    const keys = await distinctActiveValues('NotificationLog', 'cadenceKey', {});
    expect(keys.sort()).toEqual(['due_1', 'due_7']);
  });

  test('completed learner does not receive assignment reminders', async () => {
    await setUser(seed.member1._id, { email: 'member1@example.com' });
    const program = await createProgram();
    await completeProgram(seed.member1._id, program._id);
    await createAssignment({
      programId: program._id,
      dueDate: dateAtUtcStart('2026-06-30'),
      userIds: [seed.member1._id],
    });

    const summary = await sendAssignmentReminders({ now: new Date('2026-06-23T12:00:00.000Z') });

    expect(summary.sent).toBe(0);
    expect(sendMail).not.toHaveBeenCalled();
    expect(await countActiveRowsWhere('NotificationLog', {})).toBe(0);
  });

  test('overdue learner receives every-3-day reminders without same-bucket resend', async () => {
    await setUser(seed.member1._id, { email: 'member1@example.com' });
    const program = await createProgram();
    await createAssignment({
      programId: program._id,
      dueDate: dateAtUtcStart('2026-06-30'),
      userIds: [seed.member1._id],
    });

    await sendAssignmentReminders({ now: new Date('2026-07-01T12:00:00.000Z') });
    await sendAssignmentReminders({ now: new Date('2026-07-02T12:00:00.000Z') });
    await sendAssignmentReminders({ now: new Date('2026-07-04T12:00:00.000Z') });

    expect(sendMail).toHaveBeenCalledTimes(2);
    const keys = await distinctActiveValues('NotificationLog', 'cadenceKey', { type: 'assignment_overdue' });
    expect(keys.sort()).toEqual(['overdue_d1', 'overdue_d4']);
  });

  test('manager weekly digest includes overdue direct reports only', async () => {
    await Promise.all([
      setUser(seed.teacher._id, { email: 'manager@example.com' }),
      setUser(seed.member1._id, { email: 'member1@example.com', managerId: seed.teacher._id }),
      setUser(seed.member2._id, { email: 'member2@example.com', managerId: null }),
    ]);
    const program = await createProgram();
    await createAssignment({
      title: 'Manager digest assignment',
      programId: program._id,
      dueDate: dateAtUtcStart('2026-06-30'),
      userIds: [seed.member1._id, seed.member2._id],
    });

    const summary = await sendAssignmentReminders({ now: new Date('2026-07-02T12:00:00.000Z') });

    expect(summary.managerDigests).toBe(1);
    const digest = sendMail.mock.calls
      .map((call) => call[0])
      .find((payload) => payload.subject.includes('Overdue assignment digest'));
    expect(digest).toBeDefined();
    expect(digest.text).toContain('Member One');
    expect(digest.text).not.toContain('Member Two');
    expect(digest.text).toContain('Manager digest assignment');
  });

  test('learners without email are skipped with a persisted log', async () => {
    const program = await createProgram();
    await createAssignment({
      programId: program._id,
      dueDate: dateAtUtcStart('2026-06-30'),
      userIds: [seed.member1._id],
    });

    const summary = await sendAssignmentReminders({ now: new Date('2026-06-23T12:00:00.000Z') });

    expect(summary.skipped).toBe(1);
    expect(sendMail).not.toHaveBeenCalled();
    const log = await findActiveRowWhere('NotificationLog', { learnerId: seed.member1._id });
    expect(log).toMatchObject({ status: 'skipped', error: 'recipient email missing' });
  });

  test('managers without email are skipped with a persisted digest log', async () => {
    await setUser(seed.member1._id, { email: 'member1@example.com', managerId: seed.teacher._id });
    const program = await createProgram();
    await createAssignment({
      programId: program._id,
      dueDate: dateAtUtcStart('2026-06-30'),
      userIds: [seed.member1._id],
    });

    const summary = await sendAssignmentReminders({ now: new Date('2026-07-02T12:00:00.000Z') });

    expect(summary.skipped).toBe(1);
    const log = await findActiveRowWhere('NotificationLog', { type: 'manager_assignment_digest' });
    expect(log).toMatchObject({ status: 'skipped', error: 'recipient email missing' });
  });
});

describe('POST /api/cron/assignment-reminders', () => {
  test('requires cron token and records CronRun when authenticated', async () => {
    await setUser(seed.member1._id, { email: 'member1@example.com' });
    const program = await createProgram();
    await createAssignment({
      programId: program._id,
      dueDate: dateInUtcDays(7),
      userIds: [seed.member1._id],
    });

    const unauthorized = await request(app).post('/api/cron/assignment-reminders');
    expect(unauthorized.status).toBe(401);

    const authorized = await request(app)
      .post('/api/cron/assignment-reminders')
      .set('Authorization', `Bearer ${VALID_CRON_TOKEN}`);

    expect(authorized.status).toBe(200);
    expect(authorized.body.success).toBe(true);
    expect(authorized.body.data).toHaveProperty('assignmentsScanned');
    const run = await CronRun.findOne({ jobName: 'assignment-reminders' }).lean();
    expect(run).toMatchObject({ lastStatus: 'ok' });
    expect(run.expectedIntervalMs).toBe(DAY_MS);
  });
});
