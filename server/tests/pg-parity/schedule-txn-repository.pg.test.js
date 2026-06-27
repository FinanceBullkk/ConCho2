/**
 * ──────────────────────────────────────────────────────────
 * PG-parity test — domains/schedule repository, slice S3a (TXN methods)
 * ──────────────────────────────────────────────────────────
 * The 12 booking/cancel/room-lock/waitlist/mode/capacity/attendance methods that
 * carry a transaction handle, PLUS a rollback harness driving the real
 * runInTransaction on BOTH backends (mid-tx throw → zero partial writes).
 *
 * Runs only when a Postgres URL is present; SKIPS otherwise. Uses
 * MongoMemoryReplSet (NOT the standalone server) because runInTransaction's mongo
 * impl uses session.withTransaction, which requires a replica set.
 *
 * Pins the trap-prone bits:
 *   • collision = time-overlap + status='scheduled' (cancelled = no collide) + exclude;
 *   • weekly cap counts status='scheduled' only, excludes a given id;
 *   • capacity/mode resolution Class.programId → program (fallback {} / leader_booking);
 *   • cancelScheduleById conditional flip (one winner; loser → null) + roomId nulled;
 *   • createRoomBooking unique (room_id,start_time) → 23505 → { code:11000 };
 *   • rollback harness: createRoomBooking + setScheduleRoom then throw → neither persists.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env.pg-prototype') });
const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');

const PG_URL = process.env.PG_URL || process.env.PG_PROTOTYPE_URL;
const describePg = PG_URL ? describe : describe.skip;

const { query, closePool } = require('../../config/pg');
const repo = require('../../domains/schedule/repository'); // registers all schedule models
const uow = require('../../domains/_shared/unit-of-work');
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
const PCAP = hex(0xF01); const PLEAD = hex(0xF02);
const CCAP = hex(0xF11); const CLEAD = hex(0xF12); const CNOPROG = hex(0xF13); const CTEAM = hex(0xF14);
const TM = hex(0xF21); const U1 = hex(0xF31); const U2 = hex(0xF32);
const OF = hex(0xF41); const RA = hex(0xF51); const RDEL = hex(0xF52); const RINACT = hex(0xF53);
const SA = hex(0xF61); const SB = hex(0xF62);
const SW1 = hex(0xF63); const SW2 = hex(0xF64); const SW3 = hex(0xF65);
const SCANCEL = hex(0xF66); const SROOM = hex(0xF67); const SWAIT = hex(0xF68);
const SDELRB = hex(0xF69); const SRBC = hex(0xF6A); const SCOMMIT = hex(0xF6B); const SROLL = hex(0xF6C);
const ATT1 = hex(0xF71);
const WL1 = hex(0xF81); const WL2 = hex(0xF82); const WL3 = hex(0xF83);
const RB1 = hex(0xF91);

// times
const T10 = '2026-08-01T10:00:00.000Z'; const T11 = '2026-08-01T11:00:00.000Z';
const T1030 = '2026-08-01T10:30:00.000Z'; const T1130 = '2026-08-01T11:30:00.000Z';
const T12 = '2026-08-01T12:00:00.000Z'; const T13 = '2026-08-01T13:00:00.000Z';
const MON = '2026-08-03T10:00:00.000Z'; const TUE = '2026-08-04T10:00:00.000Z'; const WED = '2026-08-05T10:00:00.000Z';
const WSTART = '2026-08-03T00:00:00.000Z'; const WEND = '2026-08-09T23:59:59.999Z';
const FUT1 = '2026-09-01T10:00:00.000Z'; const FUT2 = '2026-09-02T10:00:00.000Z'; const FUT3 = '2026-09-03T10:00:00.000Z';
const FUT4 = '2026-09-04T10:00:00.000Z'; const FUT5 = '2026-09-05T10:00:00.000Z'; const FUT6 = '2026-09-06T10:00:00.000Z'; const FUT7 = '2026-09-07T10:00:00.000Z';
const TRB1 = '2026-08-10T10:00:00.000Z'; const TDUP = '2026-08-11T10:00:00.000Z';
const TCOMMIT = '2026-08-12T10:00:00.000Z'; const TROLL = '2026-08-13T10:00:00.000Z';

describePg('PG-parity: domains/schedule repository (S3a txn methods)', () => {
  let mem; let db;

  beforeAll(async () => {
    mem = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(mem.getUri());
    db = mongoose.connection.db;
    const d = (s) => new Date(s);

    // ── Mongo seed ──
    await db.collection(coll('LearningProgram')).insertMany([
      { _id: oid(PCAP), code: 'PC', name: 'PCap', status: 'active', schedulingMode: 'self_enroll', capacityPolicy: { maxParticipantsPerSession: 7 } },
      { _id: oid(PLEAD), code: 'PL', name: 'PLead', status: 'active', schedulingMode: 'leader_booking' },
    ]);
    await db.collection(coll('Class')).insertMany([
      { _id: oid(CCAP), classCode: 'C-CAP', courseName: 'Cap', programId: oid(PCAP), status: 'Ongoing', teacherIds: [], isDeleted: false },
      { _id: oid(CLEAD), classCode: 'C-LEAD', courseName: 'Lead', programId: oid(PLEAD), status: 'Ongoing', teacherIds: [], isDeleted: false },
      { _id: oid(CNOPROG), classCode: 'C-NP', courseName: 'NoProg', status: 'Ongoing', teacherIds: [], isDeleted: false },
      { _id: oid(CTEAM), classCode: 'C-TM', courseName: 'Team', status: 'Ongoing', teacherIds: [], isDeleted: false },
    ]);
    await db.collection(coll('User')).insertMany([
      { _id: oid(U1), empCode: 'U1', name: 'Al', email: 'u1@x.io', role: 'Participant', status: 'Active', isDeleted: false },
      { _id: oid(U2), empCode: 'U2', name: 'Bo', email: 'u2@x.io', role: 'Participant', status: 'Active', isDeleted: false },
    ]);
    await db.collection(coll('Team')).insertOne({ _id: oid(TM), name: 'TeamM', classId: oid(CTEAM), members: [oid(U1), oid(U2)], isDeleted: false });
    await db.collection(coll('Office')).insertOne({ _id: oid(OF), name: 'OffW', code: 'OFW', isDeleted: false });
    await db.collection(coll('Room')).insertMany([
      { _id: oid(RA), name: 'RoomA', code: 'RA', officeId: oid(OF), isActive: true, isDeleted: false },
      { _id: oid(RDEL), name: 'RoomD', code: 'RD', officeId: oid(OF), isActive: true, isDeleted: true },
      { _id: oid(RINACT), name: 'RoomI', code: 'RI', officeId: oid(OF), isActive: false, isDeleted: false },
    ]);
    await db.collection(coll('Schedule')).insertMany([
      { _id: oid(SA), classId: oid(CCAP), bookedTeamId: oid(TM), officeId: oid(OF), roomId: oid(RA), startTime: d(T10), endTime: d(T11), status: 'scheduled', enrolledUsers: [oid(U1)] },
      { _id: oid(SB), classId: oid(CCAP), startTime: d(T10), endTime: d(T11), status: 'cancelled', enrolledUsers: [] },
      { _id: oid(SW1), classId: oid(CTEAM), bookedTeamId: oid(TM), startTime: d(MON), endTime: d(MON), status: 'scheduled', enrolledUsers: [] },
      { _id: oid(SW2), classId: oid(CTEAM), bookedTeamId: oid(TM), startTime: d(TUE), endTime: d(TUE), status: 'scheduled', enrolledUsers: [] },
      { _id: oid(SW3), classId: oid(CTEAM), bookedTeamId: oid(TM), startTime: d(WED), endTime: d(WED), status: 'cancelled', enrolledUsers: [] },
      { _id: oid(SCANCEL), classId: oid(CCAP), roomId: oid(RA), startTime: d(FUT1), endTime: d(FUT1), status: 'scheduled', enrolledUsers: [] },
      { _id: oid(SROOM), classId: oid(CCAP), startTime: d(FUT2), endTime: d(FUT2), status: 'scheduled', enrolledUsers: [] },
      { _id: oid(SWAIT), classId: oid(CCAP), startTime: d(FUT3), endTime: d(FUT3), status: 'scheduled', enrolledUsers: [] },
      { _id: oid(SDELRB), classId: oid(CCAP), roomId: oid(RA), startTime: d(FUT4), endTime: d(FUT4), status: 'scheduled', enrolledUsers: [] },
      { _id: oid(SRBC), classId: oid(CCAP), startTime: d(FUT5), endTime: d(FUT5), status: 'scheduled', enrolledUsers: [] },
      { _id: oid(SCOMMIT), classId: oid(CCAP), startTime: d(FUT6), endTime: d(FUT6), status: 'scheduled', enrolledUsers: [] },
      { _id: oid(SROLL), classId: oid(CCAP), startTime: d(FUT7), endTime: d(FUT7), status: 'scheduled', enrolledUsers: [] },
    ]);
    await db.collection(coll('Attendance')).insertOne({ _id: oid(ATT1), scheduleId: oid(SA), userId: oid(U1), status: 'P' });
    await db.collection(coll('WaitlistEntry')).insertMany([
      { _id: oid(WL1), scheduleId: oid(SWAIT), classId: oid(CCAP), userId: oid(U1), status: 'waiting', createdAt: d(FUT3), updatedAt: d(FUT3) },
      { _id: oid(WL2), scheduleId: oid(SWAIT), classId: oid(CCAP), userId: oid(U2), status: 'waiting', createdAt: d(FUT3), updatedAt: d(FUT3) },
      { _id: oid(WL3), scheduleId: oid(SWAIT), classId: oid(CCAP), userId: oid(U1), status: 'withdrawn', createdAt: d(FUT3), updatedAt: d(FUT3) },
    ]);
    await db.collection(coll('RoomBooking')).insertOne({ _id: oid(RB1), roomId: oid(RA), scheduleId: oid(SDELRB), classId: oid(CCAP), startTime: d(TRB1) });

    // ── PG seed ──
    await query('TRUNCATE learning_programs, classes, users, teams, team_members, offices, rooms, schedules, attendances, waitlist_entries, room_bookings');
    await query(
      `INSERT INTO learning_programs(id,code,name,status,scheduling_mode,capacity_policy) VALUES
        ($1,'PC','PCap','active','self_enroll',$3::jsonb),($2,'PL','PLead','active','leader_booking',NULL)`,
      [PCAP, PLEAD, JSON.stringify({ maxParticipantsPerSession: 7 })]);
    await query(
      `INSERT INTO classes(id,class_code,course_name,program_id,status,teacher_ids,is_deleted) VALUES
        ($1,'C-CAP','Cap',$5,'Ongoing','{}'::text[],false),
        ($2,'C-LEAD','Lead',$6,'Ongoing','{}'::text[],false),
        ($3,'C-NP','NoProg',NULL,'Ongoing','{}'::text[],false),
        ($4,'C-TM','Team',NULL,'Ongoing','{}'::text[],false)`,
      [CCAP, CLEAD, CNOPROG, CTEAM, PCAP, PLEAD]);
    await query(
      `INSERT INTO users(id,emp_code,name,email,role,status,is_deleted) VALUES
        ($1,'U1','Al','u1@x.io','Participant','Active',false),($2,'U2','Bo','u2@x.io','Participant','Active',false)`,
      [U1, U2]);
    await query(`INSERT INTO teams(id,name,class_id,is_deleted) VALUES ($1,'TeamM',$2,false)`, [TM, CTEAM]);
    await query(`INSERT INTO offices(id,name,code,is_deleted) VALUES ($1,'OffW','OFW',false)`, [OF]);
    await query(
      `INSERT INTO rooms(id,name,code,office_id,is_active,is_deleted) VALUES
        ($1,'RoomA','RA',$4,true,false),($2,'RoomD','RD',$4,true,true),($3,'RoomI','RI',$4,false,false)`,
      [RA, RDEL, RINACT, OF]);
    const schedRows = [
      [SA, CCAP, TM, OF, RA, T10, T11, 'scheduled', [U1]],
      [SB, CCAP, null, null, null, T10, T11, 'cancelled', []],
      [SW1, CTEAM, TM, null, null, MON, MON, 'scheduled', []],
      [SW2, CTEAM, TM, null, null, TUE, TUE, 'scheduled', []],
      [SW3, CTEAM, TM, null, null, WED, WED, 'cancelled', []],
      [SCANCEL, CCAP, null, null, RA, FUT1, FUT1, 'scheduled', []],
      [SROOM, CCAP, null, null, null, FUT2, FUT2, 'scheduled', []],
      [SWAIT, CCAP, null, null, null, FUT3, FUT3, 'scheduled', []],
      [SDELRB, CCAP, null, null, RA, FUT4, FUT4, 'scheduled', []],
      [SRBC, CCAP, null, null, null, FUT5, FUT5, 'scheduled', []],
      [SCOMMIT, CCAP, null, null, null, FUT6, FUT6, 'scheduled', []],
      [SROLL, CCAP, null, null, null, FUT7, FUT7, 'scheduled', []],
    ];
    for (const [id, cls, team, office, room, st, en, status, enr] of schedRows) {
      // eslint-disable-next-line no-await-in-loop -- sequential test seed
      await query(
        `INSERT INTO schedules(id,class_id,booked_team_id,office_id,room_id,start_time,end_time,status,enrolled_users)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::text[])`,
        [id, cls, team, office, room, st, en, status, enr]);
    }
    await query(`INSERT INTO attendances(id,schedule_id,user_id,status) VALUES ($1,$2,$3,'P')`, [ATT1, SA, U1]);
    await query(
      `INSERT INTO waitlist_entries(id,schedule_id,class_id,user_id,status,created_at,updated_at) VALUES
        ($1,$4,$7,$5,'waiting',$8,$8),($2,$4,$7,$6,'waiting',$8,$8),($3,$4,$7,$5,'withdrawn',$8,$8)`,
      [WL1, WL2, WL3, SWAIT, U1, U2, CCAP, FUT3]);
    await query(`INSERT INTO room_bookings(id,room_id,schedule_id,class_id,start_time) VALUES ($1,$2,$3,$4,$5)`, [RB1, RA, SDELRB, CCAP, TRB1]);
  }, 90_000);

  afterAll(async () => {
    if (mongoose.connection.readyState) await mongoose.disconnect();
    if (mem) await mem.stop();
    await closePool();
  });

  // ── read-shaped txn methods (no mutation) ──
  test('findScheduleForCollision: overlap + cancelled-no-collide + exclude', async () => {
    const [m, p] = await both((r) => r.findScheduleForCollision(CCAP, T1030, T1130, null));
    expect(String(norm(m)._id)).toBe(SA); expect(String(norm(p)._id)).toBe(SA);
    const [mn, pn] = await both((r) => r.findScheduleForCollision(CCAP, T12, T13, null));
    expect(mn).toBeNull(); expect(pn).toBeNull();
    const [mx, px] = await both((r) => r.findScheduleForCollision(CCAP, T1030, T1130, SA)); // SB cancelled, SA excluded
    expect(mx).toBeNull(); expect(px).toBeNull();
  });

  test('countSchedulesForTeamInWeek: scheduled only + exclude', async () => {
    const [m, p] = await both((r) => r.countSchedulesForTeamInWeek(TM, WSTART, WEND, null));
    expect(m).toBe(2); expect(p).toBe(2); // SW1+SW2 (SW3 cancelled; SA other week)
    const [me, pe] = await both((r) => r.countSchedulesForTeamInWeek(TM, WSTART, WEND, SW1));
    expect(me).toBe(1); expect(pe).toBe(1);
  });

  test('findClassCapacityPolicy + findClassSchedulingMode: program → policy/mode, fallback', async () => {
    const [m, p] = await both((r) => r.findClassCapacityPolicy(CCAP));
    expect(m).toEqual({ maxParticipantsPerSession: 7 }); expect(p).toEqual({ maxParticipantsPerSession: 7 });
    const [mn, pn] = await both((r) => r.findClassCapacityPolicy(CNOPROG));
    expect(mn).toEqual({}); expect(pn).toEqual({});
    const [ms, ps] = await both((r) => r.findClassSchedulingMode(CCAP));
    expect(ms).toBe('self_enroll'); expect(ps).toBe('self_enroll');
    const [mf, pf] = await both((r) => r.findClassSchedulingMode(CNOPROG));
    expect(mf).toBe('leader_booking'); expect(pf).toBe('leader_booking');
  });

  test('attendanceExistsForSchedule: exists vs none', async () => {
    const [m, p] = await both((r) => r.attendanceExistsForSchedule(SA));
    expect(Boolean(m)).toBe(true); expect(Boolean(p)).toBe(true);
    const [mn, pn] = await both((r) => r.attendanceExistsForSchedule(SROOM));
    expect(mn).toBeNull(); expect(pn).toBeNull();
  });

  test('findRoomForLock: live (officeId,isActive) · deleted → null · inactive passes through', async () => {
    const proj = (x) => { const n = norm(x); return { office: String(n.officeId), active: n.isActive }; };
    const [m, p] = await both((r) => r.findRoomForLock(RA));
    expect(proj(m)).toEqual({ office: OF, active: true }); expect(proj(p)).toEqual({ office: OF, active: true });
    const [md, pd] = await both((r) => r.findRoomForLock(RDEL));
    expect(md).toBeNull(); expect(pd).toBeNull();
    const [mi, pi] = await both((r) => r.findRoomForLock(RINACT));
    expect(proj(mi)).toEqual({ office: OF, active: false }); expect(proj(pi)).toEqual({ office: OF, active: false });
  });

  test('findWaitingEntries: waiting userIds only', async () => {
    const [m, p] = await both((r) => r.findWaitingEntries([SWAIT]));
    expect(sortStr(norm(m).map((e) => e.userId))).toEqual(sortStr([U1, U2]));
    expect(sortStr(norm(p).map((e) => e.userId))).toEqual(sortStr([U1, U2]));
  });

  // ── mutating txn methods (autocommit, no tx handle) ──
  test('createRoomBooking: insert + double-claim (room,start) → code 11000', async () => {
    const [m, p] = await both((r) => r.createRoomBooking({ roomId: RA, scheduleId: SRBC, classId: CCAP, startTime: TDUP }));
    expect(Array.isArray(m)).toBe(true); expect(Array.isArray(p)).toBe(true);
    const dup = async (r) => {
      try { await r.createRoomBooking({ roomId: RA, scheduleId: SRBC, classId: CCAP, startTime: TDUP }); return null; }
      catch (e) { return e.code; }
    };
    const [mc, pc] = await both(dup);
    expect(mc).toBe(11000); expect(pc).toBe(11000);
  });

  test('setScheduleRoom: writes roomId', async () => {
    await both((r) => r.setScheduleRoom(SROOM, RA));
    const mRoom = await mongoSchedRoom(SROOM); const pRoom = await pgSchedRoom(SROOM);
    expect(mRoom).toBe(RA); expect(pRoom).toBe(RA);
  });

  test('deleteRoomBookings: drops the ledger row(s)', async () => {
    const [m, p] = await both((r) => r.deleteRoomBookings([SDELRB]));
    expect(m.deletedCount).toBe(1); expect(p.deletedCount).toBe(1);
    expect(await mongoRB(SDELRB)).toBe(false); expect(await pgRB(SDELRB)).toBe(false);
  });

  test('cancelWaitingEntries: dissolve waiting → cancelled', async () => {
    const [m, p] = await both((r) => r.cancelWaitingEntries([SWAIT]));
    expect(m.modifiedCount).toBe(2); expect(p.modifiedCount).toBe(2);
    const [mw, pw] = await both((r) => r.findWaitingEntries([SWAIT]));
    expect(norm(mw)).toEqual([]); expect(norm(pw)).toEqual([]);
  });

  test('cancelScheduleById: conditional flip → cancelled + roomId nulled; second → null', async () => {
    const proj = (x) => { const n = norm(x); return { status: n.status, room: n.roomId }; };
    const [m, p] = await both((r) => r.cancelScheduleById(SCANCEL, { cancelledBy: U1, cancelReason: 'x' }));
    expect(proj(m)).toEqual({ status: 'cancelled', room: null }); expect(proj(p)).toEqual({ status: 'cancelled', room: null });
    const [m2, p2] = await both((r) => r.cancelScheduleById(SCANCEL, {}));
    expect(m2).toBeNull(); expect(p2).toBeNull();
  });

  // ── rollback harness: runInTransaction on BOTH backends ──
  test('runInTransaction COMMIT: room booking + roomId both persist', async () => {
    const work = (impl, sid) => async (tx) => {
      await impl.createRoomBooking({ roomId: RA, scheduleId: sid, classId: CCAP, startTime: TCOMMIT }, tx);
      await impl.setScheduleRoom(sid, RA, tx);
    };
    await uow.impls.mongo(work(repo.impls.mongo, SCOMMIT));
    await uow.impls.pg(work(repo.impls.pg, SCOMMIT));
    expect(await mongoRB(SCOMMIT)).toBe(true); expect(await pgRB(SCOMMIT)).toBe(true);
    expect(await mongoSchedRoom(SCOMMIT)).toBe(RA); expect(await pgSchedRoom(SCOMMIT)).toBe(RA);
  });

  test('runInTransaction ROLLBACK: mid-tx throw → zero partial writes (both backends)', async () => {
    const boom = (impl, sid) => async (tx) => {
      await impl.createRoomBooking({ roomId: RA, scheduleId: sid, classId: CCAP, startTime: TROLL }, tx);
      await impl.setScheduleRoom(sid, RA, tx);
      throw new Error('forced mid-tx failure');
    };
    await expect(uow.impls.mongo(boom(repo.impls.mongo, SROLL))).rejects.toThrow('forced mid-tx failure');
    await expect(uow.impls.pg(boom(repo.impls.pg, SROLL))).rejects.toThrow('forced mid-tx failure');
    // neither the ledger row nor the roomId survived
    expect(await mongoRB(SROLL)).toBe(false); expect(await pgRB(SROLL)).toBe(false);
    expect(await mongoSchedRoom(SROLL)).toBeNull(); expect(await pgSchedRoom(SROLL)).toBeNull();
  });

  // ── observers (raw collection / table — no model methods) ──
  async function mongoRB(sid) { return Boolean(await db.collection(coll('RoomBooking')).findOne({ scheduleId: oid(sid) })); }
  async function pgRB(sid) { const { rows } = await query(`SELECT 1 FROM room_bookings WHERE schedule_id=$1`, [sid]); return rows.length > 0; }
  async function mongoSchedRoom(sid) { const s = await db.collection(coll('Schedule')).findOne({ _id: oid(sid) }); return s && s.roomId ? String(s.roomId) : null; }
  async function pgSchedRoom(sid) { const { rows } = await query(`SELECT room_id FROM schedules WHERE id=$1`, [sid]); return rows[0] && rows[0].room_id ? rows[0].room_id : null; }
});
