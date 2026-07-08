/**
 * ──────────────────────────────────────────────────────────
 * PG-parity test — Sheets-sync bulk reads (Mongo ↔ Postgres)
 * ──────────────────────────────────────────────────────────
 * The two NEW read seams the B5-reads port added for syncController's
 * pre-load maps. Runs only when a Postgres URL is present; SKIPS otherwise.
 * Asserts identical behaviour + traps:
 *   • findAllClassCodesLean: live classes only (soft-deleted dropped), shape
 *     { _id, classCode } with stringifiable ids
 *   • findLiveSchedulesForSync: status='scheduled' only (cancelled rows are
 *     history), enrolledUsers as an id array, capacity as Number|undefined
 * (Read A — teams w/ members — reuses groups/read-repository.findAllTeams,
 *  already pinned by groups-read-repository.pg.test.js.)
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env.pg-prototype') });
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const PG_URL = process.env.PG_URL || process.env.PG_PROTOTYPE_URL;
const describePg = PG_URL ? describe : describe.skip;

const { query, closePool } = require('../../config/pg');
const classRepo = require('../../controllers/class/class-repository');
const scheduleRepo = require('../../domains/schedule/repository');

const hex = (n) => n.toString(16).padStart(24, '0');
const oid = (h) => new mongoose.Types.ObjectId(h);
const coll = (m) => mongoose.model(m).collection.name;

const CLS_LIVE = hex(0xc1);
const CLS_DEAD = hex(0xc2);
const SCH_LIVE = hex(0xd1);
const SCH_CANCELLED = hex(0xd2);
const USER_A = hex(0xe1);
const USER_B = hex(0xe2);
const T0 = new Date('2026-07-15T03:00:00.000Z');
const T1 = new Date('2026-07-15T04:00:00.000Z');

describePg('PG-parity: sync bulk-read seams', () => {
  let mem;

  beforeAll(async () => {
    mem = await MongoMemoryServer.create();
    await mongoose.connect(mem.getUri());
    const db = mongoose.connection.db;

    await db.collection(coll('Class')).insertMany([
      { _id: oid(CLS_LIVE), classCode: 'SYNC01', courseName: 'Sync Course', isDeleted: false },
      { _id: oid(CLS_DEAD), classCode: 'SYNC02', courseName: 'Gone Course', isDeleted: true },
    ]);
    await db.collection(coll('Schedule')).insertMany([
      {
        _id: oid(SCH_LIVE), classId: oid(CLS_LIVE), startTime: T0, endTime: T1,
        status: 'scheduled', enrolledUsers: [oid(USER_A), oid(USER_B)], capacity: 12,
      },
      {
        _id: oid(SCH_CANCELLED), classId: oid(CLS_LIVE), startTime: T1, endTime: T1,
        status: 'cancelled', enrolledUsers: [],
      },
    ]);

    await query('TRUNCATE classes, schedules');
    await query(
      `INSERT INTO classes(id, class_code, course_name, is_deleted) VALUES
       ($1, 'SYNC01', 'Sync Course', false),
       ($2, 'SYNC02', 'Gone Course', true)`,
      [CLS_LIVE, CLS_DEAD]);
    await query(
      `INSERT INTO schedules(id, class_id, start_time, end_time, status, enrolled_users, capacity) VALUES
       ($1, $3, $4, $5, 'scheduled', $6, 12),
       ($2, $3, $5, $5, 'cancelled', '{}', NULL)`,
      [SCH_LIVE, SCH_CANCELLED, CLS_LIVE, T0, T1, [USER_A, USER_B]]);
  }, 60_000);

  afterAll(async () => {
    if (mongoose.connection.readyState) await mongoose.disconnect();
    if (mem) await mem.stop();
    await closePool();
  });

  const both = (fn) => Promise.all([fn(classRepo.impls.mongo), fn(classRepo.impls.pg)]);

  test('findAllClassCodesLean: live classes only, {_id, classCode} — identical', async () => {
    const proj = (rows) => rows.map((c) => ({ _id: String(c._id), classCode: c.classCode }))
      .sort((a, b) => a.classCode.localeCompare(b.classCode));
    const [m, p] = await both((r) => r.findAllClassCodesLean());
    expect(proj(m)).toEqual([{ _id: CLS_LIVE, classCode: 'SYNC01' }]);
    expect(proj(p)).toEqual(proj(m));
  });

  test('findLiveSchedulesForSync: scheduled only, sync-consumed shape — identical', async () => {
    const proj = (rows) => rows.map((s) => ({
      _id: String(s._id),
      classId: String(s.classId),
      bookedTeamId: s.bookedTeamId ? String(s.bookedTeamId) : null,
      startTime: new Date(s.startTime).toISOString(),
      enrolledUsers: s.enrolledUsers.map(String).sort(),
      capacity: s.capacity,
    })).sort((a, b) => a._id.localeCompare(b._id));

    const [m, p] = await Promise.all([
      scheduleRepo.impls.mongo.findLiveSchedulesForSync(),
      scheduleRepo.impls.pg.findLiveSchedulesForSync(),
    ]);
    expect(proj(m)).toEqual([{
      _id: SCH_LIVE,
      classId: CLS_LIVE,
      bookedTeamId: null,
      startTime: T0.toISOString(),
      enrolledUsers: [USER_A, USER_B].sort(),
      capacity: 12,
    }]);
    expect(proj(p)).toEqual(proj(m));
  });
});
