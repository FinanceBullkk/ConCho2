/**
 * ──────────────────────────────────────────────────────────
 * PG-parity — dashboard-stats repository (Mongo ↔ Postgres)
 * ──────────────────────────────────────────────────────────
 * Wave-F: the admin analytics 14-query bundle (mig 031 profile columns) —
 * the largest single Mongo→SQL rewrite of the port. Read-only → standalone
 * mongod. Runs only when a Postgres URL is present; SKIPS otherwise.
 *
 * Pinned identical on both backends (normalized: ids → String, settled →
 * values, arrays sorted deterministically before compare):
 *   1. getFilterDistincts: same value sets, '' excluded on the 4 dims;
 *   2. findFilteredUserIds honors the equality filter + soft-delete;
 *   3. all 14 aggregation shapes byte-compatible with the controller's
 *      PHASE-2 composition: status counts, attendance totals ([] when no
 *      rows — Mongo $group-over-empty parity), recently-active distinct,
 *      teams+populate (deleted class → null), drop reason/classification
 *      ' — ' split, classes order, schedule done-counts (NULL end_time
 *      counts as done), 2-level dept/position breakdowns, level counts,
 *      level progression;
 *   4. filtered vs unfiltered branches (filteredUserIds null vs array).
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env.pg-prototype') });
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const PG_URL = process.env.PG_URL || process.env.PG_PROTOTYPE_URL;
const describePg = PG_URL ? describe : describe.skip;

const { query, closePool } = require('../../config/pg');
const repo = require('../../controllers/dashboard/dashboard-stats-repository');
require('../../models/User');
require('../../models/Class');
require('../../models/Schedule');
require('../../models/Attendance');
require('../../models/Team');

const hex = (n) => n.toString(16).padStart(24, '0');
const oid = (h) => new mongoose.Types.ObjectId(h);
const coll = (m) => mongoose.model(m).collection.name;

// Users: 4 Ops participants (2 Active, 1 Dropped w/ classified reason, 1
// Inactive w/ plain reason), 1 IT participant, 1 deleted, 1 Teacher (excluded
// by role). Levels chosen so progression = {total:3, progressed:2, stayed:1}.
const U = Array.from({ length: 7 }, (_, i) => hex(0xf100 + i));
const C1 = hex(0xf201); const C2 = hex(0xf202); const C3 = hex(0xf203); // C3 deleted
const T1 = hex(0xf301); const T2 = hex(0xf302);                         // T2 → deleted class
const S1 = hex(0xf401); const S2 = hex(0xf402); const S3 = hex(0xf403);
const A = Array.from({ length: 5 }, (_, i) => hex(0xf500 + i));

const NOW = new Date('2026-07-04T12:00:00.000Z');
const THIRTY_AGO = new Date('2026-06-04T12:00:00.000Z');
const RECENT = new Date('2026-06-20T00:00:00.000Z');
const OLD = new Date('2026-05-01T00:00:00.000Z');

const norm = (v) => JSON.parse(JSON.stringify(v, (k, x) => (x === undefined ? null : x)));
const byId = (arr) => [...arr].sort((a, b) => String(a._id).localeCompare(String(b._id)));
const sortedIds = (arr) => arr.map(String).sort();

const seed = async () => {
  const db = mongoose.connection.db;
  await Promise.all(['User', 'Class', 'Schedule', 'Attendance', 'Team'].map((m) => db.collection(coll(m)).deleteMany({})));

  const mongoUser = (i, over) => ({
    _id: oid(U[i]), empCode: `F10${i}`, email: null, name: `U${i}`, role: 'Participant',
    department: 'Ops', position: 'Analyst', entranceLevel: '', currentLevel: '',
    status: 'Active', dropReason: '', isDeleted: false, ...over,
  });
  await db.collection(coll('User')).insertMany([
    mongoUser(0, { entranceLevel: 'A1', currentLevel: 'B1' }),                      // progressed
    mongoUser(1, { entranceLevel: 'A1', currentLevel: 'A1' }),                      // stayed
    mongoUser(2, { status: 'Dropped', dropReason: 'Workload — Too busy', entranceLevel: 'A2', currentLevel: 'B2' }), // progressed
    mongoUser(3, { status: 'Inactive', dropReason: 'Left company', position: 'Manager' }),
    mongoUser(4, { department: 'IT', position: '' }),
    mongoUser(5, { isDeleted: true }),
    mongoUser(6, { role: 'Teacher' }),
  ]);

  await db.collection(coll('Class')).insertMany([
    { _id: oid(C1), classCode: 'C01', courseName: 'TOEIC', totalSessions: 10, status: 'Ongoing', isDeleted: false },
    { _id: oid(C2), classCode: 'C02', courseName: 'IELTS', totalSessions: 8, status: 'Ongoing', isDeleted: false },
    { _id: oid(C3), classCode: 'C03', courseName: 'Ghost', totalSessions: 5, status: 'Closed', isDeleted: true },
  ]);

  await db.collection(coll('Team')).insertMany([
    { _id: oid(T1), name: 'Team1', classId: oid(C1), members: [oid(U[0]), oid(U[1]), oid(U[4])], isDeleted: false },
    { _id: oid(T2), name: 'Team2', classId: oid(C3), members: [oid(U[2])], isDeleted: false },
  ]);

  await db.collection(coll('Schedule')).insertMany([
    { _id: oid(S1), classId: oid(C1), startTime: OLD, endTime: OLD, status: 'scheduled' },        // done
    { _id: oid(S2), classId: oid(C1), startTime: NOW, endTime: new Date('2026-08-01'), status: 'scheduled' }, // not done
    { _id: oid(S3), classId: oid(C2), startTime: OLD, endTime: OLD, status: 'cancelled' },        // excluded
  ]);

  await db.collection(coll('Attendance')).insertMany([
    { _id: oid(A[0]), userId: oid(U[0]), scheduleId: oid(S1), status: 'P', createdAt: RECENT },
    { _id: oid(A[1]), userId: oid(U[0]), scheduleId: oid(S2), status: 'A', createdAt: OLD },
    { _id: oid(A[2]), userId: oid(U[1]), scheduleId: oid(S1), status: 'L', createdAt: OLD },
    { _id: oid(A[3]), userId: oid(U[4]), scheduleId: oid(S1), status: 'P', createdAt: RECENT },
  ]);

  // PG — identical logical rows.
  await query('TRUNCATE users, classes, teams, team_members, schedules, attendances');
  const pgUser = (i, dept, pos, ent, cur, status, drop, role, deleted) =>
    query(
      `INSERT INTO users(id, emp_code, name, role, department, position,
                         entrance_level, current_level, status, drop_reason, is_deleted)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [U[i], `F10${i}`, `U${i}`, role, dept, pos, ent, cur, status, drop, deleted]
    );
  await pgUser(0, 'Ops', 'Analyst', 'A1', 'B1', 'Active', '', 'Participant', false);
  await pgUser(1, 'Ops', 'Analyst', 'A1', 'A1', 'Active', '', 'Participant', false);
  await pgUser(2, 'Ops', 'Analyst', 'A2', 'B2', 'Dropped', 'Workload — Too busy', 'Participant', false);
  await pgUser(3, 'Ops', 'Manager', '', '', 'Inactive', 'Left company', 'Participant', false);
  await pgUser(4, 'IT', '', '', '', 'Active', '', 'Participant', false);
  await pgUser(5, 'Ops', 'Analyst', '', '', 'Active', '', 'Participant', true);
  await pgUser(6, 'Ops', 'Analyst', '', '', 'Active', '', 'Teacher', false);

  await query(
    `INSERT INTO classes(id, class_code, course_name, total_sessions, status, is_deleted) VALUES
       ($1,'C01','TOEIC',10,'Ongoing',false), ($2,'C02','IELTS',8,'Ongoing',false), ($3,'C03','Ghost',5,'Closed',true)`,
    [C1, C2, C3]
  );
  await query(
    `INSERT INTO teams(id, name, class_id, is_deleted) VALUES ($1,'Team1',$2,false), ($3,'Team2',$4,false)`,
    [T1, C1, T2, C3]
  );
  await query(
    `INSERT INTO team_members(team_id, user_id) VALUES ($1,$2),($1,$3),($1,$4),($5,$6)`,
    [T1, U[0], U[1], U[4], T2, U[2]]
  );
  await query(
    `INSERT INTO schedules(id, class_id, start_time, end_time, status) VALUES
       ($1,$2,$3,$3,'scheduled'), ($4,$2,$5,'2026-08-01T00:00:00Z','scheduled'), ($6,$7,$3,$3,'cancelled')`,
    [S1, C1, OLD, S2, NOW, S3, C2]
  );
  const att = (id, uid, sid, status, at) =>
    query(
      `INSERT INTO attendances(id, user_id, schedule_id, status, created_at) VALUES ($1,$2,$3,$4,$5)`,
      [id, uid, sid, status, at]
    );
  await att(A[0], U[0], S1, 'P', RECENT);
  await att(A[1], U[0], S2, 'A', OLD);
  await att(A[2], U[1], S1, 'L', OLD);
  await att(A[3], U[4], S1, 'P', RECENT);
};

// Run the full bundle on one backend and normalize for comparison.
const runAll = async (impl, userFilter, filteredUserIds) => {
  const settled = await impl.runStatsAggregations({ userFilter, filteredUserIds, now: NOW, thirtyDaysAgo: THIRTY_AGO });
  expect(settled.every((r) => r.status === 'fulfilled')).toBe(true);
  const v = settled.map((r) => r.value);
  return {
    statusCounts: byId(norm(v[0])),
    attendance: norm(v[1]),
    recentlyActive: sortedIds(v[2]),
    teams: byId(norm(v[3])).map((t) => ({ ...t, members: [...t.members].map(String).sort() })),
    participants: byId(norm(v[4])),
    // count-DESC with ties is nondeterministic on BOTH backends → stable-sort
    // by (count desc, _id) for comparison; the controller renders order-agnostic.
    dropReasons: norm(v[5]).sort((a, b) => b.count - a.count || String(a._id).localeCompare(String(b._id))),
    dropClassifications: norm(v[6]).sort((a, b) => b.count - a.count || String(a._id).localeCompare(String(b._id))),
    classes: norm(v[7]).map(({ _id, classCode, courseName, totalSessions, status }) => ({ _id: String(_id), classCode, courseName, totalSessions, status })),
    scheduleCounts: byId(norm(v[8])),
    departments: norm(v[9]).map((d) => ({ ...d, statuses: [...d.statuses].sort((a, b) => a.status.localeCompare(b.status)) })),
    positions: norm(v[10]).map((d) => ({ ...d, statuses: [...d.statuses].sort((a, b) => a.status.localeCompare(b.status)) })),
    entranceLevels: byId(norm(v[11])),
    currentLevels: byId(norm(v[12])),
    progression: norm(v[13]),
  };
};

describePg('pg-parity: dashboard-stats repository (14-query bundle)', () => {
  let mongod;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri('pg-parity-dashboard'));
    await seed();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    if (mongod) await mongod.stop();
    await closePool();
  });

  test('getFilterDistincts: same value sets, empty strings excluded', async () => {
    const m = await repo.impls.mongo.getFilterDistincts();
    const p = await repo.impls.pg.getFilterDistincts();
    for (const k of ['departments', 'positions', 'entranceLevels', 'currentLevels', 'statuses']) {
      expect([...p[k]].sort()).toEqual([...m[k]].sort());
    }
    expect([...m.departments].sort()).toEqual(['IT', 'Ops']);
    expect([...m.positions].sort()).toEqual(['Analyst', 'Manager']);
  });

  test('findFilteredUserIds: equality filter + soft-delete + role scoping', async () => {
    const filter = { role: 'Participant', department: 'Ops' };
    const m = sortedIds(await repo.impls.mongo.findFilteredUserIds(filter));
    const p = sortedIds(await repo.impls.pg.findFilteredUserIds(filter));
    expect(p).toEqual(m);
    expect(m).toEqual([U[0], U[1], U[2], U[3]].sort()); // no deleted U5, no Teacher U6
  });

  test('unfiltered bundle: all 14 shapes identical', async () => {
    const filter = { role: 'Participant' };
    const m = await runAll(repo.impls.mongo, filter, null);
    const p = await runAll(repo.impls.pg, filter, null);
    expect(p).toEqual(m);

    // Spot-pin values the controller composes from:
    expect(Object.fromEntries(m.statusCounts.map((s) => [s._id, s.count])))
      .toEqual({ Active: 3, Dropped: 1, Inactive: 1 });
    expect(m.attendance).toEqual([{ _id: null, total: 4, present: 3 }]);
    expect(m.recentlyActive).toEqual([U[0], U[4]].sort());
    // ' — ' split parity: reason takes the part AFTER, classification BEFORE.
    expect(new Set(m.dropReasons.map((d) => d._id))).toEqual(new Set(['Too busy', 'Left company']));
    expect(new Set(m.dropClassifications.map((d) => d._id))).toEqual(new Set(['Workload', 'Left company']));
    expect(m.classes.map((c) => c.classCode)).toEqual(['C01', 'C02']); // deleted C03 hidden, code order
    expect(m.scheduleCounts).toEqual([{ _id: C1, total: 2, done: 1 }]); // cancelled excluded
    expect(m.teams.find((t) => t._id === T2).classId).toBeNull(); // deleted class → null populate
    expect(m.progression).toEqual([{ _id: null, total: 3, progressed: 2, stayed: 1 }]);
  });

  test('filtered bundle (department=Ops + filteredUserIds): shapes identical', async () => {
    const filter = { role: 'Participant', department: 'Ops' };
    const mIds = await repo.impls.mongo.findFilteredUserIds(filter);
    const pIds = await repo.impls.pg.findFilteredUserIds(filter);
    const m = await runAll(repo.impls.mongo, filter, mIds);
    const p = await runAll(repo.impls.pg, filter, pIds);
    expect(p).toEqual(m);

    // IT user U4's attendance drops out of the cross-filtered stats.
    expect(m.attendance).toEqual([{ _id: null, total: 3, present: 2 }]);
    expect(m.recentlyActive).toEqual([U[0]]);
    // Clobber semantics: the department breakdown IGNORES the department
    // filter (the pipeline's $ne:'' overwrites the spread key) → both rows.
    expect(m.departments.map((d) => d._id)).toEqual(['Ops', 'IT']);
    expect(m.departments[0].total).toBe(4);
  });

  test('empty-result parity: impossible filter → $group-over-empty shapes match', async () => {
    const filter = { role: 'Participant', department: 'Nowhere' };
    const mIds = await repo.impls.mongo.findFilteredUserIds(filter);
    const pIds = await repo.impls.pg.findFilteredUserIds(filter);
    expect(mIds).toEqual([]);
    expect(pIds).toEqual([]);
    const m = await runAll(repo.impls.mongo, filter, mIds);
    const p = await runAll(repo.impls.pg, filter, pIds);
    expect(p).toEqual(m);
    expect(m.statusCounts).toEqual([]);
    expect(m.attendance).toEqual([]);   // the Mongo $group-over-empty pin
    expect(m.progression).toEqual([]);  // ditto
  });
});
