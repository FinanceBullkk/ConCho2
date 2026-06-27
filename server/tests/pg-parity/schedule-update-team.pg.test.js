/**
 * ──────────────────────────────────────────────────────────
 * PG-parity test — the last 2 schedule repo methods, slice S3b-2
 * ──────────────────────────────────────────────────────────
 * updateScheduleById (the field-mapped UPDATE: core columns + meta-extras merge;
 * empty data → no-op returning the row) and findTeamById (opts-select: classId
 * only / members-with-status). Completes the schedule repo dual-backend port.
 *
 * Runs only when a Postgres URL is present; SKIPS otherwise.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env.pg-prototype') });
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const PG_URL = process.env.PG_URL || process.env.PG_PROTOTYPE_URL;
const describePg = PG_URL ? describe : describe.skip;

const { query, closePool } = require('../../config/pg');
const repo = require('../../domains/schedule/repository');
require('../../models/User');

const hex = (n) => n.toString(16).padStart(24, '0');
const oid = (h) => new mongoose.Types.ObjectId(h);
const coll = (m) => mongoose.model(m).collection.name;
const norm = (x) => (x == null ? null : JSON.parse(JSON.stringify(x)));
const both = (fn) => Promise.all([fn(repo.impls.mongo), fn(repo.impls.pg)]);
const sortBy = (a, k) => [...a].sort((x, y) => String(x[k]).localeCompare(String(y[k])));

const C1 = hex(0x301); const C2 = hex(0x302);
const U1 = hex(0x311); const U2 = hex(0x312); const U3 = hex(0x313);
const TM = hex(0x321); const TMDEL = hex(0x322);
const SU1 = hex(0x351); const SU2 = hex(0x352); const SU3 = hex(0x353); const SUE = hex(0x354);
const RA = hex(0x341);

const F1 = '2026-12-01T10:00:00.000Z'; const F2 = '2026-12-02T10:00:00.000Z';
const F3 = '2026-12-03T10:00:00.000Z'; const F4 = '2026-12-04T10:00:00.000Z';

describePg('PG-parity: schedule repo updateScheduleById + findTeamById (S3b-2)', () => {
  let mem;

  beforeAll(async () => {
    mem = await MongoMemoryServer.create();
    await mongoose.connect(mem.getUri());
    const db = mongoose.connection.db;
    const d = (s) => new Date(s);

    await db.collection(coll('Class')).insertMany([
      { _id: oid(C1), classCode: 'C-1', courseName: 'C1', status: 'Ongoing', teacherIds: [], isDeleted: false },
      { _id: oid(C2), classCode: 'C-2', courseName: 'C2', status: 'Ongoing', teacherIds: [], isDeleted: false },
    ]);
    await db.collection(coll('User')).insertMany([
      { _id: oid(U1), empCode: 'U1', name: 'A', role: 'Participant', status: 'Active', isDeleted: false },
      { _id: oid(U2), empCode: 'U2', name: 'B', role: 'Participant', status: 'Active', isDeleted: false },
      { _id: oid(U3), empCode: 'U3', name: 'C', role: 'Participant', status: 'Dropped', isDeleted: false },
    ]);
    await db.collection(coll('Team')).insertMany([
      { _id: oid(TM), name: 'TM', classId: oid(C1), members: [oid(U1), oid(U2), oid(U3)], isDeleted: false },
      { _id: oid(TMDEL), name: 'TD', classId: oid(C1), members: [oid(U1)], isDeleted: true },
    ]);
    await db.collection(coll('Schedule')).insertMany([
      { _id: oid(SU1), classId: oid(C1), startTime: d(F1), endTime: d(F1), status: 'scheduled', enrolledUsers: [] },
      { _id: oid(SU2), classId: oid(C1), startTime: d(F2), endTime: d(F2), status: 'scheduled', enrolledUsers: [] },
      { _id: oid(SU3), classId: oid(C1), roomId: oid(RA), startTime: d(F3), endTime: d(F3), status: 'scheduled', enrolledUsers: [] },
      { _id: oid(SUE), classId: oid(C1), topic: 'orig', startTime: d(F4), endTime: d(F4), status: 'scheduled', enrolledUsers: [] },
    ]);

    await query('TRUNCATE classes, users, teams, team_members, schedules');
    await query(
      `INSERT INTO classes(id,class_code,course_name,status,teacher_ids,is_deleted) VALUES
        ($1,'C-1','C1','Ongoing','{}'::text[],false),($2,'C-2','C2','Ongoing','{}'::text[],false)`, [C1, C2]);
    await query(
      `INSERT INTO users(id,emp_code,name,role,status,is_deleted) VALUES
        ($1,'U1','A','Participant','Active',false),($2,'U2','B','Participant','Active',false),($3,'U3','C','Participant','Dropped',false)`,
      [U1, U2, U3]);
    await query(`INSERT INTO teams(id,name,class_id,is_deleted) VALUES ($1,'TM',$3,false),($2,'TD',$3,true)`, [TM, TMDEL, C1]);
    await query(`INSERT INTO team_members(team_id,user_id) VALUES ($1,$3),($1,$4),($1,$5),($2,$3)`, [TM, TMDEL, U1, U2, U3]);
    await query(
      `INSERT INTO schedules(id,class_id,room_id,topic,start_time,end_time,status,enrolled_users) VALUES
        ($1,$5,NULL,NULL,$6,$6,'scheduled','{}'::text[]),
        ($2,$5,NULL,NULL,$7,$7,'scheduled','{}'::text[]),
        ($3,$5,$9,NULL,$8,$8,'scheduled','{}'::text[]),
        ($4,$5,NULL,'orig',$10,$10,'scheduled','{}'::text[])`,
      [SU1, SU2, SU3, SUE, C1, F1, F2, F3, RA, F4]);
  }, 60_000);

  afterAll(async () => {
    if (mongoose.connection.readyState) await mongoose.disconnect();
    if (mem) await mem.stop();
    await closePool();
  });

  test('updateScheduleById: core columns (classId/topic/capacity/enrolled/roomLink)', async () => {
    await both((r) => r.updateScheduleById(SU1, { classId: C2, topic: 'New', capacity: 8, enrolledUsers: [U1, U2], roomLink: 'http://x' }));
    const proj = (x) => { const n = norm(x); return {
      cls: String(n.classId), topic: n.topic, capacity: n.capacity, enrolled: [...n.enrolledUsers].map(String).sort(), roomLink: n.roomLink,
    }; };
    const [m, p] = await both((r) => r.findScheduleByIdRaw(SU1));
    const want = { cls: C2, topic: 'New', capacity: 8, enrolled: [U1, U2].sort(), roomLink: 'http://x' };
    expect(proj(m)).toEqual(want); expect(proj(p)).toEqual(want);
  });

  test('updateScheduleById: meta extras merge (agenda/externalTrainer)', async () => {
    await both((r) => r.updateScheduleById(SU2, { agenda: ['a1'], externalTrainer: { name: 'Ext', email: 'e@x.io' } }));
    const proj = (x) => { const n = norm(x); return { agenda: n.agenda, ext: n.externalTrainer ? n.externalTrainer.name : null }; };
    const [m, p] = await both((r) => r.findScheduleByIdRaw(SU2));
    expect(proj(m)).toEqual({ agenda: ['a1'], ext: 'Ext' }); expect(proj(p)).toEqual({ agenda: ['a1'], ext: 'Ext' });
  });

  test('updateScheduleById: { roomId: null } clears the field', async () => {
    await both((r) => r.updateScheduleById(SU3, { roomId: null }));
    const [m, p] = await both((r) => r.findScheduleByIdRaw(SU3));
    expect(norm(m).roomId).toBeNull(); expect(norm(p).roomId).toBeNull();
  });

  test('updateScheduleById: empty data → no-op returns the current row (not null)', async () => {
    const [m, p] = await both((r) => r.updateScheduleById(SUE, {}));
    expect(norm(m).topic).toBe('orig'); expect(String(norm(m)._id)).toBe(SUE);
    expect(norm(p).topic).toBe('orig'); expect(String(norm(p)._id)).toBe(SUE);
  });

  test('findTeamById: select classId', async () => {
    const [m, p] = await both((r) => r.findTeamById(TM, { select: 'classId', lean: true }));
    expect(String(norm(m).classId)).toBe(C1); expect(String(norm(p).classId)).toBe(C1);
  });

  test('findTeamById: members + status (dropped kept; deleted team → null)', async () => {
    const proj = (t) => sortBy(norm(t).members.map((mm) => ({ id: String(mm._id), s: mm.status })), 'id');
    const [m, p] = await both((r) => r.findTeamById(TM, { select: 'members', populate: { path: 'members', select: '_id status' }, lean: true }));
    const want = sortBy([{ id: U1, s: 'Active' }, { id: U2, s: 'Active' }, { id: U3, s: 'Dropped' }], 'id');
    expect(proj(m)).toEqual(want); expect(proj(p)).toEqual(want);
    const [md, pd] = await both((r) => r.findTeamById(TMDEL, { select: 'classId', lean: true }));
    expect(md).toBeNull(); expect(pd).toBeNull();
  });
});
