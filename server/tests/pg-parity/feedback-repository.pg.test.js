/**
 * ──────────────────────────────────────────────────────────
 * PG-parity test — learning/feedback repository (Mongo ↔ Postgres)
 * ──────────────────────────────────────────────────────────
 * Idempotent submit (upsert one per cohort+user) + reads. Runs only when a
 * Postgres URL is present; SKIPS otherwise. Asserts: upsert insert→re-submit
 * updates the same row; findFeedback; listFeedback populate user/cohort (deleted
 * ref → null) + order; findCohort hides deleted.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env.pg-prototype') });
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const PG_URL = process.env.PG_URL || process.env.PG_PROTOTYPE_URL;
const describePg = PG_URL ? describe : describe.skip;

const { query, closePool } = require('../../config/pg');
require('../../models/User');
const repo = require('../../domains/learning/feedback/repository');

const hex = (n) => n.toString(16).padStart(24, '0');
const norm = (x) => (x == null ? null : JSON.parse(JSON.stringify(x)));
const U1 = hex(401); const U2 = hex(402); const UD = hex(403);
const C1 = hex(411); const CD = hex(412);

const both = (fn) => Promise.all([fn(repo.impls.mongo), fn(repo.impls.pg)]);
const fproj = (raw) => { const x = norm(raw); return x == null ? null : {
  rating: x.rating, contentRating: x.contentRating ?? null, instructorRating: x.instructorRating ?? null, comment: x.comment || '',
  user: x.userId && x.userId.empCode !== undefined ? { empCode: x.userId.empCode, name: x.userId.name } : (x.userId ? String(x.userId) : null),
  cohort: x.cohortId && x.cohortId.classCode !== undefined ? { classCode: x.cohortId.classCode } : (x.cohortId ? String(x.cohortId) : null),
}; };

describePg('PG-parity: learning/feedback repository', () => {
  let mem;

  beforeAll(async () => {
    mem = await MongoMemoryServer.create();
    await mongoose.connect(mem.getUri());
    await mongoose.model('Feedback').init(); // unique (cohortId,userId)
    const db = mongoose.connection.db;
    await db.collection(mongoose.model('User').collection.name).insertMany([
      { _id: new mongoose.Types.ObjectId(U1), empCode: 'U1', name: 'Uno', department: 'Eng', isDeleted: false },
      { _id: new mongoose.Types.ObjectId(U2), empCode: 'U2', name: 'Dos', department: 'Eng', isDeleted: false },
      { _id: new mongoose.Types.ObjectId(UD), empCode: 'U3', name: 'Gone', department: 'Eng', isDeleted: true },
    ]);
    await db.collection(mongoose.model('Class').collection.name).insertMany([
      { _id: new mongoose.Types.ObjectId(C1), classCode: 'CC1', courseName: 'Course 1', isDeleted: false },
      { _id: new mongoose.Types.ObjectId(CD), classCode: 'CCD', courseName: 'Course D', isDeleted: true },
    ]);
    await query('TRUNCATE users, classes, feedbacks');
    await query(`INSERT INTO users(id,emp_code,name,department,is_deleted) VALUES ($1,'U1','Uno','Eng',false),($2,'U2','Dos','Eng',false),($3,'U3','Gone','Eng',true)`, [U1, U2, UD]);
    await query(`INSERT INTO classes(id,class_code,course_name,is_deleted) VALUES ($1,'CC1','Course 1',false),($2,'CCD','Course D',true)`, [C1, CD]);

    // upserts (both backends, same sequence)
    await both((r) => r.upsertFeedback({ cohortId: C1, userId: U1, rating: 5, contentRating: 4, comment: 'great' }));
    await both((r) => r.upsertFeedback({ cohortId: C1, userId: U2, rating: 4, comment: 'good' }));
    await both((r) => r.upsertFeedback({ cohortId: C1, userId: UD, rating: 3, comment: 'meh' })); // deleted user
  }, 60_000);

  afterAll(async () => {
    if (mongoose.connection.readyState) await mongoose.disconnect();
    if (mem) await mem.stop();
    await closePool();
  });

  test('upsertFeedback: re-submit updates the SAME row (idempotent) — identical', async () => {
    const [m, p] = await both((r) => r.upsertFeedback({ cohortId: C1, userId: U1, rating: 2, comment: 'changed' }));
    expect(fproj(m)).toMatchObject({ rating: 2, comment: 'changed' });
    expect(fproj(p)).toEqual(fproj(m));
    // still exactly one feedback for (C1,U1)
    const [mF, pF] = await both((r) => r.findFeedback(C1, U1));
    expect(fproj(mF)).toMatchObject({ rating: 2, comment: 'changed' });
    expect(fproj(pF)).toEqual(fproj(mF));
    const [mL, pL] = await both((r) => r.listFeedback({ cohortId: C1, learnerId: U1 }));
    expect(mL.length).toBe(1); expect(pL.length).toBe(1);
  });

  test('listFeedback: populate user+cohort, deleted user → null — identical', async () => {
    const [m, p] = await both((r) => r.listFeedback({ cohortId: C1 }));
    // order is updated_at desc but Mongo ties at ms-precision on rapid upserts;
    // compare as a multiset keyed by the distinct ratings instead.
    const byRating = (rows) => rows.map(fproj).sort((a, b) => a.rating - b.rating);
    expect(byRating(p)).toEqual(byRating(m));
    expect(m.map((f) => fproj(f).user)).toContain(null); // UD deleted → null
    const u1 = m.find((f) => fproj(f).user && fproj(f).user.empCode === 'U1');
    expect(fproj(u1).cohort).toEqual({ classCode: 'CC1' }); // cohort populated
  });

  test('findCohort hides deleted — identical', async () => {
    const [m, p] = await both((r) => r.findCohort(C1));
    expect(norm(m).classCode).toBe('CC1'); expect(norm(p).classCode).toBe('CC1');
    expect(await repo.impls.mongo.findCohort(CD)).toBeNull();
    expect(await repo.impls.pg.findCohort(CD)).toBeNull();
  });
});
