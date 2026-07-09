/**
 * ──────────────────────────────────────────────────────────
 * PG-parity test — domains/attendance repository (Mongo ↔ Postgres)
 * ──────────────────────────────────────────────────────────
 * Runs only when a Postgres URL is present (CI pg-parity job sets PG_URL;
 * locally PG_PROTOTYPE_URL → Neon). SKIPS otherwise. Pins the trap-prone
 * behaviours of the 14-method repo:
 *   • populate('userId') / nested populate('classId') drop soft-deleted refs to
 *     null (User/Class find-hooks ⇔ LEFT JOIN … is_deleted=false); Schedule has
 *     no soft-delete hook (always embeds);
 *   • findClassById = findOne → deleted class returns null;
 *   • createdAt asc/desc record ordering;
 *   • distinctScheduledIdsForClasses excludes cancelled sessions;
 *   • aggregateByEmployee: counts, banker's-rounded rate (.x5 tie), {rate desc,
 *     empCode binary asc} sort, schedule-scope, filterUserId, invalid-id throw,
 *     pagination, soft-deleted users excluded;
 *   • aggregateTeamsForAnalytics: members from the team_members junction, deleted
 *     team excluded, class scope;
 *   • aggregateAttendanceCountsByUser scope + empty-members; aggregateMyStats
 *     zero→[]; bulkWriteAttendance matched/modified/upserted exactness;
 *     bumpUsersLastActive GREATEST (null→set, earlier→advance, later→keep).
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env.pg-prototype') });
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const PG_URL = process.env.PG_URL || process.env.PG_PROTOTYPE_URL;
const describePg = PG_URL ? describe : describe.skip;

const { query, closePool } = require('../../config/pg');
const repo = require('../../domains/attendance/repository'); // registers Attendance/Schedule/Class/Team/User

const hex = (n) => n.toString(16).padStart(24, '0');
const oid = (h) => new mongoose.Types.ObjectId(h);
const coll = (m) => mongoose.model(m).collection.name;
const norm = (x) => (x == null ? null : JSON.parse(JSON.stringify(x)));
const both = (fn) => Promise.all([fn(repo.impls.mongo), fn(repo.impls.pg)]);
const iso = (d) => (d == null ? null : new Date(d).toISOString());
// schedule/class ids typed per backend: Mongo aggregate() does NOT cast hex→ObjectId
// (unlike .find()); in production these ids arrive already typed per backend from
// distinctScheduledIdsForClasses / findTeacherVisibleClassIds.
const sid = (r, h) => (r === repo.impls.pg ? h : oid(h));
const sortStr = (a) => [...a].map(String).sort();

// Seed ids (shared hex across both backends; Mongo casts hex → ObjectId).
const U1 = hex(631); const U2 = hex(632); const U3 = hex(633); const UDEL = hex(634); const UNOATT = hex(635);
const C1 = hex(641); const C2 = hex(642); const CDEL = hex(643);
const T1 = hex(661); const T2 = hex(662); const TDEL = hex(663);
const BMP1 = hex(671); const BMP2 = hex(672); const BMP3 = hex(673);
const S1 = hex(701); const S2 = hex(702); const S3 = hex(703); const SDEL = hex(704); const SB = hex(709);
const AA1 = hex(801); const AA2 = hex(802); const AA3 = hex(803); const AA4 = hex(804); const AA5 = hex(805); const AA6 = hex(806);

const T = (n) => `2026-05-${String(10 + n).padStart(2, '0')}T08:00:00.000Z`; // distinct createdAt per record
const ST1 = '2026-05-02T03:00:00.000Z'; const ST2 = '2026-05-03T03:00:00.000Z'; const ST3 = '2026-05-04T03:00:00.000Z';
const BUMP = '2026-06-01T00:00:00.000Z';

describePg('PG-parity: domains/attendance repository', () => {
  let mem;

  beforeAll(async () => {
    mem = await MongoMemoryServer.create();
    await mongoose.connect(mem.getUri());
    const db = mongoose.connection.db;

    // ── Mongo seed (raw inserts; refs as ObjectIds so populate matches) ──
    await db.collection(coll('User')).insertMany([
      { _id: oid(U1), empCode: 'E1', name: 'Alice', department: 'Eng', isDeleted: false },
      { _id: oid(U2), empCode: 'E2', name: 'Bob', department: 'Eng', isDeleted: false },
      { _id: oid(U3), empCode: 'E3', name: 'Carol', department: 'Ops', isDeleted: false },
      { _id: oid(UDEL), empCode: 'E4', name: 'Dave', department: 'Eng', isDeleted: true },
      { _id: oid(UNOATT), empCode: 'E5', name: 'Erin', department: 'Eng', isDeleted: false },
      { _id: oid(BMP1), empCode: 'B1', name: 'Bmp1', isDeleted: false },
      { _id: oid(BMP2), empCode: 'B2', name: 'Bmp2', lastActiveAt: new Date('2026-05-01T00:00:00.000Z'), isDeleted: false },
      { _id: oid(BMP3), empCode: 'B3', name: 'Bmp3', lastActiveAt: new Date('2026-07-01T00:00:00.000Z'), isDeleted: false },
    ]);
    await db.collection(coll('Class')).insertMany([
      { _id: oid(C1), classCode: 'C-1', courseName: 'Course1', programId: oid(hex(901)), totalSessions: 5, status: 'Ongoing', teacherIds: [oid(U1)], isDeleted: false },
      { _id: oid(C2), classCode: 'C-2', courseName: 'Course2', status: 'Ongoing', teacherIds: [], isDeleted: false },
      { _id: oid(CDEL), classCode: 'C-D', courseName: 'CourseD', status: 'Ongoing', isDeleted: true },
    ]);
    await db.collection(coll('Schedule')).insertMany([
      { _id: oid(S1), classId: oid(C1), startTime: new Date(ST1), endTime: new Date(ST1), status: 'scheduled', enrolledUsers: [oid(U1), oid(U2), oid(U3)], sessionInstructorIds: [oid(U1)] },
      { _id: oid(S2), classId: oid(C1), startTime: new Date(ST2), endTime: new Date(ST2), status: 'scheduled', enrolledUsers: [oid(U1)], sessionInstructorIds: [] },
      { _id: oid(S3), classId: oid(C1), startTime: new Date(ST2), status: 'cancelled', enrolledUsers: [] },
      { _id: oid(SDEL), classId: oid(CDEL), startTime: new Date(ST1), status: 'scheduled', enrolledUsers: [oid(U1)] },
      { _id: oid(SB), classId: oid(C1), startTime: new Date(ST3), status: 'scheduled', enrolledUsers: [oid(U1), oid(U2)] },
    ]);
    await db.collection(coll('Team')).insertMany([
      { _id: oid(T1), name: 'Team1', classId: oid(C1), members: [oid(U1), oid(U2)], isDeleted: false },
      { _id: oid(T2), name: 'Team2', classId: oid(C2), members: [oid(U3)], isDeleted: false },
      { _id: oid(TDEL), name: 'TeamD', classId: oid(C1), members: [oid(U1)], isDeleted: true },
    ]);
    const att = [
      { _id: oid(AA1), scheduleId: oid(S1), userId: oid(U1), status: 'P', remark: 'r1', createdAt: new Date(T(1)) },
      { _id: oid(AA2), scheduleId: oid(S1), userId: oid(U2), status: 'A', createdAt: new Date(T(2)) },
      { _id: oid(AA3), scheduleId: oid(S1), userId: oid(U3), status: 'L', createdAt: new Date(T(3)) },
      { _id: oid(AA4), scheduleId: oid(S1), userId: oid(UDEL), status: 'P', createdAt: new Date(T(4)) },
      { _id: oid(AA5), scheduleId: oid(S2), userId: oid(U1), status: 'EL', createdAt: new Date(T(5)) },
      { _id: oid(AA6), scheduleId: oid(SDEL), userId: oid(U1), status: 'P', createdAt: new Date(T(6)) },
    ];
    await db.collection(coll('Attendance')).insertMany(att.map((a) => ({ remark: '', photoUrl: '', syncStatus: 'PENDING', updatedAt: a.createdAt, ...a })));

    // ── PG seed (text ids; text[] arrays) ──
    await query('TRUNCATE users, classes, schedules, teams, team_members, attendances');
    await query(
      `INSERT INTO users(id,emp_code,name,department,last_active_at,is_deleted) VALUES
        ($1,'E1','Alice','Eng',NULL,false),($2,'E2','Bob','Eng',NULL,false),
        ($3,'E3','Carol','Ops',NULL,false),($4,'E4','Dave','Eng',NULL,true),
        ($5,'E5','Erin','Eng',NULL,false),
        ($6,'B1','Bmp1',NULL,NULL,false),
        ($7,'B2','Bmp2',NULL,'2026-05-01T00:00:00.000Z',false),
        ($8,'B3','Bmp3',NULL,'2026-07-01T00:00:00.000Z',false)`,
      [U1, U2, U3, UDEL, UNOATT, BMP1, BMP2, BMP3]);
    await query(
      `INSERT INTO classes(id,class_code,course_name,program_id,total_sessions,status,teacher_ids,is_deleted) VALUES
        ($1,'C-1','Course1',$4,5,'Ongoing',ARRAY[$5]::text[],false),
        ($2,'C-2','Course2',NULL,NULL,'Ongoing','{}'::text[],false),
        ($3,'C-D','CourseD',NULL,NULL,'Ongoing','{}'::text[],true)`,
      [C1, C2, CDEL, hex(901), U1]);
    await query(
      `INSERT INTO schedules(id,class_id,start_time,end_time,status,enrolled_users,session_instructor_ids) VALUES
        ($1,$6,$8,$8,'scheduled',ARRAY[$11,$12,$13]::text[],ARRAY[$11]::text[]),
        ($2,$6,$9,$9,'scheduled',ARRAY[$11]::text[],'{}'::text[]),
        ($3,$6,$9,NULL,'cancelled','{}'::text[],'{}'::text[]),
        ($4,$7,$8,NULL,'scheduled',ARRAY[$11]::text[],'{}'::text[]),
        ($5,$6,$10,NULL,'scheduled',ARRAY[$11,$12]::text[],'{}'::text[])`,
      [S1, S2, S3, SDEL, SB, C1, CDEL, ST1, ST2, ST3, U1, U2, U3]);
    await query(
      `INSERT INTO teams(id,name,class_id,is_deleted) VALUES
        ($1,'Team1',$4,false),($2,'Team2',$5,false),($3,'TeamD',$4,true)`,
      [T1, T2, TDEL, C1, C2]);
    await query(
      `INSERT INTO team_members(team_id,user_id) VALUES ($1,$4),($1,$5),($2,$6),($3,$4)`,
      [T1, T2, TDEL, U1, U2, U3]);
    const arows = [
      [AA1, S1, U1, 'P', 'r1', T(1)], [AA2, S1, U2, 'A', '', T(2)], [AA3, S1, U3, 'L', '', T(3)],
      [AA4, S1, UDEL, 'P', '', T(4)], [AA5, S2, U1, 'EL', '', T(5)], [AA6, SDEL, U1, 'P', '', T(6)],
    ];
    for (const [id, sId, uId, st, rk, ts] of arows) {
      // eslint-disable-next-line no-await-in-loop
      await query(
        `INSERT INTO attendances(id,schedule_id,user_id,status,remark,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$6)`,
        [id, sId, uId, st, rk, ts]);
    }
  }, 60_000);

  afterAll(async () => {
    if (mongoose.connection.readyState) await mongoose.disconnect();
    if (mem) await mem.stop();
    await closePool();
  });

  // ── Schedule / Class reads ──────────────────────────────
  test('findScheduleForAuthz: classId + sessionInstructorIds; null for missing', async () => {
    const [m, p] = await both((r) => r.findScheduleForAuthz(S1));
    expect(String(norm(m).classId)).toBe(C1);
    expect(sortStr(norm(m).sessionInstructorIds)).toEqual([U1]);
    expect(String(norm(p).classId)).toBe(C1);
    expect(sortStr(norm(p).sessionInstructorIds)).toEqual([U1]);
    const [mn, pn] = await both((r) => r.findScheduleForAuthz(hex(999)));
    expect(mn).toBeNull(); expect(pn).toBeNull();
  });

  test('findScheduleDocById: live-doc fields; null for missing', async () => {
    const proj = (x) => { const n = norm(x); return n == null ? null : {
      classId: String(n.classId), startTime: iso(n.startTime), status: n.status,
      enrolled: sortStr(n.enrolledUsers), instr: sortStr(n.sessionInstructorIds),
    }; };
    const [m, p] = await both((r) => r.findScheduleDocById(S1));
    expect(proj(m)).toEqual({ classId: C1, startTime: ST1, status: 'scheduled', enrolled: sortStr([U1, U2, U3]), instr: [U1] });
    expect(proj(p)).toEqual(proj(m));
    const [mn, pn] = await both((r) => r.findScheduleDocById(hex(999)));
    expect(mn).toBeNull(); expect(pn).toBeNull();
  });

  test('findClassById: shape; deleted class → null', async () => {
    const proj = (x) => { const n = norm(x); return n == null ? null : {
      classCode: n.classCode, courseName: n.courseName, status: n.status,
      teacherIds: sortStr(n.teacherIds), programId: n.programId == null ? null : String(n.programId),
    }; };
    const [m, p] = await both((r) => r.findClassById(C1));
    expect(proj(m)).toEqual({ classCode: 'C-1', courseName: 'Course1', status: 'Ongoing', teacherIds: [U1], programId: hex(901) });
    expect(proj(p)).toEqual(proj(m));
    const [md, pd] = await both((r) => r.findClassById(CDEL)); // soft-deleted
    expect(md).toBeNull(); expect(pd).toBeNull();
  });

  test('distinctScheduledIdsForClasses: scheduled only (cancelled excluded)', async () => {
    const [m, p] = await both((r) => r.distinctScheduledIdsForClasses([C1]));
    expect(sortStr(m)).toEqual(sortStr([S1, S2, SB])); // S3 cancelled excluded
    expect(sortStr(p)).toEqual(sortStr(m));
  });

  test('findScheduledForClass: scheduled sessions ordered by startTime asc', async () => {
    const [m, p] = await both((r) => r.findScheduledForClass(C1));
    // scheduled C1 sessions ordered by startTime asc: S1(ST1) < S2(ST2) < SB(ST3).
    expect(m.map((s) => iso(s.startTime))).toEqual([ST1, ST2, ST3]);
    expect(m.map((s) => String(s._id))).toEqual([S1, S2, SB]);
    expect(p.map((s) => iso(s.startTime))).toEqual([ST1, ST2, ST3]);
    expect(p.map((s) => String(s._id))).toEqual([S1, S2, SB]);
  });

  // ── Attendance reads ────────────────────────────────────
  test('findAttendanceBySchedule: createdAt asc; deleted user → userId null', async () => {
    const proj = (rows) => norm(rows).map((r) => ({ id: String(r._id), status: r.status, emp: r.userId ? r.userId.empCode : null }));
    const [m, p] = await both((r) => r.findAttendanceBySchedule(S1));
    expect(proj(m)).toEqual([
      { id: AA1, status: 'P', emp: 'E1' },
      { id: AA2, status: 'A', emp: 'E2' },
      { id: AA3, status: 'L', emp: 'E3' },
      { id: AA4, status: 'P', emp: null }, // UDEL deleted → populate null
    ]);
    expect(proj(p)).toEqual(proj(m));
  });

  test('findAttendanceByUser: createdAt desc; nested classId; deleted class → null; scope filter', async () => {
    const proj = (rows) => norm(rows).map((r) => ({
      id: String(r._id),
      sched: r.scheduleId ? String(r.scheduleId._id) : null,
      classCode: r.scheduleId && r.scheduleId.classId ? r.scheduleId.classId.classCode : null,
    }));
    const [m, p] = await both((r) => r.findAttendanceByUser(U1, {}));
    expect(proj(m)).toEqual([
      { id: AA6, sched: SDEL, classCode: null }, // class CDEL soft-deleted → classId null
      { id: AA5, sched: S2, classCode: 'C-1' },
      { id: AA1, sched: S1, classCode: 'C-1' },
    ]);
    expect(proj(p)).toEqual(proj(m));

    const [ms, ps] = await both((r) => r.findAttendanceByUser(U1, { scheduleId: { $in: [S1] } }));
    expect(proj(ms)).toEqual([{ id: AA1, sched: S1, classCode: 'C-1' }]);
    expect(proj(ps)).toEqual(proj(ms));
  });

  test('findAttendanceForSchedules: records across sessions; deleted user → null', async () => {
    const proj = (rows) => norm(rows).map((r) => ({ sched: String(r.scheduleId), status: r.status, emp: r.userId ? r.userId.empCode : null }))
      .sort((a, b) => (a.sched + a.emp).localeCompare(b.sched + b.emp));
    const [m, p] = await both((r) => r.findAttendanceForSchedules([S1, S2]));
    const mm = proj(m);
    expect(mm).toContainEqual({ sched: S1, status: 'P', emp: null }); // AA4 deleted user
    expect(mm.length).toBe(5);
    expect(proj(p)).toEqual(mm);
  });

  // K1b slice 3 — the enrollment enrichment read: raw (scheduleId,userId,status)
  // rows filtered by BOTH scheduleIds and userIds; no user join (a deleted user's
  // rows are NOT dropped — only excluded when absent from userIds).
  test('findAttendanceStatusRows: scheduleId ∩ userId filter; empty scope → []', async () => {
    const proj = (rows) => norm(rows).map((a) => ({ s: String(a.scheduleId), u: String(a.userId), st: a.status }))
      .sort((x, y) => (x.s + x.u).localeCompare(y.s + y.u));
    const [m, p] = await both((r) => r.findAttendanceStatusRows([S1, S2], [U1, U2]));
    const mm = proj(m);
    // AA1(S1,U1,P) AA2(S1,U2,A) AA5(S2,U1,EL); AA3(S1,U3) + AA4(S1,UDEL) excluded (users out of scope).
    expect(mm).toEqual([
      { s: S1, u: U1, st: 'P' }, { s: S1, u: U2, st: 'A' }, { s: S2, u: U1, st: 'EL' },
    ].sort((x, y) => (x.s + x.u).localeCompare(y.s + y.u)));
    expect(proj(p)).toEqual(mm);
    // empty scope short-circuits identically on both backends.
    const [me, pe] = await both((r) => r.findAttendanceStatusRows([], [U1]));
    expect(me).toEqual([]); expect(pe).toEqual([]);
  });

  // ── Aggregations ────────────────────────────────────────
  const empMap = (rows) => Object.fromEntries(norm(rows).map((r) => [r.empCode, {
    totalSessions: r.totalSessions, present: r.present, absent: r.absent, late: r.late, excused: r.excused, rate: r.attendanceRate,
  }]));

  test('aggregateByEmployee: counts + banker rate + soft-deleted excluded', async () => {
    const [m, p] = await both((r) => r.aggregateByEmployee({}, undefined, { skip: 0, limit: 100 }));
    expect(m.total).toBe(3); expect(p.total).toBe(3); // U1,U2,U3; UDEL excluded
    const mm = empMap(m.data); const pp = empMap(p.data);
    expect(Object.keys(pp).sort()).toEqual(Object.keys(mm).sort());
    expect(Object.keys(mm)).not.toContain('E4'); // soft-deleted
    for (const k of Object.keys(mm)) expect(pp[k]).toEqual(mm[k]);
    expect(mm.E1.totalSessions).toBe(3); // AA1,AA5,AA6
  });

  test('aggregateByEmployee: schedule scope + sort order identical', async () => {
    const [m, p] = await both((r) => r.aggregateByEmployee({ scheduleId: { $in: [sid(r, S1)] } }, undefined, { skip: 0, limit: 100 }));
    expect(m.total).toBe(3);
    expect(m.data.map((r) => r.empCode)).toEqual(p.data.map((r) => r.empCode)); // identical {rate desc, empCode asc}
    expect(empMap(p.data)).toEqual(empMap(m.data));
    expect(empMap(m.data).E1.rate).toBe(100); // only S1: U1 present 1/1
  });

  test('aggregateByEmployee: filterUserId + pagination + invalid-id throw', async () => {
    const [m, p] = await both((r) => r.aggregateByEmployee({}, U1, { skip: 0, limit: 100 }));
    expect(m.total).toBe(1); expect(p.total).toBe(1);
    expect(empMap(m.data).E1.totalSessions).toBe(3);
    expect(empMap(p.data)).toEqual(empMap(m.data));

    const [mp, pp] = await both((r) => r.aggregateByEmployee({}, undefined, { skip: 1, limit: 1 }));
    expect(mp.total).toBe(3); expect(pp.total).toBe(3);
    expect(mp.data.length).toBe(1); expect(pp.data.length).toBe(1);
    expect(mp.data[0].empCode).toBe(pp.data[0].empCode); // same paged slice

    await expect(repo.impls.mongo.aggregateByEmployee({}, 'not-an-id', {})).rejects.toThrow();
    await expect(repo.impls.pg.aggregateByEmployee({}, 'not-an-id', {})).rejects.toThrow();
  });

  test('aggregateTeamsForAnalytics: members from junction; deleted team excluded; class scope', async () => {
    const tMap = (rows) => Object.fromEntries(norm(rows).map((t) => [t.name, sortStr(t.members)]));
    const [m, p] = await both((r) => r.aggregateTeamsForAnalytics(null));
    expect(tMap(m)).toEqual({ Team1: sortStr([U1, U2]), Team2: [U3] }); // TeamD excluded
    expect(tMap(p)).toEqual(tMap(m));
    const [ms, ps] = await both((r) => r.aggregateTeamsForAnalytics([sid(r, C1)]));
    expect(Object.keys(tMap(ms))).toEqual(['Team1']); // only C1 team
    expect(tMap(ps)).toEqual(tMap(ms));
  });

  test('aggregateAttendanceCountsByUser: counts + schedule scope + empty members', async () => {
    const cMap = (rows) => Object.fromEntries(norm(rows).map((r) => [String(r._id), r.total]));
    const [m, p] = await both((r) => r.aggregateAttendanceCountsByUser([U1, U2, U3]));
    expect(cMap(m)).toEqual({ [U1]: 3, [U2]: 1, [U3]: 1 });
    expect(cMap(p)).toEqual(cMap(m));
    const [ms, ps] = await both((r) => r.aggregateAttendanceCountsByUser([U1], [sid(r, S1)]));
    expect(cMap(ms)).toEqual({ [U1]: 1 }); expect(cMap(ps)).toEqual(cMap(ms));
    const [me, pe] = await both((r) => r.aggregateAttendanceCountsByUser([]));
    expect(me).toEqual([]); expect(pe).toEqual([]);
  });

  test('aggregateMyStats: rollup; zero attendance → []', async () => {
    const [m, p] = await both((r) => r.aggregateMyStats(U1));
    expect(norm(m)[0]).toMatchObject({ totalSessions: 3, present: 2, excused: 1 });
    expect(norm(p)[0]).toMatchObject({ totalSessions: 3, present: 2, excused: 1 });
    const [mz, pz] = await both((r) => r.aggregateMyStats(UNOATT));
    expect(mz).toEqual([]); expect(pz).toEqual([]);
  });

  // ── Writes (run last; mutate both backends in lockstep via both()) ──
  test('bulkWriteAttendance: upsert → modified(changed) → matched(unchanged)', async () => {
    const op = (status, remark) => [{ updateOne: { filter: { scheduleId: SB, userId: U1 }, update: { $set: { scheduleId: SB, userId: U1, status, remark, photoUrl: '' } }, upsert: true } }];
    const [m1, p1] = await both((r) => r.bulkWriteAttendance(op('P', 'x')));
    expect({ m: m1.matchedCount, mod: m1.modifiedCount, up: m1.upsertedCount }).toEqual({ m: 0, mod: 0, up: 1 });
    expect({ m: p1.matchedCount, mod: p1.modifiedCount, up: p1.upsertedCount }).toEqual({ m: 0, mod: 0, up: 1 });

    const [m2, p2] = await both((r) => r.bulkWriteAttendance(op('A', 'x'))); // status changed
    expect([m2.matchedCount, m2.modifiedCount, m2.upsertedCount]).toEqual([1, 1, 0]);
    expect([p2.matchedCount, p2.modifiedCount, p2.upsertedCount]).toEqual([1, 1, 0]);

    // identical re-mark: Mongoose still bumps updatedAt → modified == matched on both.
    const [m3, p3] = await both((r) => r.bulkWriteAttendance(op('A', 'x')));
    expect([m3.matchedCount, m3.modifiedCount, m3.upsertedCount]).toEqual([1, 1, 0]);
    expect([p3.matchedCount, p3.modifiedCount, p3.upsertedCount]).toEqual([1, 1, 0]);

    // resulting row identical
    const [mr, pr] = await both((r) => r.findAttendanceBySchedule(SB));
    const pick = (rows) => norm(rows).map((x) => ({ emp: x.userId ? x.userId.empCode : null, status: x.status }));
    expect(pick(mr)).toEqual([{ emp: 'E1', status: 'A' }]);
    expect(pick(pr)).toEqual(pick(mr));
  });

  test('bumpUsersLastActive: GREATEST (null→set, earlier→advance, later→keep); empty no-op', async () => {
    await both((r) => r.bumpUsersLastActive([BMP1, BMP2, BMP3], new Date(BUMP)));
    const mongoLast = async (id) => {
      const u = await mongoose.connection.db.collection('users').findOne({ _id: oid(id) });
      return iso(u.lastActiveAt);
    };
    const pgLast = async (id) => {
      const { rows } = await query('SELECT last_active_at FROM users WHERE id = $1', [id]);
      return iso(rows[0].last_active_at);
    };
    expect(await mongoLast(BMP1)).toBe(BUMP); expect(await pgLast(BMP1)).toBe(BUMP);          // null → set
    expect(await mongoLast(BMP2)).toBe(BUMP); expect(await pgLast(BMP2)).toBe(BUMP);          // earlier → advance
    expect(await mongoLast(BMP3)).toBe('2026-07-01T00:00:00.000Z');                            // later → keep
    expect(await pgLast(BMP3)).toBe('2026-07-01T00:00:00.000Z');
    const [me, pe] = await both((r) => r.bumpUsersLastActive([], new Date(BUMP)));
    expect(me).toBeNull(); expect(pe).toBeNull(); // empty no-op
  });
});
