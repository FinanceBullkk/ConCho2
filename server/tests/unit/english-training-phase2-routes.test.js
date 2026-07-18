const express = require('express');
const request = require('supertest');

jest.mock('../../middleware/auth', () => ({
  protect: (req, _res, next) => {
    req.user = { role: req.get('x-test-role') || 'Participant' };
    next();
  },
}));

jest.mock('../../domains/english-training/controller', () => ({
  listSessions: (_req, res) => res.json({ success: true, data: [{ id: 's1' }] }),
  getSessionAttendance: (_req, res) => res.json({ success: true, data: { id: 's1', roster: [] } }),
  listEligibility: (_req, res) => res.json({ success: true, data: [] }),
  listCohorts: jest.fn(), getCohort: jest.fn(), listCourses: jest.fn(), getCourseRun: jest.fn(),
  listEmployees: jest.fn(), getEmployee: jest.fn(), correctEmployee: jest.fn(),
  listIssues: jest.fn(), listIssueDetails: jest.fn(),
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
});
