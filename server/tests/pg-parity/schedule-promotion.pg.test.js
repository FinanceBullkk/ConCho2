/**
 * ──────────────────────────────────────────────────────────
 * PG-parity test — waitlist FIFO promotion primitives, slice S4
 * ──────────────────────────────────────────────────────────
 * promoteIfSeatFree's business logic (FIFO loop / stale-head / M5 belt) is
 * backend-agnostic JS, exercised end-to-end on Mongo by the staleWaitlistReconcile
 * / scheduleReassign / teams integration suites. The BACKEND-SPECIFIC parts are
 * the 5 repo primitives it drives — parity-tested here on both backends, plus the
 * concurrency crown: the guarded seat (T-FIFO-push) under contention can never
 * overfill (exactly one of two concurrent seats at the cap boundary wins).
 *
 * Runs only when a Postgres URL is present; SKIPS otherwise. MongoMemoryReplSet
 * (not standalone) — the concurrency test uses real transactions.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env.pg-prototype') });
const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');

const PG_URL = process.env.PG_URL || process.env.PG_PROTOTYPE_URL;
const describePg = PG_URL ? describe : describe.skip;

const { query, closePool } = require('../../config/pg');
const repo = require('../../domains/schedule/waitlist/repository');
const uow = require('../../domains/_shared/unit-of-work');
const Schedule = require('../../models/Schedule');
require('../../models/User');

const hex = (n) => n.toString(16).padStart(24, '0');
const oid = (h) => new mongoose.Types.ObjectId(h);
const coll = (m) => mongoose.model(m).collection.name;
const both = (fn) => Promise.all([fn(repo.impls.mongo), fn(repo.impls.pg)]);

const C1 = hex(0x201);
const U1 = hex(0x211); const U2 = hex(0x212); const U3 = hex(0x213); const U4 = hex(0x214);
const SP = hex(0x221); const SW = hex(0x222); const SSEAT = hex(0x223); const SMARK = hex(0x224); const SC = hex(0x225);
const WE2 = hex(0x231); const WE3 = hex(0x232); const WE4 = hex(0x233); const WEW = hex(0x234); const WEMARK = hex(0x235);

// distinct future start times — each schedule needs its own (classId,startTime)
// slot (the partial-unique double-booking index rejects same-class same-slot).
const SCHEDULES = [
  [SP, 3, [U1], '2026-11-01T10:00:00.000Z'],
  [SW, 5, [], '2026-11-02T10:00:00.000Z'],
  [SSEAT, 2, [U1], '2026-11-03T10:00:00.000Z'],
  [SMARK, 3, [], '2026-11-04T10:00:00.000Z'],
  [SC, 2, [U1], '2026-11-05T10:00:00.000Z'],
];
const T1 = '2026-10-01T01:00:00.000Z'; const T2 = '2026-10-01T02:00:00.000Z'; const T3 = '2026-10-01T03:00:00.000Z';

describePg('PG-parity: waitlist FIFO promotion primitives (S4)', () => {
  let mem;

  beforeAll(async () => {
    mem = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(mem.getUri());
    await Schedule.init();
    const db = mongoose.connection.db;
    const d = (s) => new Date(s);

    await db.collection(coll('Class')).insertOne({ _id: oid(C1), classCode: 'C-1', courseName: 'C1', status: 'Ongoing', teacherIds: [], isDeleted: false });
    await db.collection(coll('User')).insertMany([
      { _id: oid(U1), empCode: 'U1', name: 'A', role: 'Participant', status: 'Active', isDeleted: false },
      { _id: oid(U2), empCode: 'U2', name: 'B', role: 'Participant', status: 'Active', isDeleted: false },
      { _id: oid(U3), empCode: 'U3', name: 'C', role: 'Participant', status: 'Active', isDeleted: false },
      { _id: oid(U4), empCode: 'U4', name: 'D', role: 'Participant', status: 'Active', isDeleted: false },
    ]);
    await db.collection(coll('Schedule')).insertMany(
      SCHEDULES.map(([id, cap, roster, st]) => ({
        _id: oid(id), classId: oid(C1), startTime: d(st), endTime: d(st), status: 'scheduled', capacity: cap, enrolledUsers: roster.map(oid),
      })),
    );
    await db.collection(coll('WaitlistEntry')).insertMany([
      { _id: oid(WE2), scheduleId: oid(SW), classId: oid(C1), userId: oid(U2), status: 'waiting', createdAt: d(T1), updatedAt: d(T1) },
      { _id: oid(WE3), scheduleId: oid(SW), classId: oid(C1), userId: oid(U3), status: 'waiting', createdAt: d(T2), updatedAt: d(T2) },
      { _id: oid(WE4), scheduleId: oid(SW), classId: oid(C1), userId: oid(U4), status: 'waiting', createdAt: d(T3), updatedAt: d(T3) },
      { _id: oid(WEW), scheduleId: oid(SW), classId: oid(C1), userId: oid(U1), status: 'withdrawn', createdAt: d(T1), updatedAt: d(T1) },
      { _id: oid(WEMARK), scheduleId: oid(SMARK), classId: oid(C1), userId: oid(U2), status: 'waiting', createdAt: d(T1), updatedAt: d(T1) },
    ]);

    await query('TRUNCATE classes, users, schedules, waitlist_entries');
    await query(`INSERT INTO classes(id,class_code,course_name,status,teacher_ids,is_deleted) VALUES ($1,'C-1','C1','Ongoing','{}'::text[],false)`, [C1]);
    await query(
      `INSERT INTO users(id,emp_code,name,role,status,is_deleted) VALUES
        ($1,'U1','A','Participant','Active',false),($2,'U2','B','Participant','Active',false),
        ($3,'U3','C','Participant','Active',false),($4,'U4','D','Participant','Active',false)`, [U1, U2, U3, U4]);
    for (const [id, cap, roster, st] of SCHEDULES) {
      // eslint-disable-next-line no-await-in-loop -- sequential test seed
      await query(
        `INSERT INTO schedules(id,class_id,start_time,end_time,status,capacity,enrolled_users) VALUES ($1,$2,$3,$3,'scheduled',$4,$5::text[])`,
        [id, C1, st, cap, roster]);
    }
    const wl = [
      [WE2, SW, U2, 'waiting', T1], [WE3, SW, U3, 'waiting', T2], [WE4, SW, U4, 'waiting', T3],
      [WEW, SW, U1, 'withdrawn', T1], [WEMARK, SMARK, U2, 'waiting', T1],
    ];
    for (const [id, sid, uid, status, t] of wl) {
      // eslint-disable-next-line no-await-in-loop -- sequential test seed
      await query(
        `INSERT INTO waitlist_entries(id,schedule_id,class_id,user_id,status,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$6)`,
        [id, sid, C1, uid, status, t]);
    }
  }, 90_000);

  afterAll(async () => {
    if (mongoose.connection.readyState) await mongoose.disconnect();
    if (mem) await mem.stop();
    await closePool();
  });

  test('findScheduleForPromotion: shape (status/classId/capacity/enrolled)', async () => {
    const proj = (s) => ({ status: s.status, classId: String(s.classId), capacity: s.capacity, enrolled: [...s.enrolledUsers].map(String).sort() });
    const [m, p] = await both((r) => r.findScheduleForPromotion(SP));
    expect(proj(m)).toEqual({ status: 'scheduled', classId: C1, capacity: 3, enrolled: [U1] });
    expect(proj(p)).toEqual(proj(m));
    const [mn, pn] = await both((r) => r.findScheduleForPromotion(hex(0x2FF)));
    expect(mn).toBeNull(); expect(pn).toBeNull();
  });

  test('findWaitingEntriesForPromotion: FIFO order, waiting only', async () => {
    const ids = (rows) => rows.map((e) => String(e.userId));
    const [m, p] = await both((r) => r.findWaitingEntriesForPromotion(SW));
    expect(ids(m)).toEqual([U2, U3, U4]); // createdAt asc; withdrawn WEW excluded
    expect(ids(p)).toEqual([U2, U3, U4]);
  });

  test('findScheduleEnrolledUsers: roster', async () => {
    const [m, p] = await both((r) => r.findScheduleEnrolledUsers(SP));
    expect([...m].sort()).toEqual([U1]); expect([...p].sort()).toEqual([U1]);
  });

  test('seatWaiterIfRoom: guarded seat — under cap=1, at cap=0, already-seated=0', async () => {
    // SSEAT cap=2 roster=[U1]: seat U2 → 1 (count 1<2)
    const [m1, p1] = await both((r) => r.seatWaiterIfRoom(SSEAT, U2, 2));
    expect(m1).toBe(1); expect(p1).toBe(1);
    // now count=2: seat U3 → 0 (cardinality 2 < 2 false)
    const [m2, p2] = await both((r) => r.seatWaiterIfRoom(SSEAT, U3, 2));
    expect(m2).toBe(0); expect(p2).toBe(0);
    // already-seated U1 → 0 (NOT $ne guard)
    const [m3, p3] = await both((r) => r.seatWaiterIfRoom(SSEAT, U1, 2));
    expect(m3).toBe(0); expect(p3).toBe(0);
    // roster ended at exactly cap on both
    const [me, pe] = await both((r) => r.findScheduleEnrolledUsers(SSEAT));
    expect([...me].sort()).toEqual([U1, U2].sort()); expect([...pe].sort()).toEqual([U1, U2].sort());
  });

  test('markEntryPromoted: waiting → promoted (drops out of the FIFO scan)', async () => {
    await both((r) => r.markEntryPromoted(WEMARK));
    const [m, p] = await both((r) => r.findWaitingEntriesForPromotion(SMARK));
    expect(m).toEqual([]); expect(p).toEqual([]);
  });

  // ── concurrency crown: the guarded seat can never overfill ──
  test('concurrent seatWaiterIfRoom at the cap boundary: exactly one wins (no overfill)', async () => {
    // SC cap=2 roster=[U1] (1 free). Two concurrent txns seat DIFFERENT users.
    const seat = (impl, runTx, user) => runTx((tx) => impl.seatWaiterIfRoom(SC, user, 2, tx));
    const run = async (impl, runTx) => {
      const res = await Promise.allSettled([seat(impl, runTx, U2), seat(impl, runTx, U3)]);
      return res.filter((r) => r.status === 'fulfilled' && r.value === 1).length;
    };
    const mWins = await run(repo.impls.mongo, uow.impls.mongo);
    const pWins = await run(repo.impls.pg, uow.impls.pg);
    expect(mWins).toBe(1); expect(pWins).toBe(1); // exactly one seat granted
    const [me, pe] = await both((r) => r.findScheduleEnrolledUsers(SC));
    expect(me.length).toBe(2); expect(pe.length).toBe(2); // == cap, never overfilled
  });
});
