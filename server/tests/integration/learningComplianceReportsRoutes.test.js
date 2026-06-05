const request = require('supertest');
const { getApp, getTokens, getSeedData, teardown } = require('../setup');
const Assignment = require('../../models/Assignment');
const AuditLog = require('../../models/AuditLog');
const Certificate = require('../../models/Certificate');
const Class = require('../../models/Class');
const Department = require('../../models/Department');
const Enrollment = require('../../models/Enrollment');
const LearningProgram = require('../../models/LearningProgram');
const User = require('../../models/User');

let app, tokens, seed;
let seq = 0;

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
    Assignment.deleteMany({}),
    AuditLog.deleteMany({ entity: 'Report' }),
    Certificate.deleteMany({}),
    Enrollment.deleteMany({}),
    LearningProgram.deleteMany({}),
    Department.deleteMany({}),
    Class.deleteMany({ classCode: /^CMP/ }),
  ]);
  await User.updateMany(
    { _id: { $in: [seed.member1._id, seed.member2._id] } },
    { $set: { departmentId: null, managerId: null, status: 'Active', isDeleted: false, deletedAt: null } },
  );
  delete process.env['COMPLIANCE_EXPORT_MAX_ROWS'];
});

const uniq = () => `${Date.now()}_${seq++}`;

const createProgram = () =>
  LearningProgram.create({
    code: `CMP_${uniq()}`,
    name: `Compliance Program ${seq}`,
    schedulingMode: 'self_enroll',
    completionPolicy: { attendanceThresholdPercent: 0, requiresAssessment: true },
  });

const createCohort = (programId) =>
  Class.create({
    classCode: `CMP${seq++}`,
    courseName: 'Compliance Course',
    programId,
    totalSessions: 1,
  });

const issueCertificate = (userId, programId, cohortId, status = 'Issued') =>
  Certificate.create({
    certificateNumber: `CERT-CMP-${uniq()}`,
    verificationCode: `cmp-${uniq()}`,
    userId,
    programId,
    cohortId,
    status,
  });

const seedCompliance = async () => {
  const [program, dept] = await Promise.all([
    createProgram(),
    Department.create({ name: 'Safety Ops', code: `CMPD${seq++}` }),
  ]);
  await User.updateMany(
    { _id: { $in: [seed.member1._id, seed.member2._id] } },
    { $set: { departmentId: dept._id, managerId: seed.teacher._id } },
  );
  const cohort = await createCohort(program._id);
  const cert = await issueCertificate(seed.member1._id, program._id, cohort._id);
  await Enrollment.create({ userId: seed.member2._id, classId: cohort._id, status: 'Active' });
  const assignment = await Assignment.create({
    title: 'Annual safety training',
    targetType: 'program',
    programId: program._id,
    dueDate: new Date(Date.now() + 7 * 86400000),
    userIds: [seed.member1._id, seed.member2._id],
  });
  return { program, dept, cohort, cert, assignment };
};

const getCompliance = (token, query = '') =>
  request(app)
    .get(`/api/learning/reports/compliance${query}`)
    .set('Authorization', `Bearer ${token}`);

const waitForAudit = () => new Promise((resolve) => setTimeout(resolve, 30));

describe('Learning Platform API — compliance reports (Wave D6 v1.1)', () => {
  test('Admin reads assignment compliance rows with org rollups and certificate state', async () => {
    const { dept, cert } = await seedCompliance();

    const res = await getCompliance(tokens.admin);
    expect(res.status).toBe(200);
    expect(res.body.data.summary).toMatchObject({
      rows: 2,
      learners: 2,
      assignments: 1,
      complete: 1,
      inProgress: 1,
      issued: 1,
      missing: 1,
    });

    const byId = Object.fromEntries(res.body.data.rows.map((row) => [row.learner.id, row]));
    expect(byId[seed.member1._id.toString()]).toMatchObject({
      org: { departmentName: 'Safety Ops', managerName: 'Teacher User' },
      assignment: { title: 'Annual safety training', status: 'complete' },
      completion: { complete: true, evidence: 'certificate' },
      certificate: { number: cert.certificateNumber, status: 'Issued', state: 'issued' },
    });
    expect(byId[seed.member2._id.toString()]).toMatchObject({
      assignment: { status: 'in_progress' },
      completion: { complete: false, evidence: 'none' },
      certificate: { state: 'missing' },
    });

    expect(res.body.data.rollups.departments).toContainEqual(
      expect.objectContaining({ key: dept._id.toString(), label: 'Safety Ops', rows: 2, learners: 2 }),
    );
    expect(res.body.data.rollups.managers).toContainEqual(
      expect.objectContaining({ key: seed.teacher._id.toString(), label: 'Teacher User', rows: 2 }),
    );
  });

  test('Teacher and Participant are denied org-wide compliance reports', async () => {
    await seedCompliance();

    expect((await getCompliance(tokens.teacher)).status).toBe(403);
    expect((await getCompliance(tokens.leader)).status).toBe(403);
  });

  test('filters by status, certificate state, department, manager, program, and due window', async () => {
    const { program, dept } = await seedCompliance();
    const dueFrom = new Date(Date.now() + 6 * 86400000).toISOString().slice(0, 10);
    const dueTo = new Date(Date.now() + 8 * 86400000).toISOString().slice(0, 10);

    const complete = await getCompliance(tokens.admin, '?status=complete');
    expect(complete.body.data.rows).toHaveLength(1);
    expect(complete.body.data.rows[0].learner.id).toBe(seed.member1._id.toString());

    const missing = await getCompliance(tokens.admin, '?certificateState=missing');
    expect(missing.body.data.rows).toHaveLength(1);
    expect(missing.body.data.rows[0].learner.id).toBe(seed.member2._id.toString());

    const scoped = await getCompliance(
      tokens.admin,
      `?departmentId=${dept._id}&managerId=${seed.teacher._id}&programId=${program._id}&dueFrom=${dueFrom}&dueTo=${dueTo}`,
    );
    expect(scoped.status).toBe(200);
    expect(scoped.body.data.summary.rows).toBe(2);

    const invalid = await getCompliance(tokens.admin, '?assignmentId=bad-id');
    expect(invalid.status).toBe(400);
  });

  test('export returns xlsx with row count header and writes a Report audit entry', async () => {
    await seedCompliance();

    const res = await request(app)
      .get('/api/learning/reports/compliance/export')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .buffer(true);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('spreadsheetml.sheet');
    expect(res.headers['content-disposition']).toContain('compliance-report-');
    expect(res.headers['x-tms-record-count']).toBe('2');

    await waitForAudit();
    const log = await AuditLog.findOne({ action: 'exported', entity: 'Report' }).lean();
    expect(log).toMatchObject({ actorRole: 'Admin' });
    expect(log.note).toContain('compliance-report.xlsx');
  });

  test('export refuses to create a partial workbook when row cap is exceeded', async () => {
    await seedCompliance();
    process.env['COMPLIANCE_EXPORT_MAX_ROWS'] = '1';

    const res = await request(app)
      .get('/api/learning/reports/compliance/export')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .buffer(true);

    expect(res.status).toBe(413);
    expect(res.body.message).toContain('row limit');
  });
});
