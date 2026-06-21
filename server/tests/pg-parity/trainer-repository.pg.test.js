/**
 * ──────────────────────────────────────────────────────────
 * PG-parity test — trainer repository (Mongo ↔ Postgres)
 * ──────────────────────────────────────────────────────────
 * Whole-repository port: TrainerProfile CRUD (upsert+defaults, jsonb availability/
 * ratings, text[] canDeliver) + user pickers + Schedule load/availability reads.
 * Runs only when a Postgres URL is present; SKIPS otherwise. Asserts identical
 * behaviour + the traps: upsert insert-defaults vs update; soft-delete hides +
 * archives; listProfiles status/canDeliver filter + order; candidate pool
 * (Teacher/Admin, status≠Dropped INCLUDING null, not deleted); sessionsForTrainer
 * window; busyInstructorIds overlap Set.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env.pg-prototype') });
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const PG_URL = process.env.PG_URL || process.env.PG_PROTOTYPE_URL;
const describePg = PG_URL ? describe : describe.skip;

const { query, closePool } = require('../../config/pg');
const trainerRepo = require('../../domains/trainer/repository');

const hex = (n) => n.toString(16).padStart(24, '0');
const oid = (h) => new mongoose.Types.ObjectId(h);
const T1 = hex(901); const T2 = hex(902); const T3 = hex(903); const T4 = hex(904); const TN = hex(905); const TD = hex(906);
const PA = hex(911); const PB = hex(912);
const CX = hex(921); const OF = hex(931); const RM = hex(941);
const at = (h, m = 0) => new Date(Date.UTC(2026, 0, 5, h, m, 0));

const USERS = [
  { id: T1, name: 'Trainer One', emp: 'T1', role: 'Teacher', status: 'Active', deleted: false },
  { id: T2, name: 'Trainer Two', emp: 'T2', role: 'Admin', status: 'Active', deleted: false },
  { id: T3, name: 'Dropped Tom', emp: 'T3', role: 'Teacher', status: 'Dropped', deleted: false }, // excluded (Dropped)
  { id: T4, name: 'Parti Pat', emp: 'T4', role: 'Participant', status: 'Active', deleted: false }, // excluded (role)
  { id: TN, name: 'Null Status', emp: 'T5', role: 'Teacher', status: null, deleted: false }, // INCLUDED ($ne Dropped matches null)
  { id: TD, name: 'Gone Trainer', emp: 'T6', role: 'Teacher', status: 'Active', deleted: true }, // excluded (deleted)
];
const SCHED = [
  { id: hex(951), ins: [T1], status: 'scheduled', s: at(10), e: at(11), topic: 'Topic A' },
  { id: hex(952), ins: [T1, T2], status: 'scheduled', s: at(14), e: at(15), topic: 'Topic B' },
  { id: hex(953), ins: [T1], status: 'cancelled', s: at(9), e: at(10), topic: 'Cancelled' }, // excluded
  { id: hex(954), ins: [T2], status: 'scheduled', s: at(10, 30), e: at(11, 30), topic: 'Topic C' }, // overlaps [10,11)
];

const insertPg = async (table, cols, rows, toVals) => {
  if (!rows.length) return;
  const ph = rows.map((_, i) => `(${cols.map((__, j) => `$${i * cols.length + j + 1}`).join(',')})`).join(',');
  await query(`INSERT INTO ${table}(${cols.join(',')}) VALUES ${ph}`, rows.flatMap(toVals));
};

const both = (fn) => Promise.all([fn(trainerRepo.impls.mongo), fn(trainerRepo.impls.pg)]);
const pproj = (p) => (p == null ? null : {
  userId: String(p.userId), canDeliver: (p.canDeliver || []).map(String).sort(), note: p.note || '',
  status: p.status, availability: p.availability || [],
  ratings: (p.ratings || []).map((r) => ({ value: r.value, note: r.note || '' })),
});
const setArr = (s) => [...s].sort();

describePg('PG-parity: trainer repository (profiles + pickers + schedule reads)', () => {
  let mem;

  beforeAll(async () => {
    mem = await MongoMemoryServer.create();
    await mongoose.connect(mem.getUri());
    await mongoose.model('TrainerProfile').init(); // unique user_id index
    const db = mongoose.connection.db;
    await db.collection('users').insertMany(USERS.map((u) => ({
      _id: oid(u.id), name: u.name, empCode: u.emp, email: `${u.emp}@x.io`, role: u.role,
      ...(u.status === null ? {} : { status: u.status }), department: 'Eng', isDeleted: u.deleted,
    })));
    await db.collection('schedules').insertMany(SCHED.map((s) => ({
      _id: oid(s.id), classId: oid(CX), sessionInstructorIds: s.ins.map(oid), status: s.status,
      startTime: s.s, endTime: s.e, topic: s.topic, officeId: oid(OF), roomId: oid(RM),
    })));

    await query('TRUNCATE trainer_profiles, users, schedules');
    await insertPg('users', ['id', 'name', 'emp_code', 'email', 'role', 'status', 'department', 'is_deleted'],
      USERS, (u) => [u.id, u.name, u.emp, `${u.emp}@x.io`, u.role, u.status, 'Eng', u.deleted]);
    await insertPg('schedules', ['id', 'class_id', 'session_instructor_ids', 'status', 'start_time', 'end_time', 'topic', 'office_id', 'room_id'],
      SCHED, (s) => [s.id, CX, s.ins.map(String), s.status, s.s.toISOString(), s.e.toISOString(), s.topic, OF, RM]);
  }, 60_000);

  afterAll(async () => {
    if (mongoose.connection.readyState) await mongoose.disconnect();
    if (mem) await mem.stop();
    await closePool();
  });

  test('upsertProfile: insert applies defaults, then update sets only provided fields — identical', async () => {
    const [m, p] = await both((r) => r.upsertProfile(T1, { canDeliver: [PA], note: 'hi', availability: [{ weekday: 1, from: '09:00', to: '12:00' }] }));
    expect(pproj(m)).toEqual({
      userId: T1, canDeliver: [PA], note: 'hi', status: 'active',
      availability: [{ weekday: 1, from: '09:00', to: '12:00' }], ratings: [],
    });
    expect(pproj(p)).toEqual(pproj(m));

    const [m2, p2] = await both((r) => r.upsertProfile(T1, { note: 'updated' })); // only note changes; canDeliver kept
    expect(pproj(m2)).toMatchObject({ userId: T1, canDeliver: [PA], note: 'updated', status: 'active' });
    expect(pproj(p2)).toEqual(pproj(m2));
  });

  test('findProfileByUserId: live → shape; pushRating appends; soft-delete hides + archives — identical', async () => {
    await both((r) => r.upsertProfile(T2, { canDeliver: [PA, PB], status: 'active' }));
    const [mF, pF] = await both((r) => r.findProfileByUserId(T2));
    expect(pproj(pF)).toEqual(pproj(mF));

    const [mR, pR] = await both((r) => r.pushRating(T2, { value: 5, note: 'great', by: T1 }));
    expect(pproj(mR).ratings).toEqual([{ value: 5, note: 'great' }]);
    expect(pproj(pR).ratings).toEqual(pproj(mR).ratings);

    const [mD, pD] = await both((r) => r.softDeleteProfile(T2));
    expect(mD.status).toBe('archived');
    expect(pD.status).toBe('archived');
    expect(await trainerRepo.impls.mongo.findProfileByUserId(T2)).toBeNull(); // hidden
    expect(await trainerRepo.impls.pg.findProfileByUserId(T2)).toBeNull();
  });

  test('listProfiles: live only + status/canDeliver filter + order — identical', async () => {
    const names = (rows) => rows.map((r) => String(r.userId)).sort();
    const [mAll, pAll] = await both((r) => r.listProfiles());
    expect(names(pAll)).toEqual(names(mAll)); // T2 archived (soft-deleted) excluded; T1 present
    const [mQ, pQ] = await both((r) => r.listProfiles({ canDeliver: PA })); // T1 has PA
    expect(names(pQ)).toEqual(names(mQ));
    expect(names(mQ)).toContain(T1);
  });

  test('findUsersByIds excludes soft-deleted; findTrainerCandidates (Teacher/Admin, ≠Dropped incl null) — identical', async () => {
    const norm = (rows) => rows.map((u) => String(u._id)).sort();
    const [mU, pU] = await both((r) => r.findUsersByIds([T1, TD]));
    expect(norm(pU)).toEqual(norm(mU));
    expect(norm(mU)).toEqual([T1]); // TD soft-deleted excluded

    const [mC, pC] = await both((r) => r.findTrainerCandidates());
    expect(norm(pC)).toEqual(norm(mC));
    // T1(Teacher) T2(Admin) TN(Teacher,null status) included; T3(Dropped) T4(Participant) TD(deleted) excluded
    expect(norm(mC)).toEqual([T1, T2, TN].sort());
  });

  test('sessionsForTrainer: live sessions in window, ordered; busyInstructorIds overlap Set — identical', async () => {
    const [mS, pS] = await both((r) => r.sessionsForTrainer(T1));
    expect(mS.map((x) => String(x._id))).toEqual([hex(951), hex(952)]); // S1,S2 (cancelled S3 excluded), ordered
    expect(pS.map((x) => String(x._id))).toEqual(mS.map((x) => String(x._id)));
    expect(pS.map((x) => x.topic)).toEqual(['Topic A', 'Topic B']);

    const [mW, pW] = await both((r) => r.sessionsForTrainer(T1, { from: at(13) }));
    expect(mW.map((x) => String(x._id))).toEqual([hex(952)]);
    expect(pW.map((x) => String(x._id))).toEqual(mW.map((x) => String(x._id)));

    const [mB, pB] = await both((r) => r.busyInstructorIds([T1, T2], at(10), at(11)));
    expect(setArr(pB)).toEqual(setArr(mB));
    expect(setArr(mB)).toEqual([T1, T2].sort()); // S1(T1) + S4(T2) overlap [10,11)
  });
});
