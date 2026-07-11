/**
 * ──────────────────────────────────────────────────────────
 * Integration Tests — Office-scoped Rooms + conflict lock (re-center Phase 3)
 *   /api/rooms                 (Admin/Coordinator CRUD, room.read/room.manage)
 *   cohort session + room      (DELTA A same-Office guard + per-room lock)
 * ──────────────────────────────────────────────────────────
 */

const request = require('supertest');
const jwt = require('jsonwebtoken');
const {
  getApp, getTokens, getSeedData, getCsrfHeaders, teardown,
} = require('../setup');
const {
  findActiveRowWhere, readActiveRow, countActiveRowsWhere,
  deleteActiveRowsWhere, updateActiveRow,
} = require('../pg-test-utils');
const fx = require('../fixtures/pg-fixtures');

let app, tokens, seed, csrf, officeA, officeB, coordinatorToken;

// $addToSet-equivalent on the ALLOWED_TIME_SLOTS jsonb array (PG-native).
const addAllowedSlot = async (slot) => {
  const s = await findActiveRowWhere('Setting', { key: 'ALLOWED_TIME_SLOTS' });
  const slots = Array.isArray(s.value) ? s.value : [];
  const has = slots.some((v) => v.sh === slot.sh && v.sm === slot.sm && v.eh === slot.eh && v.em === slot.em);
  if (!has) slots.push(slot);
  await updateActiveRow('Setting', s._id, { value: JSON.stringify(slots) });
};

beforeAll(async () => {
  app = await getApp();
  tokens = getTokens();
  seed = getSeedData();
  csrf = await getCsrfHeaders(app);

  await addAllowedSlot({ sh: 10, sm: 0, eh: 11, em: 0 });

  officeA = await fx.createOffice({ name: 'HCM Office', code: 'RMHCM' });
  officeB = await fx.createOffice({ name: 'Hanoi Office', code: 'RMHN' });
  const coordinator = await fx.createUser({
    empCode: '000040', name: 'Coordinator Room', role: 'Coordinator',
    department: 'HR', password: 'coord123456',
  });
  coordinatorToken = jwt.sign(
    { id: coordinator._id.toString() }, process.env.JWT_SECRET, { expiresIn: '1h' },
  );
});

afterAll(async () => {
  await teardown();
});

afterEach(async () => {
  await deleteActiveRowsWhere('Schedule', {});
  await deleteActiveRowsWhere('RoomBooking', {});
  await deleteActiveRowsWhere('Enrollment', {});
  await deleteActiveRowsWhere('Room', {});
  await updateActiveRow('Class', seed.class1._id, { teacherIds: [], programId: null });
  await updateActiveRow('Class', seed.class2._id, { teacherIds: [], programId: null });
  await deleteActiveRowsWhere('LearningProgram', {});
});

const as = (token) => (method, path) =>
  request(app)[method](path).set('Authorization', `Bearer ${token}`).set(csrf);

const vnSlot = (offsetDays = 0) => {
  const d = new Date();
  const dayOfWeek = d.getUTCDay();
  const daysToNextMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
  d.setUTCDate(d.getUTCDate() + daysToNextMonday + offsetDays);
  d.setUTCHours(3, 0, 0, 0);
  const start = new Date(d);
  const end = new Date(d.getTime() + 60 * 60 * 1000);
  return { start, end };
};

const makeCohort = async (classId, mode = 'self_enroll', code = 'RM_PROG') => {
  const program = await fx.createLearningProgram({ code, name: code, schedulingMode: mode });
  await updateActiveRow("Class", classId, { programId: program._id });
  await fx.createEnrollment({ userId: seed.member1._id, classId, teamId: null, status: 'Active' });
};

// ── Room CRUD + authz ─────────────────────────────────────
describe('Rooms CRUD + authz (Office-scoped)', () => {
  test('Admin creates a room in an office (201, code uppercased, office populated)', async () => {
    const res = await as(tokens.admin)('post', '/api/rooms')
      .send({ name: 'Room A1', code: 'a1', officeId: officeA._id.toString(), seats: 20 });
    expect(res.status).toBe(201);
    expect(res.body.data.code).toBe('A1');
    expect(res.body.data.office).toMatchObject({ code: 'RMHCM' });
    expect(res.body.data.seats).toBe(20);
  });

  test('Coordinator creates a room (room.manage)', async () => {
    const res = await as(coordinatorToken)('post', '/api/rooms')
      .send({ name: 'Room B1', code: 'B1', officeId: officeB._id.toString() });
    expect(res.status).toBe(201);
  });

  test('create with an unknown office → 404', async () => {
    const res = await as(tokens.admin)('post', '/api/rooms')
      .send({ name: 'Ghost', code: 'GH1', officeId: fx.genId() });
    expect(res.status).toBe(404);
  });

  test('duplicate code among live rooms → 409', async () => {
    await as(tokens.admin)('post', '/api/rooms').send({ name: 'Dup', code: 'DUP', officeId: officeA._id.toString() });
    const res = await as(tokens.admin)('post', '/api/rooms').send({ name: 'Dup2', code: 'dup', officeId: officeA._id.toString() });
    expect(res.status).toBe(409);
  });

  test('list is Office-scoped via ?officeId=', async () => {
    await as(tokens.admin)('post', '/api/rooms').send({ name: 'A-room', code: 'AR1', officeId: officeA._id.toString() });
    await as(tokens.admin)('post', '/api/rooms').send({ name: 'B-room', code: 'BR1', officeId: officeB._id.toString() });

    const resA = await as(tokens.admin)('get', `/api/rooms?officeId=${officeA._id}`);
    expect(resA.status).toBe(200);
    expect(resA.body.data.every((r) => String(r.officeId) === String(officeA._id))).toBe(true);
    expect(resA.body.data.some((r) => r.code === 'AR1')).toBe(true);
    expect(resA.body.data.some((r) => r.code === 'BR1')).toBe(false);
  });

  test('Teacher cannot list rooms (no room.read) → 403', async () => {
    const res = await request(app).get('/api/rooms').set('Authorization', `Bearer ${tokens.teacher}`);
    expect(res.status).toBe(403);
  });

  test('Participant cannot list rooms (no room.read) → 403', async () => {
    const res = await request(app).get('/api/rooms').set('Authorization', `Bearer ${tokens.leader}`);
    expect(res.status).toBe(403);
  });

  test('room create is audited (pins the AuditLog entity enum)', async () => {
    const create = await as(tokens.admin)('post', '/api/rooms')
      .send({ name: 'Audited', code: 'AUD1', officeId: officeA._id.toString() });
    // Audit is written through the ported repository (rows live in PG on the
    // lane) — read the active backend so the assertion holds on either lane.
    let row = null;
    for (let i = 0; i < 20 && !row; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      row = await findActiveRowWhere('AuditLog', { entity: 'Room', action: 'created', entityId: create.body.data._id });
      // eslint-disable-next-line no-await-in-loop
      if (!row) await new Promise((r) => setTimeout(r, 50));
    }
    expect(row).not.toBeNull();
  });
});

// ── Room assignment on a cohort session (DELTA A + lock) ──
describe('Room assignment on a cohort session', () => {
  test('same-Office room → 201, ledger row written, DTO exposes room', async () => {
    await makeCohort(seed.class1._id, 'self_enroll', 'RM_SE1');
    const room = await fx.createRoom({ name: 'Same Office', code: 'SO1', officeId: officeA._id });
    const { start, end } = vnSlot();

    const res = await as(coordinatorToken)('post', '/api/learning/sessions/book-slot').send({
      cohortId: seed.class1._id.toString(),
      officeId: officeA._id.toString(),
      roomId: room._id.toString(),
      startTime: start.toISOString(),
      endTime: end.toISOString(),
    });

    expect(res.status).toBe(201);
    expect(res.body.data.roomId).toBe(room._id.toString());
    expect(res.body.data.room).toMatchObject({ code: 'SO1' });

    // The session + room ledger are written through the ported schedule repo
    // (PG-only on the lane) — read the active backend so the assert holds on both.
    const stored = await readActiveRow('Schedule', res.body.data.scheduleId);
    expect(String(stored.roomId)).toBe(String(room._id));
    const ledger = await findActiveRowWhere('RoomBooking', { scheduleId: stored._id });
    expect(ledger).not.toBeNull();
    expect(String(ledger.roomId)).toBe(String(room._id));
  });

  test('cross-Office room → 422 (no ledger row, no schedule persisted)', async () => {
    await makeCohort(seed.class1._id, 'self_enroll', 'RM_SE2');
    const roomB = await fx.createRoom({ name: 'Other Office', code: 'OO1', officeId: officeB._id });
    const { start, end } = vnSlot();

    const res = await as(coordinatorToken)('post', '/api/learning/sessions/book-slot').send({
      cohortId: seed.class1._id.toString(),
      officeId: officeA._id.toString(),
      roomId: roomB._id.toString(),
      startTime: start.toISOString(),
      endTime: end.toISOString(),
    });

    expect(res.status).toBe(422);
    expect(res.body.message).toMatch(/different Office/i);
    // The whole booking rolled back — neither the schedule nor a ledger row exist.
    expect(await countActiveRowsWhere("Schedule", {})).toBe(0);
    expect(await countActiveRowsWhere("RoomBooking", {})).toBe(0);
  });

  test('per-room lock: same room+slot for two cohorts → one 201, one 409', async () => {
    await makeCohort(seed.class1._id, 'self_enroll', 'RM_SE3');
    await makeCohort(seed.class2._id, 'self_enroll', 'RM_SE4');
    const room = await fx.createRoom({ name: 'Shared', code: 'SH1', officeId: officeA._id });
    const { start, end } = vnSlot();
    const body = (cohortId) => ({
      cohortId: cohortId.toString(),
      officeId: officeA._id.toString(),
      roomId: room._id.toString(),
      startTime: start.toISOString(),
      endTime: end.toISOString(),
    });

    const first = await as(coordinatorToken)('post', '/api/learning/sessions/book-slot').send(body(seed.class1._id));
    expect(first.status).toBe(201);

    // Different cohort (so {classId,startTime} does NOT collide) → only the
    // per-room {roomId,startTime} ledger guards it → 409.
    const second = await as(coordinatorToken)('post', '/api/learning/sessions/book-slot').send(body(seed.class2._id));
    expect(second.status).toBe(409);
    expect(second.body.message).toMatch(/already booked/i);

    expect(await countActiveRowsWhere('RoomBooking', { roomId: room._id })).toBe(1);
  });

  test('cancelling a roomed session frees the slot (room re-bookable)', async () => {
    await makeCohort(seed.class1._id, 'self_enroll', 'RM_SE5');
    const room = await fx.createRoom({ name: 'Reuse', code: 'RU1', officeId: officeA._id });
    const { start, end } = vnSlot();
    const payload = {
      cohortId: seed.class1._id.toString(),
      officeId: officeA._id.toString(),
      roomId: room._id.toString(),
      startTime: start.toISOString(),
      endTime: end.toISOString(),
    };

    const first = await as(coordinatorToken)('post', '/api/learning/sessions/book-slot').send(payload);
    expect(first.status).toBe(201);

    const cancel = await as(coordinatorToken)('delete', `/api/learning/sessions/${first.body.data.scheduleId}/cancel`);
    expect(cancel.status).toBe(200);
    expect(await countActiveRowsWhere("RoomBooking", {})).toBe(0);

    // Same room + slot is now bookable again.
    const second = await as(coordinatorToken)('post', '/api/learning/sessions/book-slot').send(payload);
    expect(second.status).toBe(201);
  });

  test('archive blocked while an upcoming session uses the room (409), allowed after cancel', async () => {
    await makeCohort(seed.class1._id, 'self_enroll', 'RM_SE6');
    const room = await fx.createRoom({ name: 'Busy', code: 'BZ1', officeId: officeA._id });
    const { start, end } = vnSlot();
    const booked = await as(coordinatorToken)('post', '/api/learning/sessions/book-slot').send({
      cohortId: seed.class1._id.toString(),
      officeId: officeA._id.toString(),
      roomId: room._id.toString(),
      startTime: start.toISOString(),
      endTime: end.toISOString(),
    });
    expect(booked.status).toBe(201);

    const blocked = await as(tokens.admin)('delete', `/api/rooms/${room._id}`);
    expect(blocked.status).toBe(409);

    await as(coordinatorToken)('delete', `/api/learning/sessions/${booked.body.data.scheduleId}/cancel`);
    const ok = await as(tokens.admin)('delete', `/api/rooms/${room._id}`);
    expect(ok.status).toBe(200);
  });
});
