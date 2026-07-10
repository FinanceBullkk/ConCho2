const request = require('supertest');
const mongoose = require('mongoose');
const { getApp, getTokens, getSeedData, teardown } = require('../setup');
const Assignment = require('../../models/Assignment');
const AssessmentAttempt = require('../../models/AssessmentAttempt');
const Attendance = require('../../models/Attendance');
const Certificate = require('../../models/Certificate');
const Class = require('../../models/Class');
const Enrollment = require('../../models/Enrollment');
const Feedback = require('../../models/Feedback');
const LearningProgram = require('../../models/LearningProgram');
const Schedule = require('../../models/Schedule');
const dashboardRepository = require('../../domains/learning/dashboard/repository');

let app, tokens, seed;
let seq = 0;

const DAY_MS = 86400000;

beforeAll(async () => {
  app = await getApp();
  tokens = getTokens();
  seed = getSeedData();
});

afterAll(async () => {
  await teardown();
});

afterEach(async () => {
  jest.restoreAllMocks();
  await Promise.all([
    Assignment.deleteMany({}),
    AssessmentAttempt.deleteMany({}),
    Attendance.deleteMany({}),
    Certificate.deleteMany({}),
    Enrollment.deleteMany({}),
    Feedback.deleteMany({}),
    LearningProgram.deleteMany({}),
    Schedule.deleteMany({}),
    Class.deleteMany({ classCode: /^DSH/ }),
  ]);
});

const uniq = () => `${Date.now()}_${seq++}`;

// One full operational fixture: two cohorts (one visible to the seed Teacher,
// one not), past sessions + attendance, an overdue assignment, an expiring and
// an expired certificate, one passing attempt, and one feedback submission.
const seedDashboardData = async () => {
  const now = Date.now();
  const [programA, programB] = await Promise.all([
    LearningProgram.create({
      code: `DSH_A_${uniq()}`,
      name: 'Dashboard Program A',
      schedulingMode: 'self_enroll',
    }),
    LearningProgram.create({
      code: `DSH_B_${uniq()}`,
      name: 'Dashboard Program B',
      schedulingMode: 'self_enroll',
    }),
  ]);
  const cohortA = await Class.create({
    classCode: `DSHA${seq++}`,
    courseName: 'Dashboard Course A',
    programId: programA._id,
    totalSessions: 2,
    teacherIds: [seed.teacher._id],
  });
  const cohortB = await Class.create({
    classCode: `DSHB${seq++}`,
    courseName: 'Dashboard Course B',
    programId: programB._id,
    totalSessions: 2,
    teacherIds: [seed.admin._id], // NOT visible to the seed Teacher
  });

  const [scheduleA, scheduleB] = await Promise.all([
    Schedule.create({
      classId: cohortA._id,
      startTime: new Date(now - 2 * DAY_MS),
      endTime: new Date(now - 2 * DAY_MS + 3600000),
      enrolledUsers: [seed.member1._id],
    }),
    Schedule.create({
      classId: cohortB._id,
      startTime: new Date(now - 3 * DAY_MS),
      endTime: new Date(now - 3 * DAY_MS + 3600000),
      enrolledUsers: [seed.member2._id],
    }),
  ]);

  await Promise.all([
    Attendance.create({ scheduleId: scheduleA._id, userId: seed.member1._id, status: 'P' }),
    Attendance.create({ scheduleId: scheduleB._id, userId: seed.member2._id, status: 'A' }),
    Enrollment.create({ userId: seed.member1._id, classId: cohortA._id, status: 'Active' }),
    Feedback.create({
      cohortId: cohortA._id,
      userId: seed.member1._id,
      programId: programA._id,
      rating: 4,
    }),
    AssessmentAttempt.create({
      assessmentId: new mongoose.Types.ObjectId(),
      userId: seed.member1._id,
      cohortId: cohortA._id,
      passed: true,
    }),
    Certificate.create({
      certificateNumber: `CERT-DSH-${uniq()}`,
      verificationCode: `dsh-${uniq()}`,
      userId: seed.member1._id,
      cohortId: cohortA._id,
      programId: programA._id,
      status: 'Issued',
      learnerName: 'Member One',
      programName: 'Dashboard Program A',
      validUntil: new Date(now + 10 * DAY_MS), // expiring within 30 days
    }),
    Certificate.create({
      certificateNumber: `CERT-DSH-${uniq()}`,
      verificationCode: `dsh-${uniq()}`,
      userId: seed.member2._id,
      cohortId: cohortB._id,
      programId: programB._id,
      status: 'Issued',
      learnerName: 'Member Two',
      programName: 'Dashboard Program B',
      validUntil: new Date(now - 1 * DAY_MS), // already expired
    }),
    Assignment.create({
      title: 'Dashboard overdue training',
      targetType: 'program',
      programId: programA._id,
      dueDate: new Date(now - 1 * DAY_MS), // yesterday → member2 is overdue
      userIds: [seed.member2._id],
    }),
  ]);

  return { programA, programB, cohortA, cohortB };
};

const getDashboard = (token, query = '') =>
  request(app)
    .get(`/api/learning/dashboard/operational${query}`)
    .set('Authorization', `Bearer ${token}`);

describe('Learning Platform API — operational dashboard bundle', () => {
  test('Admin gets the full org-wide bundle with every metric populated', async () => {
    await seedDashboardData();

    const res = await getDashboard(tokens.admin);
    expect(res.status).toBe(200);
    const data = res.body.data;

    expect(data.errors).toEqual([]);
    expect(data.windowDays).toBe(30);

    expect(data.completion.summary.cohorts).toBeGreaterThanOrEqual(2);
    expect(data.attendance).toMatchObject({ totalRecords: 2, presentRecords: 1, rate: 50 });
    expect(data.sessions).toMatchObject({ upcoming: 0, next7Days: 0, past: 2 });

    expect(data.assignments).toMatchObject({ activeAssignments: 1, overdueLearners: 1 });
    expect(data.assignments.topOverdue[0]).toMatchObject({
      assignmentTitle: 'Dashboard overdue training',
      learner: { empCode: seed.member2.empCode, name: 'Member Two' },
    });

    expect(data.certificates).toMatchObject({ expired: 1, expiring30: 1, expiring60: 1 });
    expect(data.certificates.topExpiring).toHaveLength(1);
    expect(data.certificates.topExpiring[0]).toMatchObject({
      learnerName: 'Member One',
      programName: 'Dashboard Program A',
    });

    expect(data.assessments).toMatchObject({ totalAttempts: 1, passedAttempts: 1, passRate: 100 });

    expect(data.feedback).toMatchObject({ count: 1, averageRating: 4 });
    expect(data.feedback.byProgram[0]).toMatchObject({
      programName: 'Dashboard Program A',
      count: 1,
      averageRating: 4,
    });

    // Seed users: leader + member1 + member2 are Active Participants (3);
    // member1 (attendance + enrollment) and member2 (attendance) are engaged.
    expect(data.coverage).toMatchObject({
      activeParticipants: 3,
      engagedParticipants: 2,
      coveragePercent: 66.67,
    });
  });

  test('completion block matches the completion rollup endpoint (parity)', async () => {
    await seedDashboardData();

    const [dashboard, rollup] = await Promise.all([
      getDashboard(tokens.admin),
      request(app)
        .get('/api/learning/reports/completion/rollup')
        .set('Authorization', `Bearer ${tokens.admin}`),
    ]);

    expect(dashboard.status).toBe(200);
    expect(rollup.status).toBe(200);
    expect(dashboard.body.data.completion.summary).toEqual(rollup.body.data.summary);
  });

  test('Teacher gets class-scoped attendance and certificates; org-wide overdue stays visible', async () => {
    await seedDashboardData();

    const res = await getDashboard(tokens.teacher);
    expect(res.status).toBe(200);
    const data = res.body.data;

    // Only cohortA (teacherIds includes the seed Teacher) is in scope: the
    // absent record + expired certificate live in cohortB and must not leak.
    expect(data.attendance).toMatchObject({ totalRecords: 1, presentRecords: 1, rate: 100 });
    expect(data.certificates).toMatchObject({ expired: 0, expiring30: 1 });
    expect(data.sessions).toMatchObject({ past: 1 });

    // Assignments stay org-wide (same exposure as the D4 Assignments tab).
    expect(data.assignments).toMatchObject({ overdueLearners: 1 });
  });

  test('Participant is denied (no report.read)', async () => {
    await seedDashboardData();

    const res = await getDashboard(tokens.leader);
    expect(res.status).toBe(403);
  });

  test('a failing metric degrades to null + errors[] instead of a 500 (fail-soft)', async () => {
    await seedDashboardData();
    jest
      .spyOn(dashboardRepository, 'coverageCounts')
      .mockRejectedValueOnce(new Error('aggregation exploded'));

    const res = await getDashboard(tokens.admin);
    expect(res.status).toBe(200);
    expect(res.body.data.coverage).toBeNull();
    expect(res.body.data.errors).toEqual([
      { metric: 'coverage', message: 'aggregation exploded' },
    ]);
    // The rest of the bundle still computed.
    expect(res.body.data.attendance.totalRecords).toBe(2);
  });

  test('rejects an invalid window value', async () => {
    const res = await getDashboard(tokens.admin, '?window=45');
    expect(res.status).toBe(400);
  });

  test('accepts a valid non-default window', async () => {
    await seedDashboardData();

    const res = await getDashboard(tokens.admin, '?window=90');
    expect(res.status).toBe(200);
    expect(res.body.data.windowDays).toBe(90);
    expect(res.body.data.coverage.windowDays).toBe(90);
  });
});

describe('GET /api/learning/dashboard/setup', () => {
  const getSetup = (token) =>
    request(app).get('/api/learning/dashboard/setup').set('Authorization', `Bearer ${token}`);

  test('admin: returns 5 onboarding steps + at-a-glance counts', async () => {
    const res = await getSetup(tokens.admin);
    expect(res.status).toBe(200);
    const { steps, completedSteps, totalSteps, atGlance } = res.body.data;
    expect(Array.isArray(steps)).toBe(true);
    expect(steps).toHaveLength(5);
    expect(steps.every((s) => typeof s.key === 'string' && typeof s.done === 'boolean')).toBe(true);
    expect(totalSteps).toBe(5);
    expect(completedSteps).toBeGreaterThanOrEqual(0);
    expect(atGlance).toHaveProperty('activeLearners');
    expect(atGlance).toHaveProperty('totalEmployees');
    expect(atGlance).toHaveProperty('sessionsThisWeek');
    expect(atGlance).toHaveProperty('pendingEnrollment');
  });

  test('participant without report.read is forbidden (403)', async () => {
    const res = await getSetup(tokens.leader);
    expect(res.status).toBe(403);
  });
});

describe('GET /api/learning/dashboard/departments', () => {
  const getDepts = (token, q = '') =>
    request(app).get(`/api/learning/dashboard/departments${q}`).set('Authorization', `Bearer ${token}`);

  test('admin: per-dept rows with headcount/completion/coverage/overdue', async () => {
    const res = await getDepts(tokens.admin);
    expect(res.status).toBe(200);
    expect(res.body.data.windowDays).toBe(30); // default
    const rows = res.body.data.departments;
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBeGreaterThan(0); // seed users carry departments
    const row = rows[0];
    ['department', 'headcount', 'completionPercent', 'coveragePercent', 'overdueCount']
      .forEach((k) => expect(row).toHaveProperty(k));
    expect(row.headcount).toBeGreaterThan(0);
  });

  test('window=365 is honored; an invalid window falls back to 30', async () => {
    expect((await getDepts(tokens.admin, '?window=365')).body.data.windowDays).toBe(365);
    expect((await getDepts(tokens.admin, '?window=999')).body.data.windowDays).toBe(30);
  });

  test('participant is forbidden (403)', async () => {
    expect((await getDepts(tokens.leader)).status).toBe(403);
  });
});
