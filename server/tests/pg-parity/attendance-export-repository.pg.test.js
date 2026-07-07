/**
 * ──────────────────────────────────────────────────────────
 * PG-parity test — services/export/attendance-export-repository (Wave-F PR-2)
 * ──────────────────────────────────────────────────────────
 * The attendance-export semantic methods behind the claim-race export flow:
 *   • findExportRows        — the 4-join projection (Excel + JSON preview)
 *   • findPendingIdsInRange — pre-claim id scan (schedule join ONLY)
 *   • countExportablePending — joined pending count (drops orphans)
 *   • claimBatch / markExported — the P2-08 claim-race transitions
 *   • countByStatus / findLastExported / countExportedInWindow — stats
 *
 * Pins the trap-prone Mongo semantics:
 *   • schedule+user joins INNER ($unwind) — orphan attendance / soft-deleted
 *     user DROP the row; class/team joins LEFT (preserveNullAndEmptyArrays) —
 *     row kept, classCode/courseName keys OMITTED, teamName → 'N/A';
 *   • the id-scan has NO user join — a soft-deleted user's PENDING row IS
 *     claimed (and later dropped from the file by the row query);
 *   • claim only flips rows still PENDING (concurrent loser claims 0).
 *
 * Runs only when a Postgres URL is present; SKIPS otherwise.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env.pg-prototype') });
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const PG_URL = process.env.PG_URL || process.env.PG_PROTOTYPE_URL;
const describePg = PG_URL ? describe : describe.skip;

const { query, closePool } = require('../../config/pg');
const repo = require('../../services/export/attendance-export-repository');
require('../../models/Attendance');
require('../../models/Schedule');
require('../../models/User');
require('../../models/Class');
require('../../models/Team');

const hex = (n) => n.toString(16).padStart(24, '0');
const oid = (h) => new mongoose.Types.ObjectId(h);
const coll = (m) => mongoose.model(m).collection.name;
const norm = (x) => (x == null ? null : JSON.parse(JSON.stringify(x)));
const both = (fn) => Promise.all([fn(repo.impls.mongo), fn(repo.impls.pg)]);
const sortStr = (a) => [...a].map(String).sort();

// ── id fixtures ──
const U1 = hex(0xE01); const UDEL = hex(0xE02);
const C1 = hex(0xE11); const CDEL = hex(0xE12);
const T1 = hex(0xE21);
const S1 = hex(0xE31); const S2 = hex(0xE32); const S3 = hex(0xE33); const SGONE = hex(0xE34);
const A1 = hex(0xE41); const A2 = hex(0xE42); const A3 = hex(0xE43); const A4 = hex(0xE44); const A5 = hex(0xE45);

// times (fixture-controlled so attendanceDate/exportedAt deep-equal across backends)
const MAR15 = '2026-03-15T09:00:00.000Z'; const MAR15_END = '2026-03-15T10:30:00.000Z'; // 90 min
const JAN10 = '2026-01-10T09:00:00.000Z'; const JAN10_END = '2026-01-10T10:00:00.000Z'; // 60 min
const MAR20 = '2026-03-20T09:00:00.000Z'; const MAR20_END = '2026-03-20T09:45:00.000Z'; // 45 min
const CREATED = '2026-03-01T00:00:00.000Z';
const EXPORTED_AT = '2026-03-21T00:00:00.000Z';
const FROM_MAR = '2026-03-01'; const TO_MAR = '2026-03-31';

describePg('PG-parity: attendance-export repository (Wave-F PR-2)', () => {
  let mem; let db;

  beforeAll(async () => {
    mem = await MongoMemoryServer.create();
    await mongoose.connect(mem.getUri(), { dbName: 'pg_parity_attendance_export' });
    db = mongoose.connection.db;
    const d = (s) => new Date(s);

    // ── Mongo seed (raw driver — explicit createdAt, no timestamp plugin) ──
    await db.collection(coll('User')).insertMany([
      { _id: oid(U1), empCode: 'E1', name: 'Al', department: 'Sales', role: 'Participant', status: 'Active', isDeleted: false },
      { _id: oid(UDEL), empCode: 'E2', name: 'Gone', department: 'HR', role: 'Participant', status: 'Active', isDeleted: true },
    ]);
    await db.collection(coll('Class')).insertMany([
      { _id: oid(C1), classCode: 'C-1', courseName: 'Course One', isDeleted: false },
      { _id: oid(CDEL), classCode: 'C-DEL', courseName: 'Deleted Course', isDeleted: true },
    ]);
    await db.collection(coll('Team')).insertOne({ _id: oid(T1), name: 'Alpha', classId: oid(C1), isDeleted: false });
    await db.collection(coll('Schedule')).insertMany([
      { _id: oid(S1), classId: oid(C1), bookedTeamId: oid(T1), startTime: d(MAR15), endTime: d(MAR15_END), status: 'scheduled', roomLink: 'link1', enrolledUsers: [oid(U1)] },
      { _id: oid(S2), classId: oid(CDEL), bookedTeamId: null, startTime: d(JAN10), endTime: d(JAN10_END), status: 'scheduled', enrolledUsers: [oid(U1)] },
      { _id: oid(S3), classId: oid(C1), bookedTeamId: oid(T1), startTime: d(MAR20), endTime: d(MAR20_END), status: 'scheduled', enrolledUsers: [oid(U1)] },
    ]);
    await db.collection(coll('Attendance')).insertMany([
      { _id: oid(A1), scheduleId: oid(S1), userId: oid(U1), status: 'P', remark: 'r1', syncStatus: 'PENDING', createdAt: d(CREATED), updatedAt: d(CREATED) },
      { _id: oid(A2), scheduleId: oid(S2), userId: oid(U1), status: 'A', remark: 'r2', syncStatus: 'PENDING', createdAt: d(CREATED), updatedAt: d(CREATED) },
      { _id: oid(A3), scheduleId: oid(S3), userId: oid(U1), status: 'P', remark: '', syncStatus: 'EXPORTED', exportBatchId: 'B0', exportedAt: d(EXPORTED_AT), createdAt: d(CREATED), updatedAt: d(CREATED) },
      { _id: oid(A4), scheduleId: oid(S1), userId: oid(UDEL), status: 'P', remark: '', syncStatus: 'PENDING', createdAt: d(CREATED), updatedAt: d(CREATED) },
      { _id: oid(A5), scheduleId: oid(SGONE), userId: oid(U1), status: 'P', remark: '', syncStatus: 'PENDING', createdAt: d(CREATED), updatedAt: d(CREATED) },
    ]);

    // ── PG seed ──
    await query('TRUNCATE users, classes, teams, team_members, schedules, attendances');
    await query(
      `INSERT INTO users(id,emp_code,name,department,role,status,is_deleted) VALUES
        ($1,'E1','Al','Sales','Participant','Active',false),
        ($2,'E2','Gone','HR','Participant','Active',true)`,
      [U1, UDEL]);
    await query(
      `INSERT INTO classes(id,class_code,course_name,is_deleted) VALUES
        ($1,'C-1','Course One',false),($2,'C-DEL','Deleted Course',true)`,
      [C1, CDEL]);
    await query(`INSERT INTO teams(id,name,class_id,is_deleted) VALUES ($1,'Alpha',$2,false)`, [T1, C1]);
    await query(
      `INSERT INTO schedules(id,class_id,booked_team_id,start_time,end_time,status,room_link,enrolled_users) VALUES
        ($1,$4,$6,$7,$8,'scheduled','link1',ARRAY[$5]),
        ($2,$9,NULL,$10,$11,'scheduled',NULL,ARRAY[$5]),
        ($3,$4,$6,$12,$13,'scheduled',NULL,ARRAY[$5])`,
      [S1, S2, S3, C1, U1, T1, MAR15, MAR15_END, CDEL, JAN10, JAN10_END, MAR20, MAR20_END]);
    await query(
      `INSERT INTO attendances(id,schedule_id,user_id,status,remark,sync_status,export_batch_id,exported_at,created_at,updated_at) VALUES
        ($1,$6,$9,'P','r1','PENDING',NULL,NULL,$11,$11),
        ($2,$7,$9,'A','r2','PENDING',NULL,NULL,$11,$11),
        ($3,$8,$9,'P','','EXPORTED','B0',$12,$11,$11),
        ($4,$6,$10,'P','','PENDING',NULL,NULL,$11,$11),
        ($5,$13,$9,'P','','PENDING',NULL,NULL,$11,$11)`,
      [A1, A2, A3, A4, A5, S1, S2, S3, U1, UDEL, CREATED, EXPORTED_AT, SGONE]);
  }, 60_000);

  afterAll(async () => {
    if (mongoose.connection.readyState) await mongoose.disconnect();
    if (mem) await mem.stop();
    await closePool();
  });

  test('findExportRows (pending): joins/drops/omitted-keys/sort identical', async () => {
    const [m, p] = await both((r) => r.findExportRows({}));
    // A2 (Jan) then A1 (Mar); A4 dropped (soft-deleted user), A5 dropped (orphan schedule)
    expect(norm(m).map((r) => r._id)).toEqual([A2, A1]);
    expect(norm(p)).toEqual(norm(m)); // full row deep-equal, key-for-key
    const a2 = norm(m)[0];
    expect(a2.teamName).toBe('N/A');                     // team null → $ifNull
    expect('classCode' in a2).toBe(false);               // soft-deleted class → key omitted
    expect('exportedAt' in a2).toBe(false);              // PENDING → key omitted
    const a1 = norm(m)[1];
    expect(a1).toMatchObject({ classCode: 'C-1', courseName: 'Course One', teamName: 'Alpha', durationMinutes: 90, roomLink: 'link1' });
  });

  test('findExportRows (date range + includeExported): filter parity', async () => {
    const [mr, pr] = await both((r) => r.findExportRows({ from: FROM_MAR, to: TO_MAR }));
    expect(norm(mr).map((r) => r._id)).toEqual([A1]);
    expect(norm(pr)).toEqual(norm(mr));
    const [mi, pi] = await both((r) => r.findExportRows({ includeExported: true }));
    expect(norm(mi).map((r) => r._id)).toEqual([A2, A1, A3]); // Jan → Mar15 → Mar20
    expect(norm(pi)).toEqual(norm(mi));
    expect(norm(mi)[2].exportedAt).toBe(new Date(EXPORTED_AT).toISOString()); // EXPORTED keeps its stamp
  });

  test('findPendingIdsInRange: schedule join only (soft-deleted user KEPT, orphan dropped)', async () => {
    const [m, p] = await both((r) => r.findPendingIdsInRange({}));
    expect(sortStr(m)).toEqual(sortStr([A1, A2, A4]));
    expect(sortStr(p)).toEqual(sortStr([A1, A2, A4]));
    const [mr, pr] = await both((r) => r.findPendingIdsInRange({ from: FROM_MAR, to: TO_MAR }));
    expect(sortStr(mr)).toEqual(sortStr([A1, A4]));
    expect(sortStr(pr)).toEqual(sortStr([A1, A4]));
  });

  test('countExportablePending + countByStatus + lastExported + window: stats parity', async () => {
    const [m, p] = await both((r) => r.countExportablePending());
    expect(m).toBe(2); expect(p).toBe(2); // A1+A2 (A4 user-dropped, A5 orphan)
    const [ms, ps] = await both((r) => r.countByStatus('EXPORTED'));
    expect(ms).toBe(1); expect(ps).toBe(1);
    const [ml, pl] = await both((r) => r.findLastExported());
    expect(norm(ml).exportedAt).toBe(new Date(EXPORTED_AT).toISOString());
    expect(norm(pl).exportedAt).toBe(new Date(EXPORTED_AT).toISOString());
    const win = (r) => r.countExportedInWindow(new Date(new Date(EXPORTED_AT).getTime() - 1000), new Date(new Date(EXPORTED_AT).getTime() + 1000));
    const [mw, pw] = await both(win);
    expect(mw).toBe(1); expect(pw).toBe(1);
  });

  test('claimBatch → markExported: transitions + concurrent-loser parity (LAST — mutates)', async () => {
    // Claim A1 on each backend (each backend owns its own store).
    const [mc, pc] = await both((r) => r.claimBatch([A1], 'BX'));
    expect(mc.modifiedCount).toBe(1); expect(pc.modifiedCount).toBe(1);
    // The concurrent loser: A1 is no longer PENDING → claims 0.
    const [mc2, pc2] = await both((r) => r.claimBatch([A1], 'BY'));
    expect(mc2.modifiedCount).toBe(0); expect(pc2.modifiedCount).toBe(0);
    // Mark the claimed batch EXPORTED.
    const [mm, pm] = await both((r) => r.markExported('BX'));
    expect(mm.modifiedCount).toBe(1); expect(pm.modifiedCount).toBe(1);
    const [ms, ps] = await both((r) => r.countByStatus('EXPORTED'));
    expect(ms).toBe(2); expect(ps).toBe(2); // A3 + A1
  });
});
