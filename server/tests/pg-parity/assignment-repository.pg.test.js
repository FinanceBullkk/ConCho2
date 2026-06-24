/**
 * ──────────────────────────────────────────────────────────
 * PG-parity test — learning/assignment repository (Mongo ↔ Postgres)
 * ──────────────────────────────────────────────────────────
 * Required-training assignments with the multi-target populate. Runs only when a
 * Postgres URL is present; SKIPS otherwise. Pins the trap-prone behaviours:
 *   • create → populated program/path + ORDERED userIds/departmentIds embed that
 *     DROPS soft-deleted refs (User/Department find-hooks) while keeping array order;
 *   • list default status + dueDate order + targetType filter;
 *   • findProgram/findPath status {$ne:'archived'} incl. NULL status (IS DISTINCT FROM);
 *   • countUsers/countDepartments exclude soft-deleted;
 *   • findAssignableUsers: dept|user OR, assignable-status filter, name binary order;
 *   • findActiveAssignmentsForUser: direct-user vs department branch;
 *   • findOpenSelfEnrollCohort: self_enroll gate; findParticipatingUserIdsForProgram set;
 *   • archive hides + archives + returns the populated archived doc.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env.pg-prototype') });
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const PG_URL = process.env.PG_URL || process.env.PG_PROTOTYPE_URL;
const describePg = PG_URL ? describe : describe.skip;

const { query, closePool } = require('../../config/pg');
const repo = require('../../domains/learning/assignment/repository'); // registers all referenced models

const hex = (n) => n.toString(16).padStart(24, '0');
const oid = (h) => new mongoose.Types.ObjectId(h);
const coll = (m) => mongoose.model(m).collection.name;
const norm = (x) => (x == null ? null : JSON.parse(JSON.stringify(x)));
const both = (fn) => Promise.all([fn(repo.impls.mongo), fn(repo.impls.pg)]);
const aid = (r, mId, pId) => (r === repo.impls.pg ? pId : mId);

// Seed ids (shared hex across both backends; Mongo casts hex → ObjectId).
const PSELF = hex(601); const PADMIN = hex(602); const PARCH = hex(603); const PNULL = hex(604);
const PATH1 = hex(611); const PATHARCH = hex(612);
const DENG = hex(621); const DDEL = hex(622);
const U1 = hex(631); const U2 = hex(632); const U3 = hex(633); const U4 = hex(634); const UDEL = hex(635);
const CSELF = hex(641); const CADMIN = hex(642);
const EN1 = hex(651); const EN2 = hex(652); const EN3 = hex(653);
const D1 = '2026-09-01T00:00:00.000Z'; const D2 = '2026-10-01T00:00:00.000Z';

// Assignment projection (stable subset compared across backends).
const pa = (raw) => { const x = norm(raw); return x == null ? null : {
  title: x.title, status: x.status, targetType: x.targetType,
  program: x.programId ? { code: x.programId.code, name: x.programId.name, category: x.programId.category, status: x.programId.status } : null,
  path: x.pathId ? { code: x.pathId.code, title: x.pathId.title, programs: x.pathId.programs } : null,
  users: (x.userIds || []).map((u) => u.empCode),
  depts: (x.departmentIds || []).map((d) => d.code),
}; };
const sorted = (set) => [...set].sort();

describePg('PG-parity: learning/assignment repository', () => {
  let mem;
  const id = {};

  beforeAll(async () => {
    mem = await MongoMemoryServer.create();
    await mongoose.connect(mem.getUri());
    const db = mongoose.connection.db;

    // ── Mongo seed (raw inserts; refs stored as ObjectIds so Mongoose matches) ──
    await db.collection(coll('LearningProgram')).insertMany([
      { _id: oid(PSELF), code: 'P-SELF', name: 'Self Prog', category: 'technical', status: 'active', schedulingMode: 'self_enroll' },
      { _id: oid(PADMIN), code: 'P-ADMIN', name: 'Admin Prog', category: 'onboarding', status: 'active', schedulingMode: 'admin_scheduled' },
      { _id: oid(PARCH), code: 'P-ARCH', name: 'Arch Prog', category: 'compliance', status: 'archived', schedulingMode: 'self_enroll' },
      { _id: oid(PNULL), code: 'P-NULL', name: 'Null Prog', category: 'other', schedulingMode: 'self_enroll' }, // no status
    ]);
    await db.collection(coll('LearningPath')).insertMany([
      { _id: oid(PATH1), code: 'PATH-1', title: 'Path One', status: 'active', programs: [oid(PSELF), oid(PADMIN)], isDeleted: false },
      { _id: oid(PATHARCH), code: 'PATH-ARCH', title: 'Path Arch', status: 'archived', programs: [oid(PSELF)], isDeleted: false },
    ]);
    await db.collection(coll('Department')).insertMany([
      { _id: oid(DENG), code: 'ENG', name: 'Engineering', isDeleted: false },
      { _id: oid(DDEL), code: 'DEL', name: 'Deleted Dept', isDeleted: true },
    ]);
    await db.collection(coll('User')).insertMany([
      { _id: oid(U1), empCode: 'E1', name: 'Alice', email: 'alice@x.io', department: 'Eng', departmentId: oid(DENG), status: 'Active', isDeleted: false },
      { _id: oid(U2), empCode: 'E2', name: 'Bob', email: 'bob@x.io', department: 'Eng', departmentId: oid(DENG), status: 'On-hold', isDeleted: false },
      { _id: oid(U3), empCode: 'E3', name: 'Carol', email: 'carol@x.io', department: 'Eng', departmentId: oid(DENG), status: 'Waiting for class', isDeleted: false },
      { _id: oid(U4), empCode: 'E4', name: 'Dave', email: 'dave@x.io', department: 'Eng', departmentId: oid(DENG), status: 'Inactive', isDeleted: false },
      { _id: oid(UDEL), empCode: 'E5', name: 'Eve', email: 'eve@x.io', department: 'Eng', departmentId: oid(DENG), status: 'Active', isDeleted: true },
    ]);
    await db.collection(coll('Class')).insertMany([
      { _id: oid(CSELF), classCode: 'C-SELF', courseName: 'CourseSelf', programId: oid(PSELF), status: 'Ongoing', isDeleted: false },
      { _id: oid(CADMIN), classCode: 'C-ADMIN', courseName: 'CourseAdmin', programId: oid(PADMIN), status: 'Ongoing', isDeleted: false },
    ]);
    await db.collection(coll('Enrollment')).insertMany([
      { _id: oid(EN1), userId: oid(U1), classId: oid(CSELF), status: 'Active' },
      { _id: oid(EN2), userId: oid(U2), classId: oid(CSELF), status: 'Dropped' },
      { _id: oid(EN3), userId: oid(U3), classId: oid(CSELF), status: 'Completed' },
    ]);

    // ── PG seed (text ids; text[] for path programs) ──
    await query('TRUNCATE assignments, learning_programs, learning_paths, departments, users, classes, enrollments');
    await query(
      `INSERT INTO learning_programs(id,code,name,category,status,scheduling_mode) VALUES
        ($1,'P-SELF','Self Prog','technical','active','self_enroll'),
        ($2,'P-ADMIN','Admin Prog','onboarding','active','admin_scheduled'),
        ($3,'P-ARCH','Arch Prog','compliance','archived','self_enroll'),
        ($4,'P-NULL','Null Prog','other',NULL,'self_enroll')`,
      [PSELF, PADMIN, PARCH, PNULL]);
    await query(
      `INSERT INTO learning_paths(id,code,title,status,programs,is_deleted) VALUES
        ($1,'PATH-1','Path One','active',ARRAY[$3,$4]::text[],false),
        ($2,'PATH-ARCH','Path Arch','archived',ARRAY[$3]::text[],false)`,
      [PATH1, PATHARCH, PSELF, PADMIN]);
    await query(
      `INSERT INTO departments(id,code,name,is_deleted) VALUES
        ($1,'ENG','Engineering',false),($2,'DEL','Deleted Dept',true)`,
      [DENG, DDEL]);
    await query(
      `INSERT INTO users(id,emp_code,name,email,department,department_id,status,is_deleted) VALUES
        ($1,'E1','Alice','alice@x.io','Eng',$6,'Active',false),
        ($2,'E2','Bob','bob@x.io','Eng',$6,'On-hold',false),
        ($3,'E3','Carol','carol@x.io','Eng',$6,'Waiting for class',false),
        ($4,'E4','Dave','dave@x.io','Eng',$6,'Inactive',false),
        ($5,'E5','Eve','eve@x.io','Eng',$6,'Active',true)`,
      [U1, U2, U3, U4, UDEL, DENG]);
    await query(
      `INSERT INTO classes(id,class_code,course_name,program_id,status,is_deleted) VALUES
        ($1,'C-SELF','CourseSelf',$3,'Ongoing',false),
        ($2,'C-ADMIN','CourseAdmin',$4,'Ongoing',false)`,
      [CSELF, CADMIN, PSELF, PADMIN]);
    await query(
      `INSERT INTO enrollments(id,user_id,class_id,status) VALUES
        ($1,$4,$7,'Active'),($2,$5,$7,'Dropped'),($3,$6,$7,'Completed')`,
      [EN1, EN2, EN3, U1, U2, U3, CSELF]);

    // Create assignments via BOTH repos (the unit under test).
    // A1: program target, userIds [U1, UDEL(deleted), U2] (drop UDEL, keep order),
    //     departments [DENG, DDEL(deleted)] (drop DDEL).
    const [ma1, pa1] = await both((r) => r.create({
      title: 'Security Basics', targetType: 'program', programId: PSELF,
      dueDate: D1, userIds: [U1, UDEL, U2], departmentIds: [DENG, DDEL],
    }));
    // A2: path target, userIds [U3], later dueDate.
    const [ma2, pa2] = await both((r) => r.create({
      title: 'Onboarding Path', targetType: 'path', pathId: PATH1,
      dueDate: D2, userIds: [U3], departmentIds: [],
    }));
    id.m_a1 = ma1._id; id.p_a1 = pa1._id; id.m_a2 = ma2._id; id.p_a2 = pa2._id;
  }, 60_000);

  afterAll(async () => {
    if (mongoose.connection.readyState) await mongoose.disconnect();
    if (mem) await mem.stop();
    await closePool();
  });

  test('create + findById: program populate + ORDERED userIds (deleted dropped) + departments', async () => {
    const [m, p] = await both((r) => r.findById(aid(r, id.m_a1, id.p_a1)));
    expect(pa(m)).toEqual({
      title: 'Security Basics', status: 'active', targetType: 'program',
      program: { code: 'P-SELF', name: 'Self Prog', category: 'technical', status: 'active' },
      path: null,
      users: ['E1', 'E2'],   // UDEL dropped; order preserved
      depts: ['ENG'],        // DDEL dropped
    });
    expect(pa(p)).toEqual(pa(m));
  });

  test('findById: path populate embeds title + ordered program ids', async () => {
    const [m, p] = await both((r) => r.findById(aid(r, id.m_a2, id.p_a2)));
    expect(pa(m)).toEqual({
      title: 'Onboarding Path', status: 'active', targetType: 'path',
      program: null,
      path: { code: 'PATH-1', title: 'Path One', programs: [PSELF, PADMIN] },
      users: ['E3'], depts: [],
    });
    expect(pa(p)).toEqual(pa(m));
  });

  test('list: default status=active + dueDate asc; targetType filter — identical', async () => {
    const [m, p] = await both((r) => r.list({}));
    expect(m.map((x) => x.title)).toEqual(['Security Basics', 'Onboarding Path']); // dueDate asc
    expect(p.map(pa)).toEqual(m.map(pa));
    const [mp, pp] = await both((r) => r.list({ targetType: 'path' }));
    expect(mp.map((x) => x.title)).toEqual(['Onboarding Path']);
    expect(pp.map(pa)).toEqual(mp.map(pa));
  });

  test('findProgram/findPath: $ne archived (incl. NULL status) — identical', async () => {
    const [mOk, pOk] = await both((r) => r.findProgram(PSELF));
    expect(norm(mOk)._id).toBe(PSELF); expect(norm(pOk)._id).toBe(PSELF);
    const [mNull, pNull] = await both((r) => r.findProgram(PNULL)); // null status counts as not-archived
    expect(norm(mNull)._id).toBe(PNULL); expect(norm(pNull)._id).toBe(PNULL);
    const [mArch, pArch] = await both((r) => r.findProgram(PARCH));
    expect(mArch).toBeNull(); expect(pArch).toBeNull();

    const [mPath, pPath] = await both((r) => r.findPath(PATH1));
    expect(norm(mPath)).toEqual({ _id: PATH1, programs: [PSELF, PADMIN] });
    expect(norm(pPath)).toEqual(norm(mPath));
    const [mPa, pPa] = await both((r) => r.findPath(PATHARCH)); // archived → null
    expect(mPa).toBeNull(); expect(pPa).toBeNull();
  });

  test('countUsers/countDepartments exclude soft-deleted — identical', async () => {
    const [mu, pu] = await both((r) => r.countUsers([U1, U2, UDEL]));
    expect(mu).toBe(2); expect(pu).toBe(2); // UDEL dropped
    const [md, pd] = await both((r) => r.countDepartments([DENG, DDEL]));
    expect(md).toBe(1); expect(pd).toBe(1); // DDEL dropped
  });

  test('findAssignableUsers: dept|user OR + assignable status + name binary order', async () => {
    const [m, p] = await both((r) => r.findAssignableUsers({ departmentIds: [DENG] }));
    expect(m.map((u) => u.empCode)).toEqual(['E1', 'E2', 'E3']); // Alice,Bob,Carol; Dave(Inactive)/Eve(deleted) excluded
    expect(p.map((u) => u.empCode)).toEqual(m.map((u) => u.empCode));
    const [mu, pu] = await both((r) => r.findAssignableUsers({ userIds: [U4] }));
    expect(mu).toEqual([]); expect(pu).toEqual([]); // U4 Inactive → not assignable
    const [me, pe] = await both((r) => r.findAssignableUsers({ userIds: [], departmentIds: [] }));
    expect(me).toEqual([]); expect(pe).toEqual([]);
  });

  test('findActiveAssignmentsForUser: direct-user vs department branch — identical', async () => {
    const [m1, p1] = await both((r) => r.findActiveAssignmentsForUser(U1, DENG));
    expect(m1.map((x) => x.title)).toEqual(['Security Basics']); // matches user + dept
    expect(p1.map(pa)).toEqual(m1.map(pa));
    const [m3, p3] = await both((r) => r.findActiveAssignmentsForUser(U3, null));
    expect(m3.map((x) => x.title)).toEqual(['Onboarding Path']); // user-only branch (no dept clause)
    expect(p3.map(pa)).toEqual(m3.map(pa));
  });

  test('findOpenSelfEnrollCohort: self_enroll gate — identical', async () => {
    const [m, p] = await both((r) => r.findOpenSelfEnrollCohort(PSELF));
    expect(norm(m)).toEqual({ _id: CSELF, classCode: 'C-SELF' });
    expect(norm(p)).toEqual(norm(m));
    const [ma, pga] = await both((r) => r.findOpenSelfEnrollCohort(PADMIN)); // admin_scheduled → null
    expect(ma).toBeNull(); expect(pga).toBeNull();
  });

  test('findParticipatingUserIdsForProgram: participating statuses ∩ program cohorts', async () => {
    const [m, p] = await both((r) => r.findParticipatingUserIdsForProgram([U1, U2, U3], PSELF));
    expect(sorted(m)).toEqual(sorted(new Set([U1, U3]))); // U2 Dropped excluded
    expect(sorted(p)).toEqual(sorted(m));
  });

  test('archive: hides + archives + returns populated archived doc — identical', async () => {
    const [m, p] = await both((r) => r.archive(aid(r, id.m_a1, id.p_a1)));
    expect(norm(m).status).toBe('archived'); expect(norm(m).isDeleted).toBe(true);
    expect(pa(p)).toEqual(pa(m)); // still populated
    const [mGone, pGone] = await both((r) => r.findById(aid(r, id.m_a1, id.p_a1)));
    expect(mGone).toBeNull(); expect(pGone).toBeNull(); // hidden after archive
  });
});
