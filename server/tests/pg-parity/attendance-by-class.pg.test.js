/**
 * ──────────────────────────────────────────────────────────
 * PG-parity test — per-class attendance roster (Mongo ↔ Postgres)
 * ──────────────────────────────────────────────────────────
 * Runs only when a Postgres URL is present (CI pg-parity job sets PG_URL;
 * locally PG_PROTOTYPE_URL → Neon). SKIPS otherwise. Proves the per-class
 * roster (schedule list + per-employee session matrix + rate) is identical on
 * both backends, AND the three traps hold on BOTH sides:
 *   • a soft-deleted user's attendance drops out (User pre('find') hook ⇔ SQL
 *     JOIN … is_deleted = false);
 *   • a cancelled session is excluded (status='scheduled' filter);
 *   • another class's session is excluded (class_id filter / JOIN).
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env.pg-prototype') });
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const PG_URL = process.env.PG_URL || process.env.PG_PROTOTYPE_URL;
const describePg = PG_URL ? describe : describe.skip;

const { query, closePool } = require('../../config/pg');
const classRollup = require('../../services/attendance-by-class');

const K = 8;   // classA live sessions
const N = 50;  // users
const ST = ['P', 'P', 'P', 'A', 'L', 'EL'];
const hex = (n) => n.toString(16).padStart(24, '0');

const CLASS_A = hex(1);
const CLASS_B = hex(2);
const SC = hex(1999);  // cancelled session in classA (trap)
const SB = hex(2001);  // scheduled session in classB (trap)

describePg('PG-parity: per-class attendance roster (+ soft-delete / cancelled / other-class traps)', () => {
  let mem;
  let mongo;
  let pg;

  // ── shared fixture ───────────────────────────────────────
  const sessions = Array.from({ length: K }, (_, i) => ({
    id: hex(1001 + i), start: Date.UTC(2026, 0, 1 + i, 10), end: Date.UTC(2026, 0, 1 + i, 11),
  }));
  const users = Array.from({ length: N }, (_, i) => ({ idx: i, id: hex(3001 + i), deleted: i % 7 === 0 }));

  const attendance = [];
  let aid = 4000;
  for (const u of users) {
    for (let j = 0; j < K; j += 1) {
      if ((u.idx + j) % 3 === 0) continue; // skip some → varied totals/rates
      attendance.push({ id: hex(aid += 1), user: u.id, sched: sessions[j].id, status: ST[(u.idx + j) % ST.length] });
    }
  }
  // traps (active users, but on excluded sessions): cancelled + other-class
  attendance.push({ id: hex(aid += 1), user: users[1].id, sched: SC, status: 'P' });
  attendance.push({ id: hex(aid += 1), user: users[2].id, sched: SB, status: 'A' });

  // schedules: K live in classA + 1 cancelled in classA + 1 live in classB
  const schedules = [
    ...sessions.map((s) => ({ id: s.id, classId: CLASS_A, start: s.start, end: s.end, status: 'scheduled' })),
    { id: SC, classId: CLASS_A, start: Date.UTC(2026, 0, 20, 13), end: Date.UTC(2026, 0, 20, 14), status: 'cancelled' },
    { id: SB, classId: CLASS_B, start: Date.UTC(2026, 0, 1, 10), end: Date.UTC(2026, 0, 1, 11), status: 'scheduled' },
  ];

  beforeAll(async () => {
    mem = await MongoMemoryServer.create();
    await mongoose.connect(mem.getUri());
    const db = mongoose.connection.db;
    await db.collection('users').insertMany(users.map((u) => ({
      _id: new mongoose.Types.ObjectId(u.id), empCode: `E${String(u.idx).padStart(4, '0')}`,
      email: `e${u.idx}@example.io`, name: `Emp ${u.idx}`, department: 'Eng', isDeleted: u.deleted,
    })));
    await db.collection('schedules').insertMany(schedules.map((s) => ({
      _id: new mongoose.Types.ObjectId(s.id), classId: new mongoose.Types.ObjectId(s.classId),
      startTime: new Date(s.start), endTime: new Date(s.end), status: s.status,
    })));
    await db.collection('attendances').insertMany(attendance.map((a) => ({
      _id: new mongoose.Types.ObjectId(a.id), userId: new mongoose.Types.ObjectId(a.user),
      scheduleId: new mongoose.Types.ObjectId(a.sched), status: a.status,
    })));
    mongo = await classRollup.impls.mongo.getClassAttendance(CLASS_A);

    await query('TRUNCATE users, schedules, attendances');
    await query(
      `INSERT INTO users(id,emp_code,email,name,department,is_deleted) VALUES ${users.map((_, j) => `($${j * 6 + 1},$${j * 6 + 2},$${j * 6 + 3},$${j * 6 + 4},$${j * 6 + 5},$${j * 6 + 6})`).join(',')}`,
      users.flatMap((u) => [u.id, `E${String(u.idx).padStart(4, '0')}`, `e${u.idx}@example.io`, `Emp ${u.idx}`, 'Eng', u.deleted]),
    );
    await query(
      `INSERT INTO schedules(id,class_id,start_time,end_time,status) VALUES ${schedules.map((_, j) => `($${j * 5 + 1},$${j * 5 + 2},$${j * 5 + 3},$${j * 5 + 4},$${j * 5 + 5})`).join(',')}`,
      schedules.flatMap((s) => [s.id, s.classId, new Date(s.start).toISOString(), new Date(s.end).toISOString(), s.status]),
    );
    await query(
      `INSERT INTO attendances(id,user_id,schedule_id,status) VALUES ${attendance.map((_, j) => `($${j * 4 + 1},$${j * 4 + 2},$${j * 4 + 3},$${j * 4 + 4})`).join(',')}`,
      attendance.flatMap((a) => [a.id, a.user, a.sched, a.status]),
    );
    pg = await classRollup.impls.pg.getClassAttendance(CLASS_A);
  }, 60_000);

  afterAll(async () => {
    if (mongoose.connection.readyState) await mongoose.disconnect();
    if (mem) await mem.stop();
    await closePool();
  });

  test('schedule list identical (only classA live sessions, ordered)', () => {
    expect(pg.schedules).toEqual(mongo.schedules);
    expect(mongo.schedules.map((s) => s.id)).toEqual(sessions.map((s) => s.id)); // SC + SB excluded, ordered
  });

  test('per-employee roster identical across Mongo and Postgres', () => {
    const byCode = (rows) => Object.fromEntries(rows.map((r) => [r.empCode, r]));
    const m = byCode(mongo.roster);
    const p = byCode(pg.roster);
    expect(Object.keys(p).sort()).toEqual(Object.keys(m).sort());
    for (const code of Object.keys(m)) {
      expect(p[code]).toMatchObject({
        total: m[code].total, present: m[code].present, rate: m[code].rate, sessions: m[code].sessions,
      });
    }
  });

  test('all three traps hold on BOTH backends', () => {
    const deletedCodes = users.filter((u) => u.deleted).map((u) => `E${String(u.idx).padStart(4, '0')}`);
    const mCodes = new Set(mongo.roster.map((r) => r.empCode));
    const pCodes = new Set(pg.roster.map((r) => r.empCode));
    for (const code of deletedCodes) {        // soft-deleted users excluded
      expect(mCodes.has(code)).toBe(false);
      expect(pCodes.has(code)).toBe(false);
    }
    // cancelled (SC) + other-class (SB) sessions never surface in any sessions map
    const liveIds = new Set(sessions.map((s) => s.id));
    for (const roster of [mongo.roster, pg.roster]) {
      for (const r of roster) {
        for (const sid of Object.keys(r.sessions)) expect(liveIds.has(sid)).toBe(true);
      }
    }
  });
});
