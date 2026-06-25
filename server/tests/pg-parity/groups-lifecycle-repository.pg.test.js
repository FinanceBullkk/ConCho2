/**
 * ──────────────────────────────────────────────────────────
 * PG-parity — groups lifecycle repository (Mongo ↔ Postgres)
 * ──────────────────────────────────────────────────────────
 * The first REAL domain transaction ported onto the dual-backend Unit of Work
 * (the booking spike proved the primitive; this proves it on a production
 * mutation): the team soft-delete cascade (close Active enrollments + flip the
 * team to deleted, atomically) and the restore. Runs only when a Postgres URL
 * is present (the pg-parity CI job); SKIPS otherwise.
 *
 * Uses MongoMemoryReplSet (Mongo transactions need a replica set).
 *
 * Pinned identical on both backends:
 *   1. delete tx — closes exactly the Active enrollments + hides the team
 *      (findTeamById → null, findDeletedTeamById → the team);
 *   2. rollback — a throw rolls back BOTH the enrollment close and the team flip;
 *   3. restore — markTeamRestored un-hides the team.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env.pg-prototype') });
const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');

const PG_URL = process.env.PG_URL || process.env.PG_PROTOTYPE_URL;
const describePg = PG_URL ? describe : describe.skip;

const { query, closePool } = require('../../config/pg');
const uow = require('../../domains/_shared/unit-of-work');
const repo = require('../../domains/groups/lifecycle-repository');
const Team = require('../../models/Team');
const Enrollment = require('../../models/Enrollment');

const hex = (n) => n.toString(16).padStart(24, '0');
const oid = (h) => new mongoose.Types.ObjectId(h);
const coll = (m) => mongoose.model(m).collection.name;

// Shared ids (Mongo casts hex → ObjectId; PG stores text).
const T1 = hex(0x801);
const U1 = hex(0x811); const U2 = hex(0x812); const U3 = hex(0x813);
const E1 = hex(0x821); const E2 = hex(0x822); const E3 = hex(0x823);

const BACKENDS = {
  mongo: { run: uow.impls.mongo, repo: repo.impls.mongo, teamId: oid(T1) },
  pg: { run: uow.impls.pg, repo: repo.impls.pg, teamId: T1 },
};

// Active count for the team — observe the cascade outcome per backend.
const activeCount = async (b) => {
  if (b.repo === repo.impls.pg) {
    const { rows } = await query(`SELECT count(*)::int AS n FROM enrollments WHERE team_id=$1 AND status='Active'`, [T1]);
    return rows[0].n;
  }
  return Enrollment.countDocuments({ teamId: oid(T1), status: 'Active' });
};

const seed = async () => {
  // Mongo
  await mongoose.connection.db.collection(coll('Team')).deleteMany({});
  await mongoose.connection.db.collection(coll('Enrollment')).deleteMany({});
  await mongoose.connection.db.collection(coll('Team')).insertOne({ _id: oid(T1), name: 'Alpha', isDeleted: false });
  await mongoose.connection.db.collection(coll('Enrollment')).insertMany([
    { _id: oid(E1), userId: oid(U1), teamId: oid(T1), status: 'Active' },
    { _id: oid(E2), userId: oid(U2), teamId: oid(T1), status: 'Active' },
    { _id: oid(E3), userId: oid(U3), teamId: oid(T1), status: 'Dropped' }, // already closed
  ]);
  // PG
  await query('TRUNCATE teams, enrollments');
  await query(`INSERT INTO teams(id,name,is_deleted) VALUES ($1,'Alpha',false)`, [T1]);
  await query(
    `INSERT INTO enrollments(id,user_id,team_id,status) VALUES
      ($1,$4,$7,'Active'),($2,$5,$7,'Active'),($3,$6,$7,'Dropped')`,
    [E1, E2, E3, U1, U2, U3, T1],
  );
};

describePg('PG-parity: groups lifecycle repository', () => {
  let replSet;

  beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(replSet.getUri(), { dbName: 'pg_parity_groups_lifecycle' });
  }, 60_000);

  afterAll(async () => {
    if (mongoose.connection.readyState) await mongoose.disconnect();
    if (replSet) await replSet.stop();
    await closePool();
  });

  beforeEach(seed);

  test('delete tx: closes Active enrollments + hides the team — identical', async () => {
    for (const b of Object.values(BACKENDS)) {
      const closed = await b.run(async (tx) => { // eslint-disable-line no-await-in-loop
        const res = await b.repo.closeActiveEnrollments(b.teamId, tx);
        await b.repo.markTeamDeleted(b.teamId, tx);
        return res;
      });
      expect(closed.modifiedCount).toBe(2); // only the 2 Active rows
      expect(await b.repo.findTeamById(b.teamId)).toBeNull(); // eslint-disable-line no-await-in-loop
      expect(await b.repo.findDeletedTeamById(b.teamId)).toMatchObject({ name: 'Alpha' }); // eslint-disable-line no-await-in-loop
      expect(await activeCount(b)).toBe(0); // eslint-disable-line no-await-in-loop
    }
  });

  test('rollback: a throw rolls back both the close and the team flip — identical', async () => {
    for (const b of Object.values(BACKENDS)) {
      await expect( // eslint-disable-line no-await-in-loop
        b.run(async (tx) => {
          await b.repo.closeActiveEnrollments(b.teamId, tx);
          await b.repo.markTeamDeleted(b.teamId, tx);
          throw new Error('boom after cascade');
        }),
      ).rejects.toThrow('boom after cascade');
      expect(await b.repo.findTeamById(b.teamId)).toMatchObject({ name: 'Alpha' }); // still live
      expect(await activeCount(b)).toBe(2); // enrollments un-closed
    }
  });

  test('restore: markTeamRestored un-hides the team — identical', async () => {
    for (const b of Object.values(BACKENDS)) {
      await b.run((tx) => b.repo.markTeamDeleted(b.teamId, tx)); // eslint-disable-line no-await-in-loop
      expect(await b.repo.findTeamById(b.teamId)).toBeNull(); // eslint-disable-line no-await-in-loop
      await b.repo.markTeamRestored(T1); // eslint-disable-line no-await-in-loop
      expect(await b.repo.findTeamById(b.teamId)).toMatchObject({ name: 'Alpha' }); // eslint-disable-line no-await-in-loop
    }
  });
});
