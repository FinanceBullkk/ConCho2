/**
 * ──────────────────────────────────────────────────────────
 * PG-parity test — user-list repository (getUsers list read, Mongo ↔ Postgres)
 * ──────────────────────────────────────────────────────────
 * The admin GET /api/users read ported to follow DB_BACKEND (Wave-G). Runs only
 * when a Postgres URL is present (CI pg-parity sets PG_URL); SKIPS otherwise.
 * Drives listUsers/countUsers on BOTH backends over the same seeded workforce and
 * asserts identical observable results + the read's traps:
 *   • soft-deleted users are excluded (find-hook ↔ is_deleted=false predicate);
 *   • role/status exact-match, department + free-text search = case-insensitive
 *     CONTAINS (Mongo escaped regex ↔ literal ILIKE);
 *   • text sort is BYTE order (COLLATE "C") to match Mongo binary, NOT PG locale
 *     — a lowercase name must sort AFTER the uppercase ones on both;
 *   • lastActive sort places nulls last on DESC; pagination is deterministic.
 * Backend-generated timestamps are ignored — business fields are compared.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env.pg-prototype') });
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const PG_URL = process.env.PG_URL || process.env.PG_PROTOTYPE_URL;
const describePg = PG_URL ? describe : describe.skip;

const { query, closePool } = require('../../config/pg');
const listRepo = require('../../controllers/user/user-list-repository');

const hex = (n) => n.toString(16).padStart(24, '0');

// `alice` is intentionally lowercase: byte order (COLLATE "C" ↔ Mongo binary)
// sorts it AFTER the capitalised names, PG locale collation would not.
const USERS = [
  { _id: hex(1), empCode: '000001', name: 'alice admin', role: 'Admin', status: 'Active', department: 'HR', lastActiveAt: new Date('2026-01-03T00:00:00.000Z') },
  { _id: hex(2), empCode: '000002', name: 'Bob Teacher', role: 'Teacher', status: 'Active', department: 'Sales', lastActiveAt: new Date('2026-01-05T00:00:00.000Z') },
  { _id: hex(3), empCode: '000003', name: 'Carol Part', role: 'Participant', status: 'Inactive', department: 'HR', lastActiveAt: null },
  { _id: hex(4), empCode: '000004', name: 'Dan Part', role: 'Participant', status: 'Active', department: 'Eng', lastActiveAt: new Date('2026-01-01T00:00:00.000Z') },
  { _id: hex(5), empCode: '000005', name: 'Eve Gone', role: 'Participant', status: 'Active', department: 'HR', lastActiveAt: null, isDeleted: true },
];

// Business projection — ignores backend id representation / timestamps.
const proj = (r) => ({
  empCode: r.empCode, name: r.name, role: r.role, status: r.status, department: r.department,
  lastActiveAt: r.lastActiveAt == null ? null : new Date(r.lastActiveAt).toISOString(),
});
const seq = (rows) => rows.map(proj);
const codes = (rows) => rows.map((r) => r.empCode);
const both = (fn) => Promise.all([fn(listRepo.impls.mongo), fn(listRepo.impls.pg)]);

const base = { sortField: 'empCode', sortOrder: 1, skip: 0, limit: 50 };

describePg('PG-parity: user-list repository (getUsers list read)', () => {
  let mem;

  beforeAll(async () => {
    mem = await MongoMemoryServer.create();
    await mongoose.connect(mem.getUri());
    await mongoose.model('User').init();
    const db = mongoose.connection.db;
    await db.collection('users').insertMany(USERS.map((u) => ({
      _id: new mongoose.Types.ObjectId(u._id),
      empCode: u.empCode, name: u.name, role: u.role, status: u.status,
      department: u.department, position: '', lastActiveAt: u.lastActiveAt,
      isDeleted: !!u.isDeleted, password: 'seed-password',
    })));

    await query('TRUNCATE users');
    for (const u of USERS) {
      // eslint-disable-next-line no-await-in-loop
      await query(
        `INSERT INTO users(id, emp_code, name, role, status, department, position, last_active_at, is_deleted, password)
         VALUES ($1,$2,$3,$4,$5,$6,'',$7,$8,'seed-password')`,
        [u._id, u.empCode, u.name, u.role, u.status, u.department,
          u.lastActiveAt ? u.lastActiveAt.toISOString() : null, !!u.isDeleted],
      );
    }
  }, 60_000);

  afterAll(async () => {
    if (mongoose.connection.readyState) await mongoose.disconnect();
    if (mem) await mem.stop();
    await closePool();
  });

  test('lists LIVE users only (soft-deleted excluded) — identical sequence', async () => {
    const [m, p] = await both((r) => r.listUsers(base));
    expect(seq(p)).toEqual(seq(m));
    expect(codes(m)).not.toContain('000005'); // Eve soft-deleted
  });

  test('countUsers excludes soft-deleted — identical', async () => {
    const [m, p] = await both((r) => r.countUsers({}));
    expect(m).toBe(4);
    expect(p).toBe(4);
  });

  test('filter by role — identical', async () => {
    const [m, p] = await both((r) => r.listUsers({ ...base, role: 'Participant' }));
    expect(seq(p)).toEqual(seq(m));
    expect(codes(m)).toEqual(['000003', '000004']);
  });

  test('filter by status — identical', async () => {
    const [m, p] = await both((r) => r.listUsers({ ...base, status: 'Active' }));
    expect(seq(p)).toEqual(seq(m));
  });

  test('department + free-text search are case-insensitive CONTAINS — identical', async () => {
    const [md, pd] = await both((r) => r.listUsers({ ...base, department: 'hr' }));
    expect(seq(pd)).toEqual(seq(md));
    expect(codes(md)).toEqual(['000001', '000003']);

    const [ms, ps] = await both((r) => r.listUsers({ ...base, search: 'part' }));
    expect(seq(ps)).toEqual(seq(ms));
    expect(codes(ms)).toEqual(['000003', '000004']);
  });

  test('sort by name is BYTE order (lowercase last), not locale — identical', async () => {
    const [m, p] = await both((r) => r.listUsers({ ...base, sortField: 'name', sortOrder: 1 }));
    expect(seq(p)).toEqual(seq(m));
    // Bob/Carol/Dan (capitalised) precede alice (lowercase) in byte order.
    expect(codes(m)).toEqual(['000002', '000003', '000004', '000001']);
  });

  test('sort by lastActive DESC places nulls last — identical', async () => {
    const [m, p] = await both((r) => r.listUsers({ ...base, sortField: 'lastActiveAt', sortOrder: -1 }));
    expect(seq(p)).toEqual(seq(m));
    expect(codes(m)).toEqual(['000002', '000001', '000004', '000003']); // Bob, alice, Dan, Carol(null)
  });

  test('pagination (skip/limit) — identical page', async () => {
    const [m, p] = await both((r) => r.listUsers({ ...base, skip: 1, limit: 2 }));
    expect(seq(p)).toEqual(seq(m));
    expect(codes(m)).toEqual(['000002', '000003']);
  });
});
