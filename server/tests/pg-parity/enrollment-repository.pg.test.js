/**
 * ──────────────────────────────────────────────────────────
 * PG-parity test — learning/enrollment repository (Mongo ↔ Postgres)
 * ──────────────────────────────────────────────────────────
 * Cohort-scoped enrollment reads + the shared insertActiveEnrollment spine +
 * program-policy resolvers. Runs only when a Postgres URL is present; SKIPS
 * otherwise. Asserts identical behaviour + traps: cohort duplicate guard
 * (partial-unique), populate('userId'/'classId'/'teamId') dropping soft-deleted
 * refs to null, both-mode learner read, findCohort hides deleted, scheduling/
 * capacity resolvers (no-program → null/{}).
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env.pg-prototype') });
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const PG_URL = process.env.PG_URL || process.env.PG_PROTOTYPE_URL;
const describePg = PG_URL ? describe : describe.skip;

const { query, closePool } = require('../../config/pg');
require('../../models/User'); // populate('userId') ref + Team ref not loaded by the enrollment repo
require('../../models/Team');
const repo = require('../../domains/learning/enrollment/repository');

const hex = (n) => n.toString(16).padStart(24, '0');
const oid = (h) => new mongoose.Types.ObjectId(h);
const coll = (m) => mongoose.model(m).collection.name;
const day = (n) => new Date(Date.UTC(2026, 0, n, 0, 0, 0));
const norm = (x) => (x == null ? null : JSON.parse(JSON.stringify(x)));

const U1 = hex(301); const U2 = hex(302); const UD = hex(303);
const P1 = hex(311);
const C1 = hex(321); const C2 = hex(322); const CD = hex(323);
const T1 = hex(331);
const E1 = hex(341); const E2 = hex(342); const E3 = hex(343); const E4 = hex(344);

const userF = (u) => (u == null ? null : (u.empCode !== undefined ? { empCode: u.empCode, name: u.name, status: u.status } : String(u)));
const clsF = (c) => (c == null ? null : (c.classCode !== undefined ? { classCode: c.classCode, courseName: c.courseName } : String(c)));
const teamF = (t) => (t == null ? null : (t.name !== undefined ? { name: t.name } : String(t)));
const eproj = (raw) => { const e = norm(raw); return e == null ? null : { user: userF(e.userId), cls: clsF(e.classId), team: teamF(e.teamId), status: e.status }; };

describePg('PG-parity: learning/enrollment repository', () => {
  let mem;

  beforeAll(async () => {
    mem = await MongoMemoryServer.create();
    await mongoose.connect(mem.getUri());
    await mongoose.model('Enrollment').init(); // cohort + team partial-unique
    const db = mongoose.connection.db;

    await db.collection(coll('User')).insertMany([
      { _id: oid(U1), empCode: 'U1', name: 'Uno', department: 'Eng', status: 'Active', isDeleted: false },
      { _id: oid(U2), empCode: 'U2', name: 'Dos', department: 'Eng', status: 'Active', isDeleted: false },
      { _id: oid(UD), empCode: 'U3', name: 'Gone', department: 'Eng', status: 'Active', isDeleted: true },
    ]);
    await db.collection(coll('LearningProgram')).insertMany([
      { _id: oid(P1), name: 'Prog 1', code: 'PG-1', schedulingMode: 'self_enroll', capacityPolicy: { maxParticipants: 30 } },
    ]);
    await db.collection(coll('Class')).insertMany([
      { _id: oid(C1), classCode: 'CC1', courseName: 'Course 1', programId: oid(P1), isDeleted: false },
      { _id: oid(C2), classCode: 'CC2', courseName: 'Course 2', programId: null, isDeleted: false },
      { _id: oid(CD), classCode: 'CCD', courseName: 'Course D', programId: oid(P1), isDeleted: true },
    ]);
    await db.collection(coll('Team')).insertMany([{ _id: oid(T1), name: 'Group A', isDeleted: false }]);
    const enr = [
      { id: E1, u: U1, c: C1, t: null, on: day(1) },
      { id: E2, u: U2, c: C1, t: null, on: day(2) },
      { id: E3, u: U1, c: C2, t: T1, on: day(3) }, // team mode
      { id: E4, u: UD, c: C1, t: null, on: day(4) }, // deleted user → populate null
    ];
    await db.collection(coll('Enrollment')).insertMany(enr.map((e) => ({
      _id: oid(e.id), userId: oid(e.u), classId: oid(e.c), teamId: e.t ? oid(e.t) : null, status: 'Active',
      joinedAt: e.on, createdAt: e.on,
    })));

    await query('TRUNCATE users, learning_programs, classes, teams, enrollments');
    await query(`INSERT INTO users(id,emp_code,name,department,status,is_deleted) VALUES ($1,'U1','Uno','Eng','Active',false),($2,'U2','Dos','Eng','Active',false),($3,'U3','Gone','Eng','Active',true)`, [U1, U2, UD]);
    await query(`INSERT INTO learning_programs(id,name,code,scheduling_mode,capacity_policy) VALUES ($1,'Prog 1','PG-1','self_enroll','{"maxParticipants":30}')`, [P1]);
    await query(`INSERT INTO classes(id,class_code,course_name,program_id,is_deleted) VALUES ($1,'CC1','Course 1',$2,false),($3,'CC2','Course 2',null,false),($4,'CCD','Course D',$5,true)`, [C1, P1, C2, CD, P1]);
    await query(`INSERT INTO teams(id,name,is_deleted) VALUES ($1,'Group A',false)`, [T1]);
    await query(
      `INSERT INTO enrollments(id,user_id,class_id,team_id,status,joined_at,created_at) VALUES
        ($1,$2,$3,null,'Active',$4,$4),($5,$6,$7,null,'Active',$8,$8),($9,$10,$11,$12,'Active',$13,$13),($14,$15,$16,null,'Active',$17,$17)`,
      [E1, U1, C1, day(1).toISOString(), E2, U2, C1, day(2).toISOString(), E3, U1, C2, T1, day(3).toISOString(), E4, UD, C1, day(4).toISOString()]);
  }, 60_000);

  afterAll(async () => {
    if (mongoose.connection.readyState) await mongoose.disconnect();
    if (mem) await mem.stop();
    await closePool();
  });

  const both = (fn) => Promise.all([fn(repo.impls.mongo), fn(repo.impls.pg)]);

  test('insertActiveEnrollment: new cohort enrollment + duplicate guard — identical', async () => {
    const fresh = hex(361);
    const [m, p] = await both((r) => r.insertActiveEnrollment({ userId: fresh, classId: C1 }));
    expect(eproj(m)).toEqual({ user: fresh, cls: C1, team: null, status: 'Active' });
    expect(eproj(p)).toEqual(eproj(m));
    // duplicate active cohort enrollment (same user+cohort) rejected on both,
    // with the SAME Mongo-style { code: 11000 } (PG maps 23505 → 11000) so the
    // use-case's duplicate handler returns 409 on either backend, not a raw 500.
    await expect(repo.impls.mongo.insertActiveEnrollment({ userId: fresh, classId: C1 }))
      .rejects.toMatchObject({ code: 11000 });
    await expect(repo.impls.pg.insertActiveEnrollment({ userId: fresh, classId: C1 }))
      .rejects.toMatchObject({ code: 11000 });
  });

  test('findActiveCohortEnrollment + findCohortEnrollmentById + markDropped — identical', async () => {
    const [mF, pF] = await both((r) => r.findActiveCohortEnrollment(U1, C1));
    expect(eproj(mF)).toEqual({ user: U1, cls: C1, team: null, status: 'Active' });
    expect(eproj(pF)).toEqual(eproj(mF));
    expect(await repo.impls.mongo.findCohortEnrollmentById(E3)).toBeNull(); // E3 has teamId → not a cohort enrollment
    expect(await repo.impls.pg.findCohortEnrollmentById(E3)).toBeNull();
    const [mD, pD] = await both((r) => r.markDropped(E2));
    expect(norm(mD).status).toBe('Dropped');
    expect(norm(pD).status).toBe('Dropped');
  });

  test('listCohortEnrollments: populate user+class, deleted user → null, order — identical', async () => {
    const [m, p] = await both((r) => r.listCohortEnrollments({ cohortId: C1 }));
    // same projection sequence + order (created_at desc); no status filter, so the
    // dropped E2 + the deleted/no-user rows all appear.
    expect(p.map(eproj)).toEqual(m.map(eproj));
    expect(m.map((e) => eproj(e).user)).toContain(null); // deleted user populates to null
    const u1 = m.find((e) => eproj(e).user && eproj(e).user.empCode === 'U1');
    expect(eproj(u1).cls).toEqual({ classCode: 'CC1', courseName: 'Course 1' }); // class populated
  });

  test('listEnrollmentsForLearner: both modes, populate class+team, order — identical', async () => {
    const [m, p] = await both((r) => r.listEnrollmentsForLearner(U1));
    // E3 (team, joined day3) then E1 (cohort, joined day1)
    expect(m.map((e) => eproj(e))).toEqual([
      { user: U1, cls: { classCode: 'CC2', courseName: 'Course 2' }, team: { name: 'Group A' }, status: 'Active' },
      { user: U1, cls: { classCode: 'CC1', courseName: 'Course 1' }, team: null, status: 'Active' },
    ]);
    expect(p.map((e) => eproj(e))).toEqual(m.map((e) => eproj(e)));
  });

  test('findCohort (hides deleted) + scheduling/capacity resolvers — identical', async () => {
    const [mC, pC] = await both((r) => r.findCohort(C1));
    expect(norm(mC)).toMatchObject({ classCode: 'CC1', courseName: 'Course 1' });
    expect(norm(pC).classCode).toBe('CC1');
    expect(await repo.impls.mongo.findCohort(CD)).toBeNull(); // deleted cohort hidden
    expect(await repo.impls.pg.findCohort(CD)).toBeNull();

    const [mS, pS] = await both((r) => r.findCohortSchedulingMode(C1));
    expect(mS).toBe('self_enroll'); expect(pS).toBe('self_enroll');
    const [mS2, pS2] = await both((r) => r.findCohortSchedulingMode(C2)); // no program
    expect(mS2).toBeNull(); expect(pS2).toBeNull();

    const [mCap, pCap] = await both((r) => r.findCohortCapacityPolicy(C1));
    expect(mCap).toMatchObject({ maxParticipants: 30 }); expect(pCap).toMatchObject({ maxParticipants: 30 });
    const [mCap2, pCap2] = await both((r) => r.findCohortCapacityPolicy(C2)); // no program → {}
    expect(mCap2).toEqual({}); expect(pCap2).toEqual({});

    const [mN, pN] = await both((r) => r.countActiveCohortEnrollments(C1)); // E1(U1),E4(UD) Active (E2 dropped above)
    expect(mN).toBe(pN);
  });
});
