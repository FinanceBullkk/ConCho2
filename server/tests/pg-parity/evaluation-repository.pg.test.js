/**
 * ──────────────────────────────────────────────────────────
 * PG-parity test — evaluation repository (Mongo ↔ Postgres)
 * ──────────────────────────────────────────────────────────
 * evaluationController's surface (B3): revive-in-place upsert on the FULL
 * {classId,userId} unique (DATA-014), soft-delete, populated reads, roster.
 * Runs only when a Postgres URL is present; SKIPS otherwise. Traps pinned:
 *   • upsert insert → createdBy set; update → createdBy NOT clobbered
 *   • re-upsert after soft delete REVIVES the same row (id unchanged)
 *   • softDeleteById returns the BEFORE shape; a second delete → null
 *   • averageScore parity (Mongo virtual ⇔ PG mapper)
 *   • populate: trashed class/user refs drop to null
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env.pg-prototype') });
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const PG_URL = process.env.PG_URL || process.env.PG_PROTOTYPE_URL;
const describePg = PG_URL ? describe : describe.skip;

const { query, closePool } = require('../../config/pg');
const repo = require('../../domains/evaluation/repository');

const hex = (n) => n.toString(16).padStart(24, '0');
const oid = (h) => new mongoose.Types.ObjectId(h);
const coll = (m) => mongoose.model(m).collection.name;
const norm = (x) => (x == null ? null : JSON.parse(JSON.stringify(x)));

const C1 = hex(0xc01); const CDEL = hex(0xc02);
const U1 = hex(0xc11); const U2 = hex(0xc12); const UDEL = hex(0xc13);
const TCH = hex(0xc21);
const E1 = hex(0xc31);

const scores = (g, v, p, f) => ({ grammarScore: g, vocabularyScore: v, pronunciationScore: p, fluencyScore: f });

describePg('PG-parity: evaluation repository', () => {
  let mem;

  beforeAll(async () => {
    mem = await MongoMemoryServer.create();
    await mongoose.connect(mem.getUri());
    const db = mongoose.connection.db;

    await db.collection(coll('Class')).insertMany([
      { _id: oid(C1), classCode: 'EV-1', courseName: 'Eval Course', status: 'Ongoing', isDeleted: false },
      { _id: oid(CDEL), classCode: 'EV-D', courseName: 'Dead Course', status: 'Ongoing', isDeleted: true },
    ]);
    await db.collection(coll('User')).insertMany([
      { _id: oid(U1), empCode: 'EU1', name: 'Learner One', department: 'D1', role: 'Participant', isDeleted: false },
      { _id: oid(U2), empCode: 'EU2', name: 'Learner Two', department: 'D1', role: 'Participant', isDeleted: false },
      { _id: oid(UDEL), empCode: 'EUD', name: 'Trashed', department: 'D1', role: 'Participant', isDeleted: true },
      { _id: oid(TCH), empCode: 'ET1', name: 'Teacher', department: 'D1', role: 'Teacher', isDeleted: false },
    ]);
    // Pre-existing evaluation on a TRASHED class + a trashed-user enrollment
    // exercise the populate drop.
    await db.collection(coll('Evaluation')).insertMany([
      { _id: oid(E1), classId: oid(CDEL), userId: oid(U2), level: 'B1', grammarScore: 5, vocabularyScore: 5, pronunciationScore: 5, fluencyScore: 5, teacherComment: '', createdBy: oid(TCH), isDeleted: false },
    ]);
    await db.collection(coll('Enrollment')).insertMany([
      { _id: oid(hex(0xc41)), classId: oid(C1), userId: oid(U1), status: 'Active' },
      { _id: oid(hex(0xc42)), classId: oid(C1), userId: oid(UDEL), status: 'Active' }, // trashed user → dropped
      { _id: oid(hex(0xc43)), classId: oid(C1), userId: oid(U2), status: 'Dropped' },  // not Active → excluded
    ]);

    await query('TRUNCATE evaluations, classes, users, enrollments');
    await query(`INSERT INTO classes(id,class_code,course_name,status,is_deleted) VALUES
      ($1,'EV-1','Eval Course','Ongoing',false),($2,'EV-D','Dead Course','Ongoing',true)`, [C1, CDEL]);
    await query(`INSERT INTO users(id,emp_code,name,department,role,is_deleted) VALUES
      ($1,'EU1','Learner One','D1','Participant',false),($2,'EU2','Learner Two','D1','Participant',false),
      ($3,'EUD','Trashed','D1','Participant',true),($4,'ET1','Teacher','D1','Teacher',false)`, [U1, U2, UDEL, TCH]);
    await query(
      `INSERT INTO evaluations(id,class_id,user_id,level,grammar_score,vocabulary_score,pronunciation_score,fluency_score,teacher_comment,created_by,is_deleted)
       VALUES ($1,$2,$3,'B1',5,5,5,5,'',$4,false)`, [E1, CDEL, U2, TCH]);
    await query(`INSERT INTO enrollments(id,class_id,user_id,status) VALUES
      ($1,$4,$5,'Active'),($2,$4,$6,'Active'),($3,$4,$7,'Dropped')`,
      [hex(0xc41), hex(0xc42), hex(0xc43), C1, U1, UDEL, U2]);
  }, 60_000);

  afterAll(async () => {
    if (mongoose.connection.readyState) await mongoose.disconnect();
    if (mem) await mem.stop();
    await closePool();
  });

  const both = (fn) => Promise.all([fn(repo.impls.mongo), fn(repo.impls.pg)]);
  const proj = (e) => {
    const n = norm(e);
    return n == null ? null : {
      level: n.level, g: n.grammarScore, v: n.vocabularyScore, p: n.pronunciationScore, f: n.fluencyScore,
      comment: n.teacherComment, createdBy: n.createdBy ? String(n.createdBy) : null,
      avg: n.averageScore, deleted: !!n.isDeleted,
    };
  };

  test('upsert: insert sets createdBy; update does NOT clobber it; averageScore parity', async () => {
    const [mI, pI] = await both((r) => r.upsertEvaluation(C1, U1, {
      fields: { level: 'A2', ...scores(6, 7, 8, 9), teacherComment: 'first' },
      reviving: false, createdBy: TCH,
    }));
    expect(proj(mI)).toEqual({ level: 'A2', g: 6, v: 7, p: 8, f: 9, comment: 'first', createdBy: TCH, avg: 7.5, deleted: false });
    expect(proj(pI)).toEqual(proj(mI));

    // Update by ANOTHER author — createdBy must stay the original.
    const [mU, pU] = await both((r) => r.upsertEvaluation(C1, U1, {
      fields: { level: 'B1', ...scores(7, 7, 7, 6), teacherComment: 'second' },
      reviving: false, createdBy: U2,
    }));
    expect(proj(mU)).toEqual({ level: 'B1', g: 7, v: 7, p: 7, f: 6, comment: 'second', createdBy: TCH, avg: 6.75, deleted: false });
    expect(proj(pU)).toEqual(proj(mU));
  });

  test('softDelete returns BEFORE shape, hides row, second delete → null; re-upsert REVIVES same id', async () => {
    // ids differ per backend — soft-delete each row with its own id.
    const [mRow, pRow] = await both((r) => r.findForClassUserIncludingTrashed(C1, U1));
    const mD = await repo.impls.mongo.softDeleteById(mRow._id);
    const pD = await repo.impls.pg.softDeleteById(pRow._id);
    expect(norm(mD).isDeleted).toBe(false); // BEFORE shape (pre-update doc)
    expect(norm(pD).isDeleted).toBe(false);

    expect(await repo.impls.mongo.findByIdPopulated(mRow._id)).toBeNull();
    expect(await repo.impls.pg.findByIdPopulated(pRow._id)).toBeNull();
    expect(await repo.impls.mongo.softDeleteById(mRow._id)).toBeNull(); // second delete
    expect(await repo.impls.pg.softDeleteById(pRow._id)).toBeNull();

    // Revive in place — same row id, isDeleted back to false.
    const [mR, pR] = await both((r) => r.upsertEvaluation(C1, U1, {
      fields: { level: 'C1', ...scores(9, 9, 9, 9), teacherComment: 'revived' },
      reviving: true, createdBy: U2,
    }));
    expect(String(norm(mR)._id)).toBe(String(mRow._id));
    expect(String(norm(pR)._id)).toBe(String(pRow._id));
    expect(proj(mR)).toMatchObject({ level: 'C1', deleted: false, createdBy: TCH });
    expect(proj(pR)).toMatchObject({ level: 'C1', deleted: false, createdBy: TCH });
  });

  test('findAllPopulated: trashed class ref drops to null; filter by classId — identical', async () => {
    const [m, p] = await both((r) => r.findAllPopulated({ userId: U2 }));
    expect(m).toHaveLength(1);
    expect(norm(m[0]).classId).toBeNull();        // CDEL is trashed → populate drop
    expect(norm(m[0]).userId.empCode).toBe('EU2');
    expect(norm(p[0]).classId).toBeNull();
    expect(norm(p[0]).userId.empCode).toBe('EU2');

    const [mC, pC] = await both((r) => r.findAllPopulated({ classId: C1 }));
    expect(mC.map((e) => norm(e).userId.empCode)).toEqual(['EU1']);
    expect(pC.map((e) => norm(e).userId.empCode)).toEqual(['EU1']);
  });

  test('roster: Active enrollments only, trashed users drop — identical', async () => {
    const [m, p] = await both((r) => r.findActiveEnrollmentsWithUsers(C1));
    const names = (rows) => rows.map((e) => (e.userId ? e.userId.name : null)).sort();
    expect(names(m)).toEqual([null, 'Learner One']); // UDEL enrollment → userId null
    expect(names(p)).toEqual(names(m));
  });
});
