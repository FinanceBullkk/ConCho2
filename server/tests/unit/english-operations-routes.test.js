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
  getArchiveStatus: (_req, res) => res.json({ success: true, data: { isFrozen: true } }),
  cutoverArchive: (_req, res) => res.status(201).json({ success: true }),
  getCombinedHistory: (_req, res) => res.json({ success: true, data: { attendance: [], evaluations: [] } }),
  listManagedPeople: (_req, res) => res.json({ success: true, data: [] }),
  createManagedPerson: (req, res) => res.status(201).json({ success: true, data: req.body }),
  updateManagedPerson: jest.fn(), deleteManagedPerson: jest.fn(), provisionManagedPeople: jest.fn(),
  getOverview: jest.fn(), listCohorts: jest.fn(), getCohort: jest.fn(), getClassDetail: jest.fn(),
  listCourses: jest.fn(), getCourseRun: jest.fn(), listEmployees: jest.fn(), getEmployee: jest.fn(),
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

describe('English Operations P4 level authorization', () => {
  test.each(['Admin', 'Coordinator', 'Teacher'])('%s can enter the live evaluation worklist', async (role) => {
    const res = await request(app)
      .get('/api/english-training/live/cohorts/cohort-1/evaluations')
      .set('x-test-role', role);
    expect(res.status).toBe(200);
  });

  test('Participant cannot record a live English level', async () => {
    const res = await request(app)
      .post('/api/english-training/live/cohorts/cohort-1/evaluations')
      .set('x-test-role', 'Participant')
      .send({ userId: 'learner-1', levelCode: 'advanced' });
    expect(res.status).toBe(403);
  });
});

describe('English Operations P5 archive authorization', () => {
  test('Coordinator can read archive status but cannot perform cutover', async () => {
    const read = await request(app).get('/api/english-training/archive/status').set('x-test-role', 'Coordinator');
    expect(read.status).toBe(200);
    const write = await request(app)
      .post('/api/english-training/archive/cutover')
      .set('x-test-role', 'Coordinator')
      .send({ confirm: true, reason: 'Verified all live English operations' });
    expect(write.status).toBe(403);
  });

  test('Admin cutover requires explicit confirmation and reason', async () => {
    const rejected = await request(app)
      .post('/api/english-training/archive/cutover')
      .set('x-test-role', 'Admin')
      .send({ confirm: false, reason: 'Verified all live English operations' });
    expect(rejected.status).toBe(400);
    const accepted = await request(app)
      .post('/api/english-training/archive/cutover')
      .set('x-test-role', 'Admin')
      .send({ confirm: true, reason: 'Verified all live English operations' });
    expect(accepted.status).toBe(201);
  });

  test('Teacher cannot read the historical archive status', async () => {
    const res = await request(app).get('/api/english-training/archive/status').set('x-test-role', 'Teacher');
    expect(res.status).toBe(403);
  });
});
