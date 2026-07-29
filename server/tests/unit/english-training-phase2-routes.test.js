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
  createCanonicalClass: jest.fn(),
  addCanonicalRunEnrollment: jest.fn(), leaveCanonicalRunEnrollment: jest.fn(),
  transferCanonicalRunEnrollment: jest.fn(),
  createCanonicalAttendanceSession: jest.fn(),
  rescheduleCanonicalMeeting: jest.fn(), cancelCanonicalMeeting: jest.fn(),
  getCanonicalAttendanceRoster: jest.fn(), saveCanonicalAttendanceRoster: jest.fn(),
  listManagedPeople: jest.fn(), createManagedPerson: jest.fn(), updateManagedPerson: jest.fn(),
  deleteManagedPerson: jest.fn(), provisionManagedPeople: jest.fn(),
  listSessions: (_req, res) => res.json({ success: true, data: [{ id: 's1' }] }),
  getSessionsSummary: (_req, res) => res.json({
    success: true,
    data: { counts: { all: 1, upcoming: 0, recorded: 1, needsEvidence: 0 }, nearestSessionAt: null, latestSessionAt: null },
  }),
  getSessionAttendance: (_req, res) => res.json({ success: true, data: { id: 's1', roster: [] } }),
  listEligibility: (_req, res) => res.json({ success: true, data: [] }),
  getOverview: jest.fn(),
  listCohorts: jest.fn(), getCohort: jest.fn(), getClassDetail: jest.fn(), listCourses: jest.fn(), listCanonicalCourseRuns: jest.fn(), getCourseRun: jest.fn(),
  listEmployees: jest.fn(), getEmployee: jest.fn(), correctEmployee: jest.fn(),
  listIssues: jest.fn(), listIssueDetails: jest.fn(),
  listLevels: jest.fn(), listPendingExamEntries: jest.fn(),
  recordExamResult: jest.fn(), deleteExamResult: jest.fn(),
}));

const routes = require('../../domains/english-training/routes');

const app = express();
app.use('/api/english-training', routes);

describe('English-training Phase-2 route authorization', () => {
  test('Admin with report.read can inspect sessions', async () => {
    const response = await request(app)
      .get('/api/english-training/sessions?limit=2')
      .set('x-test-role', 'Admin');

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([{ id: 's1' }]);
  });

  test('Participant is denied before the session controller runs', async () => {
    const response = await request(app)
      .get('/api/english-training/sessions')
      .set('x-test-role', 'Participant');

    expect(response.status).toBe(403);
  });

  test('Admin with report.read can read the sessions summary', async () => {
    const response = await request(app)
      .get('/api/english-training/sessions/summary')
      .set('x-test-role', 'Admin');

    expect(response.status).toBe(200);
    expect(response.body.data.counts).toMatchObject({ all: 1, recorded: 1 });
  });

  test('Participant is denied the sessions summary', async () => {
    const response = await request(app)
      .get('/api/english-training/sessions/summary')
      .set('x-test-role', 'Participant');

    expect(response.status).toBe(403);
  });
});
