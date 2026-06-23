/**
 * ──────────────────────────────────────────────────────────
 * PG-parity test — mobile repository (Mongo ↔ Postgres)
 * ──────────────────────────────────────────────────────────
 * Web-Push subscription upsert/delete + the learner's upcoming enrolled
 * sessions. Runs only when a Postgres URL is present; SKIPS otherwise. Asserts
 * identical behaviour + traps:
 *   • upsert keys on the globally-unique endpoint (re-homes device to new user)
 *   • removeSubscription is a hard delete returning { deletedCount }
 *   • upcoming: enrolled-array-contains + scheduled + start>=from, start asc;
 *     populate(classId) drops a deleted class to null; cancelled/past excluded
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env.pg-prototype') });
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const PG_URL = process.env.PG_URL || process.env.PG_PROTOTYPE_URL;
const describePg = PG_URL ? describe : describe.skip;

const { query, closePool } = require('../../config/pg');
require('../../models/Class'); // populate('classId') ref — not loaded by the mobile repo
const repo = require('../../domains/mobile/repository');

const hex = (n) => n.toString(16).padStart(24, '0');
const oid = (h) => new mongoose.Types.ObjectId(h);
const coll = (m) => mongoose.model(m).collection.name;
const day = (n) => new Date(Date.UTC(2026, 0, n, 10, 0, 0));
const norm = (x) => (x == null ? null : JSON.parse(JSON.stringify(x)));

const U1 = hex(1011); const U2 = hex(1012);
const C1 = hex(1021); const CD = hex(1022);
const S1 = hex(1031); const S2 = hex(1032); const S3 = hex(1033); const S4 = hex(1034); const S5 = hex(1035);

const sessProj = (s) => (s == null ? null : {
  topic: s.topic, roomLink: s.roomLink || '', meetLink: s.meetLink || '',
  cls: s.classId ? { classCode: s.classId.classCode, courseName: s.classId.courseName } : null,
});
const subProj = (s) => (s == null ? null : { userId: String(s.userId), endpoint: s.endpoint, keys: s.keys, userAgent: s.userAgent });

describePg('PG-parity: mobile repository', () => {
  let mem;

  beforeAll(async () => {
    mem = await MongoMemoryServer.create();
    await mongoose.connect(mem.getUri());
    const db = mongoose.connection.db;

    await db.collection(coll('Class')).insertMany([
      { _id: oid(C1), classCode: 'CC1', courseName: 'Course 1', isDeleted: false },
      { _id: oid(CD), classCode: 'CCD', courseName: 'Course D', isDeleted: true },
    ]);
    const sess = (id, cls, status, d, enrolled, room = '', meet = '') => ({
      _id: oid(id), classId: oid(cls), status, startTime: day(d), endTime: day(d),
      enrolledUsers: enrolled.map(oid), topic: `t${d}`, roomLink: room, meetLink: meet,
    });
    await db.collection(coll('Schedule')).insertMany([
      sess(S1, C1, 'scheduled', 10, [U1], 'room-a', 'meet-a'),
      sess(S2, C1, 'scheduled', 12, [U1, U2], '', ''),
      sess(S3, C1, 'cancelled', 11, [U1]),            // cancelled → excluded
      sess(S4, C1, 'scheduled', 2, [U1]),             // before `from` → excluded
      sess(S5, CD, 'scheduled', 14, [U1], '', 'm-e'), // deleted class → classId null
    ]);

    await query('TRUNCATE classes, schedules, push_subscriptions');
    await query(`INSERT INTO classes(id,class_code,course_name,is_deleted) VALUES ($1,'CC1','Course 1',false),($2,'CCD','Course D',true)`, [C1, CD]);
    const ipg = (id, cls, status, d, enrolled, room = '', meet = '') => query(
      `INSERT INTO schedules(id,class_id,status,start_time,end_time,enrolled_users,topic,room_link,meet_link)
       VALUES ($1,$2,$3,$4,$4,$5,$6,$7,$8)`,
      [id, cls, status, day(d).toISOString(), enrolled, `t${d}`, room, meet]);
    await ipg(S1, C1, 'scheduled', 10, [U1], 'room-a', 'meet-a');
    await ipg(S2, C1, 'scheduled', 12, [U1, U2], '', '');
    await ipg(S3, C1, 'cancelled', 11, [U1]);
    await ipg(S4, C1, 'scheduled', 2, [U1]);
    await ipg(S5, CD, 'scheduled', 14, [U1], '', 'm-e');
  }, 60_000);

  afterAll(async () => {
    if (mongoose.connection.readyState) await mongoose.disconnect();
    if (mem) await mem.stop();
    await closePool();
  });

  const both = (fn) => Promise.all([fn(repo.impls.mongo), fn(repo.impls.pg)]);

  test('upcomingSessionsForUser: filters + order + populate(class) — identical', async () => {
    const from = day(5);
    const [m, p] = await both((r) => r.upcomingSessionsForUser(U1, from, 10));
    // scheduled + start>=day5, asc: S1(day10), S2(day12), S5(day14); S3 cancelled, S4 past excluded
    expect(m.map((s) => s.topic)).toEqual(['t10', 't12', 't14']);
    expect(p.map(sessProj)).toEqual(m.map(sessProj));
    // S1 carries links; S5's class is deleted → classId null
    expect(sessProj(m[0])).toMatchObject({ roomLink: 'room-a', meetLink: 'meet-a', cls: { classCode: 'CC1' } });
    expect(sessProj(m[2]).cls).toBeNull();

    // limit honoured
    const [mL, pL] = await both((r) => r.upcomingSessionsForUser(U1, from, 2));
    expect(mL.length).toBe(2); expect(pL.length).toBe(2);
  });

  test('upsertSubscription: insert then upsert (re-home device on same endpoint) — identical', async () => {
    const ep = 'https://push.example/abc';
    const [m1, p1] = await both((r) => r.upsertSubscription({ userId: U1, endpoint: ep, keys: { p256dh: 'k1', auth: 'a1' }, userAgent: 'Chrome' }));
    expect(subProj(m1)).toEqual({ userId: U1, endpoint: ep, keys: { p256dh: 'k1', auth: 'a1' }, userAgent: 'Chrome' });
    expect(subProj(p1)).toEqual(subProj(m1));

    // same endpoint, different user → upsert re-homes (no duplicate row)
    const [m2, p2] = await both((r) => r.upsertSubscription({ userId: U2, endpoint: ep, keys: { p256dh: 'k2', auth: 'a2' }, userAgent: 'Edge' }));
    expect(subProj(m2)).toEqual({ userId: U2, endpoint: ep, keys: { p256dh: 'k2', auth: 'a2' }, userAgent: 'Edge' });
    expect(subProj(p2)).toEqual(subProj(m2));
  });

  test('removeSubscription: hard delete returns deletedCount — identical', async () => {
    const ep = 'https://push.example/abc'; // now owned by U2 (re-homed above)
    const [mMiss, pMiss] = await both((r) => r.removeSubscription(U1, ep)); // U1 no longer owns it
    expect(norm(mMiss).deletedCount).toBe(0); expect(norm(pMiss).deletedCount).toBe(0);

    const [mHit, pHit] = await both((r) => r.removeSubscription(U2, ep));
    expect(norm(mHit).deletedCount).toBe(1); expect(norm(pHit).deletedCount).toBe(1);
  });
});
