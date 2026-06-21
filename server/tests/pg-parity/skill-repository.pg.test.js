/**
 * ──────────────────────────────────────────────────────────
 * PG-parity test — skill repository (Mongo ↔ Postgres)
 * ──────────────────────────────────────────────────────────
 * Whole-repository port: skill CRUD (jsonb targetByRole + text[] programIds) +
 * the certificate-derived completion-signal reads (Map/Set) + supporting
 * user/program reads. Runs only when a Postgres URL is present; SKIPS otherwise.
 * Asserts identical behaviour + the traps: name partial-unique (case-insensitive
 * guard) / reuse after soft-delete; soft-delete hides; completion reads filter
 * status/isDeleted/null-program; user reads exclude soft-deleted; program reads
 * (all vs active-only).
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env.pg-prototype') });
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const PG_URL = process.env.PG_URL || process.env.PG_PROTOTYPE_URL;
const describePg = PG_URL ? describe : describe.skip;

const { query, closePool } = require('../../config/pg');
const skillRepo = require('../../domains/skill/repository');

const hex = (n) => n.toString(16).padStart(24, '0');
const oid = (h) => new mongoose.Types.ObjectId(h);
const coll = (m) => mongoose.model(m).collection.name;

const PA = hex(801); const PB = hex(802); const PC = hex(803);
const U1 = hex(811); const U2 = hex(812); const UD = hex(813);
const PROGS = [{ id: PA, name: 'Prog A', status: 'active' }, { id: PB, name: 'Prog B', status: 'archived' }, { id: PC, name: 'Prog C', status: 'active' }];
const USERS = [
  { id: U1, name: 'Uno', role: 'Participant', dept: 'Eng', emp: 'U1', deleted: false },
  { id: U2, name: 'Dos', role: 'Teacher', dept: 'Eng', emp: 'U2', deleted: false },
  { id: UD, name: 'Gone', role: 'Participant', dept: 'Eng', emp: 'U3', deleted: true },
];
const CERTS = [
  { id: hex(821), user: U1, prog: PA, status: 'Issued', deleted: false },
  { id: hex(822), user: U1, prog: PB, status: 'Issued', deleted: false },
  { id: hex(823), user: U1, prog: PC, status: 'Revoked', deleted: false }, // excluded
  { id: hex(824), user: U1, prog: PA, status: 'Issued', deleted: true }, // excluded
  { id: hex(825), user: U1, prog: null, status: 'Issued', deleted: false }, // excluded (null prog)
  { id: hex(826), user: U2, prog: PA, status: 'Issued', deleted: false },
  { id: hex(827), user: U2, prog: PC, status: 'Issued', deleted: false },
];

const insertPg = async (table, cols, rows, toVals) => {
  if (!rows.length) return;
  const ph = rows.map((_, i) => `(${cols.map((__, j) => `$${i * cols.length + j + 1}`).join(',')})`).join(',');
  await query(`INSERT INTO ${table}(${cols.join(',')}) VALUES ${ph}`, rows.flatMap(toVals));
};

const both = (fn) => Promise.all([fn(skillRepo.impls.mongo), fn(skillRepo.impls.pg)]);
const sproj = (s) => (s == null ? null : {
  name: s.name, category: s.category, parentId: s.parentId == null ? null : String(s.parentId),
  hue: s.hue, programIds: (s.programIds || []).map(String).sort(), maxLevel: s.maxLevel,
  // Mongoose drops an empty Mixed {} on persist → lean reads `undefined`; PG jsonb
  // reads `{}`. Same meaning ("no targets") — normalise both to {}.
  targetByRole: s.targetByRole || {}, coverageTarget: s.coverageTarget, isDeleted: s.isDeleted,
});
const setArr = (s) => [...s].sort();
const mapObj = (m) => Object.fromEntries([...m.entries()].map(([k, v]) => [k, [...v].sort()]));
const mapStr = (m) => Object.fromEntries([...m.entries()].map(([k, v]) => [String(k), v]));

describePg('PG-parity: skill repository (CRUD + completion signal + supporting reads)', () => {
  let mem;

  beforeAll(async () => {
    mem = await MongoMemoryServer.create();
    await mongoose.connect(mem.getUri());
    await mongoose.model('Skill').init();        // partial-unique name index
    await mongoose.model('Certificate').init();  // cert unique indexes (autoIndex race guard)
    await mongoose.model('LearningProgram').init(); // unique code + unique name (case-insensitive)
    const db = mongoose.connection.db;

    // distinct `code` per program — LearningProgram has a unique `code` index that
    // collides on null (the autoIndex-race trap; PG learning_programs has no code).
    await db.collection(coll('LearningProgram')).insertMany(PROGS.map((p) => ({ _id: oid(p.id), name: p.name, status: p.status, code: `PG-${p.id}` })));
    await db.collection(coll('User')).insertMany(USERS.map((u) => ({
      _id: oid(u.id), name: u.name, role: u.role, department: u.dept, empCode: u.emp, isDeleted: u.deleted,
    })));
    await db.collection(coll('Certificate')).insertMany(CERTS.map((c) => ({
      _id: oid(c.id), userId: oid(c.user), programId: c.prog ? oid(c.prog) : null, status: c.status, isDeleted: c.deleted,
      certificateNumber: `CN-${c.id}`, verificationCode: `VC-${c.id}`, cohortId: oid(c.id),
    })));

    await query('TRUNCATE skills, learning_programs, users, certificates');
    await insertPg('learning_programs', ['id', 'name', 'status'], PROGS, (p) => [p.id, p.name, p.status]);
    await insertPg('users', ['id', 'name', 'role', 'department', 'emp_code', 'is_deleted'], USERS, (u) => [u.id, u.name, u.role, u.dept, u.emp, u.deleted]);
    await insertPg('certificates', ['id', 'user_id', 'program_id', 'status', 'is_deleted'], CERTS, (c) => [c.id, c.user, c.prog, c.status, c.deleted]);
  }, 60_000);

  afterAll(async () => {
    if (mongoose.connection.readyState) await mongoose.disconnect();
    if (mem) await mem.stop();
    await closePool();
  });

  test('create: defaults (category/hue/programIds/maxLevel/targetByRole/coverageTarget) — identical', async () => {
    const [m, p] = await both((r) => r.create({ name: 'Communication' }));
    expect(sproj(m)).toEqual({
      name: 'Communication', category: 'General', parentId: null, hue: 250, programIds: [],
      maxLevel: 5, targetByRole: {}, coverageTarget: null, isDeleted: false,
    });
    expect(sproj(p)).toEqual(sproj(m));
  });

  test('create: full fields (programIds text[] + targetByRole jsonb) — identical', async () => {
    const [m, p] = await both((r) => r.create({
      name: 'JavaScript', category: 'Tech', programIds: [PA, PC], targetByRole: { Participant: 3 }, coverageTarget: 10,
    }));
    expect(sproj(m)).toEqual({
      name: 'JavaScript', category: 'Tech', parentId: null, hue: 250, programIds: [PA, PC].sort(),
      maxLevel: 5, targetByRole: { Participant: 3 }, coverageTarget: 10, isDeleted: false,
    });
    expect(sproj(p)).toEqual(sproj(m));
  });

  test('findById live → fields; soft-deleted → null; findByName case-insensitive + excludeId — identical', async () => {
    const m = await skillRepo.impls.mongo.findByName('javascript');
    const p = await skillRepo.impls.pg.findByName('JAVASCRIPT');
    expect(sproj(m).name).toBe('JavaScript');
    expect(sproj(p)).toEqual(sproj(m));
    // excludeId → excludes the very skill (used by edit uniqueness guard)
    expect(await skillRepo.impls.mongo.findByName('JavaScript', m._id)).toBeNull();
    expect(await skillRepo.impls.pg.findByName('JavaScript', p._id)).toBeNull();
    // findById round-trips; a missing id → null
    expect(sproj(await skillRepo.impls.mongo.findById(m._id)).name).toBe('JavaScript');
    expect(await skillRepo.impls.pg.findById(hex(999111))).toBeNull();
  });

  test('partial-unique name: duplicate LIVE rejected; reusable after soft-delete — both', async () => {
    await expect(skillRepo.impls.mongo.create({ name: 'JavaScript' })).rejects.toBeDefined();
    await expect(skillRepo.impls.pg.create({ name: 'JavaScript' })).rejects.toBeDefined();

    const [m, p] = await both((r) => r.create({ name: 'Leadership', category: 'Soft' }));
    await Promise.all([skillRepo.impls.mongo.softDeleteById(m._id), skillRepo.impls.pg.softDeleteById(p._id)]);
    expect(await skillRepo.impls.mongo.findById(m._id)).toBeNull();
    expect(await skillRepo.impls.pg.findById(p._id)).toBeNull();
    const [m2, p2] = await both((r) => r.create({ name: 'Leadership' })); // freed
    expect(sproj(m2).name).toBe('Leadership');
    expect(sproj(p2).name).toBe('Leadership');
  });

  test('listLive: live rows in (category, name) order — identical sequence', async () => {
    const [m, p] = await both((r) => r.listLive());
    expect(p.map(sproj)).toEqual(m.map(sproj));
    // Communication(General) < JavaScript(Tech) < Leadership(General, recreated) → General group first
    expect(m.map((s) => s.name)).toEqual(['Communication', 'Leadership', 'JavaScript']);
  });

  test('updateById: category + programIds[] + targetByRole jsonb — identical', async () => {
    const js = await skillRepo.impls.mongo.findByName('JavaScript');
    const jsPg = await skillRepo.impls.pg.findByName('JavaScript');
    const upd = await Promise.all([
      skillRepo.impls.mongo.updateById(js._id, { category: 'Engineering', programIds: [PA], targetByRole: { Teacher: 2 } }),
      skillRepo.impls.pg.updateById(jsPg._id, { category: 'Engineering', programIds: [PA], targetByRole: { Teacher: 2 } }),
    ]);
    expect(sproj(upd[0])).toMatchObject({ category: 'Engineering', programIds: [PA], targetByRole: { Teacher: 2 } });
    expect(sproj(upd[1])).toEqual(sproj(upd[0]));
  });

  test('completion signal: completedProgramIdsForUser + byUser + holdersByProgram — identical', async () => {
    const [mU, pU] = await both((r) => r.completedProgramIdsForUser(U1));
    expect(setArr(pU)).toEqual(setArr(mU));
    expect(setArr(mU)).toEqual([PA, PB].sort()); // Revoked + deleted + null-prog excluded

    const [mByU, pByU] = await both((r) => r.completedProgramIdsByUser());
    expect(mapObj(pByU)).toEqual(mapObj(mByU));
    expect(mapObj(mByU)[U1]).toEqual([PA, PB].sort());
    expect(mapObj(mByU)[U2]).toEqual([PA, PC].sort());

    const [mHold, pHold] = await both((r) => r.holdersByProgram());
    expect(mapObj(pHold)).toEqual(mapObj(mHold));
    expect(mapObj(mHold)[PA]).toEqual([U1, U2].sort());
    expect(mapObj(mHold)[PB]).toEqual([U1]);
    expect(mapObj(mHold)[PC]).toEqual([U2]);
  });

  test('supporting reads: users (exclude soft-deleted) + program names (all vs active) — identical', async () => {
    const [mUsers, pUsers] = await both((r) => r.listUsersWithRole());
    const norm = (rows) => rows.map((u) => ({ _id: String(u._id), role: u.role })).sort((a, b) => a._id.localeCompare(b._id));
    expect(norm(pUsers)).toEqual(norm(mUsers));
    expect(norm(mUsers).map((u) => u._id)).toEqual([U1, U2].sort()); // UD soft-deleted excluded

    const [mBasic, pBasic] = await both((r) => r.findUserBasic(U1));
    expect({ name: mBasic.name, role: mBasic.role, empCode: mBasic.empCode }).toEqual({ name: 'Uno', role: 'Participant', empCode: 'U1' });
    expect({ name: pBasic.name, role: pBasic.role, empCode: pBasic.empCode }).toEqual({ name: 'Uno', role: 'Participant', empCode: 'U1' });
    expect(await skillRepo.impls.mongo.findUserBasic(UD)).toBeNull(); // soft-deleted
    expect(await skillRepo.impls.pg.findUserBasic(UD)).toBeNull();

    const [mAll, pAll] = await both((r) => r.programNamesByIds([PA, PB]));
    expect(mapStr(pAll)).toEqual(mapStr(mAll));
    expect(mapStr(mAll)).toEqual({ [PA]: 'Prog A', [PB]: 'Prog B' }); // archived PB still named
    const [mAct, pAct] = await both((r) => r.activeProgramNamesByIds([PA, PB]));
    expect(mapStr(pAct)).toEqual(mapStr(mAct));
    expect(mapStr(mAct)).toEqual({ [PA]: 'Prog A' }); // archived PB excluded
  });
});
