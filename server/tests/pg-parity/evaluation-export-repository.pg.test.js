/**
 * ──────────────────────────────────────────────────────────
 * PG-parity — evaluation export repository (Mongo ↔ Postgres)
 * ──────────────────────────────────────────────────────────
 * services/export/evaluation-export-repository.{mongo,pg} (Phase 3 Wave-F,
 * legacy-tail port). Drives the REAL buildEvaluationPipeline from
 * evaluation-export.js (not a hand-rolled stand-in) through both backends'
 * `aggregate(pipeline)` — this is the one production call shape. Standalone
 * mongod (read-only). Runs only when a Postgres URL is present (the pg-parity
 * CI job); SKIPS otherwise.
 *
 * Pinned identical on both backends:
 *   1. no filter: a soft-deleted evaluation is excluded; an evaluation whose
 *      user is soft-deleted is excluded (INNER join semantics); an evaluation
 *      whose class is soft-deleted is KEPT with classCode/courseName ABSENT
 *      (not null — Mongo's $project on a missing '$class.classCode' omits the
 *      key, it does not null it; the pg impl mirrors that key-for-key);
 *   2. classId filter;
 *   3. updatedAt from/to range filter, composed with the drop-row cases;
 *   4. sort: classCode asc, empCode asc, with the null-classCode row sorting
 *      FIRST (Mongo ascending sort ranks a missing/null field before a string);
 *   5. averageScore computed identically (unrounded $divide equivalent);
 *   6. malformed input: an unrecognised pipeline stage throws loudly on the pg
 *      side rather than silently mis-querying (this port's fail-fast guard,
 *      since the pg impl reconstructs {classId,from,to} from the pipeline
 *      shape instead of interpreting an arbitrary Mongo aggregation).
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env.pg-prototype') });
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const PG_URL = process.env.PG_URL || process.env.PG_PROTOTYPE_URL;
const describePg = PG_URL ? describe : describe.skip;

const { query, closePool } = require('../../config/pg');
const { buildEvaluationPipeline } = require('../../services/export/evaluation-export');
const evalExportRepo = require('../../services/export/evaluation-export-repository');
// The Evaluation model is registered transitively via evaluation-export-repository
// .mongo, but User/Class are only referenced by collection name in this file's
// raw-driver seeding — register their schemas explicitly.
require('../../models/User');
require('../../models/Class');

const hex = (n) => n.toString(16).padStart(24, '0');
const oid = (h) => new mongoose.Types.ObjectId(h);
const coll = (m) => mongoose.model(m).collection.name;
const plain = (v) => JSON.parse(JSON.stringify(v));

const U1 = hex(0x601); // live user
const U2 = hex(0x602); // live user
const U3 = hex(0x603); // soft-deleted user — drops its evaluation row (INNER join)
const U5 = hex(0x605); // live user, owns only the soft-deleted eval (distinct {classId,userId} pair)
const C1 = hex(0x611); // live class
const C2 = hex(0x612); // soft-deleted class — row kept, label omitted

// Evaluation carries a FULL unique index on {classId,userId} (a soft-delete
// revives the slot in place rather than leaving a duplicate row) — every row
// below uses a distinct {classId,userId} pair.
const EV1 = hex(0x701); // U1/C1, 2026-02-01
const EV2 = hex(0x702); // U2/C1, 2026-02-05
const EV3 = hex(0x703); // U1/C2 (deleted class), 2026-02-03
const EV4 = hex(0x704); // U3/C1 (deleted user), 2026-02-04 — dropped
const EV5 = hex(0x705); // U5/C1, 2026-02-02, isDeleted:true — dropped

const BACKENDS = {
  mongo: { repo: evalExportRepo.impls.mongo, id: (h) => oid(h) },
  pg: { repo: evalExportRepo.impls.pg, id: (h) => h },
};

const seedMongo = async () => {
  const db = mongoose.connection.db;
  await Promise.all(['User', 'Class', 'Evaluation'].map((m) => db.collection(coll(m)).deleteMany({})));
  await db.collection(coll('User')).insertMany([
    { _id: oid(U1), empCode: '000001', name: 'Alice', department: 'Ops', role: 'Participant', isDeleted: false },
    { _id: oid(U2), empCode: '000002', name: 'Bob', department: 'HR', role: 'Participant', isDeleted: false },
    { _id: oid(U3), empCode: '000003', name: 'Carol', department: 'Ops', role: 'Participant', isDeleted: true },
    { _id: oid(U5), empCode: '000005', name: 'Eve', department: 'Ops', role: 'Participant', isDeleted: false },
  ]);
  await db.collection(coll('Class')).insertMany([
    { _id: oid(C1), classCode: 'EL001', courseName: 'English 1', isDeleted: false },
    { _id: oid(C2), classCode: 'EL002', courseName: 'English 2', isDeleted: true },
  ]);
  await db.collection(coll('Evaluation')).insertMany([
    {
      _id: oid(EV1), classId: oid(C1), userId: oid(U1), level: 'A1',
      grammarScore: 8, vocabularyScore: 7, pronunciationScore: 6, fluencyScore: 9,
      teacherComment: 'Great', updatedAt: new Date('2026-02-01T00:00:00.000Z'), isDeleted: false,
    },
    {
      _id: oid(EV2), classId: oid(C1), userId: oid(U2), level: 'B1',
      grammarScore: 5, vocabularyScore: 5, pronunciationScore: 5, fluencyScore: 5,
      teacherComment: '', updatedAt: new Date('2026-02-05T00:00:00.000Z'), isDeleted: false,
    },
    {
      _id: oid(EV3), classId: oid(C2), userId: oid(U1), level: '',
      grammarScore: 10, vocabularyScore: 10, pronunciationScore: 10, fluencyScore: 10,
      teacherComment: 'x', updatedAt: new Date('2026-02-03T00:00:00.000Z'), isDeleted: false,
    },
    {
      _id: oid(EV4), classId: oid(C1), userId: oid(U3), level: '',
      grammarScore: 1, vocabularyScore: 1, pronunciationScore: 1, fluencyScore: 1,
      teacherComment: '', updatedAt: new Date('2026-02-04T00:00:00.000Z'), isDeleted: false,
    },
    {
      _id: oid(EV5), classId: oid(C1), userId: oid(U5), level: '',
      grammarScore: 2, vocabularyScore: 2, pronunciationScore: 2, fluencyScore: 2,
      teacherComment: '', updatedAt: new Date('2026-02-02T00:00:00.000Z'), isDeleted: true,
    },
  ]);
};

const seedPg = async () => {
  await query('TRUNCATE users, classes, evaluations');
  await query(
    `INSERT INTO users(id, emp_code, name, department, role, is_deleted) VALUES
      ($1,'000001','Alice','Ops','Participant',false),
      ($2,'000002','Bob','HR','Participant',false),
      ($3,'000003','Carol','Ops','Participant',true),
      ($4,'000005','Eve','Ops','Participant',false)`,
    [U1, U2, U3, U5],
  );
  await query(
    `INSERT INTO classes(id, class_code, course_name, is_deleted) VALUES
      ($1,'EL001','English 1',false),
      ($2,'EL002','English 2',true)`,
    [C1, C2],
  );
  const rows = [
    [EV1, C1, U1, 'A1', 8, 7, 6, 9, 'Great', '2026-02-01T00:00:00.000Z', false],
    [EV2, C1, U2, 'B1', 5, 5, 5, 5, '', '2026-02-05T00:00:00.000Z', false],
    [EV3, C2, U1, '', 10, 10, 10, 10, 'x', '2026-02-03T00:00:00.000Z', false],
    [EV4, C1, U3, '', 1, 1, 1, 1, '', '2026-02-04T00:00:00.000Z', false],
    [EV5, C1, U5, '', 2, 2, 2, 2, '', '2026-02-02T00:00:00.000Z', true],
  ];
  for (const r of rows) {
    // eslint-disable-next-line no-await-in-loop
    await query(
      `INSERT INTO evaluations(id, class_id, user_id, level, grammar_score, vocabulary_score,
                                pronunciation_score, fluency_score, teacher_comment, updated_at, is_deleted)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      r,
    );
  }
};

describePg('PG-parity: evaluation export repository', () => {
  let mongod;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri('pg-parity-eval-export'));
  });

  afterAll(async () => {
    await mongoose.disconnect();
    if (mongod) await mongod.stop();
    await closePool();
  });

  beforeEach(async () => {
    await seedMongo();
    await seedPg();
  });

  test('no filter: dropped rows (deleted eval / deleted user), kept-with-omitted-label row, sort — identical', async () => {
    const pipeline = buildEvaluationPipeline({});
    const mongoRows = await BACKENDS.mongo.repo.aggregate(pipeline);
    const pgRows = await BACKENDS.pg.repo.aggregate(pipeline);

    // EV5 dropped (isDeleted), EV4 dropped (user U3 soft-deleted) → 3 rows left.
    expect(mongoRows).toHaveLength(3);
    // classCode null (EV3/C2 deleted) sorts FIRST, then EL001 rows by empCode asc.
    expect(mongoRows.map((r) => r.empCode)).toEqual(['000001', '000001', '000002']);
    expect(mongoRows[0].classCode).toBeUndefined(); // key omitted, not null
    expect(mongoRows[0]).not.toHaveProperty('classCode');
    expect(mongoRows[1]).toMatchObject({ classCode: 'EL001', empCode: '000001', averageScore: 7.5 });
    expect(mongoRows[2]).toMatchObject({ classCode: 'EL001', empCode: '000002', averageScore: 5 });
    expect(plain(pgRows)).toEqual(plain(mongoRows));
  });

  test('classId filter — identical', async () => {
    const pipeline = buildEvaluationPipeline({ classId: C1 });
    const mongoRows = await BACKENDS.mongo.repo.aggregate(pipeline);
    const pgRows = await BACKENDS.pg.repo.aggregate(pipeline);

    expect(mongoRows.map((r) => r.empCode)).toEqual(['000001', '000002']); // EV3 (C2) excluded
    expect(plain(pgRows)).toEqual(plain(mongoRows));
  });

  test('updatedAt from/to range filter, composed with drop-row cases — identical', async () => {
    // Window covers EV3(02-03, kept), EV5(02-02, would match but isDeleted), EV4(02-04, would match but user deleted).
    const pipeline = buildEvaluationPipeline({ from: '2026-02-02', to: '2026-02-04' });
    const mongoRows = await BACKENDS.mongo.repo.aggregate(pipeline);
    const pgRows = await BACKENDS.pg.repo.aggregate(pipeline);

    expect(mongoRows).toHaveLength(1);
    expect(mongoRows[0]).toMatchObject({ empCode: '000001', level: '' });
    expect(mongoRows[0]).not.toHaveProperty('classCode');
    expect(plain(pgRows)).toEqual(plain(mongoRows));
  });

  test('classId + date range combined — identical', async () => {
    const pipeline = buildEvaluationPipeline({ classId: C1, from: '2026-02-01', to: '2026-02-02' });
    const mongoRows = await BACKENDS.mongo.repo.aggregate(pipeline);
    const pgRows = await BACKENDS.pg.repo.aggregate(pipeline);

    // EV1 (02-01) in range; EV5 (02-02) would match but is soft-deleted; EV2 (02-05) out of range.
    expect(mongoRows).toHaveLength(1);
    expect(mongoRows[0]).toMatchObject({ empCode: '000001', classCode: 'EL001', averageScore: 7.5 });
    expect(plain(pgRows)).toEqual(plain(mongoRows));
  });

  test('malformed pipeline: an unrecognised stage throws on the pg impl (fail-fast, not silent)', async () => {
    await expect(BACKENDS.pg.repo.aggregate([{ $facet: {} }])).rejects.toThrow(/unrecognised pipeline stage/);
    await expect(BACKENDS.pg.repo.aggregate('not-a-pipeline')).rejects.toThrow(/expected a pipeline array/);
  });
});
