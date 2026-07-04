/**
 * ──────────────────────────────────────────────────────────
 * PG-parity — search repository (Mongo ↔ Postgres)
 * ──────────────────────────────────────────────────────────
 * services/search/search-repository.{mongo,pg} (Phase 3 Wave-F, legacy-tail
 * port) — all 6 finders behind searchService's global search. Standalone
 * mongod (read-only). Runs only when a Postgres URL is present (the
 * pg-parity CI job); SKIPS otherwise.
 *
 * Pinned identical on both backends:
 *   1. findUsers: Admin (all) / Teacher (Participants-only) / Participant
 *      (own record only) scoping, soft-delete exclusion;
 *   2. prefix-only match for a <4-char query vs substring match for ≥4 chars
 *      (Mongo's anchored-prefix/substring regex pair ⇔ ILIKE 'q%' / '%q%' —
 *      a substring match is always a superset of a prefix match, so ONE
 *      ILIKE pattern reproduces the identical result set);
 *   3. case-insensitivity + a regex-special char (`(`, `+`) matched literally
 *      on both backends (escapeRegex on the Mongo side; those characters are
 *      already literal in ILIKE, only %/_/\\ need escaping there);
 *   4. findTeams: populate(classId)/populate(leaderId) ⇔ LEFT JOIN guarded by
 *      is_deleted=false — a soft-deleted/missing ref resolves to null on both;
 *      the `members` array-of-refs ⇔ team_members join table; Participant
 *      scope on `members` (not `leaderId` — a leader who isn't also a member
 *      must NOT match);
 *   5. findClasses / findPrograms / findDepartments: soft-delete exclusion +
 *      multi-field OR;
 *   6. findMemberClassIds: distinct, soft-deleted teams excluded, null
 *      classId filtered out.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env.pg-prototype') });
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const PG_URL = process.env.PG_URL || process.env.PG_PROTOTYPE_URL;
const describePg = PG_URL ? describe : describe.skip;

const { query, closePool } = require('../../config/pg');
const searchRepo = require('../../services/search/search-repository');

const hex = (n) => n.toString(16).padStart(24, '0');
const oid = (h) => new mongoose.Types.ObjectId(h);
const coll = (m) => mongoose.model(m).collection.name;
const plain = (v) => JSON.parse(JSON.stringify(v));

// Ascending hex ids in insertion order — both backends' natural/ORDER-BY-id
// order line up (neither the Mongo original nor this port sorts these finders).
const U1 = hex(0x001); // Admin — 'Alice Nguyen' / alice@corp.com
const U2 = hex(0x002); // Participant — 'Bob Tran' / bob@corp.com
const U3 = hex(0x003); // Participant — 'Carol (Lead)' / carol@corp.com — regex-special char in name
const U4 = hex(0x004); // Participant, soft-deleted — excluded from everything

const C1 = hex(0x011); // live class
const C2 = hex(0x012); // soft-deleted class

const T1 = hex(0x021); // 'Marketing+Growth' — regex-special char; leader U1, members [U2,U3]
const T2 = hex(0x022); // 'Ops Team'; no class/leader; members [U2]
const T3 = hex(0x023); // soft-deleted team — excluded

const P1 = hex(0x031); // live program
const P2 = hex(0x032); // soft-deleted program

const D1 = hex(0x041); // live department
const D2 = hex(0x042); // soft-deleted department

const BACKENDS = {
  mongo: { repo: searchRepo.impls.mongo, id: (h) => oid(h) },
  pg: { repo: searchRepo.impls.pg, id: (h) => h },
};

const seedMongo = async () => {
  const db = mongoose.connection.db;
  await Promise.all(
    ['User', 'Team', 'Class', 'LearningProgram', 'Department']
      .map((m) => db.collection(coll(m)).deleteMany({})),
  );
  await db.collection(coll('User')).insertMany([
    { _id: oid(U1), empCode: '000001', name: 'Alice Nguyen', department: 'Ops', email: 'alice@corp.com', role: 'Admin', status: 'Active', isDeleted: false },
    { _id: oid(U2), empCode: '000002', name: 'Bob Tran', department: 'HR', email: 'bob@corp.com', role: 'Participant', status: 'Active', isDeleted: false },
    { _id: oid(U3), empCode: '000003', name: 'Carol (Lead)', department: 'Ops', email: 'carol@corp.com', role: 'Participant', status: 'Active', isDeleted: false },
    { _id: oid(U4), empCode: '000004', name: 'Dave Gone', department: 'Ops', email: 'dave@corp.com', role: 'Participant', status: 'Active', isDeleted: true },
  ]);
  await db.collection(coll('Class')).insertMany([
    { _id: oid(C1), classCode: 'EL001', courseName: 'English Level 1', status: 'Ongoing', totalSessions: 20, isDeleted: false },
    { _id: oid(C2), classCode: 'EL002', courseName: 'Deleted Course', status: 'Ongoing', totalSessions: 10, isDeleted: true },
  ]);
  await db.collection(coll('Team')).insertMany([
    { _id: oid(T1), name: 'Marketing+Growth', classId: oid(C1), leaderId: oid(U1), members: [oid(U2), oid(U3)], isDeleted: false },
    { _id: oid(T2), name: 'Ops Team', classId: null, leaderId: null, members: [oid(U2)], isDeleted: false },
    { _id: oid(T3), name: 'Trashed Team', classId: null, leaderId: null, members: [], isDeleted: true },
  ]);
  await db.collection(coll('LearningProgram')).insertMany([
    { _id: oid(P1), code: 'LEAD', name: 'Leadership', status: 'active', isDeleted: false },
    { _id: oid(P2), code: 'OLDP', name: 'Old Program', status: 'archived', isDeleted: true },
  ]);
  await db.collection(coll('Department')).insertMany([
    { _id: oid(D1), name: 'Operations', code: 'OPS', isDeleted: false },
    { _id: oid(D2), name: 'Old Dept', code: 'OLD', isDeleted: true },
  ]);
};

const seedPg = async () => {
  await query('TRUNCATE users, teams, team_members, classes, learning_programs, departments');
  await query(
    `INSERT INTO users(id, emp_code, name, department, email, role, status, is_deleted) VALUES
      ($1,'000001','Alice Nguyen','Ops','alice@corp.com','Admin','Active',false),
      ($2,'000002','Bob Tran','HR','bob@corp.com','Participant','Active',false),
      ($3,'000003','Carol (Lead)','Ops','carol@corp.com','Participant','Active',false),
      ($4,'000004','Dave Gone','Ops','dave@corp.com','Participant','Active',true)`,
    [U1, U2, U3, U4],
  );
  await query(
    `INSERT INTO classes(id, class_code, course_name, status, total_sessions, is_deleted) VALUES
      ($1,'EL001','English Level 1','Ongoing',20,false),
      ($2,'EL002','Deleted Course','Ongoing',10,true)`,
    [C1, C2],
  );
  await query(
    `INSERT INTO teams(id, name, class_id, leader_id, is_deleted) VALUES
      ($1,'Marketing+Growth',$2,$3,false),
      ($4,'Ops Team',NULL,NULL,false),
      ($5,'Trashed Team',NULL,NULL,true)`,
    [T1, C1, U1, T2, T3],
  );
  await query(
    `INSERT INTO team_members(team_id, user_id) VALUES ($1,$2), ($1,$3), ($4,$2)`,
    [T1, U2, U3, T2],
  );
  await query(
    `INSERT INTO learning_programs(id, code, name, status, is_deleted) VALUES
      ($1,'LEAD','Leadership','active',false),
      ($2,'OLDP','Old Program','archived',true)`,
    [P1, P2],
  );
  await query(
    `INSERT INTO departments(id, name, code, is_deleted) VALUES
      ($1,'Operations','OPS',false),
      ($2,'Old Dept','OLD',true)`,
    [D1, D2],
  );
};

describePg('PG-parity: search repository', () => {
  let mongod;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri('pg-parity-search'));
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

  test('findUsers: Admin/Teacher/Participant scoping, prefix vs substring, regex-special char — identical', async () => {
    const cases = [
      { q: 'ali', role: 'Admin', userId: null },   // 3 chars: prefix-only, matches name 'Alice...'
      { q: 'corp', role: 'Admin', userId: null },  // 4 chars: substring on email — every live user
      { q: 'corp', role: 'Teacher', userId: null }, // Teacher: Participants only
      { q: 'corp', role: 'Participant', userId: U2 }, // self-scoped
      { q: '(lea', role: 'Admin', userId: null },  // regex-special '(' — literal match, case-insensitive
    ];
    for (const c of cases) {
      /* eslint-disable no-await-in-loop */
      const mongoRows = await BACKENDS.mongo.repo.findUsers({
        q: c.q, role: c.role, userId: c.userId ? oid(c.userId) : undefined, limit: 10,
      });
      const pgRows = await BACKENDS.pg.repo.findUsers({ q: c.q, role: c.role, userId: c.userId, limit: 10 });
      expect(plain(pgRows)).toEqual(plain(mongoRows));
      /* eslint-enable no-await-in-loop */
    }

    // Pin the actual result sets (not just cross-backend equality) for the interesting cases.
    const admin4 = await BACKENDS.mongo.repo.findUsers({ q: 'corp', role: 'Admin', userId: null, limit: 10 });
    expect(admin4.map((u) => u.empCode)).toEqual(['000001', '000002', '000003']); // U4 soft-deleted excluded

    const teacher = await BACKENDS.mongo.repo.findUsers({ q: 'corp', role: 'Teacher', userId: null, limit: 10 });
    expect(teacher.map((u) => u.empCode)).toEqual(['000002', '000003']); // Admin U1 excluded

    const self = await BACKENDS.mongo.repo.findUsers({ q: 'corp', role: 'Participant', userId: oid(U2), limit: 10 });
    expect(self.map((u) => u.empCode)).toEqual(['000002']);

    const special = await BACKENDS.mongo.repo.findUsers({ q: '(lea', role: 'Admin', userId: null, limit: 10 });
    expect(special.map((u) => u.empCode)).toEqual(['000003']);
  });

  test('findTeams: populate→null on deleted/missing ref, "+" regex-special char, members vs leader scoping — identical', async () => {
    const cases = [
      { q: 'team', role: 'Admin', userId: null },              // 4 chars substring, no class/leader ref
      { q: 'ing+gr', role: 'Admin', userId: null },             // '+' literal, class+leader both populate
      { q: 'ing+gr', role: 'Participant', userId: U3 },         // U3 is a MEMBER of T1 → included
      { q: 'ing+gr', role: 'Participant', userId: U1 },         // U1 is only the LEADER of T1, not a member → excluded
    ];
    for (const c of cases) {
      /* eslint-disable no-await-in-loop */
      const mongoRows = await BACKENDS.mongo.repo.findTeams({
        q: c.q, role: c.role, userId: c.userId ? oid(c.userId) : undefined, limit: 10,
      });
      const pgRows = await BACKENDS.pg.repo.findTeams({ q: c.q, role: c.role, userId: c.userId, limit: 10 });
      expect(plain(pgRows)).toEqual(plain(mongoRows));
      /* eslint-enable no-await-in-loop */
    }

    const opsTeam = await BACKENDS.mongo.repo.findTeams({ q: 'team', role: 'Admin', userId: null, limit: 10 });
    expect(opsTeam).toHaveLength(1);
    expect(opsTeam[0].name).toBe('Ops Team');
    expect(opsTeam[0].classId).toBeNull();
    expect(opsTeam[0].leaderId).toBeNull();

    const marketing = await BACKENDS.mongo.repo.findTeams({ q: 'ing+gr', role: 'Admin', userId: null, limit: 10 });
    expect(marketing).toHaveLength(1);
    expect(marketing[0]).toMatchObject({
      name: 'Marketing+Growth',
      classId: { classCode: 'EL001', courseName: 'English Level 1' },
      leaderId: { empCode: '000001', name: 'Alice Nguyen' },
    });
    expect(marketing[0].members.map(String).sort()).toEqual([U2, U3].sort());

    const memberScope = await BACKENDS.mongo.repo.findTeams({ q: 'ing+gr', role: 'Participant', userId: oid(U3), limit: 10 });
    expect(memberScope).toHaveLength(1);
    const leaderOnlyScope = await BACKENDS.mongo.repo.findTeams({ q: 'ing+gr', role: 'Participant', userId: oid(U1), limit: 10 });
    expect(leaderOnlyScope).toHaveLength(0);
  });

  test('findTeams: soft-deleted class ref on a team populates to null (join-miss), team itself soft-deleted excluded', async () => {
    // Re-point T2 at the soft-deleted class C2 to exercise the classId populate→null path.
    await query('UPDATE teams SET class_id = $1 WHERE id = $2', [C2, T2]);
    await mongoose.connection.db.collection(coll('Team')).updateOne({ _id: oid(T2) }, { $set: { classId: oid(C2) } });

    const mongoRows = await BACKENDS.mongo.repo.findTeams({ q: 'team', role: 'Admin', userId: null, limit: 10 });
    const pgRows = await BACKENDS.pg.repo.findTeams({ q: 'team', role: 'Admin', userId: null, limit: 10 });
    expect(mongoRows).toHaveLength(1);
    expect(mongoRows[0].classId).toBeNull(); // ref exists but points at a soft-deleted class
    expect(plain(pgRows)).toEqual(plain(mongoRows));

    // Trashed Team never appears regardless of query.
    const trashed = await BACKENDS.mongo.repo.findTeams({ q: 'trash', role: 'Admin', userId: null, limit: 10 });
    expect(trashed).toHaveLength(0);
  });

  test('findClasses / findPrograms / findDepartments: soft-delete exclusion + multi-field OR — identical', async () => {
    const classCases = [{ q: 'el00', limit: 10 }]; // 4 chars substring — matches EL001 AND EL002 (soft-deleted excluded)
    for (const c of classCases) {
      /* eslint-disable no-await-in-loop */
      const mongoRows = await BACKENDS.mongo.repo.findClasses(c);
      const pgRows = await BACKENDS.pg.repo.findClasses(c);
      expect(mongoRows.map((r) => r.classCode)).toEqual(['EL001']);
      expect(plain(pgRows)).toEqual(plain(mongoRows));
      /* eslint-enable no-await-in-loop */
    }

    const progMongo = await BACKENDS.mongo.repo.findPrograms({ q: 'lead', limit: 10 }); // matches name + code
    const progPg = await BACKENDS.pg.repo.findPrograms({ q: 'lead', limit: 10 });
    expect(progMongo.map((p) => p.code)).toEqual(['LEAD']);
    expect(plain(progPg)).toEqual(plain(progMongo));

    // 3-char prefix-only: 'ops' matches code 'OPS' (prefix) but NOT name 'Operations' (starts with 'Ope').
    const deptMongo = await BACKENDS.mongo.repo.findDepartments({ q: 'ops', limit: 10 });
    const deptPg = await BACKENDS.pg.repo.findDepartments({ q: 'ops', limit: 10 });
    expect(deptMongo.map((d) => d.code)).toEqual(['OPS']);
    expect(plain(deptPg)).toEqual(plain(deptMongo));
  });

  test('findMemberClassIds: distinct, soft-deleted teams excluded, null classId filtered — identical', async () => {
    for (const [userHex, expected] of [[U2, [C1]], [U3, [C1]], [U1, []]]) {
      /* eslint-disable no-await-in-loop */
      const mongoIds = await BACKENDS.mongo.repo.findMemberClassIds(oid(userHex));
      const pgIds = await BACKENDS.pg.repo.findMemberClassIds(userHex);
      expect(mongoIds.sort()).toEqual(expected.sort());
      expect(pgIds.sort()).toEqual(mongoIds.sort());
      /* eslint-enable no-await-in-loop */
    }
  });
});
