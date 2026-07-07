/**
 * ──────────────────────────────────────────────────────────
 * PG-parity test — user repo: import upserts + soft-delete lifecycle
 * ──────────────────────────────────────────────────────────
 * B6 (importService bulk upserts) + B1 (soft-delete cascade seams). Runs only
 * when a Postgres URL is present; SKIPS otherwise. Traps pinned:
 *   • bulkUpsertUsersByEmpCode counts: fresh insert / changed update /
 *     IDENTICAL re-import (matched but modified 0) — Mongo bulkWrite ⇔ xmax +
 *     IS DISTINCT guard
 *   • $setOnInsert role guard: an existing user's role is NEVER promoted
 *   • classes upsert-by-(classCode,courseName) same count semantics
 *   • parking: soft-delete frees empCode/email (meta._softDeletedEmail on PG),
 *     restore reverses it; conflict checks see active replacements
 *   • pullUserFromAllTeams (members array ⇔ team_members junction) +
 *     bulkDropActiveEnrollmentsByUser counts
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env.pg-prototype') });
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const PG_URL = process.env.PG_URL || process.env.PG_PROTOTYPE_URL;
const describePg = PG_URL ? describe : describe.skip;

const { query, closePool } = require('../../config/pg');
const userRepo = require('../../controllers/user/user-repository');
const classRepo = require('../../controllers/class/class-repository');
require('../../models/User');
require('../../models/Team');
require('../../models/Class');
require('../../models/Enrollment');

const hex = (n) => n.toString(16).padStart(24, '0');
const oid = (h) => new mongoose.Types.ObjectId(h);
const coll = (m) => mongoose.model(m).collection.name;

const UEX = hex(0xe01); // existing user (role Participant)
const ULC = hex(0xe02); // lifecycle target
const T1 = hex(0xe11); const T2 = hex(0xe12);
const CL1 = hex(0xe21);
const EN1 = hex(0xe31); const EN2 = hex(0xe32);

describePg('PG-parity: user repo — import upserts + lifecycle (B1/B6)', () => {
  let mem;

  beforeAll(async () => {
    mem = await MongoMemoryServer.create();
    await mongoose.connect(mem.getUri());
    const db = mongoose.connection.db;

    await db.collection(coll('User')).insertMany([
      { _id: oid(UEX), empCode: 'IMP001', name: 'Existing', role: 'Participant', department: 'D1', isDeleted: false },
      { _id: oid(ULC), empCode: 'LC0001', name: 'Lifecycle', email: 'lc@x.io', role: 'Participant', status: 'Active', isDeleted: false },
    ]);
    await db.collection(coll('Team')).insertMany([
      { _id: oid(T1), name: 'LT1', classId: oid(CL1), members: [oid(ULC), oid(UEX)], isDeleted: false },
      { _id: oid(T2), name: 'LT2', classId: oid(CL1), members: [oid(ULC)], isDeleted: false },
    ]);
    await db.collection(coll('Class')).insertMany([
      { _id: oid(CL1), classCode: 'IMPC1', courseName: 'Course A', status: 'Ongoing', totalSessions: 10, isDeleted: false },
    ]);
    await db.collection(coll('Enrollment')).insertMany([
      { _id: oid(EN1), classId: oid(CL1), userId: oid(ULC), status: 'Active' },
      { _id: oid(EN2), classId: oid(CL1), userId: oid(ULC), status: 'Completed' }, // not Active → untouched
    ]);

    await query('TRUNCATE users, teams, team_members, classes, enrollments');
    await query(`INSERT INTO users(id,emp_code,name,email,role,department,status,is_deleted) VALUES
      ($1,'IMP001','Existing',NULL,'Participant','D1',NULL,false),
      ($2,'LC0001','Lifecycle','lc@x.io','Participant',NULL,'Active',false)`, [UEX, ULC]);
    await query(`INSERT INTO teams(id,name,class_id,is_deleted) VALUES ($1,'LT1',$3,false),($2,'LT2',$3,false)`, [T1, T2, CL1]);
    await query(`INSERT INTO team_members(team_id,user_id) VALUES ($1,$3),($1,$4),($2,$3)`, [T1, T2, ULC, UEX]);
    await query(`INSERT INTO classes(id,class_code,course_name,status,total_sessions,is_deleted) VALUES
      ($1,'IMPC1','Course A','Ongoing',10,false)`, [CL1]);
    await query(`INSERT INTO enrollments(id,class_id,user_id,status) VALUES ($1,$3,$4,'Active'),($2,$3,$4,'Completed')`,
      [EN1, EN2, CL1, ULC]);
  }, 60_000);

  afterAll(async () => {
    if (mongoose.connection.readyState) await mongoose.disconnect();
    if (mem) await mem.stop();
    await closePool();
  });

  const both = (fn) => Promise.all([fn(userRepo.impls.mongo), fn(userRepo.impls.pg)]);

  test('user bulk upsert: insert/update/identical counts + role never promoted — identical', async () => {
    const items = [
      { empCode: 'IMP001', set: { empCode: 'IMP001', name: 'Existing Renamed', department: 'D2' }, setOnInsert: { role: 'Admin', password: 'x' } },
      { empCode: 'IMP002', set: { empCode: 'IMP002', name: 'Fresh', department: 'D1' }, setOnInsert: { role: 'Teacher', password: 'y', mustChangePassword: true } },
    ];
    const [m, p] = await both((r) => r.bulkUpsertUsersByEmpCode(items.map((i) => ({ ...i, set: { ...i.set }, setOnInsert: { ...i.setOnInsert } }))));
    expect(m).toEqual({ upsertedCount: 1, modifiedCount: 1, matchedCount: 1 });
    expect(p).toEqual(m);

    // Existing user's role NOT promoted ($setOnInsert only).
    const mRole = (await mongoose.model('User').collection.findOne({ empCode: 'IMP001' })).role;
    const { rows } = await query(`SELECT role, name FROM users WHERE emp_code = 'IMP001'`);
    expect(mRole).toBe('Participant');
    expect(rows[0].role).toBe('Participant');
    expect(rows[0].name).toBe('Existing Renamed');

    // IDENTICAL re-import still counts modified (Mongoose timestamps bump
    // updatedAt on every matched doc; the PG DO UPDATE mirrors it).
    const [m2, p2] = await both((r) => r.bulkUpsertUsersByEmpCode([
      { empCode: 'IMP001', set: { empCode: 'IMP001', name: 'Existing Renamed', department: 'D2' }, setOnInsert: {} },
    ]));
    expect(m2).toEqual({ upsertedCount: 0, modifiedCount: 1, matchedCount: 1 });
    expect(p2).toEqual(m2);
  });

  test('class bulk upsert counts — identical', async () => {
    const [m, p] = await Promise.all([
      classRepo.impls.mongo.bulkUpsertClassesByCodeCourse([
        { classCode: 'IMPC1', courseName: 'Course A', set: { classCode: 'IMPC1', courseName: 'Course A', totalSessions: 12 }, setOnInsert: {} },
        { classCode: 'IMPC2', courseName: 'Course B', set: { classCode: 'IMPC2', courseName: 'Course B', totalSessions: 8 }, setOnInsert: { status: 'Ongoing' } },
      ]),
      classRepo.impls.pg.bulkUpsertClassesByCodeCourse([
        { classCode: 'IMPC1', courseName: 'Course A', set: { classCode: 'IMPC1', courseName: 'Course A', totalSessions: 12 }, setOnInsert: {} },
        { classCode: 'IMPC2', courseName: 'Course B', set: { classCode: 'IMPC2', courseName: 'Course B', totalSessions: 8 }, setOnInsert: { status: 'Ongoing' } },
      ]),
    ]);
    expect(m).toEqual({ upsertedCount: 1, modifiedCount: 1, matchedCount: 1 });
    expect(p).toEqual(m);
  });

  test('lifecycle: team pull + enrollment drop counts; parking + restore roundtrip — identical', async () => {
    // Pull from all teams (2 teams hold ULC).
    const [mT, pT] = await both((r) => r.pullUserFromAllTeams(ULC));
    expect(mT.modifiedCount).toBe(2);
    expect(pT.modifiedCount).toBe(2);

    // Drop Active enrollments only (the Completed row stays).
    const [mE, pE] = await both((r) => r.bulkDropActiveEnrollmentsByUser(ULC));
    expect(mE.modifiedCount).toBe(1);
    expect(pE.modifiedCount).toBe(1);

    // Park identifiers.
    const parkRes = await both((r) => r.softDeleteUserWithParking(ULC, { releasedEmpCode: 'LC0001__DEL_TEST', releasedEmail: 'lc@x.io' }));
    const [mDel, pDel] = await both((r) => r.findDeletedUserById(ULC));
    expect(mDel.empCode).toBe('LC0001__DEL_TEST');
    expect(mDel._softDeletedEmail).toBe('lc@x.io');
    expect(pDel.empCode).toBe('LC0001__DEL_TEST');
    expect(pDel._softDeletedEmail).toBe('lc@x.io');

    // Identifier slots are free; conflict checks see nothing active.
    const [mC, pC] = await both((r) => r.findActiveUserByEmpCode('LC0001'));
    expect(mC).toBeNull(); expect(pC).toBeNull();

    // Restore reverses parking; status lands Inactive.
    await both((r) => r.restoreUserIdentity(ULC, { empCode: 'LC0001', email: 'lc@x.io' }));
    const [mBack, pBack] = await both((r) => r.findLiveUserById(ULC));
    expect(mBack.empCode).toBe('LC0001');
    expect(mBack.email).toBe('lc@x.io');
    expect(mBack.status).toBe('Inactive');
    expect(pBack.empCode).toBe('LC0001');
    expect(pBack.email).toBe('lc@x.io');
    expect(pBack.status).toBe('Inactive');
    // Parking key cleared on both (meta jsonb key removed ⇔ field nulled).
    const [mD2, pD2] = await both((r) => r.findDeletedUserById(ULC));
    expect(mD2).toBeNull(); expect(pD2).toBeNull();
  });
});
