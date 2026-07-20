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
  listManagedPeople: (_req, res) => res.json({ success: true, data: [] }),
  createManagedPerson: (req, res) => res.status(201).json({ success: true, data: req.body }),
  updateManagedPerson: jest.fn(), deleteManagedPerson: jest.fn(), provisionManagedPeople: jest.fn(),
  getOverview: jest.fn(), listCohorts: (_req, res) => res.json({ success: true, data: [] }), getCohort: jest.fn(), getClassDetail: jest.fn(),
  listCourses: (_req, res) => res.json({ success: true, data: [] }), getCourseRun: jest.fn(), listEmployees: (_req, res) => res.json({ success: true, data: [] }), getEmployee: jest.fn(),
  correctEmployee: jest.fn(), listSessions: jest.fn(), getSessionAttendance: jest.fn(),
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
