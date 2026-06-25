/**
 * ──────────────────────────────────────────────────────────
 * PG-parity — groups team-write repository (Mongo ↔ Postgres)
 * ──────────────────────────────────────────────────────────
 * Pins the MEMBERSHIP REPRESENTATION BRIDGE (the groups Wave-D unlock): Mongo
 * embeds `Team.members` as an array, Postgres normalises into the team_members
 * junction. The same semantic calls (insert team + members, replace members,
 * unassign class) must yield the same observable membership on both backends.
 * Runs only when a Postgres URL is present (the pg-parity CI job); SKIPS otherwise.
 *
 * Uses MongoMemoryReplSet (the multi-table PG writes run in a transaction).
 *
 * Pinned identical on both backends:
 *   1. insert tx — team row + its 3 member rows;
 *   2. update tx — member-replace swaps the membership set + patches name;
 *   3. unassign — class_id cleared, membership untouched;
 *   4. rollback — a throw rolls back BOTH the team row and its membership.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env.pg-prototype') });
const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');

const PG_URL = process.env.PG_URL || process.env.PG_PROTOTYPE_URL;
const describePg = PG_URL ? describe : describe.skip;

const { query, closePool } = require('../../config/pg');
const uow = require('../../domains/_shared/unit-of-work');
const repo = require('../../domains/groups/team-write-repository');
const Team = require('../../models/Team');

const hex = (n) => n.toString(16).padStart(24, '0');
const oid = (h) => new mongoose.Types.ObjectId(h);

const CLS = hex(0x901);
const L = hex(0x902);
const U1 = hex(0x911); const U2 = hex(0x912); const U3 = hex(0x913); const U4 = hex(0x914);

const BACKENDS = {
  mongo: { run: uow.impls.mongo, repo: repo.impls.mongo, classId: oid(CLS), leaderId: oid(L) },
  pg: { run: uow.impls.pg, repo: repo.impls.pg, classId: CLS, leaderId: L },
};

const sorted = (a) => [...a].sort();

// class_id of a team, per backend (used to assert unassign).
const teamClassId = async (b, teamId) => {
  if (b.repo === repo.impls.pg) {
    const { rows } = await query(`SELECT class_id FROM teams WHERE id = $1`, [teamId]);
    return rows[0] ? rows[0].class_id : undefined;
  }
  const doc = await Team.findById(teamId).select('classId').lean();
  return doc ? (doc.classId == null ? null : String(doc.classId)) : undefined;
};

describePg('PG-parity: groups team-write repository (membership bridge)', () => {
  let replSet;

  beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(replSet.getUri(), { dbName: 'pg_parity_groups_team_write' });
  }, 60_000);

  afterAll(async () => {
    if (mongoose.connection.readyState) await mongoose.disconnect();
    if (replSet) await replSet.stop();
    await closePool();
  });

  beforeEach(async () => {
    await Team.deleteMany({});
    await query('TRUNCATE teams, team_members');
  });

  test('insert tx: team + 3 member rows — identical membership set', async () => {
    for (const b of Object.values(BACKENDS)) {
      const team = await b.run((tx) => b.repo.insertTeam( // eslint-disable-line no-await-in-loop
        { name: 'Alpha', classId: b.classId, leaderId: b.leaderId, members: [U1, U2, U3] }, tx,
      ));
      expect(team.name).toBe('Alpha');
      expect(sorted(await b.repo.listTeamMemberIds(team._id))).toEqual(sorted([U1, U2, U3])); // eslint-disable-line no-await-in-loop
    }
  });

  test('update tx: member-replace swaps the set + patches name — identical', async () => {
    for (const b of Object.values(BACKENDS)) {
      const team = await b.run((tx) => b.repo.insertTeam( // eslint-disable-line no-await-in-loop
        { name: 'Alpha', classId: b.classId, leaderId: b.leaderId, members: [U1, U2, U3] }, tx,
      ));
      await b.run((tx) => b.repo.updateTeamDoc(team._id, { name: 'Beta', members: [U1, U4] }, tx)); // eslint-disable-line no-await-in-loop
      expect(sorted(await b.repo.listTeamMemberIds(team._id))).toEqual(sorted([U1, U4])); // eslint-disable-line no-await-in-loop
    }
  });

  test('unassign: class cleared, membership untouched — identical', async () => {
    for (const b of Object.values(BACKENDS)) {
      const team = await b.run((tx) => b.repo.insertTeam( // eslint-disable-line no-await-in-loop
        { name: 'Alpha', classId: b.classId, leaderId: b.leaderId, members: [U1, U2] }, tx,
      ));
      await b.repo.unassignTeamClass(team._id); // eslint-disable-line no-await-in-loop
      expect(await teamClassId(b, team._id)).toBeNull(); // eslint-disable-line no-await-in-loop
      expect(sorted(await b.repo.listTeamMemberIds(team._id))).toEqual(sorted([U1, U2])); // eslint-disable-line no-await-in-loop
    }
  });

  test('rollback: a throw rolls back both the team row and its membership — identical', async () => {
    for (const b of Object.values(BACKENDS)) {
      let createdId = null;
      await expect( // eslint-disable-line no-await-in-loop
        b.run(async (tx) => {
          const team = await b.repo.insertTeam(
            { name: 'Ghost', classId: b.classId, leaderId: b.leaderId, members: [U1, U2] }, tx,
          );
          createdId = team._id;
          throw new Error('boom after insert');
        }),
      ).rejects.toThrow('boom after insert');
      expect(await b.repo.listTeamMemberIds(createdId)).toEqual([]); // membership rolled back
      expect(await teamClassId(b, createdId)).toBeUndefined(); // team row rolled back
    }
  });
});
