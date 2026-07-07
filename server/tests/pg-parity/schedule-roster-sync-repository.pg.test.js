/**
 * ──────────────────────────────────────────────────────────
 * PG-parity test — domains/schedule roster-sync primitives (Wave G Slice B/C)
 * ──────────────────────────────────────────────────────────
 * The 5 dual-backend repo methods that back domains/schedule/roster-sync
 * (team member-edit + user auto-release):
 *   • findFutureTeamSchedules  — future LIVE team sessions (excl. past/cancelled)
 *   • findFutureUserSchedules  — future LIVE sessions a user is enrolled in
 *   • applyRosterDelta         — $pull removed + $push added ⇔ enrolled_users text[]
 *   • findEmptyScheduleIds     — empty-roster ids among a set
 *   • deleteSchedulesByIds     — hard-delete
 * PLUS a rollback harness driving runInTransaction on BOTH backends (mid-tx throw
 * → the roster delta does not persist).
 *
 * Runs only when a Postgres URL is present; SKIPS otherwise. Uses
 * MongoMemoryReplSet (runInTransaction's mongo impl needs a replica set).
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env.pg-prototype') });
const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');

const PG_URL = process.env.PG_URL || process.env.PG_PROTOTYPE_URL;
const describePg = PG_URL ? describe : describe.skip;

const { query, closePool } = require('../../config/pg');
const repo = require('../../domains/schedule/repository'); // registers schedule models
const uow = require('../../domains/_shared/unit-of-work');

const hex = (n) => n.toString(16).padStart(24, '0');
const oid = (h) => new mongoose.Types.ObjectId(h);
const coll = (m) => mongoose.model(m).collection.name;
const both = (fn) => Promise.all([fn(repo.impls.mongo), fn(repo.impls.pg)]);
const sortStr = (a) => [...a].map(String).sort();

// ── id fixtures ──
const TEAM = hex(0xD01); const C1 = hex(0xD02);
const U1 = hex(0xD11); const U2 = hex(0xD12); const U3 = hex(0xD13);
const SFUT1 = hex(0xD21); const SFUT2 = hex(0xD22); const SPAST = hex(0xD23); const SCANC = hex(0xD24);
const SUSER = hex(0xD25); const SROLL = hex(0xD26);

const TODAY = new Date('2026-08-01T00:00:00.000Z');
// Distinct start_times per scheduled row — the partial unique index
// (class_id, start_time) WHERE status='scheduled' forbids two live sessions
// sharing a slot (a cancelled row may reuse one).
const FUTURE = '2026-08-15T10:00:00.000Z'; const FUTURE2 = '2026-08-16T10:00:00.000Z';
const FUTURE3 = '2026-08-17T10:00:00.000Z'; const FUTURE4 = '2026-08-18T10:00:00.000Z';
const PAST = '2026-07-15T10:00:00.000Z';

describePg('PG-parity: schedule roster-sync primitives (Slice B/C)', () => {
  let mem; let db;

  beforeAll(async () => {
    mem = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(mem.getUri());
    db = mongoose.connection.db;
    const d = (s) => new Date(s);

    // ── Mongo seed (schedules only — the primitives touch just this collection) ──
    await db.collection(coll('Schedule')).insertMany([
      { _id: oid(SFUT1), classId: oid(C1), bookedTeamId: oid(TEAM), startTime: d(FUTURE), endTime: d(FUTURE), status: 'scheduled', capacity: 3, enrolledUsers: [oid(U1)] },
      { _id: oid(SFUT2), classId: oid(C1), bookedTeamId: oid(TEAM), startTime: d(FUTURE2), endTime: d(FUTURE2), status: 'scheduled', capacity: 3, enrolledUsers: [] },
      { _id: oid(SPAST), classId: oid(C1), bookedTeamId: oid(TEAM), startTime: d(PAST), endTime: d(PAST), status: 'scheduled', capacity: 3, enrolledUsers: [oid(U1)] },
      { _id: oid(SCANC), classId: oid(C1), bookedTeamId: oid(TEAM), startTime: d(FUTURE), endTime: d(FUTURE), status: 'cancelled', capacity: 3, enrolledUsers: [oid(U1)] },
      { _id: oid(SUSER), classId: oid(C1), bookedTeamId: null, startTime: d(FUTURE3), endTime: d(FUTURE3), status: 'scheduled', capacity: 3, enrolledUsers: [oid(U1), oid(U2)] },
      { _id: oid(SROLL), classId: oid(C1), bookedTeamId: null, startTime: d(FUTURE4), endTime: d(FUTURE4), status: 'scheduled', capacity: 3, enrolledUsers: [oid(U1)] },
    ]);

    // ── PG seed ──
    await query('TRUNCATE schedules');
    const rows = [
      [SFUT1, C1, TEAM, FUTURE, 'scheduled', [U1]],
      [SFUT2, C1, TEAM, FUTURE2, 'scheduled', []],
      [SPAST, C1, TEAM, PAST, 'scheduled', [U1]],
      [SCANC, C1, TEAM, FUTURE, 'cancelled', [U1]],
      [SUSER, C1, null, FUTURE3, 'scheduled', [U1, U2]],
      [SROLL, C1, null, FUTURE4, 'scheduled', [U1]],
    ];
    for (const [id, cls, team, st, status, enr] of rows) {
      // eslint-disable-next-line no-await-in-loop -- sequential test seed
      await query(
        `INSERT INTO schedules(id,class_id,booked_team_id,start_time,end_time,status,capacity,enrolled_users)
         VALUES ($1,$2,$3,$4,$4,$5,3,$6::text[])`,
        [id, cls, team, st, status, enr]);
    }
  }, 90_000);

  afterAll(async () => {
    if (mongoose.connection.readyState) await mongoose.disconnect();
    if (mem) await mem.stop();
    await closePool();
  });

  test('findFutureTeamSchedules: future LIVE team sessions only (excl. past + cancelled)', async () => {
    const [m, p] = await both((r) => r.findFutureTeamSchedules(TEAM, TODAY));
    expect(sortStr(m.map((s) => s._id))).toEqual(sortStr([SFUT1, SFUT2]));
    expect(sortStr(p.map((s) => s._id))).toEqual(sortStr([SFUT1, SFUT2]));
    // roster + capacity shape parity on the rostered one
    const mF1 = m.find((s) => String(s._id) === SFUT1); const pF1 = p.find((s) => String(s._id) === SFUT1);
    expect(sortStr(mF1.enrolledUsers)).toEqual([U1]); expect(sortStr(pF1.enrolledUsers)).toEqual([U1]);
    expect(mF1.capacity).toBe(3); expect(pF1.capacity).toBe(3);
    expect(String(mF1.classId)).toBe(C1); expect(String(pF1.classId)).toBe(C1);
  });

  test('findFutureUserSchedules: future LIVE sessions the user is on (excl. past + cancelled)', async () => {
    const [m, p] = await both((r) => r.findFutureUserSchedules(U1, TODAY));
    expect(sortStr(m.map((s) => s._id))).toEqual(sortStr([SFUT1, SUSER, SROLL]));
    expect(sortStr(p.map((s) => s._id))).toEqual(sortStr([SFUT1, SUSER, SROLL]));
    // a user not on any roster → empty
    const [m2, p2] = await both((r) => r.findFutureUserSchedules(U3, TODAY));
    expect(m2).toEqual([]); expect(p2).toEqual([]);
  });

  test('applyRosterDelta: $pull removed + $push added ⇔ text[] survivors || added', async () => {
    await both((r) => r.applyRosterDelta(SUSER, [U1], [U3]));
    const mRoster = await mongoRoster(SUSER); const pRoster = await pgRoster(SUSER);
    expect(sortStr(mRoster)).toEqual(sortStr([U2, U3])); // U1 removed, U3 added, U2 kept
    expect(sortStr(pRoster)).toEqual(sortStr([U2, U3]));
  });

  test('findEmptyScheduleIds: empty-roster ids among the set', async () => {
    const [m, p] = await both((r) => r.findEmptyScheduleIds([SFUT1, SFUT2]));
    expect(sortStr(m)).toEqual([SFUT2]); expect(sortStr(p)).toEqual([SFUT2]); // SFUT2 empty, SFUT1 has U1
  });

  test('deleteSchedulesByIds: hard-delete the empty placeholder', async () => {
    await both((r) => r.deleteSchedulesByIds([SFUT2]));
    expect(await mongoExists(SFUT2)).toBe(false); expect(await pgExists(SFUT2)).toBe(false);
    expect(await mongoExists(SFUT1)).toBe(true); expect(await pgExists(SFUT1)).toBe(true);
  });

  test('runInTransaction ROLLBACK: mid-tx applyRosterDelta throw → roster unchanged (both backends)', async () => {
    const boom = (impl) => async (tx) => {
      await impl.applyRosterDelta(SROLL, [U1], [], tx);
      throw new Error('forced mid-tx failure');
    };
    await expect(uow.impls.mongo(boom(repo.impls.mongo))).rejects.toThrow('forced mid-tx failure');
    await expect(uow.impls.pg(boom(repo.impls.pg))).rejects.toThrow('forced mid-tx failure');
    expect(sortStr(await mongoRoster(SROLL))).toEqual([U1]); // U1 still present — delta rolled back
    expect(sortStr(await pgRoster(SROLL))).toEqual([U1]);
  });

  // ── observers (raw collection / table — no model methods) ──
  async function mongoRoster(sid) { const s = await db.collection(coll('Schedule')).findOne({ _id: oid(sid) }); return (s?.enrolledUsers || []).map(String); }
  async function pgRoster(sid) { const { rows } = await query(`SELECT enrolled_users FROM schedules WHERE id=$1`, [sid]); return (rows[0]?.enrolled_users || []).map(String); }
  async function mongoExists(sid) { return Boolean(await db.collection(coll('Schedule')).findOne({ _id: oid(sid) })); }
  async function pgExists(sid) { const { rows } = await query(`SELECT 1 FROM schedules WHERE id=$1`, [sid]); return rows.length > 0; }
});
