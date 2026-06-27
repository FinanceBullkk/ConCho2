/**
 * ──────────────────────────────────────────────────────────
 * PG-parity test — domains/schedule/waitlist repository, slice S2
 * ──────────────────────────────────────────────────────────
 * The 10 waitlist methods (reads + the two simple writes). Runs only when a
 * Postgres URL is present; SKIPS otherwise. Pins the trap-prone bits:
 *   • createEntry double-join guard: partial-unique uq_waitlist_live → 23505 →
 *     Mongo-style { code: 11000 };
 *   • status-lifecycle (withdraw flips waiting→withdrawn; second flip → null);
 *   • populate('userId') drops a soft-deleted user to null; nested
 *     populate(scheduleId→class/office/room) drops a soft-deleted ref to null;
 *   • FIFO order = created_at ASC across ALL statuses (listForSchedule) /
 *     WAITING only (listMine, positionOf);
 *   • positionOf handles a populated scheduleId (Mongoose _id-extraction ⇔ idOf);
 *   • findScheduleForJoin / findTeamMembers (deleted team → null) /
 *     hasActiveCohortEnrollment (team_id null only) / isTeacherAllowedForClass
 *     (named OR empty teacher_ids; deleted class → false).
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env.pg-prototype') });
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const PG_URL = process.env.PG_URL || process.env.PG_PROTOTYPE_URL;
const describePg = PG_URL ? describe : describe.skip;

const { query, closePool } = require('../../config/pg');
const repo = require('../../domains/schedule/waitlist/repository'); // registers Schedule/Team/Class/Enrollment/WaitlistEntry
require('../../models/User');
require('../../models/Office');
require('../../models/Room');

const hex = (n) => n.toString(16).padStart(24, '0');
const oid = (h) => new mongoose.Types.ObjectId(h);
const coll = (m) => mongoose.model(m).collection.name;
const norm = (x) => (x == null ? null : JSON.parse(JSON.stringify(x)));
const both = (fn) => Promise.all([fn(repo.impls.mongo), fn(repo.impls.pg)]);
const sortStr = (a) => [...a].map(String).sort();

// ── id fixtures ──
const CW1 = hex(0xE11); const CW2 = hex(0xE12); const CWDEL = hex(0xE13);
const WU1 = hex(0xE21); const WU2 = hex(0xE22); const WU3 = hex(0xE23);
const WUDEL = hex(0xE24); const WUW = hex(0xE25); const WUC = hex(0xE26);
const TT1 = hex(0xE27); const TT2 = hex(0xE28);
const TMW = hex(0xE31); const TMDEL = hex(0xE32);
const OW1 = hex(0xE41); const RW1 = hex(0xE51); const RWDEL = hex(0xE52);
const SW1 = hex(0xE61); const SW2 = hex(0xE62);
const EW1 = hex(0xE71); const EW2 = hex(0xE72);
const WE1 = hex(0xE81); const WE2 = hex(0xE82); const WE3 = hex(0xE83);
const WE4 = hex(0xE84); const WEW = hex(0xE85); const WE5 = hex(0xE86);

const FUT = '2026-08-01T03:00:00.000Z'; const FUT2 = '2026-08-02T03:00:00.000Z';
// waitlist created_at ladder (distinct → deterministic FIFO across both backends)
const T0 = '2026-06-01T00:00:00.000Z'; // WE4 withdrawn (oldest)
const T1 = '2026-06-01T01:00:00.000Z'; // WE1 SW1/WU1
const T2 = '2026-06-01T02:00:00.000Z'; // WE2 SW1/WU2
const T3 = '2026-06-01T03:00:00.000Z'; // WE3 SW1/WUDEL
const T4 = '2026-06-01T04:00:00.000Z'; // WEW SW1/WUW
const T5 = '2026-06-01T05:00:00.000Z'; // WE5 SW2/WU1

describePg('PG-parity: domains/schedule/waitlist repository (S2)', () => {
  let mem;

  beforeAll(async () => {
    mem = await MongoMemoryServer.create();
    await mongoose.connect(mem.getUri());
    const db = mongoose.connection.db;
    const d = (s) => new Date(s);

    // ── Mongo seed ──
    await db.collection(coll('Class')).insertMany([
      { _id: oid(CW1), classCode: 'C-W1', courseName: 'CourseW1', teacherIds: [oid(TT1)], isDeleted: false },
      { _id: oid(CW2), classCode: 'C-W2', courseName: 'CourseW2', teacherIds: [], isDeleted: false },
      { _id: oid(CWDEL), classCode: 'C-WD', courseName: 'CourseWD', teacherIds: [oid(TT1)], isDeleted: true },
    ]);
    await db.collection(coll('User')).insertMany([
      { _id: oid(WU1), empCode: 'U1', name: 'Alice', department: 'Eng', role: 'Participant', status: 'Active', isDeleted: false },
      { _id: oid(WU2), empCode: 'U2', name: 'Bob', department: 'Eng', role: 'Participant', status: 'Active', isDeleted: false },
      { _id: oid(WU3), empCode: 'U3', name: 'Cara', department: 'Eng', role: 'Participant', status: 'Active', isDeleted: false },
      { _id: oid(WUDEL), empCode: 'UD', name: 'Del', department: 'Eng', role: 'Participant', status: 'Active', isDeleted: true },
      { _id: oid(WUW), empCode: 'UW', name: 'Wen', department: 'Eng', role: 'Participant', status: 'Active', isDeleted: false },
      { _id: oid(WUC), empCode: 'UC', name: 'Cyn', department: 'Eng', role: 'Participant', status: 'Active', isDeleted: false },
      { _id: oid(TT1), empCode: 'T1', name: 'Teach1', role: 'Teacher', status: 'Active', isDeleted: false },
      { _id: oid(TT2), empCode: 'T2', name: 'Teach2', role: 'Teacher', status: 'Active', isDeleted: false },
    ]);
    await db.collection(coll('Team')).insertMany([
      { _id: oid(TMW), name: 'TeamW', classId: oid(CW1), leaderId: oid(WU1), members: [oid(WU1), oid(WU2)], isDeleted: false },
      { _id: oid(TMDEL), name: 'TeamD', classId: oid(CW1), leaderId: oid(WU1), members: [oid(WU1)], isDeleted: true },
    ]);
    await db.collection(coll('Office')).insertMany([
      { _id: oid(OW1), name: 'OfficeW', code: 'OW1', isDeleted: false },
    ]);
    await db.collection(coll('Room')).insertMany([
      { _id: oid(RW1), name: 'RoomW', code: 'RW1', officeId: oid(OW1), isActive: true, isDeleted: false },
      { _id: oid(RWDEL), name: 'RoomD', code: 'RWD', officeId: oid(OW1), isActive: true, isDeleted: true },
    ]);
    await db.collection(coll('Schedule')).insertMany([
      { _id: oid(SW1), classId: oid(CW1), bookedTeamId: oid(TMW), officeId: oid(OW1), roomId: oid(RW1), startTime: d(FUT), endTime: d(FUT), status: 'scheduled', enrolledUsers: [oid(WU1), oid(WU2)], capacity: 3 },
      { _id: oid(SW2), classId: oid(CW1), bookedTeamId: null, officeId: null, roomId: oid(RWDEL), startTime: d(FUT2), endTime: d(FUT2), status: 'scheduled', enrolledUsers: [] },
    ]);
    await db.collection(coll('Enrollment')).insertMany([
      { _id: oid(EW1), userId: oid(WU1), classId: oid(CW1), teamId: null, status: 'Active' },
      { _id: oid(EW2), userId: oid(WU2), classId: oid(CW1), teamId: oid(TMW), status: 'Active' },
    ]);
    await db.collection(coll('WaitlistEntry')).insertMany([
      { _id: oid(WE4), scheduleId: oid(SW1), classId: oid(CW1), userId: oid(WU3), status: 'withdrawn', promotedAt: null, joinedBy: null, createdAt: d(T0), updatedAt: d(T0) },
      { _id: oid(WE1), scheduleId: oid(SW1), classId: oid(CW1), userId: oid(WU1), status: 'waiting', promotedAt: null, joinedBy: null, createdAt: d(T1), updatedAt: d(T1) },
      { _id: oid(WE2), scheduleId: oid(SW1), classId: oid(CW1), userId: oid(WU2), status: 'waiting', promotedAt: null, joinedBy: null, createdAt: d(T2), updatedAt: d(T2) },
      { _id: oid(WE3), scheduleId: oid(SW1), classId: oid(CW1), userId: oid(WUDEL), status: 'waiting', promotedAt: null, joinedBy: null, createdAt: d(T3), updatedAt: d(T3) },
      { _id: oid(WEW), scheduleId: oid(SW1), classId: oid(CW1), userId: oid(WUW), status: 'waiting', promotedAt: null, joinedBy: null, createdAt: d(T4), updatedAt: d(T4) },
      { _id: oid(WE5), scheduleId: oid(SW2), classId: oid(CW1), userId: oid(WU1), status: 'waiting', promotedAt: null, joinedBy: null, createdAt: d(T5), updatedAt: d(T5) },
    ]);

    // ── PG seed ──
    await query('TRUNCATE classes, users, teams, team_members, offices, rooms, schedules, enrollments, waitlist_entries');
    await query(
      `INSERT INTO classes(id,class_code,course_name,teacher_ids,is_deleted) VALUES
        ($1,'C-W1','CourseW1',ARRAY[$4]::text[],false),
        ($2,'C-W2','CourseW2','{}'::text[],false),
        ($3,'C-WD','CourseWD',ARRAY[$4]::text[],true)`,
      [CW1, CW2, CWDEL, TT1]);
    await query(
      `INSERT INTO users(id,emp_code,name,department,role,status,is_deleted) VALUES
        ($1,'U1','Alice','Eng','Participant','Active',false),
        ($2,'U2','Bob','Eng','Participant','Active',false),
        ($3,'U3','Cara','Eng','Participant','Active',false),
        ($4,'UD','Del','Eng','Participant','Active',true),
        ($5,'UW','Wen','Eng','Participant','Active',false),
        ($6,'UC','Cyn','Eng','Participant','Active',false),
        ($7,'T1','Teach1',NULL,'Teacher','Active',false),
        ($8,'T2','Teach2',NULL,'Teacher','Active',false)`,
      [WU1, WU2, WU3, WUDEL, WUW, WUC, TT1, TT2]);
    await query(
      `INSERT INTO teams(id,name,class_id,leader_id,is_deleted) VALUES
        ($1,'TeamW',$3,$4,false),($2,'TeamD',$3,$4,true)`,
      [TMW, TMDEL, CW1, WU1]);
    await query(`INSERT INTO team_members(team_id,user_id) VALUES ($1,$2),($1,$3)`, [TMW, WU1, WU2]);
    await query(`INSERT INTO offices(id,name,code,is_deleted) VALUES ($1,'OfficeW','OW1',false)`, [OW1]);
    await query(
      `INSERT INTO rooms(id,name,code,office_id,is_active,is_deleted) VALUES
        ($1,'RoomW','RW1',$3,true,false),($2,'RoomD','RWD',$3,true,true)`,
      [RW1, RWDEL, OW1]);
    await query(
      `INSERT INTO schedules(id,class_id,booked_team_id,office_id,room_id,start_time,end_time,status,enrolled_users,capacity) VALUES
        ($1,$3,$4,$5,$6,$7,$7,'scheduled',ARRAY[$9,$10]::text[],3),
        ($2,$3,NULL,NULL,$11,$8,$8,'scheduled','{}'::text[],NULL)`,
      [SW1, SW2, CW1, TMW, OW1, RW1, FUT, FUT2, WU1, WU2, RWDEL]);
    await query(
      `INSERT INTO enrollments(id,user_id,class_id,team_id,status) VALUES
        ($1,$3,$5,NULL,'Active'),($2,$4,$5,$6,'Active')`,
      [EW1, EW2, WU1, WU2, CW1, TMW]);
    await query(
      `INSERT INTO waitlist_entries(id,schedule_id,class_id,user_id,status,created_at,updated_at) VALUES
        ($1,$7,$13,$8,'withdrawn',$15,$15),
        ($2,$7,$13,$9,'waiting',$16,$16),
        ($3,$7,$13,$10,'waiting',$17,$17),
        ($4,$7,$13,$11,'waiting',$18,$18),
        ($5,$7,$13,$12,'waiting',$19,$19),
        ($6,$14,$13,$9,'waiting',$20,$20)`,
      [WE4, WE1, WE2, WE3, WEW, WE5, SW1, WU3, WU1, WU2, WUDEL, WUW, CW1, SW2, T0, T1, T2, T3, T4, T5]);
  }, 60_000);

  afterAll(async () => {
    if (mongoose.connection.readyState) await mongoose.disconnect();
    if (mem) await mem.stop();
    await closePool();
  });

  test('findScheduleForJoin: raw shape (class/team/capacity/enrolled) + null', async () => {
    const proj = (x) => { const n = norm(x); return {
      classId: String(n.classId), team: String(n.bookedTeamId), capacity: n.capacity,
      enrolled: sortStr(n.enrolledUsers), status: n.status,
    }; };
    const [m, p] = await both((r) => r.findScheduleForJoin(SW1));
    expect(proj(m)).toEqual({ classId: CW1, team: TMW, capacity: 3, enrolled: sortStr([WU1, WU2]), status: 'scheduled' });
    expect(proj(p)).toEqual(proj(m));
    const [mn, pn] = await both((r) => r.findScheduleForJoin(hex(0xEFF)));
    expect(mn).toBeNull(); expect(pn).toBeNull();
  });

  test('findTeamMembers: members + deleted team → null', async () => {
    const [m, p] = await both((r) => r.findTeamMembers(TMW));
    expect(sortStr(norm(m).members)).toEqual(sortStr([WU1, WU2]));
    expect(sortStr(norm(p).members)).toEqual(sortStr([WU1, WU2]));
    const [md, pd] = await both((r) => r.findTeamMembers(TMDEL));
    expect(md).toBeNull(); expect(pd).toBeNull(); // soft-deleted team
  });

  test('hasActiveCohortEnrollment: team_id null only', async () => {
    const [m1, p1] = await both((r) => r.hasActiveCohortEnrollment(CW1, WU1));
    expect(m1).toBe(true); expect(p1).toBe(true); // EW1 cohort (team null)
    const [m2, p2] = await both((r) => r.hasActiveCohortEnrollment(CW1, WU2));
    expect(m2).toBe(false); expect(p2).toBe(false); // EW2 has a team → not cohort
    const [m3, p3] = await both((r) => r.hasActiveCohortEnrollment(CW1, WU3));
    expect(m3).toBe(false); expect(p3).toBe(false); // none
  });

  test('isTeacherAllowedForClass: named OR empty teacher_ids; deleted class → false', async () => {
    const cases = [[CW1, TT1, true], [CW1, TT2, false], [CW2, TT2, true], [CWDEL, TT1, false]];
    for (const [cls, teacher, want] of cases) {
      // eslint-disable-next-line no-await-in-loop
      const [m, p] = await both((r) => r.isTeacherAllowedForClass(cls, teacher));
      expect(m).toBe(want); expect(p).toBe(want);
    }
  });

  test('findMyWaitingEntry: waiting hit + withdrawn → null', async () => {
    const [m, p] = await both((r) => r.findMyWaitingEntry(SW1, WU1));
    expect(String(norm(m)._id)).toBe(WE1); expect(norm(m).status).toBe('waiting');
    expect(String(norm(p)._id)).toBe(WE1); expect(norm(p).status).toBe('waiting');
    const [mn, pn] = await both((r) => r.findMyWaitingEntry(SW1, WU3)); // WU3 row is withdrawn
    expect(mn).toBeNull(); expect(pn).toBeNull();
  });

  test('positionOf: counts older WAITING rows only (raw + populated entry)', async () => {
    // WE2 (T2): older waiting on SW1 = WE1 (T1); WE4 (T0) is withdrawn → position 2
    const [me, pe] = await both((r) => r.findMyWaitingEntry(SW1, WU2));
    const [mp, pp] = await Promise.all([repo.impls.mongo.positionOf(me), repo.impls.pg.positionOf(pe)]);
    expect(mp).toBe(2); expect(pp).toBe(2);
    // populated scheduleId path (listMine entry) — WE1 (T1) has no older waiting → 1
    const [ml, pl] = await both((r) => r.listMyWaitingEntries(WU1));
    const [mp1, pp1] = await Promise.all([repo.impls.mongo.positionOf(ml[0]), repo.impls.pg.positionOf(pl[0])]);
    expect(mp1).toBe(1); expect(pp1).toBe(1);
  });

  test('listEntriesForSchedule: all statuses, FIFO, userId populate (deleted → null)', async () => {
    const proj = (rows) => norm(rows).map((e) => ({ status: e.status, emp: e.userId ? e.userId.empCode : null }));
    const [m, p] = await both((r) => r.listEntriesForSchedule(SW1));
    const want = [
      { status: 'withdrawn', emp: 'U3' }, // WE4 T0
      { status: 'waiting', emp: 'U1' },   // WE1 T1
      { status: 'waiting', emp: 'U2' },   // WE2 T2
      { status: 'waiting', emp: null },   // WE3 T3 (UDEL → null)
      { status: 'waiting', emp: 'UW' },   // WEW T4
    ];
    expect(proj(m)).toEqual(want); expect(proj(p)).toEqual(want);
  });

  test('listMyWaitingEntries: waiting only, nested schedule populate + drop-to-null', async () => {
    const proj = (rows) => norm(rows).map((e) => {
      const s = e.scheduleId;
      return {
        cls: s.classId ? s.classId.classCode : null,
        office: s.officeId ? s.officeId.code : null,
        room: s.roomId ? s.roomId.code : null,
        status: s.status,
      };
    });
    const [m, p] = await both((r) => r.listMyWaitingEntries(WU1));
    const want = [
      { cls: 'C-W1', office: 'OW1', room: 'RW1', status: 'scheduled' }, // WE1/SW1 all live
      { cls: 'C-W1', office: null, room: null, status: 'scheduled' },   // WE5/SW2 office null, room deleted
    ];
    expect(proj(m)).toEqual(want); expect(proj(p)).toEqual(want);
  });

  // ── mutations last (they change waitlist state) ──
  test('withdrawMyEntry: flip waiting→withdrawn, second flip → null', async () => {
    const [m, p] = await both((r) => r.withdrawMyEntry(SW1, WUW));
    expect(String(norm(m)._id)).toBe(WEW); expect(norm(m).status).toBe('withdrawn');
    expect(String(norm(p)._id)).toBe(WEW); expect(norm(p).status).toBe('withdrawn');
    const [m2, p2] = await both((r) => r.withdrawMyEntry(SW1, WUW)); // no waiting row left
    expect(m2).toBeNull(); expect(p2).toBeNull();
  });

  test('createEntry: returns waiting row; double-join → code 11000', async () => {
    const [m, p] = await both((r) => r.createEntry({ scheduleId: SW1, classId: CW1, userId: WUC, joinedBy: WUC }));
    expect(norm(m).status).toBe('waiting'); expect(String(norm(m).scheduleId)).toBe(SW1);
    expect(norm(p).status).toBe('waiting'); expect(String(norm(p).scheduleId)).toBe(SW1);
    // second join of the same (session,user) → partial-unique violation → 11000
    const dup = async (r) => {
      try { await r.createEntry({ scheduleId: SW1, classId: CW1, userId: WUC, joinedBy: WUC }); return null; }
      catch (e) { return e.code; }
    };
    const [mc, pc] = await both(dup);
    expect(mc).toBe(11000); expect(pc).toBe(11000);
  });
});
