const request = require('supertest');
const mongoose = require('mongoose');
const { getApp, getTokens, getSeedData, teardown, getCsrfHeaders } = require('../setup');
const AssessmentAttempt = require('../../models/AssessmentAttempt');
const Attendance = require('../../models/Attendance');
const AuditLog = require('../../models/AuditLog');
const Certificate = require('../../models/Certificate');
const Class = require('../../models/Class');
const Enrollment = require('../../models/Enrollment');
const Feedback = require('../../models/Feedback');
const LearningPath = require('../../models/LearningPath');
const LearningProgram = require('../../models/LearningProgram');
const Schedule = require('../../models/Schedule');
const Setting = require('../../models/Setting');
// Audit rows + the cost-config Setting are written through ported repos (PG-only
// on the lane) — read audit + clear the Setting on the ACTIVE backend, else a
// Mongoose read/deleteMany misses them (the cost-config leaks across tests).
const { findActiveAuditRow, deleteActiveRowsWhere } = require('../pg-test-utils');

let app, tokens, seed;
let seq = 0;

const DAY_MS = 86400000;
const uniq = () => `${Date.now()}_${seq++}`;

beforeAll(async () => {
  app = await getApp();
  tokens = getTokens();
  seed = getSeedData();
});

afterAll(async () => {
  await teardown();
});

afterEach(async () => {
  await Promise.all([
    AssessmentAttempt.deleteMany({}),
    Attendance.deleteMany({}),
    AuditLog.deleteMany({ entity: 'Setting' }),
    Certificate.deleteMany({}),
    Enrollment.deleteMany({}),
    Feedback.deleteMany({}),
    LearningPath.deleteMany({}),
    LearningProgram.deleteMany({}),
    Schedule.deleteMany({}),
    Class.deleteMany({ classCode: /^EXD/ }),
    deleteActiveRowsWhere('Setting', { key: 'LND_COST_CONFIG' }), // never touch ALLOWED_TIME_SLOTS
  ]);
});

// Mirror of the Phase-1 operational fixture plus a learning path so the
// certificate-based mobility proxy has something to count.
const seedExecutiveData = async () => {
  const now = Date.now();
  const programA = await LearningProgram.create({
    code: `EXD_A_${uniq()}`,
    name: 'Executive Program A',
    schedulingMode: 'self_enroll',
  });
  const cohortA = await Class.create({
    classCode: `EXDA${seq++}`,
    courseName: 'Executive Course A',
    programId: programA._id,
    totalSessions: 2,
  });
  const scheduleA = await Schedule.create({
    classId: cohortA._id,
    startTime: new Date(now - 2 * DAY_MS),
    endTime: new Date(now - 2 * DAY_MS + 3600000),
    enrolledUsers: [seed.member1._id],
  });

  await Promise.all([
    Attendance.create({ scheduleId: scheduleA._id, userId: seed.member1._id, status: 'P' }),
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
      certificateNumber: `CERT-EXD-${uniq()}`,
      verificationCode: `exd-${uniq()}`,
      userId: seed.member1._id,
      cohortId: cohortA._id,
      programId: programA._id,
      status: 'Issued',
      validUntil: new Date(now + 10 * DAY_MS), // expiring within 30 days
    }),
    Certificate.create({
      certificateNumber: `CERT-EXD-${uniq()}`,
      verificationCode: `exd-${uniq()}`,
      userId: seed.member2._id,
      cohortId: cohortA._id,
      programId: programA._id,
      status: 'Issued',
      validUntil: new Date(now - 1 * DAY_MS), // already expired
    }),
    LearningPath.create({
      code: `EXDP_${uniq()}`,
      title: 'Executive Path',
      programs: [programA._id],
    }),
  ]);

  return { programA, cohortA };
};

const getExecutive = (token, query = '') =>
  request(app)
    .get(`/api/learning/dashboard/executive${query}`)
    .set('Authorization', `Bearer ${token}`);

const putCostConfig = async (token, body) => {
  const csrf = await getCsrfHeaders(app);
  return request(app)
    .put('/api/learning/dashboard/cost-config')
    .set('Authorization', `Bearer ${token}`)
    .set(csrf)
    .send(body);
};

describe('Learning Platform API — executive dashboard (ROI tier)', () => {
  test('Admin gets trend, Kirkpatrick, mobility, certificate rollup, and coverage', async () => {
    await seedExecutiveData();

    const res = await getExecutive(tokens.admin);
    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(data.errors).toEqual([]);

    // Trend: 6 months, current month carries today's enrollment + 2 issued certs.
    expect(data.trend.months).toHaveLength(6);
    const currentMonth = data.trend.months.at(-1);
    expect(currentMonth.month).toBe(new Date().toISOString().slice(0, 7));
    expect(currentMonth).toMatchObject({ enrollments: 1, certificatesIssued: 2 });

    // Kirkpatrick: L1/L2 measured, L3–L5 honestly not.
    expect(data.kirkpatrick.l1Reaction).toMatchObject({ measured: true, averageRating: 4, submissions: 1 });
    expect(data.kirkpatrick.l2Learning).toMatchObject({ measured: true, passRate: 100, attempts: 1 });
    expect(data.kirkpatrick.l3Behavior.measured).toBe(false);
    expect(data.kirkpatrick.l5Roi.measured).toBe(false);

    // Mobility: member1 AND member2 hold Issued certs for the path's only
    // program (member2's is date-expired but still status Issued — D6 keeps
    // expiry a reporting signal, not a completion change).
    expect(data.mobility).toMatchObject({
      activePaths: 1,
      certificateBasedPathCompletions: 2,
      basis: 'certificates',
    });

    // Certificate validity rollup.
    expect(data.certificates).toMatchObject({
      totalIssued: 2, valid: 1, expiring30: 1, expired: 1, revoked: 0,
    });

    // Coverage: 3 active Participants, member1 engaged; Sales department row.
    expect(data.coverage).toMatchObject({ activeParticipants: 3, engagedParticipants: 1 });
    const sales = data.coverage.departments.find((row) => row.department === 'Sales');
    expect(sales).toMatchObject({ active: 3, engaged: 1 });
  });

  test('financials stay unconfigured (never fabricated) until the cost config is set', async () => {
    await seedExecutiveData();

    const before = await getExecutive(tokens.admin);
    expect(before.body.data.financials).toEqual({ configured: false });
    expect(before.body.data.financials.costPerEmployeeMinor).toBeUndefined();

    const put = await putCostConfig(tokens.admin, {
      annualBudgetMinor: 1000000,
      currency: 'vnd', // lowercased on purpose — schema uppercases
    });
    expect(put.status).toBe(200);
    expect(put.body.data).toMatchObject({ annualBudgetMinor: 1000000, currency: 'VND' });

    const after = await getExecutive(tokens.admin);
    // Active employees: admin + teacher + leader + member1 + member2 = 5.
    expect(after.body.data.financials).toMatchObject({
      configured: true,
      currency: 'VND',
      activeEmployees: 5,
      costPerEmployeeMinor: 200000,
      completionsTrailing12Months: 2,
      costPerCompletionMinor: 500000,
    });
  });

  test('efficiency dividend computes from coordinators × hours × weeks × hourly cost (ROI §10)', async () => {
    await seedExecutiveData();

    // Budget only → no efficiency inputs → dividend stays null (never fabricated).
    await putCostConfig(tokens.admin, { annualBudgetMinor: 1000000, currency: 'VND' });
    const partial = await getExecutive(tokens.admin);
    expect(partial.body.data.financials.efficiencyDividendMinor).toBeNull();

    // Full inputs → 10h/wk × 4 coordinators × 52 weeks × 100000 = 208,000,000.
    await putCostConfig(tokens.admin, {
      annualBudgetMinor: 1000000,
      currency: 'VND',
      avgLoadedHourlyCostMinor: 100000,
      coordinatorCount: 4,
      automationHoursReclaimedPerWeek: 10,
    });
    const after = await getExecutive(tokens.admin);
    expect(after.body.data.financials).toMatchObject({
      coordinatorCount: 4,
      automationHoursReclaimedPerWeek: 10,
      avgLoadedHourlyCostMinor: 100000,
      efficiencyDividendMinor: 208000000,
    });
  });

  test('PUT cost-config writes a Setting audit entry with the diff', async () => {
    const res = await putCostConfig(tokens.admin, {
      annualBudgetMinor: 500000,
      currency: 'VND',
    });
    expect(res.status).toBe(200);

    // audit is fire-and-forget through the ported repo — poll the active backend.
    let log = null;
    for (let i = 0; i < 20 && !log; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      log = await findActiveAuditRow({ entity: 'Setting', action: 'created' });
      // eslint-disable-next-line no-await-in-loop
      if (!log) await new Promise((r) => setTimeout(r, 50));
    }
    expect(log).toMatchObject({ actorRole: 'Admin' });
    expect(log.note).toContain('LND_COST_CONFIG');
  });

  test('cost-config GET returns null before set and the value after', async () => {
    const empty = await request(app)
      .get('/api/learning/dashboard/cost-config')
      .set('Authorization', `Bearer ${tokens.admin}`);
    expect(empty.status).toBe(200);
    expect(empty.body.data).toBeNull();

    await putCostConfig(tokens.admin, { annualBudgetMinor: 750000, currency: 'USD' });

    const loaded = await request(app)
      .get('/api/learning/dashboard/cost-config')
      .set('Authorization', `Bearer ${tokens.admin}`);
    expect(loaded.body.data).toMatchObject({ annualBudgetMinor: 750000, currency: 'USD' });
  });

  test('Teacher (report.read) and Participant are denied the executive tier', async () => {
    await seedExecutiveData();

    // Teacher holds report.read but the executive tier is Admin-only inside.
    expect((await getExecutive(tokens.teacher)).status).toBe(403);
    expect((await getExecutive(tokens.leader)).status).toBe(403);

    const teacherGet = await request(app)
      .get('/api/learning/dashboard/cost-config')
      .set('Authorization', `Bearer ${tokens.teacher}`);
    expect(teacherGet.status).toBe(403);

    const teacherPut = await putCostConfig(tokens.teacher, {
      annualBudgetMinor: 1,
      currency: 'VND',
    });
    expect(teacherPut.status).toBe(403);
  });

  test('rejects an invalid cost config body', async () => {
    const negative = await putCostConfig(tokens.admin, {
      annualBudgetMinor: -5,
      currency: 'VND',
    });
    expect(negative.status).toBe(400);

    const badCurrency = await putCostConfig(tokens.admin, {
      annualBudgetMinor: 100,
      currency: 'DONG',
    });
    expect(badCurrency.status).toBe(400);

    const float = await putCostConfig(tokens.admin, {
      annualBudgetMinor: 10.5,
      currency: 'VND',
    });
    expect(float.status).toBe(400);
  });
});
