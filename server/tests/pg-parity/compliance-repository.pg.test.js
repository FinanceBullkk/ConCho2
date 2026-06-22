/**
 * ──────────────────────────────────────────────────────────
 * PG-parity test — compliance repository (Mongo ↔ Postgres)
 * ──────────────────────────────────────────────────────────
 * RequiredTraining CRUD + the matrix read signals (workforce / issued certs /
 * program+path labels). Runs only when a Postgres URL is present; SKIPS
 * otherwise. Asserts identical behaviour + traps:
 *   • appliesTo/target subobjects ↔ flat columns; update replaces them
 *   • RequiredTraining/User/Certificate filter is_deleted; LearningPath does NOT
 *     (no find-hook); LearningProgram has no soft-delete
 *   • listWorkforce: Active only + role/department filter + office_id selected
 *   • listIssuedCertificates: Issued + live + empty-id guard
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env.pg-prototype') });
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const PG_URL = process.env.PG_URL || process.env.PG_PROTOTYPE_URL;
const describePg = PG_URL ? describe : describe.skip;

const { query, closePool } = require('../../config/pg');
const repo = require('../../domains/compliance/repository');

const hex = (n) => n.toString(16).padStart(24, '0');
const oid = (h) => new mongoose.Types.ObjectId(h);
const coll = (m) => mongoose.model(m).collection.name;
const day = (n) => new Date(Date.UTC(2026, 0, n, 0, 0, 0));
const norm = (x) => (x == null ? null : JSON.parse(JSON.stringify(x)));

const U1 = hex(811); const U2 = hex(812); const UD = hex(813); const UI = hex(814);
const P1 = hex(821);
const PA1 = hex(831); const PAD = hex(832);
const RT1 = hex(841); const RT2 = hex(842); const RTD = hex(843);

const reqProj = (r) => (r == null ? null : {
  appliesTo: r.appliesTo, target: { kind: r.target.kind, id: r.target.id ? String(r.target.id) : null },
  dueWithinDays: r.dueWithinDays, recurrence: r.recurrence, mandatory: r.mandatory, label: r.label,
});
const userProj = (u) => (u == null ? null : {
  empCode: u.empCode, name: u.name, role: u.role, departmentId: u.departmentId ? String(u.departmentId) : null,
  officeId: u.officeId ? String(u.officeId) : null,
});

describePg('PG-parity: compliance repository', () => {
  let mem;

  beforeAll(async () => {
    mem = await MongoMemoryServer.create();
    await mongoose.connect(mem.getUri());
    const db = mongoose.connection.db;

    await db.collection(coll('User')).insertMany([
      { _id: oid(U1), empCode: 'U1', name: 'Uno', role: 'Teacher', department: 'Eng', departmentId: oid(hex(901)), officeId: oid(hex(902)), status: 'Active', isDeleted: false, createdAt: day(1) },
      { _id: oid(U2), empCode: 'U2', name: 'Dos', role: 'Participant', department: 'Ops', departmentId: oid(hex(903)), officeId: null, status: 'Active', isDeleted: false, createdAt: day(2) },
      { _id: oid(UD), empCode: 'U3', name: 'Gone', role: 'Participant', status: 'Active', isDeleted: true, createdAt: day(3) },
      { _id: oid(UI), empCode: 'U4', name: 'Inact', role: 'Participant', status: 'Inactive', isDeleted: false, createdAt: day(4) },
    ]);
    await db.collection(coll('LearningProgram')).insertOne({ _id: oid(P1), name: 'Prog 1', code: 'PG-1' });
    await db.collection(coll('LearningPath')).insertMany([
      { _id: oid(PA1), title: 'Path 1', code: 'PA-1', programs: [oid(P1)], isDeleted: false },
      { _id: oid(PAD), title: 'Path Gone', code: 'PA-D', programs: [], isDeleted: true },
    ]);
    await db.collection(coll('Certificate')).insertMany([
      { _id: oid(hex(851)), userId: oid(U1), programId: oid(P1), status: 'Issued', isDeleted: false, issuedAt: day(5), certificateNumber: 'C-1', verificationCode: 'v1', cohortId: oid(hex(861)) },
      { _id: oid(hex(852)), userId: oid(U1), programId: oid(P1), status: 'Issued', isDeleted: true, issuedAt: day(6), certificateNumber: 'C-2', verificationCode: 'v2', cohortId: oid(hex(862)) },
    ]);
    const rt = (id, type, value, kind, tid, d, del = false) => ({
      _id: oid(id), appliesTo: { type, value }, target: { kind, id: oid(tid) },
      dueWithinDays: 90, recurrence: 'once', mandatory: true, label: '', isDeleted: del, createdAt: day(d),
    });
    await db.collection(coll('RequiredTraining')).insertMany([
      rt(RT1, 'role', 'Teacher', 'program', P1, 1),
      rt(RT2, 'all', '', 'path', PA1, 2),
      rt(RTD, 'department', 'x', 'program', P1, 3, true),
    ]);

    // TRUNCATE the shared tables (this suite fully owns the PG state in beforeAll;
    // listWorkforce has no id filter so a leaked row from another suite would skew it).
    await query('TRUNCATE required_training, learning_paths, users, learning_programs, certificates');
    await query(`INSERT INTO users(id,emp_code,name,role,department,department_id,office_id,status,is_deleted,created_at) VALUES
      ($1,'U1','Uno','Teacher','Eng',$2,$3,'Active',false,$4),
      ($5,'U2','Dos','Participant','Ops',$6,null,'Active',false,$7),
      ($8,'U3','Gone','Participant',null,null,null,'Active',true,$9),
      ($10,'U4','Inact','Participant',null,null,null,'Inactive',false,$11)`,
    [U1, hex(901), hex(902), day(1).toISOString(), U2, hex(903), day(2).toISOString(), UD, day(3).toISOString(), UI, day(4).toISOString()]);
    await query(`INSERT INTO learning_programs(id,name,code) VALUES ($1,'Prog 1','PG-1')`, [P1]);
    await query(`INSERT INTO learning_paths(id,title,code,programs,is_deleted) VALUES ($1,'Path 1','PA-1',ARRAY[$2],false),($3,'Path Gone','PA-D',ARRAY[]::text[],true)`, [PA1, P1, PAD]);
    await query(`INSERT INTO certificates(id,user_id,program_id,status,is_deleted,issued_at,certificate_number,verification_code,cohort_id) VALUES
      ($1,$2,$3,'Issued',false,$4,'C-1','v1',$5),($6,$2,$3,'Issued',true,$7,'C-2','v2',$8)`,
    [hex(851), U1, P1, day(5).toISOString(), hex(861), hex(852), day(6).toISOString(), hex(862)]);
    await query(`INSERT INTO required_training(id,applies_to_type,applies_to_value,target_kind,target_id,due_within_days,recurrence,mandatory,label,is_deleted,created_at) VALUES
      ($1,'role','Teacher','program',$2,90,'once',true,'',false,$3),
      ($4,'all','','path',$5,90,'once',true,'',false,$6),
      ($7,'department','x','program',$2,90,'once',true,'',true,$8)`,
    [RT1, P1, day(1).toISOString(), RT2, PA1, day(2).toISOString(), RTD, day(3).toISOString()]);
  }, 60_000);

  afterAll(async () => {
    if (mongoose.connection.readyState) await mongoose.disconnect();
    if (mem) await mem.stop();
    await closePool();
  });

  const both = (fn) => Promise.all([fn(repo.impls.mongo), fn(repo.impls.pg)]);

  test('listRequirements (excludes deleted, createdAt desc) + findRequirementById — identical', async () => {
    const [m, p] = await both((r) => r.listRequirements());
    expect(m.map((r) => reqProj(r).appliesTo.type)).toEqual(['all', 'role']); // RT2(day2),RT1(day1); RTD deleted out
    expect(p.map(reqProj)).toEqual(m.map(reqProj));
    expect(await repo.impls.mongo.findRequirementById(RTD)).toBeNull();
    expect(await repo.impls.pg.findRequirementById(RTD)).toBeNull();
  });

  test('createRequirement defaults + updateRequirement replaces appliesTo/target — identical', async () => {
    const [mC, pC] = await both((r) => r.createRequirement({ appliesTo: { type: 'office', value: 'HQ' }, target: { id: P1 } }));
    expect(reqProj(mC)).toEqual({ appliesTo: { type: 'office', value: 'HQ' }, target: { kind: 'program', id: P1 }, dueWithinDays: 90, recurrence: 'once', mandatory: true, label: '' });
    expect(reqProj(pC)).toEqual(reqProj(mC));

    const [mU, pU] = await both((r) => r.updateRequirement(RT1, { appliesTo: { type: 'all', value: '' }, mandatory: false }));
    expect(reqProj(mU)).toMatchObject({ appliesTo: { type: 'all', value: '' }, mandatory: false });
    expect(reqProj(pU)).toEqual(reqProj(mU));
    expect(await repo.impls.mongo.updateRequirement(RTD, { mandatory: false })).toBeNull();
    expect(await repo.impls.pg.updateRequirement(RTD, { mandatory: false })).toBeNull();
  });

  test('listWorkforce (Active + filters + office_id) + findUserById — identical', async () => {
    const [mAll, pAll] = await both((r) => r.listWorkforce({}));
    // U1, U2 Active+live; UD deleted out, UI inactive out
    expect(mAll.map((u) => u.empCode).sort()).toEqual(['U1', 'U2']);
    expect(pAll.map(userProj).sort((a, b) => a.empCode.localeCompare(b.empCode)))
      .toEqual(mAll.map(userProj).sort((a, b) => a.empCode.localeCompare(b.empCode)));

    const [mR, pR] = await both((r) => r.listWorkforce({ role: 'Teacher' }));
    expect(mR.map((u) => u.empCode)).toEqual(['U1']);
    expect(pR.map(userProj)).toEqual(mR.map(userProj));

    const [mU, pU] = await both((r) => r.findUserById(U1));
    expect(userProj(mU)).toEqual({ empCode: 'U1', name: 'Uno', role: 'Teacher', departmentId: hex(901), officeId: hex(902) });
    expect(userProj(pU)).toEqual(userProj(mU));
    expect(await repo.impls.mongo.findUserById(UD)).toBeNull();
    expect(await repo.impls.pg.findUserById(UD)).toBeNull();
  });

  test('listIssuedCertificates (Issued+live, empty guard) + label lookups (path incl. deleted) — identical', async () => {
    const [mC, pC] = await both((r) => r.listIssuedCertificates({ userIds: [U1, U2], programIds: [P1] }));
    expect(mC.length).toBe(1); // only the live Issued cert (the deleted one excluded)
    expect(pC.map((c) => ({ u: String(c.userId), p: String(c.programId) }))).toEqual(mC.map((c) => ({ u: String(c.userId), p: String(c.programId) })));
    expect(await repo.impls.mongo.listIssuedCertificates({ userIds: [], programIds: [P1] })).toEqual([]);
    expect(await repo.impls.pg.listIssuedCertificates({ userIds: [], programIds: [P1] })).toEqual([]);

    const [mP, pP] = await both((r) => r.findProgramsByIds([P1]));
    expect(mP.map((p) => p.code)).toEqual(['PG-1']);
    expect(pP.map((p) => p.code)).toEqual(['PG-1']);

    // LearningPath has no find-hook → BOTH the live and deleted path come back.
    const [mPa, pPa] = await both((r) => r.findPathsByIds([PA1, PAD]));
    expect(mPa.map((p) => p.code).sort()).toEqual(['PA-1', 'PA-D']);
    expect(pPa.map((p) => p.code).sort()).toEqual(['PA-1', 'PA-D']);
  });

  test('softDeleteRequirement hides the row — identical', async () => {
    const [mD, pD] = await both((r) => r.softDeleteRequirement(RT2));
    expect(mD).toBeTruthy(); expect(pD).toBeTruthy();
    expect(await repo.impls.mongo.findRequirementById(RT2)).toBeNull();
    expect(await repo.impls.pg.findRequirementById(RT2)).toBeNull();
  });
});
