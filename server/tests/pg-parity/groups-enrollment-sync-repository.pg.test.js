/**
 * ──────────────────────────────────────────────────────────
 * PG-parity — groups enrollment-sync repository (Mongo ↔ Postgres)
 * ──────────────────────────────────────────────────────────
 * The hardest groups slice: the legacy code held LIVE Enrollment docs and
 * mutated + `.save()`d them (no Postgres analogue). This pins that the new
 * EXPLICIT transfer/drop + the membership remove behave identically on both
 * backends, on the unit-of-work transaction boundary. Runs only when a Postgres
 * URL is present (the pg-parity CI job); SKIPS otherwise.
 *
 * Uses MongoMemoryReplSet (the writes run in a transaction).
 *
 * Pinned identical on both backends:
 *   1. findTeamForEnrollmentContext — team + cohort label;
 *   2. transfer tx — source enrollment → Transferred + transferred_to, learner
 *      pulled from the old team's roster;
 *   3. drop tx — Active enrollment in this team → Dropped;
 *   4. findUserContact — name/email;
 *   5. rollback — a throw rolls back the transfer + the roster pull.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env.pg-prototype') });
const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');

const PG_URL = process.env.PG_URL || process.env.PG_PROTOTYPE_URL;
const describePg = PG_URL ? describe : describe.skip;

const { query, closePool } = require('../../config/pg');
const uow = require('../../domains/_shared/unit-of-work');
const repo = require('../../domains/groups/enrollment-sync-repository');
const Team = require('../../models/Team');
const Enrollment = require('../../models/Enrollment');

const hex = (n) => n.toString(16).padStart(24, '0');
const oid = (h) => new mongoose.Types.ObjectId(h);

const C1 = hex(0xa01);
const T1 = hex(0xa11); const T2 = hex(0xa12);
const U1 = hex(0xa21); const U2 = hex(0xa22); const U3 = hex(0xa23);
const E1 = hex(0xa31); const E3 = hex(0xa33);

const BACKENDS = {
  mongo: { run: uow.impls.mongo, repo: repo.impls.mongo, t1: oid(T1), t2: oid(T2), u3: oid(U3), u1: oid(U1), e1: oid(E1), e3: oid(E3) },
  pg: { run: uow.impls.pg, repo: repo.impls.pg, t1: T1, t2: T2, u3: U3, u1: U1, e1: E1, e3: E3 },
};

const sorted = (a) => [...a].sort();

// Read helpers per backend (observe the write outcomes).
const enrollmentState = async (b, id) => {
  if (b.repo === repo.impls.pg) {
    const { rows } = await query(`SELECT status, transferred_to FROM enrollments WHERE id = $1`, [id]);
    return rows[0] ? { status: rows[0].status, transferredTo: rows[0].transferred_to } : null;
  }
  const d = await Enrollment.findById(id).lean();
  return d ? { status: d.status, transferredTo: d.transferredTo == null ? null : String(d.transferredTo) } : null;
};
const teamMembers = async (b, teamId) => {
  if (b.repo === repo.impls.pg) {
    const { rows } = await query(`SELECT user_id FROM team_members WHERE team_id = $1`, [teamId]);
    return rows.map((r) => r.user_id);
  }
  const d = await Team.findById(teamId).select('members').lean();
  return d ? d.members.map((m) => String(m)) : [];
};

const seed = async () => {
  // Mongo
  const db = mongoose.connection.db;
  await Promise.all([Team, Enrollment].map((m) => db.collection(m.collection.name).deleteMany({})));
  await db.collection(mongoose.model('Class').collection.name).deleteMany({});
  await db.collection(mongoose.model('User').collection.name).deleteMany({});
  await db.collection('classes').insertOne({ _id: oid(C1), classCode: 'C-1', courseName: 'Course One', isDeleted: false });
  await db.collection('users').insertMany([
    { _id: oid(U1), empCode: 'EA', name: 'Alice', email: 'alice@x.io', isDeleted: false },
    { _id: oid(U2), empCode: 'EB', name: 'Bob', email: 'bob@x.io', isDeleted: false },
    { _id: oid(U3), empCode: 'EC', name: 'Carol', email: 'carol@x.io', isDeleted: false },
  ]);
  await db.collection('teams').insertMany([
    { _id: oid(T1), name: 'Alpha', classId: oid(C1), members: [oid(U1), oid(U2)], isDeleted: false },
    { _id: oid(T2), name: 'Beta', members: [oid(U3)], isDeleted: false },
  ]);
  await db.collection('enrollments').insertMany([
    { _id: oid(E1), userId: oid(U1), teamId: oid(T1), classId: oid(C1), status: 'Active' },
    { _id: oid(E3), userId: oid(U3), teamId: oid(T2), status: 'Active' },
  ]);
  // PG
  await query('TRUNCATE teams, team_members, enrollments, classes, users');
  await query(`INSERT INTO classes(id,class_code,course_name,is_deleted) VALUES ($1,'C-1','Course One',false)`, [C1]);
  await query(`INSERT INTO users(id,emp_code,name,email,is_deleted) VALUES ($1,'EA','Alice','alice@x.io',false),($2,'EB','Bob','bob@x.io',false),($3,'EC','Carol','carol@x.io',false)`, [U1, U2, U3]);
  await query(`INSERT INTO teams(id,name,class_id,is_deleted) VALUES ($1,'Alpha',$3,false),($2,'Beta',NULL,false)`, [T1, T2, C1]);
  await query(`INSERT INTO team_members(team_id,user_id) VALUES ($1,$3),($1,$4),($2,$5)`, [T1, T2, U1, U2, U3]);
  await query(`INSERT INTO enrollments(id,user_id,team_id,class_id,status) VALUES ($1,$3,$5,$6,'Active'),($2,$4,$7,NULL,'Active')`, [E1, E3, U1, U3, T1, C1, T2]);
};

describePg('PG-parity: groups enrollment-sync repository', () => {
  let replSet;

  beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(replSet.getUri(), { dbName: 'pg_parity_groups_enrollment_sync' });
  }, 60_000);

  afterAll(async () => {
    if (mongoose.connection.readyState) await mongoose.disconnect();
    if (replSet) await replSet.stop();
    await closePool();
  });

  beforeEach(seed);

  test('findTeamForEnrollmentContext — team + cohort label identical', async () => {
    for (const b of Object.values(BACKENDS)) {
      const ctx = await b.repo.findTeamForEnrollmentContext(b.t1); // eslint-disable-line no-await-in-loop
      expect(ctx.name).toBe('Alpha');
      expect(ctx.classId).toMatchObject({ classCode: 'C-1', courseName: 'Course One' });
    }
  });

  test('transfer tx: source → Transferred + transferred_to, learner pulled from old team — identical', async () => {
    for (const b of Object.values(BACKENDS)) {
      const source = await b.repo.findActiveEnrollmentInOtherTeam(b.u3, b.t1); // eslint-disable-line no-await-in-loop
      expect(String(source.teamId._id)).toBe(String(b.t2));
      await b.run(async (tx) => { // eslint-disable-line no-await-in-loop
        await b.repo.transferEnrollment(source._id, { toTeamId: b.t1, leftAt: new Date('2026-09-01T00:00:00Z') }, tx);
        await b.repo.pullTeamMember(source.teamId._id, b.u3, tx);
      });
      const st = await enrollmentState(b, b.e3); // eslint-disable-line no-await-in-loop
      expect(st.status).toBe('Transferred');
      expect(String(st.transferredTo)).toBe(String(b.t1));
      expect(sorted(await teamMembers(b, b.t2))).toEqual([]); // U3 pulled
    }
  });

  test('drop tx: Active enrollment in this team → Dropped — identical', async () => {
    for (const b of Object.values(BACKENDS)) {
      const active = await b.repo.findActiveEnrollmentInTeam(b.u1, b.t1); // eslint-disable-line no-await-in-loop
      expect(String(active._id)).toBe(String(b.e1));
      await b.run((tx) => b.repo.dropEnrollment(active._id, { leftAt: new Date('2026-09-01T00:00:00Z') }, tx)); // eslint-disable-line no-await-in-loop
      expect((await enrollmentState(b, b.e1)).status).toBe('Dropped'); // eslint-disable-line no-await-in-loop
    }
  });

  test('findUserContact — name/email identical', async () => {
    for (const b of Object.values(BACKENDS)) {
      expect(await b.repo.findUserContact(b.u1)).toEqual({ name: 'Alice', email: 'alice@x.io' }); // eslint-disable-line no-await-in-loop
    }
  });

  test('rollback: a throw rolls back the transfer + the roster pull — identical', async () => {
    for (const b of Object.values(BACKENDS)) {
      const source = await b.repo.findActiveEnrollmentInOtherTeam(b.u3, b.t1); // eslint-disable-line no-await-in-loop
      await expect( // eslint-disable-line no-await-in-loop
        b.run(async (tx) => {
          await b.repo.transferEnrollment(source._id, { toTeamId: b.t1, leftAt: new Date() }, tx);
          await b.repo.pullTeamMember(source.teamId._id, b.u3, tx);
          throw new Error('boom mid-transfer');
        }),
      ).rejects.toThrow('boom mid-transfer');
      expect((await enrollmentState(b, b.e3)).status).toBe('Active'); // unchanged
      expect(sorted(await teamMembers(b, b.t2))).toEqual(sorted([String(b.u3)])); // still a member
    }
  });
});
