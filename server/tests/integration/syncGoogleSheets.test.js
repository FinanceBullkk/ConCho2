/**
 * Integration Tests — Google Sheets sync (POST /api/sync/google-sheets)
 *
 * First coverage for /api/sync (was reverse-assert-only): B5-reads ported the
 * controller's 3 bulk pre-loads onto the dual-backend seams, so on the pg lane
 * the row-matcher only finds the fixtures if the PG read twins work — that IS
 * the active-backend assertion on reads. The write side (bookedTeamId +
 * roster) is reverse-asserted via readActiveRow.
 *
 * Google is mocked at both layers the controller touches: lib/googleAuth
 * (credential resolution) and googleapis (sheets client). Sheet rows are
 * data-only (range defaults to A2:D — no header row).
 */

jest.mock('../../lib/googleAuth', () => ({
  getAuthClient: jest.fn(() => ({})),
  isConfigured: jest.fn(() => true),
  warnIfMissing: jest.fn(),
}));

const mockValuesGet = jest.fn();
jest.mock('googleapis', () => ({
  google: {
    sheets: jest.fn(() => ({ spreadsheets: { values: { get: mockValuesGet } } })),
  },
}));

const request = require('supertest');
const { getApp, getTokens, getSeedData, teardown, getCsrfHeaders } = require('../setup');
const { readActiveRow } = require('../pg-test-utils');
const fx = require('../fixtures/pg-fixtures');

let app, tokens, seed, csrf;

// 03:00Z = 10:00 VN (UTC+7) on the same VN calendar date — matches the sheet
// slot "10:00-11:00" and the VN-date grouping key.
const DAY = '2026-07-15';
const at = (isoHour) => new Date(`${DAY}T${isoHour}:00.000Z`);

beforeAll(async () => {
  app = await getApp();
  tokens = getTokens();
  seed = getSeedData();
  csrf = await getCsrfHeaders(app);
});

afterAll(async () => {
  await teardown();
});

afterEach(() => {
  mockValuesGet.mockReset();
});

describe('POST /api/sync/google-sheets — authz + validation', () => {
  test('403 for a Teacher (DATA_TRANSFER is an admin capability)', async () => {
    const res = await request(app)
      .post('/api/sync/google-sheets')
      .set('Authorization', `Bearer ${tokens.teacher}`)
      .set(csrf)
      .send({ spreadsheetId: 'sheet-x' });
    expect(res.status).toBe(403);
    expect(mockValuesGet).not.toHaveBeenCalled();
  });

  test('400 when spreadsheetId is missing — no Google call', async () => {
    const res = await request(app)
      .post('/api/sync/google-sheets')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/spreadsheetId/);
    expect(mockValuesGet).not.toHaveBeenCalled();
  });
});

describe('POST /api/sync/google-sheets — happy path (reads on the active backend)', () => {
  test('enrolls the team into the matching schedule and writes through the seam', async () => {
    const schedule = await fx.createSchedule({
      classId: seed.class1._id,
      startTime: at('03:00'),
      endTime: at('04:00'),
      enrolledUsers: [],
    });
    mockValuesGet.mockResolvedValue({
      data: { values: [['Alpha Team', 'TEST001', DAY, '10:00-11:00']] },
    });

    const res = await request(app)
      .post('/api/sync/google-sheets')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({ spreadsheetId: 'sheet-happy' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.enrolled).toBe(1);
    expect(res.body.data.errors).toEqual([]);

    // Write-side reverse-assert: the book + roster writes ride the schedule
    // repo (PG-only on the pg lane) — read the ACTIVE backend.
    const after = await readActiveRow('Schedule', schedule._id);
    expect(String(after.bookedTeamId)).toBe(seed.team._id.toString());
    const enrolled = after.enrolledUsers.map(String).sort();
    expect(enrolled).toEqual(
      [seed.leader._id, seed.member1._id, seed.member2._id].map(String).sort(),
    );
  });

  test('unknown team and unknown class rows are reported, not fatal', async () => {
    mockValuesGet.mockResolvedValue({
      data: {
        values: [
          ['No Such Team', 'TEST001', DAY, '10:00-11:00'],
          ['Alpha Team', 'NOPE999', DAY, '10:00-11:00'],
        ],
      },
    });

    const res = await request(app)
      .post('/api/sync/google-sheets')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({ spreadsheetId: 'sheet-misses' });

    expect(res.status).toBe(200);
    expect(res.body.data.enrolled).toBe(0);
    expect(res.body.data.skipped).toBe(2);
    expect(res.body.data.errors.map((e) => e.error)).toEqual([
      expect.stringContaining('Team "No Such Team" not found'),
      expect.stringContaining('Class "NOPE999" not found'),
    ]);
  });

  test('capacity guard is LIVE (revived by the B5-reads port): full session errors', async () => {
    // 3 active team members vs capacity 1 → 0 available < 3 needed.
    await fx.createSchedule({
      classId: seed.class1._id,
      startTime: at('04:00'), // 11:00 VN — distinct slot (partial-unique classId+startTime)
      endTime: at('05:00'),
      enrolledUsers: [],
      capacity: 1,
    });
    mockValuesGet.mockResolvedValue({
      data: { values: [['Alpha Team', 'TEST001', DAY, '11:00-12:00']] },
    });

    const res = await request(app)
      .post('/api/sync/google-sheets')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({ spreadsheetId: 'sheet-capacity' });

    expect(res.status).toBe(200);
    expect(res.body.data.enrolled).toBe(0);
    expect(res.body.data.errors).toHaveLength(1);
    expect(res.body.data.errors[0].error).toMatch(/Capacity exceeded/);
  });
});
