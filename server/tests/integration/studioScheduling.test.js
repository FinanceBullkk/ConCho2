/**
 * ──────────────────────────────────────────────────────────
 * Integration Tests — Studio Scheduling (Investment Build Plan #5)
 * ──────────────────────────────────────────────────────────
 * SessionType CRUD + archive + authz (room.manage to write, session.book to
 * read), and room-utilization analytics derived from booked sessions. Types are
 * metadata only — these tests never touch slot/room/conflict logic.
 */

const request = require('supertest');
const mongoose = require('mongoose');
const { getApp, getTokens, getSeedData, getCsrfHeaders } = require('../setup');
const { readActiveRow, findActiveAuditRow } = require('../pg-test-utils');

const SessionType = require('../../models/SessionType');
const Office = require('../../models/Office');
const Room = require('../../models/Room');
const Class = require('../../models/Class');
const Schedule = require('../../models/Schedule');
const AuditLog = require('../../models/AuditLog');

let app, tokens, csrf;
const uniq = () => Math.random().toString(16).slice(2, 8).toUpperCase();
const settle = () => new Promise((r) => setTimeout(r, 80));

beforeAll(async () => {
  app = await getApp();
  tokens = getTokens();
  getSeedData();
  csrf = await getCsrfHeaders(app);
});

afterAll(async () => {
  await mongoose.disconnect();
});

describe('Session types CRUD + authz', () => {
  let typeId;

  test('admin creates a session type (201, order auto-assigned)', async () => {
    const r = await request(app)
      .post('/api/session-types')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({ name: 'Workshop', color: '#22c55e', defaultDurationMin: 90, defaultCapacity: 20 });

    expect(r.status).toBe(201);
    expect(r.body.data.name).toBe('Workshop');
    expect(r.body.data.order).toBeGreaterThanOrEqual(1);
    typeId = r.body.data._id;
  });

  test('a second create appends a higher order', async () => {
    const r = await request(app)
      .post('/api/session-types')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({ name: 'Coaching' });
    expect(r.status).toBe(201);
    expect(r.body.data.order).toBeGreaterThan(1);
  });

  test('a Participant (session.book) can LIST but not CREATE', async () => {
    const list = await request(app)
      .get('/api/session-types')
      .set('Authorization', `Bearer ${tokens.leader}`);
    expect(list.status).toBe(200);
    expect(list.body.data.length).toBeGreaterThanOrEqual(2);

    const create = await request(app)
      .post('/api/session-types')
      .set('Authorization', `Bearer ${tokens.leader}`)
      .set(csrf)
      .send({ name: 'Nope' });
    expect(create.status).toBe(403);
  });

  test('a Teacher (no session.book) cannot even list', async () => {
    const r = await request(app)
      .get('/api/session-types')
      .set('Authorization', `Bearer ${tokens.teacher}`);
    expect(r.status).toBe(403);
  });

  test('validation: empty name → 400, bad colour → 400', async () => {
    const a = await request(app).post('/api/session-types')
      .set('Authorization', `Bearer ${tokens.admin}`).set(csrf).send({ name: '' });
    expect(a.status).toBe(400);
    const b = await request(app).post('/api/session-types')
      .set('Authorization', `Bearer ${tokens.admin}`).set(csrf).send({ name: 'Z', color: 'red' });
    expect(b.status).toBe(400);
  });

  test('admin edits a type', async () => {
    const r = await request(app)
      .put(`/api/session-types/${typeId}`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf)
      .send({ color: '#ef4444', defaultCapacity: 30 });
    expect(r.status).toBe(200);
    expect(r.body.data.color).toBe('#ef4444');
    expect(r.body.data.defaultCapacity).toBe(30);
  });

  test('archive soft-deletes (gone from list, kept in DB) + audits', async () => {
    const del = await request(app)
      .delete(`/api/session-types/${typeId}`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .set(csrf);
    expect(del.status).toBe(200);

    const list = await request(app)
      .get('/api/session-types')
      .set('Authorization', `Bearer ${tokens.admin}`);
    expect(list.body.data.find((t) => String(t._id) === String(typeId))).toBeUndefined();

    // Read the active backend: the archive soft-deletes in PG (a Mongoose findOne
    // would read the not-soft-deleted Mongo twin).
    const raw = await readActiveRow('SessionType', typeId);
    expect(raw).not.toBeNull();
    expect(raw.isDeleted).toBe(true);

    await settle();
    const audit = await findActiveAuditRow({ entity: 'SessionType' });
    expect(audit).not.toBeNull();
  });
});

describe('Room utilization', () => {
  test('computes booked vs available hours per room + per office', async () => {
    const office = await Office.create({ name: 'Util Office', code: `UO${uniq()}` });
    const room = await Room.create({ name: 'Util Room', code: `UR${uniq()}`, officeId: office._id });
    const cls = await Class.create({ classCode: `UC${uniq()}`, courseName: 'Util Class', totalSessions: 4 });

    const start = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2h ago (in range)
    const end = new Date(start.getTime() + 2 * 60 * 60 * 1000); // 2h session
    await Schedule.create({ classId: cls._id, roomId: room._id, startTime: start, endTime: end, status: 'scheduled' });

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
