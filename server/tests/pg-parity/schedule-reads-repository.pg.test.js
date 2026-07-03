/**
 * ──────────────────────────────────────────────────────────
 * PG-parity test — domains/schedule repository, slice S1 (PURE READS)
 * ──────────────────────────────────────────────────────────
 * The 25 no-`session` read methods (populate/aggregate/filter-translate). Runs
 * only when a Postgres URL is present; SKIPS otherwise. Pins the trap-prone bits:
 *   • populate class/team/leader/enrolledUsers/sessionInstructorIds (deleted ref
 *     → null; array populate drops missing + preserves order);
 *   • enrolled_users/session_instructor_ids text[] scalar-match → ANY / overlap;
 *   • LIVE-only (status='scheduled') reads; cancelled = history;
 *   • findSchedulesPage/countSchedules/findCalendarSchedules Mongo-filter → SQL
 *     (classId, status, enrolledUsers, startTime range, $or teacher scope);
 *   • validInstructor role/status/deleted filter; instructor overlap conflict;
 *   • teacher scope (named OR empty teacher_ids); facilitator-policy reads.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env.pg-prototype') });
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const PG_URL = process.env.PG_URL || process.env.PG_PROTOTYPE_URL;
const describePg = PG_URL ? describe : describe.skip;

const { query, closePool } = require('../../config/pg');
const repo = require('../../domains/schedule/repository'); // registers most models
require('../../models/User');

const hex = (n) => n.toString(16).padStart(24, '0');
const oid = (h) => new mongoose.Types.ObjectId(h);
const coll = (m) => mongoose.model(m).collection.name;
const norm = (x) => (x == null ? null : JSON.parse(JSON.stringify(x)));
const both = (fn) => Promise.all([fn(repo.impls.mongo), fn(repo.impls.pg)]);
const sortStr = (a) => [...a].map(String).sort();

const P1 = hex(0xD01); const P2 = hex(0xD02);
const C1 = hex(0xD11); const C2 = hex(0xD12); const C3 = hex(0xD13); const CDEL = hex(0xD14);
const U1 = hex(0xD21); const U2 = hex(0xD22); const UDEL = hex(0xD23); const T1 = hex(0xD24);
const ADM = hex(0xD25); const DROPPED = hex(0xD26); const LEADER = hex(0xD27);
const TM1 = hex(0xD31); const TMDEL = hex(0xD32);
const S1 = hex(0xD41); const S2 = hex(0xD42); const SOLD = hex(0xD43); const SC = hex(0xD44);
const A1 = hex(0xD51); const A2 = hex(0xD52);
const SET1 = hex(0xD61); const O1 = hex(0xD71); const R1 = hex(0xD72);

const FUT = '2026-08-01T03:00:00.000Z'; const FUT2 = '2026-08-02T03:00:00.000Z';
const PAST = '2026-01-01T03:00:00.000Z'; const FUTC = '2026-08-03T03:00:00.000Z';
const FROM = '2026-06-01T00:00:00.000Z';
const FPOL1 = { visibility: 'assigned_only', assignmentRequired: true };
const FPOL2 = { visibility: 'all_facilitators' };
const SLOTS = [{ sh: 10, sm: 0, eh: 11, em: 0 }];

describePg('PG-parity: domains/schedule repository (S1 reads)', () => {
  let mem;

  beforeAll(async () => {
    mem = await MongoMemoryServer.create();
    await mongoose.connect(mem.getUri());
    const db = mongoose.connection.db;

    // ── Mongo seed ──
    await db.collection(coll('LearningProgram')).insertMany([
      { _id: oid(P1), code: 'P1', name: 'Prog1', status: 'active', schedulingMode: 'self_enroll', facilitatorPolicy: FPOL1, capacityPolicy: { maxParticipantsPerSession: 5 } },
      { _id: oid(P2), code: 'P2', name: 'Prog2', status: 'active', schedulingMode: 'leader_booking', facilitatorPolicy: FPOL2 },
    ]);
    await db.collection(coll('Class')).insertMany([
      { _id: oid(C1), classCode: 'C-1', courseName: 'Course1', programId: oid(P1), totalSessions: 10, status: 'Ongoing', teacherIds: [oid(T1)], isDeleted: false },
      { _id: oid(C2), classCode: 'C-2', courseName: 'Course2', programId: oid(P2), status: 'Ongoing', teacherIds: [], isDeleted: false },
      { _id: oid(C3), classCode: 'C-3', courseName: 'Course3', status: 'Ongoing', teacherIds: [], isDeleted: false },
      { _id: oid(CDEL), classCode: 'C-D', courseName: 'CourseD', status: 'Ongoing', teacherIds: [], isDeleted: true },
    ]);
    await db.collection(coll('User')).insertMany([
      { _id: oid(U1), empCode: 'E1', name: 'Alice', email: 'a@x.io', department: 'Eng', role: 'Participant', status: 'Active', isDeleted: false },
      { _id: oid(U2), empCode: 'E2', name: 'Bob', email: 'b@x.io', department: 'Eng', role: 'Participant', status: 'Active', isDeleted: false },
      { _id: oid(UDEL), empCode: 'E3', name: 'Del', email: 'd@x.io', department: 'Eng', role: 'Participant', status: 'Active', isDeleted: true },
      { _id: oid(T1), empCode: 'T1', name: 'Teach', email: 't@x.io', department: 'Eng', role: 'Teacher', status: 'Active', isDeleted: false },
      { _id: oid(ADM), empCode: 'AD', name: 'Admin', email: 'ad@x.io', role: 'Admin', status: 'Active', isDeleted: false },
      { _id: oid(DROPPED), empCode: 'DR', name: 'Drop', role: 'Teacher', status: 'Dropped', isDeleted: false },
      { _id: oid(LEADER), empCode: 'LD', name: 'Lead', email: 'l@x.io', department: 'Eng', role: 'Participant', status: 'Active', isDeleted: false },
    ]);
    await db.collection(coll('Team')).insertMany([
      { _id: oid(TM1), name: 'Team1', classId: oid(C1), leaderId: oid(LEADER), members: [oid(U1), oid(U2)], isDeleted: false },
      { _id: oid(TMDEL), name: 'TeamDel', classId: oid(C1), leaderId: oid(LEADER), members: [], isDeleted: true },
    ]);
    await db.collection(coll('Schedule')).insertMany([
      { _id: oid(S1), classId: oid(C1), bookedTeamId: oid(TM1), officeId: oid(O1), startTime: new Date(FUT), endTime: new Date(FUT), status: 'scheduled', enrolledUsers: [oid(U1), oid(U2), oid(UDEL)], sessionInstructorIds: [oid(T1)], roomId: oid(R1), capacity: 5, topic: 'Topic1' },
      { _id: oid(S2), classId: oid(C2), startTime: new Date(FUT2), endTime: new Date(FUT2), status: 'scheduled', enrolledUsers: [oid(U1)] },
      { _id: oid(SOLD), classId: oid(C1), bookedTeamId: oid(TM1), startTime: new Date(PAST), endTime: new Date(PAST), status: 'scheduled', enrolledUsers: [oid(U1)] },
      { _id: oid(SC), classId: oid(C1), startTime: new Date(FUTC), endTime: new Date(FUTC), status: 'cancelled', enrolledUsers: [oid(U1)] },
    ]);
    await db.collection(coll('Attendance')).insertMany([
      { _id: oid(A1), scheduleId: oid(S1), userId: oid(U1), status: 'P' },
      { _id: oid(A2), scheduleId: oid(S1), userId: oid(U2), status: 'P' },
    ]);
    await db.collection(coll('Setting')).insertMany([
      { _id: oid(SET1), key: 'ALLOWED_TIME_SLOTS', value: SLOTS },
    ]);

    // ── PG seed ──
    await query('TRUNCATE learning_programs, classes, users, teams, team_members, schedules, attendances, settings');
    await query(
      `INSERT INTO learning_programs(id,code,name,status,scheduling_mode,facilitator_policy,capacity_policy) VALUES
        ($1,'P1','Prog1','active','self_enroll',$3::jsonb,$4::jsonb),
        ($2,'P2','Prog2','active','leader_booking',$5::jsonb,NULL)`,
      [P1, P2, JSON.stringify(FPOL1), JSON.stringify({ maxParticipantsPerSession: 5 }), JSON.stringify(FPOL2)]);
    await query(
      `INSERT INTO classes(id,class_code,course_name,program_id,total_sessions,status,teacher_ids,is_deleted) VALUES
        ($1,'C-1','Course1',$5,10,'Ongoing',ARRAY[$7]::text[],false),
        ($2,'C-2','Course2',$6,NULL,'Ongoing','{}'::text[],false),
        ($3,'C-3','Course3',NULL,NULL,'Ongoing','{}'::text[],false),
        ($4,'C-D','CourseD',NULL,NULL,'Ongoing','{}'::text[],true)`,
      [C1, C2, C3, CDEL, P1, P2, T1]);
    await query(
      `INSERT INTO users(id,emp_code,name,email,department,role,status,is_deleted) VALUES
        ($1,'E1','Alice','a@x.io','Eng','Participant','Active',false),
        ($2,'E2','Bob','b@x.io','Eng','Participant','Active',false),
        ($3,'E3','Del','d@x.io','Eng','Participant','Active',true),
        ($4,'T1','Teach','t@x.io','Eng','Teacher','Active',false),
        ($5,'AD','Admin','ad@x.io',NULL,'Admin','Active',false),
        ($6,'DR','Drop',NULL,NULL,'Teacher','Dropped',false),
        ($7,'LD','Lead','l@x.io','Eng','Participant','Active',false)`,
      [U1, U2, UDEL, T1, ADM, DROPPED, LEADER]);
    await query(`INSERT INTO teams(id,name,class_id,leader_id,is_deleted) VALUES ($1,'Team1',$2,$3,false),($4,'TeamDel',$2,$3,true)`, [TM1, C1, LEADER, TMDEL]);
    await query(`INSERT INTO team_members(team_id,user_id) VALUES ($1,$2),($1,$3)`, [TM1, U1, U2]);
    await query(
      `INSERT INTO schedules(id,class_id,booked_team_id,office_id,start_time,end_time,status,enrolled_users,session_instructor_ids,room_id,capacity,topic) VALUES
        ($1,$5,$7,$8,$9,$9,'scheduled',ARRAY[$11,$12,$13]::text[],ARRAY[$14]::text[],$15,5,'Topic1'),
        ($2,$6,NULL,NULL,$10,$10,'scheduled',ARRAY[$11]::text[],'{}'::text[],NULL,NULL,NULL),
        ($3,$5,$7,NULL,$16,$16,'scheduled',ARRAY[$11]::text[],'{}'::text[],NULL,NULL,NULL),
        ($4,$5,NULL,NULL,$17,$17,'cancelled',ARRAY[$11]::text[],'{}'::text[],NULL,NULL,NULL)`,
      [S1, S2, SOLD, SC, C1, C2, TM1, O1, FUT, FUT2, U1, U2, UDEL, T1, R1, PAST, FUTC]);
    await query(`INSERT INTO attendances(id,schedule_id,user_id,status) VALUES ($1,$3,$4,'P'),($2,$3,$5,'P')`, [A1, A2, S1, U1, U2]);
    await query(`INSERT INTO settings(id,key,value) VALUES ($1,'ALLOWED_TIME_SLOTS',$2::jsonb)`, [SET1, JSON.stringify(SLOTS)]);
  }, 60_000);

  afterAll(async () => {
    if (mongoose.connection.readyState) await mongoose.disconnect();
    if (mem) await mem.stop();
    await closePool();
  });

  test('findScheduleById: populate class/team/enrolledUsers (deleted user dropped)', async () => {
    const proj = (x) => { const n = norm(x); return {
      cls: n.classId.classCode, team: n.bookedTeamId.name,
      enrolled: sortStr(n.enrolledUsers.map((u) => u.empCode)), instr: sortStr(n.sessionInstructorIds), status: n.status,
    }; };
    const [m, p] = await both((r) => r.findScheduleById(S1));
    expect(proj(m)).toEqual({ cls: 'C-1', team: 'Team1', enrolled: ['E1', 'E2'], instr: [T1], status: 'scheduled' });
    expect(proj(p)).toEqual(proj(m));
  });

  test('findScheduleByIdLean / Raw: raw refs', async () => {
    const proj = (x) => { const n = norm(x); return { classId: String(n.classId), enrolled: sortStr(n.enrolledUsers), capacity: n.capacity, topic: n.topic }; };
    const [m, p] = await both((r) => r.findScheduleByIdLean(S1));
    expect(proj(m)).toEqual({ classId: C1, enrolled: sortStr([U1, U2, UDEL]), capacity: 5, topic: 'Topic1' });
    expect(proj(p)).toEqual(proj(m));
  });

  test('findAvailabilitySchedules: future LIVE only', async () => {
    const [m, p] = await both((r) => r.findAvailabilitySchedules({ fromDate: FROM }));
    expect(sortStr(norm(m).map((s) => s._id))).toEqual(sortStr([S1, S2])); // SOLD past, SC cancelled excluded
    expect(sortStr(norm(p).map((s) => s._id))).toEqual(sortStr([S1, S2]));
    const [mc, pc] = await both((r) => r.findAvailabilitySchedules({ classId: C1, fromDate: FROM }));
    expect(norm(mc).map((s) => s._id)).toEqual([S1]); expect(norm(pc).map((s) => s._id)).toEqual([S1]);
  });

  test('findSchedulesPage + countSchedules: filter translate + populate + sort', async () => {
    const titles = (rows) => norm(rows).map((s) => s._id);
    const [m, p] = await both((r) => r.findSchedulesPage({ status: 'scheduled' }, { skip: 0, limit: 100 }));
    expect(sortStr(titles(m))).toEqual(sortStr([S1, S2, SOLD])); // SC cancelled excluded
    expect(sortStr(titles(p))).toEqual(sortStr(titles(m)));
    // classId + enrolledUsers + startTime range
    const [me, pe] = await both((r) => r.findSchedulesPage({ enrolledUsers: U2, status: 'scheduled' }, { skip: 0, limit: 100 }));
    expect(titles(me)).toEqual([S1]); expect(titles(pe)).toEqual([S1]); // only S1 has U2
    const [mr, pr] = await both((r) => r.findSchedulesPage({ classId: C1, status: 'scheduled', startTime: { $gte: FROM } }, { skip: 0, limit: 100 }));
    expect(titles(mr)).toEqual([S1]); expect(titles(pr)).toEqual([S1]); // SOLD past excluded by range
    const [mn, pn] = await both((r) => r.countSchedules({ status: 'scheduled' }));
    expect(mn).toBe(3); expect(pn).toBe(3);
    // populate present
    expect(norm(m).find((s) => s._id === S1).classId.totalSessions).toBe(10);
    expect(norm(p).find((s) => s._id === S1).classId.totalSessions).toBe(10);
  });

  test('findTeamsByMember: junction + leader populate', async () => {
    const proj = (rows) => norm(rows).map((t) => ({ name: t.name, cls: String(t.classId), leader: t.leaderId ? t.leaderId.empCode : null }));
    const [m, p] = await both((r) => r.findTeamsByMember(U1));
    expect(proj(m)).toEqual([{ name: 'Team1', cls: C1, leader: 'LD' }]);
    expect(proj(p)).toEqual(proj(m));
  });

  test('findUpcomingForClasses + findScheduledByClassIdsOrdered', async () => {
    const [m, p] = await both((r) => r.findUpcomingForClasses([C1], FROM, 20));
    expect(norm(m).map((s) => s._id)).toEqual([S1]); expect(norm(p).map((s) => s._id)).toEqual([S1]);
    const [mo, po] = await both((r) => r.findScheduledByClassIdsOrdered([C1]));
    expect(norm(mo).map((s) => s._id)).toEqual([SOLD, S1]); // startTime asc: PAST < FUT
    expect(norm(po).map((s) => s._id)).toEqual([SOLD, S1]);
  });

  test('findCalendarSchedules: status scheduled + $or teacher scope', async () => {
    const [m, p] = await both((r) => r.findCalendarSchedules({}));
    expect(sortStr(norm(m).map((s) => s._id))).toEqual(sortStr([S1, S2, SOLD]));
    expect(sortStr(norm(p).map((s) => s._id))).toEqual(sortStr(norm(m).map((s) => s._id)));
    // teacher scope: $or [classId in [C2], sessionInstructorIds T1] → S2 (C2) + S1/SOLD (C1 via instr? no — instr T1 only on S1)
    const filter = { $or: [{ classId: { $in: [C2] } }, { sessionInstructorIds: T1 }] };
    const [ms, ps] = await both((r) => r.findCalendarSchedules(filter));
    expect(sortStr(norm(ms).map((s) => s._id))).toEqual(sortStr([S1, S2])); // S2 via class, S1 via instructor
    expect(sortStr(norm(ps).map((s) => s._id))).toEqual(sortStr(norm(ms).map((s) => s._id)));
  });

  test('findScheduleForCalendarSync: enrolled + instructor populate', async () => {
    const proj = (x) => { const n = norm(x); return {
      enrolled: sortStr(n.enrolledUsers.map((u) => u.empCode)), instr: n.sessionInstructorIds.map((u) => u.empCode), cls: n.classId.classCode,
    }; };
    const [m, p] = await both((r) => r.findScheduleForCalendarSync(S1));
    expect(proj(m)).toEqual({ enrolled: ['E1', 'E2'], instr: ['T1'], cls: 'C-1' }); // UDEL dropped
    expect(proj(p)).toEqual(proj(m));
  });

  test('findScheduleClassLabel / findUsersForEmail / aggregateAttendanceCounts', async () => {
    const [m, p] = await both((r) => r.findScheduleClassLabel(S1));
    expect(norm(m).classId.classCode).toBe('C-1'); expect(norm(p).classId.classCode).toBe('C-1');
    const [mu, pu] = await both((r) => r.findUsersForEmail([U1, UDEL]));
    expect(sortStr(norm(mu).map((u) => u.email))).toEqual(['a@x.io']); // UDEL deleted excluded
    expect(sortStr(norm(pu).map((u) => u.email))).toEqual(['a@x.io']);
    const ac = (r, h) => (r === repo.impls.pg ? h : oid(h)); // aggregate needs ObjectId for mongo
    const [ma, pa] = await both((r) => r.aggregateAttendanceCounts([ac(r, S1)]));
    expect(norm(ma)[0].count).toBe(2); expect(norm(pa)[0].count).toBe(2);
  });

  test('findValidInstructorIds + findInstructorConflict', async () => {
    const [m, p] = await both((r) => r.findValidInstructorIds([T1, ADM, DROPPED, UDEL]));
    expect(sortStr(m)).toEqual(sortStr([T1, ADM])); // DROPPED (status), UDEL (deleted) excluded
    expect(sortStr(p)).toEqual(sortStr(m));
    // window [00:00, 06:00] Aug-1 straddles S1's FUT (03:00) → overlaps.
    const WS = '2026-08-01T00:00:00.000Z'; const WE = '2026-08-01T06:00:00.000Z';
    const [mc, pc] = await both((r) => r.findInstructorConflict([T1], WS, WE, null));
    expect(norm(mc) && String(norm(mc)._id)).toBe(S1); // S1 has T1, overlaps
    expect(norm(pc) && String(norm(pc)._id)).toBe(S1);
    const [mn, pn] = await both((r) => r.findInstructorConflict([ADM], WS, WE, null));
    expect(mn).toBeNull(); expect(pn).toBeNull(); // ADM on no session
  });

  test('findTeacherScopedClassIds: named OR empty teacher_ids', async () => {
    const [m, p] = await both((r) => r.findTeacherScopedClassIds(T1));
    expect(sortStr(norm(m).map((c) => c._id))).toEqual(sortStr([C1, C2, C3])); // C1 named; C2/C3 empty; CDEL deleted
    expect(sortStr(norm(p).map((c) => c._id))).toEqual(sortStr([C1, C2, C3]));
  });

  test('findCohortModeClassIds + facilitator/program reads', async () => {
    const [m, p] = await both((r) => r.findCohortModeClassIds());
    expect(sortStr(m)).toEqual([C1]); expect(sortStr(p)).toEqual([C1]); // P1 self_enroll
    const [mf, pf] = await both((r) => r.findClassForFacilitator(C1));
    expect(norm(mf)).toMatchObject({ programId: P1, teacherIds: [T1] });
    expect(norm(pf)).toMatchObject({ programId: P1, teacherIds: [T1] });
    const [mp, pp] = await both((r) => r.findProgramFacilitatorPolicy(P1));
    expect(norm(mp).facilitatorPolicy).toMatchObject(FPOL1); expect(norm(pp).facilitatorPolicy).toMatchObject(FPOL1);
    const [mv, pv] = await both((r) => r.findProgramVisibility(P1));
    expect(norm(mv).facilitatorPolicy.visibility).toBe('assigned_only'); expect(norm(pv).facilitatorPolicy.visibility).toBe('assigned_only');
    const [mpi, ppi] = await both((r) => r.findClassProgramId(C1));
    expect(String(norm(mpi).programId)).toBe(P1); expect(String(norm(ppi).programId)).toBe(P1);
    const [mc, pc] = await both((r) => r.findClassesProgramIds([C1, C2, C3]));
    const cmap = (rows) => Object.fromEntries(norm(rows).map((c) => [String(c._id), c.programId ? String(c.programId) : null]));
    expect(cmap(mc)).toEqual({ [C1]: P1, [C2]: P2, [C3]: null }); expect(cmap(pc)).toEqual(cmap(mc));
    const [ma, pa] = await both((r) => r.findAssignedOnlyPrograms([P1, P2]));
    expect(sortStr(norm(ma).map((x) => x._id))).toEqual([P1]); expect(sortStr(norm(pa).map((x) => x._id))).toEqual([P1]);
  });

  test('findAllowedTimeSlotsSetting', async () => {
    const [m, p] = await both((r) => r.findAllowedTimeSlotsSetting());
    expect(norm(m).value).toEqual(SLOTS); expect(norm(p).value).toEqual(SLOTS);
    expect(norm(p).key).toBe('ALLOWED_TIME_SLOTS');
  });

  // ── Post-commit read-path completion (booking/cancel re-fetches) ──
  test('findScheduleForResponse: booking response populate (empCode name)', async () => {
    const proj = (x) => { const n = norm(x); return {
      cls: n.classId.classCode, team: n.bookedTeamId.name,
      enrolled: sortStr(n.enrolledUsers.map((u) => u.empCode)),
      names: sortStr(n.enrolledUsers.map((u) => u.name)), status: n.status,
    }; };
    const [m, p] = await both((r) => r.findScheduleForResponse(S1));
    expect(proj(m)).toEqual({ cls: 'C-1', team: 'Team1', enrolled: ['E1', 'E2'], names: ['Alice', 'Bob'], status: 'scheduled' }); // UDEL dropped
    expect(proj(p)).toEqual(proj(m));
  });

  test('findScheduleForCancellation: class label + enrolled emails, bookedTeamId raw', async () => {
    const proj = (x) => { const n = norm(x); return {
      cls: n.classId.classCode,
      mails: sortStr(n.enrolledUsers.map((u) => u.email)),
      names: sortStr(n.enrolledUsers.map((u) => u.name)),
      team: String(n.bookedTeamId), // RAW id, NOT populated
    }; };
    const [m, p] = await both((r) => r.findScheduleForCancellation(S1));
    expect(proj(m)).toEqual({ cls: 'C-1', mails: ['a@x.io', 'b@x.io'], names: ['Alice', 'Bob'], team: TM1 }); // UDEL dropped
    expect(proj(p)).toEqual(proj(m));
  });

  test('findTeamLeaderId: leader id, soft-delete + missing → null', async () => {
    const [m, p] = await both((r) => r.findTeamLeaderId(TM1));
    expect(String(norm(m).leaderId)).toBe(LEADER); expect(String(norm(p).leaderId)).toBe(LEADER);
    const [md, pd] = await both((r) => r.findTeamLeaderId(TMDEL));
    expect(md).toBeNull(); expect(pd).toBeNull(); // soft-deleted team hidden
    const [mx, px] = await both((r) => r.findTeamLeaderId(hex(0xDEAD)));
    expect(mx).toBeNull(); expect(px).toBeNull(); // missing
  });
});
