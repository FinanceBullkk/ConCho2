/**
 * ──────────────────────────────────────────────────────────
 * PG-parity test — booking cutover seams, slice S3b-1
 * ──────────────────────────────────────────────────────────
 * The two seams the scheduleService→runInTransaction cutover added:
 *   • loadTeamForBooking (lock + populate; pg = SELECT … FOR UPDATE)
 *   • insertSession (the single create seam: core columns + meta-extras)
 * plus the rollback harness and the headline P1 proof: FOR UPDATE serializes
 * two concurrent same-team bookings so the weekly cap can't be over-run.
 *
 * Runs only when a Postgres URL is present; SKIPS otherwise. MongoMemoryReplSet
 * (not standalone) — the rollback + concurrency tests use real transactions.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env.pg-prototype') });
const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');

const PG_URL = process.env.PG_URL || process.env.PG_PROTOTYPE_URL;
const describePg = PG_URL ? describe : describe.skip;

const { query, closePool } = require('../../config/pg');
const sr = require('../../domains/schedule/repository');
const bw = require('../../domains/schedule/booking-write-repository');
const uow = require('../../domains/_shared/unit-of-work');
const { getWeekBounds } = require('../../domains/schedule/session-booking-policy');
const Schedule = require('../../models/Schedule');
require('../../models/User');

const hex = (n) => n.toString(16).padStart(24, '0');
const oid = (h) => new mongoose.Types.ObjectId(h);
const coll = (m) => mongoose.model(m).collection.name;
const norm = (x) => (x == null ? null : JSON.parse(JSON.stringify(x)));
const both = (fn) => Promise.all([fn(sr.impls.mongo), fn(sr.impls.pg)]);
const sortBy = (a, k) => [...a].sort((x, y) => String(x[k]).localeCompare(String(y[k])));

const C1 = hex(0x101); const CC = hex(0x102);
const U1 = hex(0x111); const U2 = hex(0x112); const U3 = hex(0x113); const LEAD = hex(0x114);
const TM = hex(0x121); const TMDEL = hex(0x122); const TC = hex(0x123);
const SPRE = hex(0x131); // pre-seeded booking for the concurrency cap test

const plus1h = (iso) => new Date(new Date(iso).getTime() + 3600000).toISOString(); // endTime > startTime (model invariant)
const T_CORE = '2026-10-01T10:00:00.000Z';
const T_FULL = '2026-10-02T10:00:00.000Z';
const T_DUP = '2026-10-03T10:00:00.000Z';
const T_RB = '2026-10-04T10:00:00.000Z';
const T_CM = '2026-10-05T10:00:00.000Z';
// concurrency week: Mon 2026-10-12 .. distinct slots
const WK_PRE = '2026-10-12T10:00:00.000Z'; const WK_A = '2026-10-13T10:00:00.000Z'; const WK_B = '2026-10-14T10:00:00.000Z';

describePg('PG-parity: booking cutover seams (S3b-1)', () => {
  let mem;

  beforeAll(async () => {
    mem = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(mem.getUri());
    await Schedule.init(); // build the {class_id,start_time} partial-unique index (mongo)
    const db = mongoose.connection.db;

    await db.collection(coll('Class')).insertMany([
      { _id: oid(C1), classCode: 'C-1', courseName: 'C1', status: 'Ongoing', teacherIds: [], isDeleted: false },
      { _id: oid(CC), classCode: 'C-C', courseName: 'CC', status: 'Ongoing', teacherIds: [], isDeleted: false },
    ]);
    await db.collection(coll('User')).insertMany([
      { _id: oid(U1), empCode: 'U1', name: 'A', role: 'Participant', status: 'Active', isDeleted: false },
      { _id: oid(U2), empCode: 'U2', name: 'B', role: 'Participant', status: 'Active', isDeleted: false },
      { _id: oid(U3), empCode: 'U3', name: 'C', role: 'Participant', status: 'Dropped', isDeleted: false },
      { _id: oid(LEAD), empCode: 'LD', name: 'L', role: 'Participant', status: 'Active', isDeleted: false },
    ]);
    await db.collection(coll('Team')).insertMany([
      { _id: oid(TM), name: 'TM', classId: oid(C1), leaderId: oid(LEAD), members: [oid(U1), oid(U2), oid(U3)], isDeleted: false },
      { _id: oid(TMDEL), name: 'TD', classId: oid(C1), leaderId: oid(LEAD), members: [oid(U1)], isDeleted: true },
      { _id: oid(TC), name: 'TC', classId: oid(CC), leaderId: oid(LEAD), members: [oid(U1)], isDeleted: false },
    ]);
    await db.collection(coll('Schedule')).insertOne(
      { _id: oid(SPRE), classId: oid(CC), bookedTeamId: oid(TC), startTime: new Date(WK_PRE), endTime: new Date(WK_PRE), status: 'scheduled', enrolledUsers: [] },
    );

    await query('TRUNCATE classes, users, teams, team_members, schedules, room_bookings');
    await query(
      `INSERT INTO classes(id,class_code,course_name,status,teacher_ids,is_deleted) VALUES
        ($1,'C-1','C1','Ongoing','{}'::text[],false),($2,'C-C','CC','Ongoing','{}'::text[],false)`, [C1, CC]);
    await query(
      `INSERT INTO users(id,emp_code,name,role,status,is_deleted) VALUES
        ($1,'U1','A','Participant','Active',false),($2,'U2','B','Participant','Active',false),
        ($3,'U3','C','Participant','Dropped',false),($4,'LD','L','Participant','Active',false)`, [U1, U2, U3, LEAD]);
    await query(
      `INSERT INTO teams(id,name,class_id,leader_id,is_deleted) VALUES
        ($1,'TM',$4,$6,false),($2,'TD',$4,$6,true),($3,'TC',$5,$6,false)`, [TM, TMDEL, TC, C1, CC, LEAD]);
    await query(`INSERT INTO team_members(team_id,user_id) VALUES ($1,$3),($1,$4),($1,$5),($2,$3)`, [TM, TC, U1, U2, U3]);
    await query(
      `INSERT INTO schedules(id,class_id,booked_team_id,start_time,end_time,status,enrolled_users) VALUES
        ($1,$2,$3,$4,$4,'scheduled','{}'::text[])`, [SPRE, CC, TC, WK_PRE]);
  }, 90_000);

  afterAll(async () => {
    if (mongoose.connection.readyState) await mongoose.disconnect();
    if (mem) await mem.stop();
    await closePool();
  });

  test('loadTeamForBooking: classId/leaderId + members(status); deleted team → null', async () => {
    const proj = (t) => { const n = norm(t); return {
      classId: String(n.classId), leaderId: String(n.leaderId),
      members: sortBy(n.members.map((m) => ({ id: String(m._id), s: m.status })), 'id'),
    }; };
    const [m, p] = await both((r) => r.loadTeamForBooking(TM, undefined));
    const want = { classId: C1, leaderId: LEAD, members: sortBy([{ id: U1, s: 'Active' }, { id: U2, s: 'Active' }, { id: U3, s: 'Dropped' }], 'id') };
    expect(proj(m)).toEqual(want); expect(proj(p)).toEqual(want);
    const [md, pd] = await both((r) => r.loadTeamForBooking(TMDEL, undefined));
    expect(md).toBeNull(); expect(pd).toBeNull();
    // lock:true returns the same shape (mongo write-lock / pg FOR UPDATE — no error outside an explicit tx)
    const [ml, pl] = await both((r) => r.loadTeamForBooking(TM, undefined, { lock: true }));
    expect(proj(ml)).toEqual(want); expect(proj(pl)).toEqual(want);
  });

  test('insertSession: core fields → scheduled row', async () => {
    const [m, p] = await Promise.all([
      bw.impls.mongo.insertSession({ classId: C1, bookedTeamId: TM, startTime: T_CORE, endTime: plus1h(T_CORE), enrolledUsers: [U1, U2] }),
      bw.impls.pg.insertSession({ classId: C1, bookedTeamId: TM, startTime: T_CORE, endTime: plus1h(T_CORE), enrolledUsers: [U1, U2] }),
    ]);
    expect(m.status).toBe('scheduled'); expect(p.status).toBe('scheduled');
    expect(String(m.classId)).toBe(C1); expect(String(p.classId)).toBe(C1);
    // read back via the dual-backend raw read
    const proj = (x) => { const n = norm(x); return { cls: String(n.classId), enrolled: [...n.enrolledUsers].map(String).sort(), status: n.status }; };
    const [mr, pr] = await Promise.all([sr.impls.mongo.findScheduleByIdRaw(m._id), sr.impls.pg.findScheduleByIdRaw(p._id)]);
    expect(proj(mr)).toEqual({ cls: C1, enrolled: [U1, U2].sort(), status: 'scheduled' });
    expect(proj(pr)).toEqual({ cls: C1, enrolled: [U1, U2].sort(), status: 'scheduled' });
  });

  test('insertSession: full fields → core columns + meta extras round-trip', async () => {
    const fields = {
      classId: C1, bookedTeamId: null, startTime: T_FULL, endTime: plus1h(T_FULL), enrolledUsers: [],
      topic: 'Kickoff', capacity: 12, agenda: ['intro'], externalTrainer: { name: 'Ext', email: 'e@x.io' },
    };
    const [m, p] = await Promise.all([bw.impls.mongo.insertSession(fields), bw.impls.pg.insertSession(fields)]);
    const proj = (x) => { const n = norm(x); return {
      topic: n.topic, capacity: n.capacity, agenda: n.agenda, ext: n.externalTrainer ? n.externalTrainer.name : null,
    }; };
    const [mr, pr] = await Promise.all([sr.impls.mongo.findScheduleByIdRaw(m._id), sr.impls.pg.findScheduleByIdRaw(p._id)]);
    const want = { topic: 'Kickoff', capacity: 12, agenda: ['intro'], ext: 'Ext' };
    expect(proj(mr)).toEqual(want); expect(proj(pr)).toEqual(want);
  });

  test('insertSession: double-booking same {class,start} → code 11000', async () => {
    await Promise.all([
      bw.impls.mongo.insertSession({ classId: C1, startTime: T_DUP, endTime: plus1h(T_DUP), enrolledUsers: [] }),
      bw.impls.pg.insertSession({ classId: C1, startTime: T_DUP, endTime: plus1h(T_DUP), enrolledUsers: [] }),
    ]);
    const dup = async (impl) => {
      try { await impl.insertSession({ classId: C1, startTime: T_DUP, endTime: plus1h(T_DUP), enrolledUsers: [] }); return null; }
      catch (e) { return e.code; }
    };
    const [mc, pc] = await Promise.all([dup(bw.impls.mongo), dup(bw.impls.pg)]);
    expect(mc).toBe(11000); expect(pc).toBe(11000);
  });

  test('runInTransaction: commit persists / rollback discards the insert (both backends)', async () => {
    // commit
    await uow.impls.mongo((tx) => bw.impls.mongo.insertSession({ classId: C1, startTime: T_CM, endTime: plus1h(T_CM), enrolledUsers: [] }, tx));
    await uow.impls.pg((tx) => bw.impls.pg.insertSession({ classId: C1, startTime: T_CM, endTime: plus1h(T_CM), enrolledUsers: [] }, tx));
    expect(await bw.impls.mongo.countScheduledForClass(C1)).toBeGreaterThanOrEqual(1);
    const pgCount = async (cls) => (await query(`SELECT count(*)::int n FROM schedules WHERE class_id=$1 AND start_time=$2 AND status='scheduled'`, [cls, T_CM])).rows[0].n;
    expect(await pgCount(C1)).toBe(1);
    // rollback
    const boom = (impl) => async (tx) => { await impl.insertSession({ classId: C1, startTime: T_RB, endTime: plus1h(T_RB), enrolledUsers: [] }, tx); throw new Error('boom'); };
    await expect(uow.impls.mongo(boom(bw.impls.mongo))).rejects.toThrow('boom');
    await expect(uow.impls.pg(boom(bw.impls.pg))).rejects.toThrow('boom');
    const mRb = await Schedule.countDocuments({ classId: oid(C1), startTime: new Date(T_RB) });
    const pRb = (await query(`SELECT count(*)::int n FROM schedules WHERE class_id=$1 AND start_time=$2`, [C1, T_RB])).rows[0].n;
    expect(mRb).toBe(0); expect(pRb).toBe(0);
  });

  // ── P1: FOR UPDATE / write-lock serializes concurrent same-team bookings ──
  // cap=2, team TC already has 1 booking (SPRE) in the week. Two concurrent
  // bookings each try to add a 2nd in DISTINCT slots. Without serialization both
  // read count=1 and commit → 3 (cap breached). With the lock, exactly one wins.
  test('concurrent same-team bookings: lock keeps the weekly cap (exactly one wins)', async () => {
    const CAP = 2;
    const attempt = (srImpl, bwImpl, runTx, start) => runTx(async (tx) => {
      await srImpl.loadTeamForBooking(TC, tx, { lock: true });
      const { weekStart, weekEnd } = getWeekBounds(new Date(start));
      const n = await srImpl.countSchedulesForTeamInWeek(TC, weekStart, weekEnd, null, tx);
      if (n >= CAP) { const e = new Error('weekly cap'); e.cap = true; throw e; }
      return bwImpl.insertSession({ classId: CC, bookedTeamId: TC, startTime: start, endTime: plus1h(start), enrolledUsers: [] }, tx);
    });
    const runBackend = async (srImpl, bwImpl, runTx) => {
      const res = await Promise.allSettled([
        attempt(srImpl, bwImpl, runTx, WK_A),
        attempt(srImpl, bwImpl, runTx, WK_B),
      ]);
      return res.filter((r) => r.status === 'fulfilled').length;
    };
    const mongoWins = await runBackend(sr.impls.mongo, bw.impls.mongo, uow.impls.mongo);
    const pgWins = await runBackend(sr.impls.pg, bw.impls.pg, uow.impls.pg);
    expect(mongoWins).toBe(1); // exactly one of the two concurrent bookings committed
    expect(pgWins).toBe(1);
    // final live count for the team's week respects the cap on both backends
    const { weekStart, weekEnd } = getWeekBounds(new Date(WK_A));
    const mFinal = await sr.impls.mongo.countSchedulesForTeamInWeek(TC, weekStart, weekEnd, null);
    const pFinal = await sr.impls.pg.countSchedulesForTeamInWeek(TC, weekStart, weekEnd, null);
    expect(mFinal).toBe(CAP); expect(pFinal).toBe(CAP);
  });
});
