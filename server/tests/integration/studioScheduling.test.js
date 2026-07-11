/**
 * ──────────────────────────────────────────────────────────
 * Integration Tests — Studio Scheduling (Investment Build Plan #5)
 * ──────────────────────────────────────────────────────────
 * Room-utilization analytics derived from booked sessions.
 */

const request = require('supertest');
const { getApp, getTokens, getSeedData, teardown } = require('../setup');
const fx = require('../fixtures/pg-fixtures');

let app, tokens;
const uniq = () => Math.random().toString(16).slice(2, 8).toUpperCase();

beforeAll(async () => {
  app = await getApp();
  tokens = getTokens();
  getSeedData();
});

afterAll(async () => {
  await teardown();
});

describe('Room utilization', () => {
  test('computes booked vs available hours per room + per office', async () => {
    const office = await fx.createOffice({ name: 'Util Office', code: `UO${uniq()}` });
    const room = await fx.createRoom({ name: 'Util Room', code: `UR${uniq()}`, officeId: office._id });
    const cls = await fx.createClass({ classCode: `UC${uniq()}`, courseName: 'Util Class', totalSessions: 4 });

    const start = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2h ago (in range)
    const end = new Date(start.getTime() + 2 * 60 * 60 * 1000); // 2h session
    await fx.createSchedule({ classId: cls._id, roomId: room._id, startTime: start, endTime: end, status: 'scheduled' });

    const r = await request(app)
      .get('/api/rooms/utilization?range=7d')
      .set('Authorization', `Bearer ${tokens.admin}`);
    expect(r.status).toBe(200);

    const mine = r.body.data.perRoom.find((x) => String(x.roomId) === String(room._id));
    expect(mine).toBeTruthy();
    expect(mine.bookedHours).toBe(2);
    expect(mine.sessions).toBe(1);
    expect(r.body.data.perOffice.length).toBeGreaterThanOrEqual(1);
  });

  test('utilization is room.read gated (Participant forbidden)', async () => {
    const r = await request(app)
      .get('/api/rooms/utilization')
      .set('Authorization', `Bearer ${tokens.leader}`);
    expect(r.status).toBe(403);
  });
});
