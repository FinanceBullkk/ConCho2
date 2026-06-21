/**
 * ──────────────────────────────────────────────────────────
 * PG-parity test — org repository (Mongo ↔ Postgres)
 * ──────────────────────────────────────────────────────────
 * Whole-repository port: departments CRUD + manager hierarchy + dashboard
 * rollups. Runs only when a Postgres URL is present (CI sets PG_URL; locally
 * PG_PROTOTYPE_URL → Neon); SKIPS otherwise. Asserts identical behaviour + the
 * traps: department code UPPERCASE/partial-unique; soft-delete hides rows;
 * listDirectReports manager-scope + populate (soft-deleted dept → departmentId
 * null, legacy string kept) + excludes other-manager / soft-deleted reports;
 * aggregates filter by status / isDeleted.
 *
 * NOTE: Mongo aggregate() does NOT auto-cast ids → the aggregate calls pass
 * ObjectIds to the mongo impl and hex strings to the pg impl.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env.pg-prototype') });
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const PG_URL = process.env.PG_URL || process.env.PG_PROTOTYPE_URL;
const describePg = PG_URL ? describe : describe.skip;

const { query, closePool } = require('../../config/pg');
const orgRepo = require('../../domains/org/repository');

const hex = (n) => n.toString(16).padStart(24, '0');
const oid = (h) => new mongoose.Types.ObjectId(h);

// fixed ids (shared across backends so reads/aggregates line up)
const ENG = hex(201); const HR = hex(202); const OLD = hex(203);
const MGR = hex(301); const R1 = hex(302); const R2 = hex(303); const R3 = hex(304); const R4 = hex(305); const RX = hex(306);
const OTHER = hex(399);
const C1 = hex(401); const C2 = hex(402); const C3 = hex(403);
const P1 = hex(501); const P2 = hex(502); const P3 = hex(503);

const DEPTS = [
  { id: ENG, name: 'Engineering', code: 'ENG', deleted: false },
  { id: HR, name: 'Human Resources', code: 'HR', deleted: false },
  { id: OLD, name: 'Old Dept', code: 'OLD', deleted: true },
];
const USERS = [
  { id: MGR, name: 'Manager M', emp: 'M001', mgr: null, dept: null, deptStr: '', status: 'Active', pos: '', deleted: false },
  { id: R1, name: 'Alice', emp: 'A001', mgr: MGR, dept: ENG, deptStr: '', status: 'Active', pos: 'Dev', deleted: false },
  { id: R2, name: 'Bob', emp: 'B001', mgr: MGR, dept: HR, deptStr: '', status: 'Active', pos: '', deleted: false },
  { id: R3, name: 'Carol', emp: 'C001', mgr: MGR, dept: OLD, deptStr: 'LegacyDept', status: 'Active', pos: '', deleted: false },
  { id: R4, name: 'Dave', emp: 'D001', mgr: OTHER, dept: ENG, deptStr: '', status: 'Active', pos: '', deleted: false },
  { id: RX, name: 'Zoe', emp: 'Z001', mgr: MGR, dept: ENG, deptStr: '', status: 'Active', pos: '', deleted: true },
];
const ENROLL = [
  { id: hex(601), user: R1, cls: C1, status: 'Active' },
  { id: hex(602), user: R1, cls: C2, status: 'Completed' },
  { id: hex(603), user: R1, cls: C3, status: 'On-hold' },
  { id: hex(604), user: R1, cls: C1, status: 'Dropped' }, // non-participating → excluded
  { id: hex(605), user: R2, cls: C1, status: 'Active' },
];
const CERTS = [
  { id: hex(701), user: R1, prog: P1, status: 'Issued', deleted: false },
  { id: hex(702), user: R1, prog: P2, status: 'Issued', deleted: false },
  { id: hex(703), user: R1, prog: P1, status: 'Revoked', deleted: false }, // excluded
  { id: hex(704), user: R1, prog: P3, status: 'Issued', deleted: true }, // excluded (soft-deleted)
  { id: hex(705), user: R2, prog: P1, status: 'Issued', deleted: false },
];

const insertPg = async (table, cols, rows, toVals) => {
  if (!rows.length) return;
  const ph = rows.map((_, i) => `(${cols.map((__, j) => `$${i * cols.length + j + 1}`).join(',')})`).join(',');
  await query(`INSERT INTO ${table}(${cols.join(',')}) VALUES ${ph}`, rows.flatMap(toVals));
};

const normAgg = (rows) => rows
  .map((r) => ({ _id: String(r._id), count: r.count, programs: (r.programs || []).filter(Boolean).map(String).sort() }))
  .sort((a, b) => a._id.localeCompare(b._id));

describePg('PG-parity: org repository (departments + manager hierarchy + rollups)', () => {
  let mem;

  beforeAll(async () => {
    mem = await MongoMemoryServer.create();
    await mongoose.connect(mem.getUri());
    await mongoose.model('Department').init(); // partial-unique code index
    const db = mongoose.connection.db;

    await db.collection('departments').insertMany(DEPTS.map((d) => ({
      _id: oid(d.id), name: d.name, code: d.code, description: '', isDeleted: d.deleted,
    })));
    await db.collection('users').insertMany(USERS.map((u) => ({
      _id: oid(u.id), name: u.name, empCode: u.emp, email: `${u.emp}@x.io`, role: 'Participant',
      status: u.status, position: u.pos, department: u.deptStr,
      departmentId: u.dept ? oid(u.dept) : null, managerId: u.mgr ? oid(u.mgr) : null, isDeleted: u.deleted,
    })));
    await db.collection('enrollments').insertMany(ENROLL.map((e) => ({
      _id: oid(e.id), userId: oid(e.user), classId: oid(e.cls), status: e.status,
    })));
    await db.collection('certificates').insertMany(CERTS.map((c) => ({
      _id: oid(c.id), userId: oid(c.user), programId: oid(c.prog), status: c.status, isDeleted: c.deleted,
      certificateNumber: `CN-${c.id}`, // unique — the model has a unique index on certificateNumber
    })));

    await query('TRUNCATE departments, users, enrollments, certificates');
    await insertPg('departments', ['id', 'name', 'code', 'is_deleted'], DEPTS, (d) => [d.id, d.name, d.code, d.deleted]);
    await insertPg('users',
      ['id', 'name', 'emp_code', 'email', 'role', 'status', 'position', 'department', 'department_id', 'manager_id', 'is_deleted'],
      USERS, (u) => [u.id, u.name, u.emp, `${u.emp}@x.io`, 'Participant', u.status, u.pos, u.deptStr, u.dept, u.mgr, u.deleted]);
    await insertPg('enrollments', ['id', 'user_id', 'class_id', 'status'], ENROLL, (e) => [e.id, e.user, e.cls, e.status]);
    await insertPg('certificates', ['id', 'user_id', 'program_id', 'status', 'is_deleted'], CERTS, (c) => [c.id, c.user, c.prog, c.status, c.deleted]);
  }, 60_000);

  afterAll(async () => {
    if (mongoose.connection.readyState) await mongoose.disconnect();
    if (mem) await mem.stop();
    await closePool();
  });

  const both = (fn) => Promise.all([fn(orgRepo.impls.mongo), fn(orgRepo.impls.pg)]);
  const dproj = (d) => (d == null ? null : { name: d.name, code: d.code, description: d.description || '' });

  test('findDepartmentByIdLean: live → fields; soft-deleted → null (both)', async () => {
    const [m, p] = await both((r) => r.findDepartmentByIdLean(ENG));
    expect(dproj(m)).toEqual({ name: 'Engineering', code: 'ENG', description: '' });
    expect(dproj(p)).toEqual(dproj(m));
    const [md, pd] = await both((r) => r.findDepartmentByIdLean(OLD));
    expect(md).toBeNull();
    expect(pd).toBeNull();
  });

  test('listDepartments: live only, search, name order — identical', async () => {
    const [m, p] = await both((r) => r.listDepartments());
    expect(p.map(dproj)).toEqual(m.map(dproj)); // OLD excluded; ordered by name
    expect(m.map((d) => d.name)).toEqual(['Engineering', 'Human Resources']); // OLD soft-deleted excluded
    const [ms, ps] = await both((r) => r.listDepartments({ search: 'eng' }));
    expect(ps.map(dproj)).toEqual(ms.map(dproj));
    expect(ms.map((d) => d.code)).toEqual(['ENG']);
  });

  test('createDepartment: code UPPERCASE + trim, identical; partial-unique among LIVE + reusable after soft-delete', async () => {
    const [m, p] = await both((r) => r.createDepartment({ name: '  Sales ', code: 'sl', description: ' x ' }));
    expect(dproj(m)).toEqual({ name: 'Sales', code: 'SL', description: 'x' });
    expect(dproj(p)).toEqual(dproj(m));

    // duplicate LIVE code rejected on both
    await expect(orgRepo.impls.mongo.createDepartment({ name: 'Sales2', code: 'SL' })).rejects.toBeDefined();
    await expect(orgRepo.impls.pg.createDepartment({ name: 'Sales2', code: 'SL' })).rejects.toBeDefined();

    // soft-delete then reuse the code on both
    await Promise.all([
      orgRepo.impls.mongo.softDeleteDepartment(m._id),
      orgRepo.impls.pg.softDeleteDepartment(p._id),
    ]);
    expect(await orgRepo.impls.mongo.findDepartmentByIdLean(m._id)).toBeNull();
    expect(await orgRepo.impls.pg.findDepartmentByIdLean(p._id)).toBeNull();
    const [m2, p2] = await both((r) => r.createDepartment({ name: 'Sales3', code: 'SL' }));
    expect(dproj(m2).code).toBe('SL');
    expect(dproj(p2).code).toBe('SL');
  });

  test('updateDepartmentById normalizes code — identical', async () => {
    const upd = await Promise.all([
      orgRepo.impls.mongo.updateDepartmentById(ENG, { description: 'eng dept', code: 'eng' }),
      orgRepo.impls.pg.updateDepartmentById(ENG, { description: 'eng dept', code: 'eng' }),
    ]);
    expect(dproj(upd[0])).toEqual({ name: 'Engineering', code: 'ENG', description: 'eng dept' });
    expect(dproj(upd[1])).toEqual(dproj(upd[0]));
  });

  test('countUsersInDepartment: only LIVE users — identical', async () => {
    const [m, p] = await both((r) => r.countUsersInDepartment(ENG)); // R1 + R4 live (RX soft-deleted excluded)
    expect(m).toBe(2);
    expect(p).toBe(2);
  });

  test('findUserByIdLean: live → managerId/departmentId; soft-deleted → null (both)', async () => {
    const [m, p] = await both((r) => r.findUserByIdLean(R1));
    expect(String(m.managerId)).toBe(MGR);
    expect(String(m.departmentId)).toBe(ENG);
    expect({ managerId: String(p.managerId), departmentId: String(p.departmentId) })
      .toEqual({ managerId: MGR, departmentId: ENG });
    const [mx, px] = await both((r) => r.findUserByIdLean(RX));
    expect(mx).toBeNull();
    expect(px).toBeNull();
  });

  test('updateUserAssignment: set + null managerId/departmentId — identical', async () => {
    const upd = await Promise.all([
      orgRepo.impls.mongo.updateUserAssignment(R2, { managerId: null, departmentId: ENG }),
      orgRepo.impls.pg.updateUserAssignment(R2, { managerId: null, departmentId: ENG }),
    ]);
    expect({ m: upd[0].managerId, d: String(upd[0].departmentId) }).toEqual({ m: null, d: ENG });
    expect({ m: upd[1].managerId, d: String(upd[1].departmentId) }).toEqual({ m: null, d: ENG });
    // restore R2 for the listDirectReports test
    await Promise.all([
      orgRepo.impls.mongo.updateUserAssignment(R2, { managerId: MGR, departmentId: HR }),
      orgRepo.impls.pg.updateUserAssignment(R2, { managerId: MGR, departmentId: HR }),
    ]);
  });

  test('listDirectReports: manager-scope + populate (soft-deleted dept → null + legacy string) + order — identical', async () => {
    const rproj = (u) => ({
      name: u.name, empCode: u.empCode, status: u.status, department: u.department || null,
      departmentId: u.departmentId ? { _id: String(u.departmentId._id), name: u.departmentId.name, code: u.departmentId.code } : null,
    });
    const [m, p] = await both((r) => r.listDirectReports(MGR));
    expect(m.map((u) => u.name)).toEqual(['Alice', 'Bob', 'Carol']); // ordered; R4/RX excluded
    expect(p.map(rproj)).toEqual(m.map(rproj));
    const carol = p.find((u) => u.name === 'Carol');
    expect(carol.departmentId).toBeNull();          // OLD dept soft-deleted → populate null
    expect(carol.department).toBe('LegacyDept');     // legacy string fallback kept
    const alice = p.find((u) => u.name === 'Alice');
    expect(alice.departmentId).toEqual({ _id: ENG, name: 'Engineering', code: 'ENG' });
  });

  test('aggregateActiveEnrollments: participating statuses only, distinct programs — identical', async () => {
    const m = await orgRepo.impls.mongo.aggregateActiveEnrollments([oid(R1), oid(R2)]);
    const p = await orgRepo.impls.pg.aggregateActiveEnrollments([R1, R2]);
    expect(normAgg(p)).toEqual(normAgg(m));
    const r1 = normAgg(m).find((x) => x._id === R1);
    expect(r1.count).toBe(3); // Active+Completed+On-hold (Dropped excluded)
    expect(r1.programs).toEqual([C1, C2, C3].sort());
  });

  test('aggregateIssuedCertificates: Issued + not-deleted only, distinct programs — identical', async () => {
    const m = await orgRepo.impls.mongo.aggregateIssuedCertificates([oid(R1), oid(R2)]);
    const p = await orgRepo.impls.pg.aggregateIssuedCertificates([R1, R2]);
    expect(normAgg(p)).toEqual(normAgg(m));
    const r1 = normAgg(m).find((x) => x._id === R1);
    expect(r1.count).toBe(2); // P1 + P2 (Revoked + soft-deleted excluded)
    expect(r1.programs).toEqual([P1, P2].sort());
  });
});
