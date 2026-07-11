/**
 * ──────────────────────────────────────────────────────────
 * Integration Tests — A5 training-hours report (Modernization Horizon 1)
 * ──────────────────────────────────────────────────────────
 * Hours = Σ attended (P/L) sessions × session duration; grouped by user or
 * department; gated by report.read.
 */

const request = require('supertest');
const { getApp, getTokens, getSeedData, teardown } = require('../setup');
// Wave K · D2c pilot — fixtures authored PG-native (no Mongoose / no mirror).
const fx = require('../fixtures/pg-fixtures');

let app, tokens;
const uniq = () => Math.random().toString(16).slice(2, 8);
const BASE = '/api/learning/reports/training-hours';

let learner;

beforeAll(async () => {
  app = await getApp();
  tokens = getTokens();
  getSeedData();

  learner = await fx.createUser({
    empCode: `TH${uniq()}`, name: 'Hours Learner', role: 'Participant',
    password: 'disposable-pwd-12345', department: 'Engineering',
  });
  const cls = await fx.createClass({ classCode: `THC${uniq()}`, courseName: 'Hours Class', totalSessions: 4 });
  const start = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000); // 3 days ago (within default 90d)
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000); // 2-hour session
  const sch = await fx.createSchedule({ classId: cls._id, startTime: start, endTime: end, status: 'scheduled' });
  await fx.createAttendance({ scheduleId: sch._id, userId: learner._id, status: 'P' });
});

afterAll(async () => {
  await teardown();
});

describe('GET training-hours', () => {
  test('admin sees per-user hours (2h over 1 attended session)', async () => {
    const r = await request(app).get(BASE).set('Authorization', `Bearer ${tokens.admin}`);
    expect(r.status).toBe(200);
    const row = r.body.data.rows.find((x) => String(x.userId) === String(learner._id));
    expect(row).toBeTruthy();
    expect(row.hours).toBe(2);
    expect(row.sessions).toBe(1);
    expect(row.department).toBe('Engineering');
    expect(r.body.data.totals.hours).toBeGreaterThanOrEqual(2);
  });

  test('groupBy=department rolls hours up per department', async () => {
    const r = await request(app).get(`${BASE}?groupBy=department`).set('Authorization', `Bearer ${tokens.admin}`);
    expect(r.status).toBe(200);
    expect(r.body.data.groupBy).toBe('department');
    const eng = r.body.data.rows.find((x) => x.department === 'Engineering');
    expect(eng).toBeTruthy();
    expect(eng.hours).toBeGreaterThanOrEqual(2);
    expect(eng.withHours).toBeGreaterThanOrEqual(1);
  });

  test('a Teacher (report.read) can read', async () => {
    const r = await request(app).get(BASE).set('Authorization', `Bearer ${tokens.teacher}`);
    expect(r.status).toBe(200);
  });

  test('a Participant (no report.read) is forbidden', async () => {
    const r = await request(app).get(BASE).set('Authorization', `Bearer ${tokens.leader}`);
    expect(r.status).toBe(403);
  });

  test('an invalid date is rejected (400)', async () => {
    const r = await request(app).get(`${BASE}?from=notadate`).set('Authorization', `Bearer ${tokens.admin}`);
    expect(r.status).toBe(400);
  });
});
