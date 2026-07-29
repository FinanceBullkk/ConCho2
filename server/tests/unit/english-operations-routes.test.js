const express = require('express');
const request = require('supertest');

jest.mock('../../middleware/auth', () => ({
  protect: (req, _res, next) => {
    req.user = { _id: 'actor-1', role: req.get('x-test-role') || 'Participant' };
    next();
  },
}));

jest.mock('../../domains/english-training/controller', () => ({
  getWorkspaceOverview: (_req, res) => res.json({ success: true, data: {} }),
  listEnglishTeachers: (_req, res) => res.json({ success: true, data: [] }),
  getLiveEligibility: (_req, res) => res.json({ success: true, data: { learners: [] } }),
  getLiveEvaluationWorklist: (_req, res) => res.json({ success: true, data: { learners: [] } }),
  recordLiveEnglishLevel: (req, res) => res.status(201).json({ success: true, data: req.body }),
  deleteLiveEnglishLevel: jest.fn(),
  createCanonicalClass: (req, res) => res.status(201).json({ success: true, data: req.body }),
  addCanonicalRunEnrollment: (req, res) => res.status(201).json({ success: true, data: req.body }),
  leaveCanonicalRunEnrollment: (req, res) => res.json({ success: true, data: req.body }),
  transferCanonicalRunEnrollment: (req, res) => res.json({ success: true, data: req.body }),
  createCanonicalAttendanceSession: (req, res) => res.status(201).json({ success: true, data: req.body }),
  rescheduleCanonicalMeeting: (req, res) => res.json({ success: true, data: req.body }),
  cancelCanonicalMeeting: (req, res) => res.json({ success: true, data: req.body }),
  getCanonicalAttendanceRoster: (_req, res) => res.json({ success: true, data: { rows: [] } }),
  saveCanonicalAttendanceRoster: (req, res) => res.json({ success: true, data: req.body }),
  listManagedPeople: (_req, res) => res.json({ success: true, data: [] }),
  createManagedPerson: (req, res) => res.status(201).json({ success: true, data: req.body }),
  updateManagedPerson: jest.fn(), deleteManagedPerson: jest.fn(), provisionManagedPeople: jest.fn(),
  getOverview: jest.fn(), listCohorts: (_req, res) => res.json({ success: true, data: [] }), getCohort: jest.fn(), getClassDetail: jest.fn(),
  listCourses: (_req, res) => res.json({ success: true, data: [] }), listCanonicalCourseRuns: (_req, res) => res.json({ success: true, data: [] }), getCourseRun: jest.fn(), listEmployees: (_req, res) => res.json({ success: true, data: [] }), getEmployee: jest.fn(),
  correctEmployee: jest.fn(), listSessions: jest.fn(), getSessionsSummary: jest.fn(), getSessionAttendance: jest.fn(),
  listEligibility: jest.fn(), listIssues: jest.fn(), listIssueDetails: jest.fn(),
  listLevels: jest.fn(), listPendingExamEntries: jest.fn(), recordExamResult: jest.fn(), deleteExamResult: jest.fn(),
}));

const routes = require('../../domains/english-training/routes');
const app = express();
app.use(express.json());
app.use('/api/english-training', routes);

describe('English Operations P0 authorization', () => {
  test('Teacher can enter the workspace overview', async () => {
    const res = await request(app).get('/api/english-training/workspace/overview').set('x-test-role', 'Teacher');
    expect(res.status).toBe(200);
  });

  test('Teacher cannot read managed learners', async () => {
    const res = await request(app).get('/api/english-training/managed-learners').set('x-test-role', 'Teacher');
    expect(res.status).toBe(403);
  });

  test('Coordinator can create a managed learner without email or password', async () => {
    const res = await request(app)
      .post('/api/english-training/managed-learners')
      .set('x-test-role', 'Coordinator')
      .send({ empCode: 'E001', name: 'Managed Learner' });
    expect(res.status).toBe(201);
    expect(res.body.data).not.toHaveProperty('password');
  });

  test('Participant cannot enter English Operations', async () => {
    const res = await request(app).get('/api/english-training/workspace/overview').set('x-test-role', 'Participant');
    expect(res.status).toBe(403);
  });
});

describe('English Operations canonical evaluation authorization', () => {
  test('Participant cannot record a canonical English level', async () => {
    const res = await request(app)
      .post('/api/english-training/enrollments/enrollment-1/exam-result')
      .set('x-test-role', 'Participant')
      .send({ levelCode: 'advanced', examDate: '2026-07-20' });
    expect(res.status).toBe(403);
  });
});

describe('English Operations canonical class authorization', () => {
  const validClass = {
    classCode: 'EL900', displayName: 'English Class 900', courseId: 'course-1',
    startDate: '2026-07-20', capacity: 12, status: 'active', picLabel: 'People Team',
  };

  test('Coordinator can read and atomically create a PIC-owned class', async () => {
    const read = await request(app).get('/api/english-training/workspace/classes').set('x-test-role', 'Coordinator');
    expect(read.status).toBe(200);
    const write = await request(app).post('/api/english-training/workspace/classes')
      .set('x-test-role', 'Coordinator').send(validClass);
    expect(write.status).toBe(201);
  });

  test('class creation requires a PIC employee or label', async () => {
    const res = await request(app).post('/api/english-training/workspace/classes')
      .set('x-test-role', 'Admin').send({ ...validClass, picLabel: '' });
    expect(res.status).toBe(400);
  });

  test('Teacher cannot administer canonical classes', async () => {
    const res = await request(app).post('/api/english-training/workspace/classes')
      .set('x-test-role', 'Teacher').send(validClass);
    expect(res.status).toBe(403);
  });
});

describe('English Operations canonical live roster authorization', () => {
  test('Coordinator can start a learner and create a timezone-aware session', async () => {
    const enrollment = await request(app)
      .post('/api/english-training/workspace/course-runs/run-1/enrollments')
      .set('x-test-role', 'Coordinator')
      .send({ employeeId: 'employee-1', startDate: '2026-07-20', confirmedStartSessionNumber: 3 });
    expect(enrollment.status).toBe(201);

    const session = await request(app)
      .post('/api/english-training/workspace/course-runs/run-1/sessions')
      .set('x-test-role', 'Coordinator')
      .send({
        startsAt: '2026-07-20T02:00:00.000Z',
        endsAt: '2026-07-20T03:00:00.000Z',
        confirmedSessionNumber: 3,
      });
    expect(session.status).toBe(201);
  });

  test('Coordinator can mark an active learner as left with a date and reason', async () => {
    const res = await request(app)
      .post('/api/english-training/workspace/course-runs/run-1/enrollments/enrollment-1/leave')
      .set('x-test-role', 'Coordinator')
      .send({ lastActiveDate: '2026-07-20', reason: 'Work schedule changed' });
    expect(res.status).toBe(200);
  });

  test('learner leave requires an operator reason', async () => {
    const res = await request(app)
      .post('/api/english-training/workspace/course-runs/run-1/enrollments/enrollment-1/leave')
      .set('x-test-role', 'Admin')
      .send({ lastActiveDate: '2026-07-20', reason: '' });
    expect(res.status).toBe(400);
  });

  test('learner leave rejects an impossible calendar date', async () => {
    const res = await request(app)
      .post('/api/english-training/workspace/course-runs/run-1/enrollments/enrollment-1/leave')
      .set('x-test-role', 'Admin')
      .send({ lastActiveDate: '2026-02-31', reason: 'Work schedule changed' });
    expect(res.status).toBe(400);
  });

  test('Teacher cannot mark a learner as left', async () => {
    const res = await request(app)
      .post('/api/english-training/workspace/course-runs/run-1/enrollments/enrollment-1/leave')
      .set('x-test-role', 'Teacher')
      .send({ lastActiveDate: '2026-07-20', reason: 'Work schedule changed' });
    expect(res.status).toBe(403);
  });

  test('Coordinator can transfer an active learner with a confirmed destination session', async () => {
    const res = await request(app)
      .post('/api/english-training/workspace/course-runs/run-1/enrollments/enrollment-1/transfer')
      .set('x-test-role', 'Coordinator')
      .send({
        targetCourseRunId: 'run-2', transferDate: '2026-07-20',
        confirmedStartSessionNumber: 3,
      });
    expect(res.status).toBe(200);
  });

  test('learner transfer rejects an impossible calendar date', async () => {
    const res = await request(app)
      .post('/api/english-training/workspace/course-runs/run-1/enrollments/enrollment-1/transfer')
      .set('x-test-role', 'Admin')
      .send({
        targetCourseRunId: 'run-2', transferDate: '2026-02-31',
        confirmedStartSessionNumber: 3,
      });
    expect(res.status).toBe(400);
  });

  test('learner transfer accepts a bounded capacity override reason', async () => {
    const accepted = await request(app)
      .post('/api/english-training/workspace/course-runs/run-1/enrollments/enrollment-1/transfer')
      .set('x-test-role', 'Admin')
      .send({
        targetCourseRunId: 'run-2', transferDate: '2026-07-20',
        confirmedStartSessionNumber: 3,
        capacityOverrideReason: 'HR approved an additional seat',
      });
    expect(accepted.status).toBe(200);

    const tooLong = await request(app)
      .post('/api/english-training/workspace/course-runs/run-1/enrollments/enrollment-1/transfer')
      .set('x-test-role', 'Admin')
      .send({
        targetCourseRunId: 'run-2', transferDate: '2026-07-20',
        confirmedStartSessionNumber: 3,
        capacityOverrideReason: 'x'.repeat(1001),
      });
    expect(tooLong.status).toBe(400);
  });

  test('Teacher cannot transfer a learner', async () => {
    const res = await request(app)
      .post('/api/english-training/workspace/course-runs/run-1/enrollments/enrollment-1/transfer')
      .set('x-test-role', 'Teacher')
      .send({
        targetCourseRunId: 'run-2', transferDate: '2026-07-20',
        confirmedStartSessionNumber: 3,
      });
    expect(res.status).toBe(403);
  });

  test('Coordinator can read and save one complete attendance roster', async () => {
    const path = '/api/english-training/workspace/course-runs/run-1/session-units/unit-1/attendance';
    expect((await request(app).get(path).set('x-test-role', 'Coordinator')).status).toBe(200);
    const save = await request(app).put(path).set('x-test-role', 'Coordinator').send({
      rosterToken: 'a'.repeat(64),
      records: [{ runEnrollmentId: 'enrollment-1', status: 'present' }],
    });
    expect(save.status).toBe(200);
  });

  test('Coordinator can reschedule and durably cancel a canonical Meeting', async () => {
    const path = '/api/english-training/workspace/course-runs/run-1/meetings/meeting-1';
    const moved = await request(app).patch(path).set('x-test-role', 'Coordinator').send({
      startsAt: '2026-07-22T02:00:00.000Z',
      endsAt: '2026-07-22T03:00:00.000Z',
      reason: 'PIC request',
    });
    expect(moved.status).toBe(200);
    const cancelled = await request(app).delete(path).set('x-test-role', 'Coordinator').send({
      cancellationReason: 'Company event',
    });
    expect(cancelled.status).toBe(200);
  });

  test('Meeting cancellation requires an operator reason', async () => {
    const res = await request(app)
      .delete('/api/english-training/workspace/course-runs/run-1/meetings/meeting-1')
      .set('x-test-role', 'Admin')
      .send({ cancellationReason: '' });
    expect(res.status).toBe(400);
  });

  test('Teacher stays closed out until assigned-resource scope is ported', async () => {
    const res = await request(app)
      .put('/api/english-training/workspace/course-runs/run-1/session-units/unit-1/attendance')
      .set('x-test-role', 'Teacher')
      .send({ rosterToken: 'a'.repeat(64), records: [] });
    expect(res.status).toBe(403);
  });

  test('Teacher cannot move an English Meeting without scheduler scope', async () => {
    const res = await request(app)
      .patch('/api/english-training/workspace/course-runs/run-1/meetings/meeting-1')
      .set('x-test-role', 'Teacher')
      .send({
        startsAt: '2026-07-22T02:00:00.000Z',
        endsAt: '2026-07-22T03:00:00.000Z',
      });
    expect(res.status).toBe(403);
  });
});
