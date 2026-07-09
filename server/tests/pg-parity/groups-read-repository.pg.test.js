/**
 * ──────────────────────────────────────────────────────────
 * PG-parity — groups read repository (Mongo ↔ Postgres)
 * ──────────────────────────────────────────────────────────
 * The groups Wave-G read port: the 13 Mongo-only reads (team lists / single
 * reads / progress bundle / mutation guards) go dual-backend so the pg lane's
 * post-write re-reads (mutations → findTeamByIdPopulated) stop returning null.
 * Runs only when a Postgres URL is present (the pg-parity CI job); SKIPS
 * otherwise. Reads only → plain MongoMemoryServer (no replica set needed).
 *
 * ONE identical dataset is seeded into both backends; each method is compared
 * DEEP-EQUAL after normalize (ObjectId→hex, Date→ISO, hydrated→JSON). Pinned:
 *   • slim vs full list populate (slim keeps RAW member ids, incl. the
 *     soft-deleted one; full embeds the selected fields and DROPS deleted
 *     members — Mongoose array-populate removes misses);
 *   • pagination (skip/limit over the name-asc list) + countTeams excluding
 *     soft-deleted rows (countDocuments hook parity);
 *   • user-scoped teams (leader-only vs member-only $or arms, dedupe) with the
 *     nested classId.programId → { _id, schedulingMode } embed;
 *   • deleted-team visibility (default reads hide them; findDeletedTeams
 *     selects is_deleted=true, deletedAt desc) + soft-deleted class/leader
 *     refs populating as null;
 *   • progress bundle (lean team + scheduled-only sessions startTime asc +
 *     unpopulated attendance rows; cancelled/foreign sessions excluded);
 *   • class guards (found / soft-deleted-holder excluded / missing → null /
 *     excludeId) and the member-conflict guard (populated members,
 *     excludeTeamId, deleted team excluded, empty input);
 *   • members ORDER: team_members has no ordinal column, so PG returns members
 *     ascending user_id; the Mongo arrays here are SEEDED ascending so both
 *     align (callers treat membership as a set — see team-write parity note).
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env.pg-prototype') });
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const PG_URL = process.env.PG_URL || process.env.PG_PROTOTYPE_URL;
const describePg = PG_URL ? describe : describe.skip;

const { query, closePool } = require('../../config/pg');
const repo = require('../../domains/groups/read-repository'); // registers Team/Schedule/Attendance
require('../../models/User'); // populate targets — register the ref'd models
require('../../models/Class');
require('../../models/LearningProgram');

const hex = (n) => n.toString(16).padStart(24, '0');
const oid = (h) => new mongoose.Types.ObjectId(h);
const coll = (m) => mongoose.model(m).collection.name;
const norm = (x) => (x == null ? null : JSON.parse(JSON.stringify(x)));
const both = (fn) => Promise.all([fn(repo.impls.mongo), fn(repo.impls.pg)]);
const byId = (a) => [...a].sort((x, y) => String(x._id).localeCompare(String(y._id)));

// Shared ids (Mongo casts hex → ObjectId; PG stores text). Member ids ascend
// so the Mongo array order matches the PG ascending-user_id read (see header).
const UL1 = hex(0xa01); const UM1 = hex(0xa02); const UDEL = hex(0xa03); const UM2 = hex(0xa04);
const P1 = hex(0xb01);
const C1 = hex(0xc01); const C2 = hex(0xc02); const C3 = hex(0xc03); const CX = hex(0xcff);
const T1 = hex(0xd01); const T2 = hex(0xd02); const T3 = hex(0xd03); const TD1 = hex(0xd04); const TD2 = hex(0xd05);
const SA = hex(0xe01); const SB = hex(0xe02); const SC = hex(0xe03); const SX = hex(0xe04);
const A1 = hex(0xf01); const A2 = hex(0xf02); const A3 = hex(0xf03); const AX = hex(0xf04);
const MISSING = hex(0xfff);

const TS = '2026-06-01T00:00:00.000Z';       // uniform created/updated stamp
const DEL_NEW = '2026-06-20T00:00:00.000Z';  // TD1 deletedAt (newer → first in desc)
const DEL_OLD = '2026-06-10T00:00:00.000Z';  // TD2 deletedAt (older)
const ST_EARLY = '2026-07-10T03:00:00.000Z'; const ET_EARLY = '2026-07-10T04:00:00.000Z';
const ST_LATE = '2026-07-11T03:00:00.000Z'; const ET_LATE = '2026-07-11T04:00:00.000Z';

// Canonical full-doc seeds (Mongo docs carry the exact lean shape the PG row
// mappers emit, so whole-doc deep-equal works — not just projections).
const teamDoc = (id, name, classId, leaderId, members, extra = {}) => ({
  _id: oid(id), name,
  classId: classId ? oid(classId) : null,
  leaderId: leaderId ? oid(leaderId) : null,
  members: members.map(oid),
  isDeleted: false, deletedAt: null,
  createdAt: new Date(TS), updatedAt: new Date(TS),
  ...extra,
});
const schedDoc = (id, classId, teamId, st, et, enrolled, extra = {}) => ({
  _id: oid(id), classId: oid(classId), bookedTeamId: oid(teamId), officeId: null,
  startTime: new Date(st), endTime: new Date(et), roomLink: '', roomId: null,
  sessionInstructorIds: [], topic: '', meetLink: '', enrolledUsers: enrolled.map(oid),
  status: 'scheduled', cancelledAt: null, cancelledBy: null, cancelReason: '',
  createdAt: new Date(TS), updatedAt: new Date(TS),
  ...extra,
});
const attDoc = (id, scheduleId, userId, status, remark) => ({
  _id: oid(id), scheduleId: oid(scheduleId), userId: oid(userId), status,
  remark, photoUrl: '', syncStatus: 'PENDING',
  createdAt: new Date(TS), updatedAt: new Date(TS),
});

describePg('PG-parity: groups read repository', () => {
  let mem;

  beforeAll(async () => {
    mem = await MongoMemoryServer.create();
    await mongoose.connect(mem.getUri(), { dbName: 'pg_parity_groups_reads' });
    const db = mongoose.connection.db;

    // ── Mongo seed (raw inserts; refs as ObjectIds so populate matches) ──
    await db.collection(coll('User')).insertMany([
      { _id: oid(UL1), empCode: 'L1', name: 'Lead One', department: 'Eng', status: 'Active', isDeleted: false },
      { _id: oid(UM1), empCode: 'M1', name: 'Mem One', department: 'Eng', status: 'Active', isDeleted: false },
      { _id: oid(UDEL), empCode: 'MD', name: 'Mem Del', department: 'Eng', status: 'Active', isDeleted: true },
      { _id: oid(UM2), empCode: 'M2', name: 'Mem Two', department: 'Ops', status: 'Active', isDeleted: false },
    ]);
    await db.collection(coll('LearningProgram')).insertOne(
      { _id: oid(P1), name: 'Prog One', schedulingMode: 'leader_booking', isDeleted: false },
    );
    await db.collection(coll('Class')).insertMany([
      { _id: oid(C1), classCode: 'CC-1', courseName: 'Course One', status: 'Ongoing', programId: oid(P1), isDeleted: false },
      { _id: oid(C2), classCode: 'CC-2', courseName: 'Course Two', status: 'Ongoing', programId: null, isDeleted: true },
      { _id: oid(C3), classCode: 'CC-3', courseName: 'Course Three', status: 'Planned', programId: null, isDeleted: false },
    ]);
    await db.collection(coll('Team')).insertMany([
      teamDoc(T1, 'Alpha', C1, UL1, [UL1, UM1, UDEL]),          // leader also member; UDEL soft-deleted
      teamDoc(T2, 'Bravo', C2, null, [UM2]),                    // class soft-deleted → populates null
      teamDoc(T3, 'Charlie', C3, UM2, []),                      // leader-only scope arm; no members
      teamDoc(TD1, 'Trash1', C1, UL1, [UM1], { isDeleted: true, deletedAt: new Date(DEL_NEW) }),
      teamDoc(TD2, 'Trash2', C2, UDEL, [], { isDeleted: true, deletedAt: new Date(DEL_OLD) }),
    ]);
    await db.collection(coll('Schedule')).insertMany([
      schedDoc(SA, C1, T1, ST_EARLY, ET_EARLY, [UL1, UM1]),
      schedDoc(SB, C1, T1, ST_LATE, ET_LATE, [UL1]),
      schedDoc(SC, C1, T1, '2026-07-12T03:00:00.000Z', '2026-07-12T04:00:00.000Z', [], { status: 'cancelled' }),
      schedDoc(SX, C2, T2, ST_EARLY, ET_EARLY, [UM2]),          // other team's session
    ]);
    await db.collection(coll('Attendance')).insertMany([
      attDoc(A1, SA, UL1, 'P', 'ok'),
      attDoc(A2, SA, UM1, 'A', ''),
      attDoc(A3, SB, UL1, 'L', ''),
      attDoc(AX, SX, UM2, 'P', ''),                              // outside the T1 bundle
    ]);

    // ── PG seed (text ids; explicit stamps so timestamps compare equal) ──
    await query('TRUNCATE teams, team_members, classes, users, learning_programs, schedules, attendances');
    await query(
      `INSERT INTO users(id,emp_code,name,department,status,is_deleted,created_at,updated_at) VALUES
        ($1,'L1','Lead One','Eng','Active',false,$5,$5),
        ($2,'M1','Mem One','Eng','Active',false,$5,$5),
        ($3,'MD','Mem Del','Eng','Active',true,$5,$5),
        ($4,'M2','Mem Two','Ops','Active',false,$5,$5)`,
      [UL1, UM1, UDEL, UM2, TS]);
    await query(
      `INSERT INTO learning_programs(id,name,scheduling_mode,is_deleted,created_at,updated_at)
        VALUES ($1,'Prog One','leader_booking',false,$2,$2)`,
      [P1, TS]);
    await query(
      `INSERT INTO classes(id,class_code,course_name,status,program_id,is_deleted,created_at,updated_at) VALUES
        ($1,'CC-1','Course One','Ongoing',$4,false,$5,$5),
        ($2,'CC-2','Course Two','Ongoing',NULL,true,$5,$5),
        ($3,'CC-3','Course Three','Planned',NULL,false,$5,$5)`,
      [C1, C2, C3, P1, TS]);
    await query(
      `INSERT INTO teams(id,name,class_id,leader_id,is_deleted,deleted_at,created_at,updated_at) VALUES
        ($1,'Alpha',$6,$9,false,NULL,$11,$11),
        ($2,'Bravo',$7,NULL,false,NULL,$11,$11),
        ($3,'Charlie',$8,$10,false,NULL,$11,$11),
        ($4,'Trash1',$6,$9,true,$12,$11,$11),
        ($5,'Trash2',$7,$13,true,$14,$11,$11)`,
      [T1, T2, T3, TD1, TD2, C1, C2, C3, UL1, UM2, TS, DEL_NEW, UDEL, DEL_OLD]);
    await query(
      `INSERT INTO team_members(team_id,user_id) VALUES ($1,$3),($1,$4),($1,$5),($2,$6),($7,$4)`,
      [T1, T2, UL1, UM1, UDEL, UM2, TD1]);
    await query(
      `INSERT INTO schedules(id,class_id,booked_team_id,start_time,end_time,status,enrolled_users,session_instructor_ids,created_at,updated_at) VALUES
        ($1,$5,$7,$9,$10,'scheduled',ARRAY[$13,$14]::text[],'{}'::text[],$8,$8),
        ($2,$5,$7,$11,$12,'scheduled',ARRAY[$13]::text[],'{}'::text[],$8,$8),
        ($3,$5,$7,'2026-07-12T03:00:00.000Z','2026-07-12T04:00:00.000Z','cancelled','{}'::text[],'{}'::text[],$8,$8),
        ($4,$6,$15,$9,$10,'scheduled',ARRAY[$16]::text[],'{}'::text[],$8,$8)`,
      [SA, SB, SC, SX, C1, C2, T1, TS, ST_EARLY, ET_EARLY, ST_LATE, ET_LATE, UL1, UM1, T2, UM2]);
    await query(
      `INSERT INTO attendances(id,schedule_id,user_id,status,remark,photo_url,sync_status,created_at,updated_at) VALUES
        ($1,$5,$8,'P','ok','','PENDING',$11,$11),
        ($2,$5,$9,'A','','','PENDING',$11,$11),
        ($3,$6,$8,'L','','','PENDING',$11,$11),
        ($4,$7,$10,'P','','','PENDING',$11,$11)`,
      [A1, A2, A3, AX, SA, SB, SX, UL1, UM1, UM2, TS]);
  }, 60_000);

  afterAll(async () => {
    if (mongoose.connection.readyState) await mongoose.disconnect();
    if (mem) await mem.stop();
    await closePool();
  });

  // ── List reads ──────────────────────────────────────────
  test('findAllTeams full: name-asc, populated refs, deleted class → null, deleted member dropped', async () => {
    const [m, p] = await both((r) => r.findAllTeams({ slim: false }));
    const mm = norm(m);
    expect(mm.map((t) => t.name)).toEqual(['Alpha', 'Bravo', 'Charlie']); // trash hidden
    expect(mm[0].classId).toEqual({ _id: C1, classCode: 'CC-1', courseName: 'Course One', status: 'Ongoing' });
    expect(mm[0].leaderId).toEqual({ _id: UL1, empCode: 'L1', name: 'Lead One', department: 'Eng', status: 'Active' });
    expect(mm[0].members.map((u) => u._id)).toEqual([UL1, UM1]); // UDEL dropped by populate
    expect(mm[1].classId).toBeNull(); // C2 soft-deleted → populate null
    expect(mm[1].leaderId).toBeNull();
    expect(mm[2].members).toEqual([]);
    expect(norm(p)).toEqual(mm);
  });

  test('findAllTeams slim: members stay RAW ids (soft-deleted member id included)', async () => {
    const [m, p] = await both((r) => r.findAllTeams({ slim: true }));
    const mm = norm(m);
    expect(mm[0].members).toEqual([UL1, UM1, UDEL]); // un-populated stored ids
    expect(mm[0].classId.classCode).toBe('CC-1');    // class/leader still populated
    expect(norm(p)).toEqual(mm);
  });

  test('findTeamsPage: skip/limit slices the name-asc list identically (full + slim)', async () => {
    const [m1, p1] = await both((r) => r.findTeamsPage({ slim: false, skip: 0, limit: 2 }));
    expect(norm(m1).map((t) => t.name)).toEqual(['Alpha', 'Bravo']);
    expect(norm(p1)).toEqual(norm(m1));
    const [m2, p2] = await both((r) => r.findTeamsPage({ slim: true, skip: 2, limit: 2 }));
    expect(norm(m2).map((t) => t.name)).toEqual(['Charlie']);
    expect(norm(p2)).toEqual(norm(m2));
  });

  test('countTeams: soft-deleted teams excluded (countDocuments hook parity)', async () => {
    const [m, p] = await both((r) => r.countTeams());
    expect(m).toBe(3);
    expect(p).toBe(3);
  });

  // ── Single reads ────────────────────────────────────────
  test('findTeamByIdPopulated: full populate; deleted team / missing id → null', async () => {
    const [m, p] = await both((r) => r.findTeamByIdPopulated(T1));
    expect(norm(m).members.map((u) => u.empCode)).toEqual(['L1', 'M1']);
    expect(norm(p)).toEqual(norm(m));
    const [m2, p2] = await both((r) => r.findTeamByIdPopulated(T2)); // deleted class ref
    expect(norm(m2).classId).toBeNull();
    expect(norm(p2)).toEqual(norm(m2));
    const [md, pd] = await both((r) => r.findTeamByIdPopulated(TD1)); // soft-deleted team
    expect(md).toBeNull(); expect(pd).toBeNull();
    const [mx, px] = await both((r) => r.findTeamByIdPopulated(MISSING));
    expect(mx).toBeNull(); expect(px).toBeNull();
  });

  test('findTeamsForUser: leader/member $or arms, dedupe, nested program embed', async () => {
    // UL1: leader AND member of T1 → one row; nested programId embedded.
    const [m, p] = await both((r) => r.findTeamsForUser(UL1));
    const mm = norm(m);
    expect(mm.map((t) => t.name)).toEqual(['Alpha']);
    expect(mm[0].classId).toEqual({
      _id: C1, classCode: 'CC-1', courseName: 'Course One', status: 'Ongoing',
      programId: { _id: P1, schedulingMode: 'leader_booking' },
    });
    expect(norm(p)).toEqual(mm);
    // UM2: member-only (T2) + leader-only (T3); deleted class → null; program-less class → programId null.
    const [m2, p2] = await both((r) => r.findTeamsForUser(UM2));
    const mm2 = norm(m2);
    expect(mm2.map((t) => t.name)).toEqual(['Bravo', 'Charlie']);
    expect(mm2[0].classId).toBeNull();
    expect(mm2[1].classId.programId).toBeNull();
    expect(norm(p2)).toEqual(mm2);
    // unknown user → empty
    const [me, pe] = await both((r) => r.findTeamsForUser(MISSING));
    expect(me).toEqual([]); expect(pe).toEqual([]);
  });

  test('findDeletedTeams: deletedAt desc; slim populate; deleted class/leader refs → null', async () => {
    const [m, p] = await both((r) => r.findDeletedTeams());
    const mm = norm(m);
    expect(mm.map((t) => t.name)).toEqual(['Trash1', 'Trash2']); // DEL_NEW first
    expect(mm[0].classId).toEqual({ _id: C1, classCode: 'CC-1', courseName: 'Course One' }); // no status (slim select)
    expect(mm[0].leaderId).toEqual({ _id: UL1, empCode: 'L1', name: 'Lead One' });
    expect(mm[0].members).toEqual([UM1]); // raw ids — members not populated here
    expect(mm[1].classId).toBeNull();     // C2 soft-deleted
    expect(mm[1].leaderId).toBeNull();    // UDEL soft-deleted
    expect(norm(p)).toEqual(mm);
  });

  // ── Progress bundle ─────────────────────────────────────
  test('findTeamForProgress: lean team, members+class populated, leaderId raw; deleted → null', async () => {
    const [m, p] = await both((r) => r.findTeamForProgress(T1));
    const mm = norm(m);
    expect(mm.leaderId).toBe(UL1); // NOT populated on this read
    expect(mm.classId).toEqual({ _id: C1, classCode: 'CC-1', courseName: 'Course One' });
    expect(mm.members.map((u) => u.empCode)).toEqual(['L1', 'M1']);
    expect(norm(p)).toEqual(mm);
    const [md, pd] = await both((r) => r.findTeamForProgress(TD1));
    expect(md).toBeNull(); expect(pd).toBeNull();
  });

  test('findTeamScheduledSessions: scheduled-only, startTime asc, other teams excluded — full doc parity', async () => {
    const [m, p] = await both((r) => r.findTeamScheduledSessions(T1));
    const mm = norm(m);
    expect(mm.map((s) => s._id)).toEqual([SA, SB]); // SC cancelled + SX foreign excluded
    expect(mm[0].enrolledUsers).toEqual([UL1, UM1]);
    expect(norm(p)).toEqual(mm); // whole lean docs (canonical shape) deep-equal
  });

  test('findAttendanceForSchedules: rows across the ids, unpopulated; empty input → []', async () => {
    const [m, p] = await both((r) => r.findAttendanceForSchedules([SA, SB]));
    const mm = byId(norm(m));
    expect(mm.map((a) => a._id)).toEqual([A1, A2, A3]); // AX excluded
    expect(mm[0]).toMatchObject({ scheduleId: SA, userId: UL1, status: 'P', remark: 'ok' });
    expect(byId(norm(p))).toEqual(mm); // unordered read → compare sorted
    const [me, pe] = await both((r) => r.findAttendanceForSchedules([]));
    expect(me).toEqual([]); expect(pe).toEqual([]);
  });

  // ── getUserProgress support (K1b slice 4) ───────────────
  test('findMemberTeamsWithClass: member teams w/ class label; deleted team excluded; deleted class → null', async () => {
    // UM1 is a member of T1 (live) and TD1 (deleted) → only T1.
    const [m, p] = await both((r) => r.findMemberTeamsWithClass(UM1));
    const mm = byId(norm(m));
    expect(mm.map((t) => t._id)).toEqual([T1]);                // TD1 hidden by soft-delete
    expect(mm[0].classId).toEqual({ _id: C1, classCode: 'CC-1', courseName: 'Course One' }); // no status select
    expect(mm[0].members).toEqual([UL1, UM1, UDEL]);           // raw ids (members not populated here)
    expect(mm[0].leaderId).toBe(UL1);                          // raw id (leader not populated here)
    expect(byId(norm(p))).toEqual(mm);                         // whole team doc deep-equal
    // UM2 → T2 whose class C2 is soft-deleted → classId null
    const [m2, p2] = await both((r) => r.findMemberTeamsWithClass(UM2));
    expect(norm(m2).map((t) => t._id)).toEqual([T2]);
    expect(norm(m2)[0].classId).toBeNull();
    expect(byId(norm(p2))).toEqual(byId(norm(m2)));
    const [me, pe] = await both((r) => r.findMemberTeamsWithClass(MISSING));
    expect(me).toEqual([]); expect(pe).toEqual([]);
  });

  test('findScheduledByBookedTeamIdsPopulated: scheduled-only, startTime asc, class+team populated', async () => {
    const [m, p] = await both((r) => r.findScheduledByBookedTeamIdsPopulated([T1]));
    const mm = norm(m);
    expect(mm.map((s) => s._id)).toEqual([SA, SB]); // SC cancelled + SX foreign excluded; startTime asc
    expect(mm[0].classId).toEqual({ _id: C1, classCode: 'CC-1', courseName: 'Course One' });
    expect(mm[0].bookedTeamId).toEqual({ _id: T1, name: 'Alpha' });
    expect(norm(p)).toEqual(mm); // whole populated docs deep-equal
    // T2 → SX only; its class C2 is soft-deleted → classId null; bookedTeamId Bravo
    const [m2, p2] = await both((r) => r.findScheduledByBookedTeamIdsPopulated([T2]));
    const mm2 = norm(m2);
    expect(mm2.map((s) => s._id)).toEqual([SX]);
    expect(mm2[0].classId).toBeNull();
    expect(mm2[0].bookedTeamId).toEqual({ _id: T2, name: 'Bravo' });
    expect(norm(p2)).toEqual(mm2);
    const [me, pe] = await both((r) => r.findScheduledByBookedTeamIdsPopulated([]));
    expect(me).toEqual([]); expect(pe).toEqual([]);
  });

  // ── Mutation pre-reads / guards ─────────────────────────
  test('findTeamByIdLean: raw lean doc (no populate); deleted team → null', async () => {
    const [m, p] = await both((r) => r.findTeamByIdLean(T1));
    expect(norm(m)).toEqual({
      _id: T1, name: 'Alpha', classId: C1, leaderId: UL1,
      members: [UL1, UM1, UDEL], isDeleted: false, deletedAt: null,
      createdAt: TS, updatedAt: TS,
    });
    expect(norm(p)).toEqual(norm(m));
    const [md, pd] = await both((r) => r.findTeamByIdLean(TD1));
    expect(md).toBeNull(); expect(pd).toBeNull();
  });

  test('class guard: live holder found (deleted holder invisible); missing → null; excludeId honored', async () => {
    const [m, p] = await both((r) => r.findTeamByClass(C1)); // TD1 also holds C1 but is deleted
    const mm = norm(m);
    expect(mm._id).toBe(T1);
    expect(mm.classId).toEqual({ _id: C1, classCode: 'CC-1' }); // classCode-only select
    expect(mm.members).toEqual([UL1, UM1, UDEL]);               // raw — not populated here
    expect(norm(p)).toEqual(mm);
    const [mx, px] = await both((r) => r.findTeamByClass(CX));
    expect(mx).toBeNull(); expect(px).toBeNull();
    const [ms, ps] = await both((r) => r.findTeamByClassExcluding(C1, T1)); // self excluded
    expect(ms).toBeNull(); expect(ps).toBeNull();
    const [mo, po] = await both((r) => r.findTeamByClassExcluding(C1, T2)); // other team excluded → T1 still found
    expect(norm(mo)._id).toBe(T1);
    expect(norm(po)).toEqual(norm(mo));
  });

  test('member-conflict guard: populated members, deleted team excluded, excludeTeamId, empty input', async () => {
    const [m, p] = await both((r) => r.findTeamsByMembers([UM1])); // UM1 in T1 + deleted TD1
    const mm = norm(m);
    expect(mm.map((t) => t._id)).toEqual([T1]); // TD1 hidden by soft-delete
    expect(mm[0].members).toEqual([            // 'name empCode' select; UDEL dropped
      { _id: UL1, name: 'Lead One', empCode: 'L1' },
      { _id: UM1, name: 'Mem One', empCode: 'M1' },
    ]);
    expect(norm(p)).toEqual(mm);
    const [m2, p2] = await both((r) => r.findTeamsByMembers([UL1, UM2])); // spans two teams
    expect(norm(m2).map((t) => t._id)).toEqual([T1, T2]);
    expect(norm(p2)).toEqual(norm(m2));
    const [m3, p3] = await both((r) => r.findTeamsByMembers([UM2], T2)); // exclude the own team
    expect(m3).toEqual([]); expect(p3).toEqual([]);
    const [m4, p4] = await both((r) => r.findTeamsByMembers([]));
    expect(m4).toEqual([]); expect(p4).toEqual([]);
  });
});
