const express = require('express');
const request = require('supertest');

jest.mock('../../middleware/auth', () => ({
  protect: (req, _res, next) => {
    req.user = { role: req.get('x-test-role') || 'Participant' };
    next();
  },
}));

jest.mock('../../domains/english-training/controller', () => ({
  getWorkspaceOverview: jest.fn(),
  listEnglishTeachers: jest.fn(),
  getLiveEligibility: jest.fn(),
  getLiveEvaluationWorklist: jest.fn(), recordLiveEnglishLevel: jest.fn(), deleteLiveEnglishLevel: jest.fn(),
  getArchiveStatus: jest.fn(), cutoverArchive: jest.fn(), getCombinedHistory: jest.fn(),
  listManagedPeople: jest.fn(), createManagedPerson: jest.fn(), updateManagedPerson: jest.fn(),
  deleteManagedPerson: jest.fn(), provisionManagedPeople: jest.fn(),
  listLevels: (_req, res) => res.json({ success: true, data: [{ code: 'advanced', rank: 13 }] }),
  listPendingExamEntries: (_req, res) => res.json({ success: true, data: [], count: 0 }),
  recordExamResult: (_req, res) => res.status(201).json({ success: true, data: { id: 'x1' } }),
  deleteExamResult: (_req, res) => res.json({ success: true, data: { deleted: true } }),
  getOverview: jest.fn(),
  listCohorts: jest.fn(), getCohort: jest.fn(), getClassDetail: jest.fn(), listCourses: jest.fn(), getCourseRun: jest.fn(),
  listEmployees: jest.fn(), getEmployee: jest.fn(), correctEmployee: jest.fn(),
  listSessions: jest.fn(), getSessionAttendance: jest.fn(), listEligibility: jest.fn(),
  listIssues: jest.fn(), listIssueDetails: jest.fn(),
}));

const routes = require('../../domains/english-training/routes');

const app = express();
app.use(express.json());
app.use('/api/english-training', routes);

const validBody = { levelCode: 'advanced', examDate: '2026-07-01' };

describe('English-training Phase-3 evaluation route authorization', () => {
  test('Admin can read the level catalog', async () => {
    const res = await request(app).get('/api/english-training/levels').set('x-test-role', 'Admin');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([{ code: 'advanced', rank: 13 }]);
  });

  test('Admin can record an exam result', async () => {
    const res = await request(app)
      .post('/api/english-training/enrollments/en1/exam-result')
      .set('x-test-role', 'Admin')
      .send(validBody);
    expect(res.status).toBe(201);
  });

  test('Participant is denied recording an exam result', async () => {
    const res = await request(app)
      .post('/api/english-training/enrollments/en1/exam-result')
      .set('x-test-role', 'Participant')
      .send(validBody);
    expect(res.status).toBe(403);
  });

  test('Teacher is denied recording an exam result', async () => {
    const res = await request(app)
      .post('/api/english-training/enrollments/en1/exam-result')
      .set('x-test-role', 'Teacher')
      .send(validBody);
    expect(res.status).toBe(403);
  });

  test('a malformed body is rejected with 400 for an authorized actor', async () => {
    const res = await request(app)
      .post('/api/english-training/enrollments/en1/exam-result')
      .set('x-test-role', 'Admin')
      .send({ levelCode: 'advanced', examDate: 'not-a-date' });
    expect(res.status).toBe(400);
  });
});
