const request = require('supertest');
const { getApp, getTokens, getSeedData, getCsrfHeaders, teardown } = require('../setup');
// Assignments are written through the ported PG repo (PG-only on the lane) — read/
// mutate/clean the active backend, not Mongoose. Fixtures INSERT straight into PG.
const {
  readActiveRow, deleteActiveRowsWhere, deleteActiveRowsLike, updateActiveRow,
} = require('../pg-test-utils');
const fx = require('../fixtures/pg-fixtures');
const { statusFromSignals } = require('../../domains/learning/assignment/status-resolver');

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
    deleteActiveRowsWhere('Certificate', {}),
    deleteActiveRowsWhere('Enrollment', {}),
    deleteActiveRowsWhere('LearningPath', {}),
    deleteActiveRowsWhere('LearningProgram', {}),
    deleteActiveRowsWhere('Department', {}),
    deleteActiveRowsLike('Class', 'classCode', 'ASG'),
  ]);
  await Promise.all([
    updateActiveRow('User', seed.member1._id, { departmentId: null, status: 'Active', isDeleted: false, deletedAt: null }),
    updateActiveRow('User', seed.member2._id, { departmentId: null, status: 'Active', isDeleted: false, deletedAt: null }),
  ]);
});

const uniq = () => `${Date.now()}_${seq++}`;

const createProgram = (overrides = {}) =>
  fx.createLearningProgram({
    code: `ASGP_${uniq()}`,
    name: `Assignment Program ${uniq()}`,
    schedulingMode: 'self_enroll',
    ...overrides,
  });

const createCohort = (programId) =>
  fx.createClass({
    classCode: `ASG${seq++}`,
    courseName: 'Assignment Course',
    programId,
    totalSessions: 1,
  });

const completeProgram = async (userId, programId) => {
  const cohort = await createCohort(programId);
  await fx.createCertificate({
    certificateNumber: `CERT-ASG-${uniq()}`,
    verificationCode: `asg-${uniq()}`,
    userId,
    programId,
    cohortId: cohort._id,
    status: 'Issued',
  });
  return cohort;
};

const createAssignment = (body, token = tokens.admin) =>
  request(app)
    .post('/api/learning/assignments')
    .set('Authorization', `Bearer ${token}`)
    .set(csrf)
    .send(body);

describe('Learning Platform API — assignments + due dates (Wave D4 v1)', () => {
  test('date-only due dates stay open through the due date', () => {
    const dueDate = new Date('2026-06-30T00:00:00.000Z');
    expect(statusFromSignals({
      complete: false,
      inProgress: false,
      dueDate,
      now: new Date('2026-06-30T12:00:00.000Z'),
    })).toBe('not_started');
    expect(statusFromSignals({
      complete: false,
      inProgress: false,
      dueDate,
      now: new Date('2026-07-01T00:00:00.000Z'),
    })).toBe('overdue');
  });

  test('Admin creates a program assignment and sees derived status summary', async () => {
    const program = await createProgram({
      completionPolicy: { attendanceThresholdPercent: 0, requiresFeedback: true },
    });
    const cohort = await completeProgram(seed.member1._id, program._id);
    await fx.createEnrollment({ userId: seed.member2._id, classId: cohort._id, status: 'Active' });

    const res = await createAssignment({
      title: 'Mandatory safety training',
      targetType: 'program',
      programId: program._id,
      dueDate: new Date(Date.now() + 7 * 86400000),
      userIds: [seed.member1._id, seed.member2._id],
    });

    expect(res.status).toBe(201);
    expect(res.body.data.summary).toMatchObject({ total: 2, complete: 1, in_progress: 1 });
    const byId = Object.fromEntries(res.body.data.learners.map((row) => [row.learner._id, row.status]));
    expect(byId[seed.member1._id.toString()]).toBe('complete');
    expect(byId[seed.member2._id.toString()]).toBe('in_progress');
  });

  test('incomplete learners past the due date are overdue; completed still wins', async () => {
    const program = await createProgram();
    await completeProgram(seed.member1._id, program._id);

    const res = await createAssignment({
      title: 'Past due compliance',
      targetType: 'program',
      programId: program._id,
      dueDate: new Date(Date.now() - 86400000),
      userIds: [seed.member1._id, seed.member2._id],
    });

    expect(res.status).toBe(201);
    expect(res.body.data.summary).toMatchObject({ total: 2, complete: 1, overdue: 1 });
  });

  test('department targets expand to live department users; soft-deleted users are excluded', async () => {
    const [program, dept] = await Promise.all([
      createProgram(),
      fx.createDepartment({ name: 'Compliance Dept', code: `ASGD${seq++}` }),
    ]);
    await Promise.all([
      updateActiveRow('User', seed.member1._id, { departmentId: dept._id }),
      updateActiveRow('User', seed.member2._id, { departmentId: dept._id }),
    ]);

    const created = await createAssignment({
      title: 'Department training',
      targetType: 'program',
      programId: program._id,
      dueDate: new Date(Date.now() + 86400000),
      departmentIds: [dept._id],
    });
    expect(created.status).toBe(201);
    expect(created.body.data.summary.total).toBe(2);

    await updateActiveRow('User', seed.member2._id, { isDeleted: true, deletedAt: new Date() });

    const listed = await request(app)
      .get('/api/learning/assignments')
      .set('Authorization', `Bearer ${tokens.admin}`);
    expect(listed.status).toBe(200);
    expect(listed.body.data[0].summary.total).toBe(1);
    expect(listed.body.data[0].learners[0].learner._id).toBe(seed.member1._id.toString());
  });

  test('path assignment is complete only when every path program is completed', async () => {
    const [a, b] = await Promise.all([createProgram(), createProgram()]);
    const path = await fx.createLearningPath({
      code: `ASGPATH_${uniq()}`,
      title: 'Mandatory path',
      programs: [a._id, b._id],
    });
    await Promise.all([
      completeProgram(seed.member1._id, a._id),
      completeProgram(seed.member1._id, b._id),
      completeProgram(seed.member2._id, a._id),
    ]);

    const res = await createAssignment({
      title: 'Path assignment',
      targetType: 'path',
      pathId: path._id,
      dueDate: new Date(Date.now() + 86400000),
      userIds: [seed.member1._id, seed.member2._id],
    });

    expect(res.status).toBe(201);
    expect(res.body.data.summary).toMatchObject({ total: 2, complete: 1, in_progress: 1 });
  });

  test('Participant cannot list/create assignment admin views', async () => {
    const program = await createProgram();

    const list = await request(app)
      .get('/api/learning/assignments')
      .set('Authorization', `Bearer ${tokens.leader}`);
    expect(list.status).toBe(403);

    const create = await createAssignment({
      title: 'Blocked',
      targetType: 'program',
      programId: program._id,
      dueDate: new Date(),
      userIds: [seed.leader._id],
    }, tokens.leader);
    expect(create.status).toBe(403);
  });

  test('Admin archives an assignment (soft delete)', async () => {
    const program = await createProgram();
    const created = await createAssignment({
      title: 'Archive me',
      targetType: 'program',
      programId: program._id,
      dueDate: new Date(Date.now() + 86400000),
      userIds: [seed.member1._id],
    });

    const archived = await request(app)
      .delete(`/api/learning/assignments/${created.body.data._id}`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf);

    expect(archived.status).toBe(200);
    expect(archived.body.data.status).toBe('archived');

    const activeList = await request(app)
      .get('/api/learning/assignments')
      .set('Authorization', `Bearer ${tokens.admin}`);
    expect(activeList.body.count).toBe(0);

    const stored = await readActiveRow('Assignment', created.body.data._id);
    expect(stored.isDeleted).toBe(true);
  });
});
