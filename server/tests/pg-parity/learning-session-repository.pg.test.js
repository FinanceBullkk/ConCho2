/**
 * ──────────────────────────────────────────────────────────
 * PG-parity — learning/session repository (Mongo ↔ Postgres)
 * ──────────────────────────────────────────────────────────
 * The learner/teacher/scheduler session READ surface (Phase 3 Wave-D — the
 * LAST repo port): list/detail hydration with the 6-way populate (cohort +
 * nested FULL program, team, office, room, instructors, roster) and the
 * booking-adapter context lookups. Read-only → standalone mongod (no replset).
 * Runs only when a Postgres URL is present (the pg-parity CI job); SKIPS
 * otherwise.
 *
 * Pinned identical on both backends:
 *   1. findSessions embeds: soft-deleted refs DROP (deleted user leaves the
 *      roster/instructors; deleted team → null), meta extras (externalTrainer/
 *      topic/capacity) surface as top-level keys, cancelled rows keep their
 *      cancel stamp, sessionNumber = live-only 1..N (cancelled → null);
 *   2. filter translator: classId/bookedTeamId/status/sessionInstructorIds
 *      scalars, startTime window, participant + teacher $or widenings,
 *      skip/limit pagination, total = un-paginated count;
 *   3. findSessionById: FULL roster projection (PERF-016 detail arm) + null miss;
 *   4. context lookups: findCohortIdsByTeacher (deleted cohort hidden),
 *      findSchedulingContextByCohort (mode fallback + deleted → cohortId null),
 *      findOfficeById (deleted → null; isDeleted select:false ⇔ omitted);
 *   5. enrollment/team lookups: Active cohort-based only (team rows + Dropped
 *      excluded); member teams exclude soft-deleted teams;
 *   6. findCapacityPoliciesByCohortIds: program cap | null, deleted cohort
 *      absent, empty input → empty Map.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env.pg-prototype') });
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const PG_URL = process.env.PG_URL || process.env.PG_PROTOTYPE_URL;
const describePg = PG_URL ? describe : describe.skip;

const { query, closePool } = require('../../config/pg');
const sessionRepo = require('../../domains/learning/session/repository');
const { sessionOrderCache } = require('../../domains/schedule/session-order');
require('../../models/User');
require('../../models/LearningProgram');
require('../../models/Class');
require('../../models/Team');
require('../../models/Office');
require('../../models/Room');
require('../../models/Enrollment');
require('../../models/Schedule');

const hex = (n) => n.toString(16).padStart(24, '0');
const oid = (h) => new mongoose.Types.ObjectId(h);
const coll = (m) => mongoose.model(m).collection.name;
const iso = (d) => (d == null ? null : new Date(d).toISOString());

// Shared ids (Mongo casts hex → ObjectId; PG stores text).
const T1 = hex(0xa01);                                   // teacher
const L1 = hex(0xa11); const L2 = hex(0xa12); const L3 = hex(0xa13); // learners (L3 deleted)
const LEAD = hex(0xa21);                                 // team leader
const P1 = hex(0xa31);                                   // program (self_enroll, cap 12)
const C1 = hex(0xa41); const C2 = hex(0xa42); const C3 = hex(0xa43); // cohorts (C3 deleted)
const G1 = hex(0xa51); const G2 = hex(0xa52);            // teams (G2 deleted)
const O1 = hex(0xa61); const O2 = hex(0xa62);            // offices (O2 deleted)
const R1 = hex(0xa71); const R2 = hex(0xa72);            // rooms (R2 deleted)
const S1 = hex(0xa81); const S2 = hex(0xa82); const S3 = hex(0xa83); const S4 = hex(0xa84);

const TC = new Date('2026-01-01T00:00:00.000Z');         // fixed created/updated stamp
const t0 = new Date('2026-03-02T03:00:00.000Z');
const t1 = new Date('2026-03-03T03:00:00.000Z');
const t2 = new Date('2026-03-04T03:00:00.000Z');
const t3 = new Date('2026-03-05T03:00:00.000Z');
const hourLater = (d) => new Date(d.getTime() + 3600e3);

const PROGRAM = {
  code: 'SAFE', name: 'Safety Basics', description: 'desc', category: 'compliance',
  defaultSessionCount: 4, deliveryMode: 'offline', schedulingMode: 'self_enroll',
  completionPolicy: { attendanceThresholdPercent: 80, requiresAssessment: false, requiresFeedback: false },
  capacityPolicy: { maxParticipants: null, maxParticipantsPerSession: 12 },
  facilitatorPolicy: { assignmentRequired: false, visibility: 'all_facilitators' },
  recertifyPolicy: { autoAssign: false },
  customFields: {}, prerequisitePrograms: [], status: 'active', legacyCourseName: '',
};
const EXT = { name: 'Jane Vendor', email: null, phone: null, org: 'ACME' };

const BACKENDS = {
  mongo: { repo: sessionRepo.impls.mongo, id: (h) => oid(h) },
  pg: { repo: sessionRepo.impls.pg, id: (h) => h },
};

const seed = async () => {
  // ── Mongo (raw collections — deterministic ids, hooks don't apply) ──
  const db = mongoose.connection.db;
  await Promise.all(
    ['User', 'LearningProgram', 'Class', 'Team', 'Office', 'Room', 'Enrollment', 'Schedule']
      .map((m) => db.collection(coll(m)).deleteMany({})),
  );
  await db.collection(coll('User')).insertMany([
    { _id: oid(T1), empCode: 'T001', name: 'Teach One', department: 'L&D', status: 'Active', role: 'Teacher', isDeleted: false },
    { _id: oid(L1), empCode: 'E001', name: 'Learner One', department: 'Ops', status: 'Active', role: 'Participant', isDeleted: false },
    { _id: oid(L2), empCode: 'E002', name: 'Learner Two', department: 'Sales', status: 'Active', role: 'Participant', isDeleted: false },
    { _id: oid(L3), empCode: 'E003', name: 'Learner Gone', department: 'Ops', status: 'Active', role: 'Participant', isDeleted: true },
    { _id: oid(LEAD), empCode: 'E010', name: 'Lead Person', department: 'Ops', status: 'Active', role: 'Participant', isDeleted: false },
  ]);
  await db.collection(coll('LearningProgram')).insertOne({ _id: oid(P1), ...PROGRAM });
  await db.collection(coll('Class')).insertMany([
    { _id: oid(C1), classCode: 'SAFE01', courseName: 'Safety Basics', programId: oid(P1), totalSessions: 4, status: 'Ongoing', teacherIds: [oid(T1)], isDeleted: false, createdAt: TC, updatedAt: TC },
    { _id: oid(C2), classCode: 'ENG01', courseName: 'English A1', programId: null, totalSessions: 10, status: 'Ongoing', teacherIds: [], isDeleted: false, createdAt: TC, updatedAt: TC },
    { _id: oid(C3), classCode: 'OLD01', courseName: 'Old Class', programId: null, totalSessions: 5, status: 'Finished', teacherIds: [oid(T1)], isDeleted: true, createdAt: TC, updatedAt: TC },
  ]);
  await db.collection(coll('Team')).insertMany([
    { _id: oid(G1), name: 'Group One', classId: oid(C1), leaderId: oid(LEAD), members: [oid(L1), oid(L2)], isDeleted: false },
    { _id: oid(G2), name: 'Group Gone', classId: oid(C1), leaderId: oid(LEAD), members: [oid(L1)], isDeleted: true },
  ]);
  await db.collection(coll('Office')).insertMany([
    { _id: oid(O1), name: 'HCM Office', code: 'HCM', address: '1 Street', timezone: 'Asia/Ho_Chi_Minh', isDeleted: false, createdAt: TC, updatedAt: TC },
    { _id: oid(O2), name: 'Old Office', code: 'OLD', address: '', timezone: '', isDeleted: true, createdAt: TC, updatedAt: TC },
  ]);
  await db.collection(coll('Room')).insertMany([
    { _id: oid(R1), name: 'Room A', code: 'RA', officeId: oid(O1), isActive: true, isDeleted: false },
    { _id: oid(R2), name: 'Room Gone', code: 'RG', officeId: oid(O1), isActive: true, isDeleted: true },
  ]);
  await db.collection(coll('Enrollment')).insertMany([
    { userId: oid(L1), classId: oid(C1), teamId: null, status: 'Active' },
    { userId: oid(L2), classId: oid(C1), teamId: oid(G1), status: 'Active' },
    { userId: oid(L1), classId: oid(C2), teamId: null, status: 'Dropped' },
  ]);
  await db.collection(coll('Schedule')).insertMany([
    { _id: oid(S1), classId: oid(C1), bookedTeamId: oid(G1), officeId: oid(O1), roomId: oid(R1), startTime: t0, endTime: hourLater(t0), status: 'scheduled', enrolledUsers: [oid(L1), oid(L2), oid(L3)], sessionInstructorIds: [oid(T1), oid(L3)], topic: 'Kickoff', capacity: 9, externalTrainer: EXT, roomLink: '', meetLink: '', cancelledAt: null, cancelReason: '', createdAt: TC, updatedAt: TC },
    { _id: oid(S2), classId: oid(C1), bookedTeamId: oid(G1), officeId: null, roomId: null, startTime: t1, endTime: hourLater(t1), status: 'cancelled', enrolledUsers: [oid(L1)], sessionInstructorIds: [], topic: '', capacity: 9, roomLink: '', meetLink: '', cancelledAt: TC, cancelReason: 'trainer sick', createdAt: TC, updatedAt: TC },
    { _id: oid(S3), classId: oid(C2), bookedTeamId: null, officeId: null, roomId: null, startTime: t2, endTime: hourLater(t2), status: 'scheduled', enrolledUsers: [oid(L2)], sessionInstructorIds: [], topic: '', capacity: 9, roomLink: '', meetLink: '', cancelledAt: null, cancelReason: '', createdAt: TC, updatedAt: TC },
    { _id: oid(S4), classId: oid(C1), bookedTeamId: oid(G2), officeId: null, roomId: null, startTime: t3, endTime: hourLater(t3), status: 'scheduled', enrolledUsers: [oid(L1)], sessionInstructorIds: [], topic: '', capacity: 9, roomLink: '', meetLink: '', cancelledAt: null, cancelReason: '', createdAt: TC, updatedAt: TC },
  ]);

  // ── Postgres (same ids/values; extras ride schedules.meta jsonb) ──
  await query('TRUNCATE schedules, classes, teams, team_members, enrollments, learning_programs, offices, rooms, users');
  await query(
    `INSERT INTO users(id, emp_code, name, department, status, role, is_deleted) VALUES
      ($1,'T001','Teach One','L&D','Active','Teacher',false),
      ($2,'E001','Learner One','Ops','Active','Participant',false),
      ($3,'E002','Learner Two','Sales','Active','Participant',false),
      ($4,'E003','Learner Gone','Ops','Active','Participant',true),
      ($5,'E010','Lead Person','Ops','Active','Participant',false)`,
    [T1, L1, L2, L3, LEAD]);
  await query(
    `INSERT INTO learning_programs(id, code, name, description, category, default_session_count, delivery_mode,
        scheduling_mode, completion_policy, capacity_policy, facilitator_policy, recertify_policy, custom_fields,
        prerequisite_programs, status, legacy_course_name)
     VALUES ($1,'SAFE','Safety Basics','desc','compliance',4,'offline','self_enroll',$2,$3,$4,$5,'{}','{}','active','')`,
    [P1, JSON.stringify(PROGRAM.completionPolicy), JSON.stringify(PROGRAM.capacityPolicy),
      JSON.stringify(PROGRAM.facilitatorPolicy), JSON.stringify(PROGRAM.recertifyPolicy)]);
  await query(
    `INSERT INTO classes(id, class_code, course_name, program_id, total_sessions, status, teacher_ids, is_deleted, created_at, updated_at) VALUES
      ($1,'SAFE01','Safety Basics',$4,4,'Ongoing',$5,false,$7,$7),
      ($2,'ENG01','English A1',NULL,10,'Ongoing','{}',false,$7,$7),
      ($3,'OLD01','Old Class',NULL,5,'Finished',$6,true,$7,$7)`,
    [C1, C2, C3, P1, [T1], [T1], TC.toISOString()]);
  await query(
    `INSERT INTO teams(id, name, class_id, leader_id, is_deleted) VALUES
      ($1,'Group One',$3,$4,false), ($2,'Group Gone',$3,$4,true)`,
    [G1, G2, C1, LEAD]);
  await query(
    `INSERT INTO team_members(team_id, user_id) VALUES ($1,$3), ($1,$4), ($2,$3)`,
    [G1, G2, L1, L2]);
  await query(
    `INSERT INTO offices(id, name, code, address, timezone, is_deleted, created_at, updated_at) VALUES
      ($1,'HCM Office','HCM','1 Street','Asia/Ho_Chi_Minh',false,$3,$3),
      ($2,'Old Office','OLD','','',true,$3,$3)`,
    [O1, O2, TC.toISOString()]);
  await query(
    `INSERT INTO rooms(id, name, code, office_id, is_active, is_deleted) VALUES
      ($1,'Room A','RA',$3,true,false), ($2,'Room Gone','RG',$3,true,true)`,
    [R1, R2, O1]);
  await query(
    `INSERT INTO enrollments(id, user_id, class_id, team_id, status) VALUES
      ($1,$4,$6,NULL,'Active'), ($2,$5,$6,$8,'Active'), ($3,$4,$7,NULL,'Dropped')`,
    [hex(0xa91), hex(0xa92), hex(0xa93), L1, L2, C1, C2, G1]);
  await query(
    `INSERT INTO schedules(id, class_id, booked_team_id, office_id, room_id, start_time, end_time, status,
        enrolled_users, session_instructor_ids, topic, capacity, room_link, meet_link,
        cancelled_at, cancel_reason, meta, created_at, updated_at) VALUES
      ($1,$5,$7,$9,$10,$11,$12,'scheduled',$19,$20,'Kickoff',9,'','',NULL,'',$23,$24,$24),
      ($2,$5,$7,NULL,NULL,$13,$14,'cancelled',$21,'{}','',9,'','',$24,'trainer sick',NULL,$24,$24),
      ($3,$6,NULL,NULL,NULL,$15,$16,'scheduled',$22,'{}','',9,'','',NULL,'',NULL,$24,$24),
      ($4,$5,$8,NULL,NULL,$17,$18,'scheduled',$21,'{}','',9,'','',NULL,'',NULL,$24,$24)`,
    [S1, S2, S3, S4, C1, C2, G1, G2, O1, R1,
      t0.toISOString(), hourLater(t0).toISOString(),
      t1.toISOString(), hourLater(t1).toISOString(),
      t2.toISOString(), hourLater(t2).toISOString(),
      t3.toISOString(), hourLater(t3).toISOString(),
      [L1, L2, L3], [T1, L3], [L1], [L2],
      JSON.stringify({ externalTrainer: EXT }), TC.toISOString()]);
};

// ── normalizers: exactly the fields the session DTO / use-case authz consume ──
const normUser = (u) => ({
  _id: String(u._id), empCode: u.empCode ?? null, name: u.name ?? null,
  department: u.department ?? null, status: u.status ?? null,
});
const normProgram = (p) => (p == null ? null : {
  _id: String(p._id), code: p.code, name: p.name, description: p.description || '',
  category: p.category, deliveryMode: p.deliveryMode, schedulingMode: p.schedulingMode,
  completionPolicy: p.completionPolicy, capacityPolicy: p.capacityPolicy,
  facilitatorPolicy: p.facilitatorPolicy, recertifyPolicy: p.recertifyPolicy,
  status: p.status,
});
const normCohort = (c) => (c == null ? null : {
  _id: String(c._id), classCode: c.classCode, courseName: c.courseName,
  program: c.programId && typeof c.programId === 'object' ? normProgram(c.programId) : null,
  totalSessions: c.totalSessions == null ? null : Number(c.totalSessions),
  status: c.status, teacherIds: (c.teacherIds || []).map(String),
  createdAt: iso(c.createdAt), updatedAt: iso(c.updatedAt),
});
const normSession = (s) => ({
  _id: String(s._id), status: s.status,
  cancelledAt: iso(s.cancelledAt), cancelReason: s.cancelReason || '',
  startTime: iso(s.startTime), endTime: iso(s.endTime),
  topic: s.topic || '', capacity: s.capacity ?? null,
  roomLink: s.roomLink || '', meetLink: s.meetLink || '',
  externalTrainer: s.externalTrainer
    ? { name: s.externalTrainer.name, email: s.externalTrainer.email ?? null, phone: s.externalTrainer.phone ?? null, org: s.externalTrainer.org ?? null }
    : null,
  sessionNumber: s.sessionNumber ?? null,
  cohort: normCohort(s.classId),
  group: s.bookedTeamId && typeof s.bookedTeamId === 'object'
    ? { _id: String(s.bookedTeamId._id), name: s.bookedTeamId.name, leaderId: String(s.bookedTeamId.leaderId), classId: String(s.bookedTeamId.classId) }
    : null,
  office: s.officeId && typeof s.officeId === 'object'
    ? { _id: String(s.officeId._id), name: s.officeId.name, code: s.officeId.code } : null,
  room: s.roomId && typeof s.roomId === 'object'
    ? { _id: String(s.roomId._id), name: s.roomId.name, code: s.roomId.code } : null,
  instructors: (s.sessionInstructorIds || []).map(normUser),
  roster: (s.enrolledUsers || []).map(normUser),
});
const idList = (arr) => arr.map((s) => String(s._id));
const strSort = (arr) => arr.map(String).sort();

describePg('PG-parity: learning/session repository', () => {
  let mongod;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri(), { dbName: 'pg_parity_learning_session' });
    await seed();
  }, 60_000);

  afterAll(async () => {
    if (mongoose.connection.readyState) await mongoose.disconnect();
    if (mongod) await mongod.stop();
    await closePool();
  });

  // The session-order cache is a shared NodeCache keyed by classId — flush so
  // each test computes numbering fresh (the ordered id lists are identical on
  // both backends: same seeded ids).
  beforeEach(() => sessionOrderCache.flushAll());

  test('findSessions: 6-way embed, deleted-ref drops, meta extras, numbering — identical', async () => {
    const out = {};
    for (const [name, b] of Object.entries(BACKENDS)) {
      // eslint-disable-next-line no-await-in-loop
      const { sessions, total } = await b.repo.findSessions({ classId: b.id(C1) }, { skip: 0, limit: 10 });
      out[name] = { total, rows: sessions.map(normSession) };
    }
    expect(out.mongo.total).toBe(3); // scheduler view: cancelled rows included
    expect(out.mongo.rows.map((r) => r._id)).toEqual([S1, S2, S4]); // startTime asc

    const s1 = out.mongo.rows[0];
    expect(s1.cohort.program.schedulingMode).toBe('self_enroll'); // nested FULL program
    expect(s1.group).toMatchObject({ _id: G1, name: 'Group One' });
    expect(s1.office).toEqual({ _id: O1, name: 'HCM Office', code: 'HCM' });
    expect(s1.room).toEqual({ _id: R1, name: 'Room A', code: 'RA' });
    expect(s1.instructors.map((u) => u._id)).toEqual([T1]);       // deleted L3 dropped
    expect(s1.roster.map((u) => u._id)).toEqual([L1, L2]);        // deleted L3 dropped
    expect(s1.roster[0].empCode).toBeNull();                       // PERF-016: list = ids-only
    expect(s1.externalTrainer).toEqual(EXT);                       // meta extra surfaced
    expect(s1.sessionNumber).toBe(1);

    expect(out.mongo.rows[1]).toMatchObject({ _id: S2, status: 'cancelled', cancelReason: 'trainer sick', sessionNumber: null });
    expect(out.mongo.rows[2]).toMatchObject({ _id: S4, group: null, sessionNumber: 2 }); // deleted team → null

    expect(out.pg).toEqual(out.mongo);
  });

  test('findSessions: filter variants + pagination — identical id sets/totals', async () => {
    const CASES = (b) => ({
      liveOnly: [{ classId: b.id(C1), status: 'scheduled' }, { skip: 0, limit: 10 }],
      window: [{ startTime: { $gte: t1, $lte: t3 } }, { skip: 0, limit: 10 }],
      byTeam: [{ bookedTeamId: b.id(G1) }, { skip: 0, limit: 10 }],
      participantOr: [{
        $or: [{ enrolledUsers: b.id(L1) }, { classId: { $in: [b.id(C2)] } }, { bookedTeamId: { $in: [b.id(G1)] } }],
        status: 'scheduled',
      }, { skip: 0, limit: 10 }],
      teacherOr: [{
        $or: [{ classId: { $in: [b.id(C1)] } }, { sessionInstructorIds: b.id(T1) }],
        status: 'scheduled',
      }, { skip: 0, limit: 10 }],
      instructorScalarMiss: [{ classId: b.id(C2), sessionInstructorIds: b.id(T1), status: 'scheduled' }, { skip: 0, limit: 10 }],
      page2: [{ classId: b.id(C1) }, { skip: 1, limit: 1 }],
    });
    const out = {};
    for (const [name, b] of Object.entries(BACKENDS)) {
      out[name] = {};
      for (const [label, [filter, page]] of Object.entries(CASES(b))) {
        // eslint-disable-next-line no-await-in-loop
        const { sessions, total } = await b.repo.findSessions(filter, page);
        out[name][label] = { ids: idList(sessions), total };
      }
    }
    expect(out.mongo).toEqual({
      liveOnly: { ids: [S1, S4], total: 2 },
      window: { ids: [S2, S3, S4], total: 3 },
      byTeam: { ids: [S1, S2], total: 2 },
      participantOr: { ids: [S1, S3, S4], total: 3 }, // S4: L1 enrolled; S3 via cohort $in
      teacherOr: { ids: [S1, S4], total: 2 },
      instructorScalarMiss: { ids: [], total: 0 },
      page2: { ids: [S2], total: 3 }, // total stays un-paginated
    });
    expect(out.pg).toEqual(out.mongo);
  });

  test('findSessionById: FULL roster projection + null miss — identical', async () => {
    const out = {};
    for (const [name, b] of Object.entries(BACKENDS)) {
      /* eslint-disable no-await-in-loop */
      out[name] = normSession(await b.repo.findSessionById(b.id(S1)));
      expect(await b.repo.findSessionById(b.id(hex(0xdead)))).toBeNull();
      /* eslint-enable no-await-in-loop */
    }
    expect(out.mongo.roster).toEqual([
      { _id: L1, empCode: 'E001', name: 'Learner One', department: 'Ops', status: 'Active' },
      { _id: L2, empCode: 'E002', name: 'Learner Two', department: 'Sales', status: 'Active' },
    ]);
    expect(out.mongo.instructors).toEqual([{ _id: T1, empCode: 'T001', name: 'Teach One', department: null, status: null }]);
    expect(out.mongo.sessionNumber).toBe(1);
    expect(out.pg).toEqual(out.mongo);
  });

  test('context lookups: teacher cohorts, scheduling context, office — identical', async () => {
    const out = {};
    for (const [name, b] of Object.entries(BACKENDS)) {
      /* eslint-disable no-await-in-loop */
      const office = await b.repo.findOfficeById(b.id(O1));
      expect(office).not.toHaveProperty('isDeleted'); // select:false ⇔ omitted column
      expect(office).not.toHaveProperty('deletedAt');
      const ctx = async (h) => {
        const c = await b.repo.findSchedulingContextByCohort(b.id(h));
        return {
          schedulingMode: c.schedulingMode,
          programId: c.programId == null ? null : String(c.programId),
          cohortId: c.cohortId == null ? null : String(c.cohortId),
        };
      };
      out[name] = {
        teacherCohorts: strSort(await b.repo.findCohortIdsByTeacher(b.id(T1))),
        withProgram: await ctx(C1),
        programLess: await ctx(C2),
        deletedCohort: await ctx(C3),
        missingCohort: await ctx(hex(0xdead)),
        office: { _id: String(office._id), name: office.name, code: office.code, address: office.address, timezone: office.timezone, createdAt: iso(office.createdAt), updatedAt: iso(office.updatedAt) },
        deletedOffice: await b.repo.findOfficeById(b.id(O2)),
      };
      /* eslint-enable no-await-in-loop */
    }
    expect(out.mongo).toEqual({
      teacherCohorts: [C1], // deleted C3 hidden (Class find-hook)
      withProgram: { schedulingMode: 'self_enroll', programId: P1, cohortId: C1 },
      programLess: { schedulingMode: 'leader_booking', programId: null, cohortId: C2 },
      deletedCohort: { schedulingMode: 'leader_booking', programId: null, cohortId: null },
      missingCohort: { schedulingMode: 'leader_booking', programId: null, cohortId: null },
      office: { _id: O1, name: 'HCM Office', code: 'HCM', address: '1 Street', timezone: 'Asia/Ho_Chi_Minh', createdAt: iso(TC), updatedAt: iso(TC) },
      deletedOffice: null,
    });
    expect(out.pg).toEqual(out.mongo);
  });

  test('enrollment/team lookups: Active cohort-based only, deleted teams excluded — identical', async () => {
    const out = {};
    for (const [name, b] of Object.entries(BACKENDS)) {
      /* eslint-disable no-await-in-loop */
      out[name] = {
        cohortLearners: strSort(await b.repo.findActiveCohortLearnerIds(b.id(C1))), // team row (L2) excluded
        learnerCohorts: strSort(await b.repo.findActiveCohortIdsForLearner(b.id(L1))), // Dropped C2 excluded
        memberTeams: strSort(await b.repo.findTeamIdsForMember(b.id(L1))), // deleted G2 excluded
        noTeams: strSort(await b.repo.findTeamIdsForMember(b.id(T1))),
      };
      /* eslint-enable no-await-in-loop */
    }
    expect(out.mongo).toEqual({
      cohortLearners: [L1], learnerCohorts: [C1], memberTeams: [G1], noTeams: [],
    });
    expect(out.pg).toEqual(out.mongo);
  });

  test('findCapacityPoliciesByCohortIds: cap | null, deleted absent, empty in — identical', async () => {
    const out = {};
    for (const [name, b] of Object.entries(BACKENDS)) {
      /* eslint-disable no-await-in-loop */
      const map = await b.repo.findCapacityPoliciesByCohortIds([b.id(C1), b.id(C2), b.id(C3)]);
      const empty = await b.repo.findCapacityPoliciesByCohortIds([]);
      out[name] = { entries: Object.fromEntries([...map.entries()].sort()), emptySize: empty.size };
      /* eslint-enable no-await-in-loop */
    }
    expect(out.mongo).toEqual({
      entries: { [C1]: 12, [C2]: null }, // C3 deleted → absent (Class find-hook)
      emptySize: 0,
    });
    expect(out.pg).toEqual(out.mongo);
  });
});
