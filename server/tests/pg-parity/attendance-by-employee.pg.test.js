/**
 * ──────────────────────────────────────────────────────────
 * PG-parity test — per-employee attendance rollup (Mongo ↔ Postgres)
 * ──────────────────────────────────────────────────────────
 * Runs only when a Postgres URL is present (CI pg-parity job sets PG_URL;
 * locally PG_PROTOTYPE_URL → Neon). SKIPS otherwise. Also exercises the
 * soft-delete trap: a fraction of users are is_deleted — their attendance MUST
 * drop out of BOTH backends (Mongo $lookup-isDeleted ⇔ SQL JOIN … is_deleted=false).
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env.pg-prototype') });
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const PG_URL = process.env.PG_URL || process.env.PG_PROTOTYPE_URL;
const describePg = PG_URL ? describe : describe.skip;

const { query, closePool } = require('../../config/pg');
const empRollup = require('../../services/attendance-by-employee');

const USERS = 200, ATTENDANCE = 5_000, BATCH = 1_000;
const ST = ['P', 'P', 'P', 'A', 'L', 'EL'];
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const hex = (n) => n.toString(16).padStart(24, '0');
const oid = (n) => new mongoose.Types.ObjectId(hex(n));

describePg('PG-parity: per-employee attendance rollup (+ soft-delete trap)', () => {
  let mem;
  let mongo;
  let pg;

  beforeAll(async () => {
    const users = Array.from({ length: USERS }, (_, i) => ({ idx: i, isDeleted: i % 5 === 0 })); // 20% deleted
    const attendance = Array.from({ length: ATTENDANCE }, (_, i) => ({ idx: i, userIdx: Math.floor(Math.random() * USERS), status: pick(ST) }));

    // Deterministic rounding guard: a user with EXACTLY a .x5 rate (1 present /
    // 16 total = 6.25%). Mongo $round and PG round(double) both go half-to-even
    // → 6.2; a naive JS Math.round would give 6.3. Pins the banker's-round fix.
    const tieIdx = USERS; // fresh active user, outside the random pool
    users.push({ idx: tieIdx, isDeleted: false });
    for (let k = 0; k < 16; k += 1) {
      attendance.push({ idx: ATTENDANCE + k, userIdx: tieIdx, status: k === 0 ? 'P' : 'A' });
    }

    mem = await MongoMemoryServer.create();
    await mongoose.connect(mem.getUri());
    const db = mongoose.connection.db;
    await db.collection('users').insertMany(users.map((u) => ({
      _id: oid(u.idx), empCode: `E${String(u.idx).padStart(4, '0')}`, email: `e${u.idx}@example.io`,
      name: `Emp ${u.idx}`, department: 'Eng', isDeleted: u.isDeleted,
    })));
    for (let i = 0; i < attendance.length; i += BATCH) {
      // eslint-disable-next-line no-await-in-loop
      await db.collection('attendances').insertMany(attendance.slice(i, i + BATCH).map((a) => ({
        _id: oid(2_000_000 + a.idx), userId: oid(a.userIdx), scheduleId: oid(4_000_000 + a.idx), status: a.status,
      })));
    }
    mongo = await empRollup.impls.mongo.getEmployeeAttendanceRollup();

    await query('TRUNCATE users, attendances');
    await query(
      `INSERT INTO users(id,emp_code,email,name,department,is_deleted) VALUES ${users.map((_, j) => `($${j * 6 + 1},$${j * 6 + 2},$${j * 6 + 3},$${j * 6 + 4},$${j * 6 + 5},$${j * 6 + 6})`).join(',')}`,
      users.flatMap((u) => [hex(u.idx), `E${String(u.idx).padStart(4, '0')}`, `e${u.idx}@example.io`, `Emp ${u.idx}`, 'Eng', u.isDeleted]),
    );
    for (let i = 0; i < attendance.length; i += BATCH) {
      const chunk = attendance.slice(i, i + BATCH);
      // eslint-disable-next-line no-await-in-loop
      await query(
        `INSERT INTO attendances(id,user_id,schedule_id,status) VALUES ${chunk.map((_, j) => `($${j * 4 + 1},$${j * 4 + 2},$${j * 4 + 3},$${j * 4 + 4})`).join(',')}`,
        chunk.flatMap((a) => [hex(3_000_000 + a.idx), hex(a.userIdx), hex(4_000_000 + a.idx), a.status]),
      );
    }
    pg = await empRollup.impls.pg.getEmployeeAttendanceRollup();
  }, 60_000);

  afterAll(async () => {
    if (mongoose.connection.readyState) await mongoose.disconnect();
    if (mem) await mem.stop();
    await closePool();
  });

  test('per-employee stats identical across Mongo and Postgres', () => {
    const byCode = (rows) => Object.fromEntries(rows.map((r) => [r.empCode, r]));
    const m = byCode(mongo);
    const p = byCode(pg);
    expect(Object.keys(p).sort()).toEqual(Object.keys(m).sort());
    for (const code of Object.keys(m)) {
      expect(p[code]).toMatchObject({
        total: m[code].total, present: m[code].present, absent: m[code].absent,
        late: m[code].late, excused: m[code].excused, rate: m[code].rate,
      });
    }
  });

  test('soft-deleted employees are excluded from BOTH backends', () => {
    const deletedCodes = Array.from({ length: USERS }, (_, i) => i).filter((i) => i % 5 === 0)
      .map((i) => `E${String(i).padStart(4, '0')}`);
    const mCodes = new Set(mongo.map((r) => r.empCode));
    const pCodes = new Set(pg.map((r) => r.empCode));
    for (const code of deletedCodes) {
      expect(mCodes.has(code)).toBe(false);
      expect(pCodes.has(code)).toBe(false);
    }
  });
});
