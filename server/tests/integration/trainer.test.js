const request = require('supertest');
const jwt = require('jsonwebtoken');
const { getApp, getTokens, getSeedData, teardown, getCsrfHeaders } = require('../setup');
const { findActiveRowWhere } = require('../pg-test-utils');
const TrainerProfile = require('../../models/TrainerProfile');
const Schedule = require('../../models/Schedule');
const LearningProgram = require('../../models/LearningProgram');
const AuditLog = require('../../models/AuditLog');
const User = require('../../models/User');

// ──────────────────────────────────────────────────────────
// Trainer API — trainer-management depth (Modernization H2 — A6).
// Covers profile upsert + audit, candidate/qualified listing, free-at filter,
// ratings aggregate, per-trainer load, the double-booking 409 guard at the
// assign chokepoint, and the session.assign-trainer authz boundary.
// ──────────────────────────────────────────────────────────

let app, tokens, seed, coordToken, program;
let seq = 0;

beforeAll(async () => {
  app = await getApp();
  tokens = getTokens();
  seed = getSeedData();
  const coord = await User.create({
    empCode: '000052', name: 'Trainer Coord', role: 'Coordinator',
    department: 'Management', password: 'coord12345',
  });
  coordToken = jwt.sign({ id: coord._id.toString() }, process.env.JWT_SECRET, { expiresIn: '1h' });
});

afterAll(async () => {
  await User.deleteMany({ empCode: '000052' });
  await teardown();
});

afterEach(async () => {
  await Promise.all([
    TrainerProfile.deleteMany({}),
    Schedule.deleteMany({}),
    LearningProgram.deleteMany({}),
    AuditLog.deleteMany({ entity: 'TrainerProfile' }),
  ]);
});

const get = (token, path) => request(app).get(path).set('Authorization', `Bearer ${token}`);
const put = async (token, path, body) => {
  const csrf = await getCsrfHeaders(app);
  return request(app).put(path).set('Authorization', `Bearer ${token}`).set(csrf).send(body);
};
const post = async (token, path, body) => {
  const csrf = await getCsrfHeaders(app);
  return request(app).post(path).set('Authorization', `Bearer ${token}`).set(csrf).send(body);
};

const makeProgram = () => LearningProgram.create({ code: `TRN_${seq++}`, name: 'Trainer Prog', schedulingMode: 'self_enroll' });
const makeSession = (start, end) =>
  Schedule.create({ classId: seed.class1._id, startTime: new Date(start), endTime: new Date(end) });

describe('Trainer API — trainer management (A6)', () => {
  test('profile upsert is audited (create 201 → update 200); reuses session.assign-trainer', async () => {
    program = await makeProgram();
    const tId = seed.teacher._id.toString();

    const created = await put(tokens.admin, `/api/trainers/${tId}`, {
      canDeliver: [program._id.toString()],
      availability: [{ weekday: 1, from: '09:00', to: '12:00' }],
    });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ userId: tId, hasProfile: true });
    expect(created.body.data.canDeliver).toContain(program._id.toString());

    await new Promise((r) => setTimeout(r, 30));
    expect(await findActiveRowWhere('AuditLog', { entity: 'TrainerProfile', action: 'created' })).toBeTruthy();

    const updated = await put(tokens.admin, `/api/trainers/${tId}`, { note: 'Lead facilitator' });
    expect(updated.status).toBe(200);
    expect(updated.body.data.note).toBe('Lead facilitator');
  });

  test('rejects a non-Teacher/Admin profile and an out-of-range rating', async () => {
    const bad = await put(tokens.admin, `/api/trainers/${seed.member1._id}`, { note: 'x' });
    expect(bad.status).toBe(400); // member1 is a Participant

    await put(tokens.admin, `/api/trainers/${seed.teacher._id}`, { note: 'ok' });
    const badRating = await post(tokens.admin, `/api/trainers/${seed.teacher._id}/ratings`, { value: 9 });
    expect(badRating.status).toBe(400);
  });

  test('listing: includeCandidates surfaces Teacher/Admin without a profile; qualifiedFor filters', async () => {
    program = await makeProgram();
    await put(tokens.admin, `/api/trainers/${seed.teacher._id}`, { canDeliver: [program._id.toString()] });

    const all = await get(tokens.admin, '/api/trainers?includeCandidates=true');
    expect(all.status).toBe(200);
    const ids = all.body.data.map((t) => t.userId);
    expect(ids).toContain(seed.teacher._id.toString());
    expect(ids).toContain(seed.admin._id.toString()); // candidate, no profile
    expect(all.body.data.find((t) => t.userId === seed.admin._id.toString()).hasProfile).toBe(false);

    const qualified = await get(tokens.admin, `/api/trainers?qualifiedFor=${program._id}`);
    expect(qualified.body.data).toHaveLength(1);
    expect(qualified.body.data[0].userId).toBe(seed.teacher._id.toString());
  });

  test('ratings aggregate to an average score', async () => {
    const tId = seed.teacher._id.toString();
    await put(tokens.admin, `/api/trainers/${tId}`, { note: 'seed' });
    await post(tokens.admin, `/api/trainers/${tId}/ratings`, { value: 4 });
    const second = await post(tokens.admin, `/api/trainers/${tId}/ratings`, { value: 5, note: 'great' });
    expect(second.status).toBe(201);
    expect(second.body.data).toMatchObject({ ratingAvg: 4.5, ratingCount: 2 });
  });

  test('double-booking a trainer across overlapping sessions is rejected (409)', async () => {
    const tId = seed.teacher._id.toString();
    const a = await makeSession('2099-01-01T10:00:00Z', '2099-01-01T12:00:00Z');
    const b = await makeSession('2099-01-01T11:00:00Z', '2099-01-01T13:00:00Z'); // overlaps a
    const c = await makeSession('2099-01-01T14:00:00Z', '2099-01-01T15:00:00Z'); // no overlap

    const first = await put(tokens.admin, `/api/schedules/${a._id}/trainers`, { internalIds: [tId] });
    expect(first.status).toBe(200);

    const clash = await put(tokens.admin, `/api/schedules/${b._id}/trainers`, { internalIds: [tId] });
    expect(clash.status).toBe(409);

    const ok = await put(tokens.admin, `/api/schedules/${c._id}/trainers`, { internalIds: [tId] });
    expect(ok.status).toBe(200);
  });

  test('free-at filter + load reflect an assigned session', async () => {
    const tId = seed.teacher._id.toString();
    await put(tokens.admin, `/api/trainers/${tId}`, { note: 'seed' });
    const a = await makeSession('2099-02-01T10:00:00Z', '2099-02-01T12:00:00Z');
    await put(tokens.admin, `/api/schedules/${a._id}/trainers`, { internalIds: [tId] });

    const busy = await get(tokens.admin, '/api/trainers?at=2099-02-01T10:30:00Z&atEnd=2099-02-01T11:00:00Z');
    expect(busy.body.data.find((t) => t.userId === tId).free).toBe(false);

    const free = await get(tokens.admin, '/api/trainers?at=2099-02-01T16:00:00Z&atEnd=2099-02-01T17:00:00Z');
    expect(free.body.data.find((t) => t.userId === tId).free).toBe(true);

    const load = await get(tokens.admin, '/api/trainers/' + tId + '/load?from=2099-01-01T00:00:00Z&to=2099-03-01T00:00:00Z');
    expect(load.body.data).toMatchObject({ sessionCount: 1, totalHours: 2 });
  });

  test('session.assign-trainer gate: Teacher + Participant denied; Coordinator allowed', async () => {
    expect((await get(tokens.teacher, '/api/trainers')).status).toBe(403);
    expect((await get(tokens.leader, '/api/trainers')).status).toBe(403);
    expect((await put(tokens.teacher, `/api/trainers/${seed.teacher._id}`, { note: 'x' })).status).toBe(403);

    const coordWrite = await put(coordToken, `/api/trainers/${seed.teacher._id}`, { note: 'by coord' });
    expect(coordWrite.status).toBe(201);
    expect((await get(coordToken, '/api/trainers')).status).toBe(200);
  });
});
