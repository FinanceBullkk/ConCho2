/**
 * ──────────────────────────────────────────────────────────
 * PG-parity — class repository (Mongo ↔ Postgres)
 * ──────────────────────────────────────────────────────────
 * Wave-F: the legacy class handlers' Phase-0 seam (controllers/class/).
 * The PG write path DELEGATES to the parity-proven learning cohort writes
 * (port #12) — this test pins the legacy-consumer contract on top of it.
 * Read-mostly → standalone mongod. SKIPS without a Postgres URL.
 *
 * Pinned identical on both backends:
 *   1. courseSessionsMap: settings value map | {};
 *   2. findOngoingByClassCode truthiness with/without excludeId;
 *   3. create → findClassDocById → updateClassById round trip; the hydrated
 *      readers expose a NON-ENUMERABLE toObject() (audit-diff safe);
 *   4. findClasses: equality filter + classCode,courseName sort + page/limit,
 *      soft-deleted hidden;
 *   5. booked-session counts (live only) + team ids (deleted team hidden) +
 *      enrollmentExists truthiness (ANY status).
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env.pg-prototype') });
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const PG_URL = process.env.PG_URL || process.env.PG_PROTOTYPE_URL;
const describePg = PG_URL ? describe : describe.skip;

const { query, closePool } = require('../../config/pg');
const repo = require('../../controllers/class/class-repository');
require('../../models/Setting');
require('../../models/Class');
require('../../models/Team');
require('../../models/Schedule');
require('../../models/Enrollment');

const hex = (n) => n.toString(16).padStart(24, '0');
const oid = (h) => new mongoose.Types.ObjectId(h);
const coll = (m) => mongoose.model(m).collection.name;

const C1 = hex(0xf601); const C2 = hex(0xf602); const C3 = hex(0xf603); // C3 deleted
const T1 = hex(0xf611); const T2 = hex(0xf612);                         // T2 deleted
const U1 = hex(0xf621);
const S1 = hex(0xf631); const S2 = hex(0xf632); const S3 = hex(0xf633);
const E1 = hex(0xf641);

const OLD = new Date('2026-05-01T00:00:00.000Z');

const seed = async () => {
  const db = mongoose.connection.db;
  await Promise.all(['Setting', 'Class', 'Team', 'Schedule', 'Enrollment'].map((m) => db.collection(coll(m)).deleteMany({})));

  await db.collection(coll('Setting')).insertOne({ key: 'COURSE_SESSIONS', value: { TOEIC: 10, IELTS: 8 } });
  await db.collection(coll('Class')).insertMany([
    { _id: oid(C1), classCode: 'C01', courseName: 'TOEIC', totalSessions: 10, status: 'Ongoing', isDeleted: false },
    { _id: oid(C2), classCode: 'C02', courseName: 'IELTS', totalSessions: 8, status: 'Completed', isDeleted: false },
    { _id: oid(C3), classCode: 'C03', courseName: 'Ghost', totalSessions: 5, status: 'Ongoing', isDeleted: true },
  ]);
  await db.collection(coll('Team')).insertMany([
    { _id: oid(T1), name: 'T1', classId: oid(C1), members: [], isDeleted: false },
    { _id: oid(T2), name: 'T2', classId: oid(C1), members: [], isDeleted: true },
  ]);
  await db.collection(coll('Schedule')).insertMany([
    { _id: oid(S1), classId: oid(C1), startTime: OLD, endTime: OLD, status: 'scheduled' },
    { _id: oid(S2), classId: oid(C1), startTime: new Date('2026-08-01'), endTime: new Date('2026-08-01'), status: 'scheduled' },
    { _id: oid(S3), classId: oid(C1), startTime: OLD, endTime: OLD, status: 'cancelled' },
  ]);
  await db.collection(coll('Enrollment')).insertMany([
    { _id: oid(E1), userId: oid(U1), teamId: oid(T1), classId: oid(C1), status: 'Dropped' },
  ]);

  await query('TRUNCATE settings, classes, teams, schedules, enrollments');
  await query(`INSERT INTO settings(id, key, value) VALUES ($1, 'COURSE_SESSIONS', $2)`,
    [hex(0xf651), JSON.stringify({ TOEIC: 10, IELTS: 8 })]);
  await query(
    `INSERT INTO classes(id, class_code, course_name, total_sessions, status, is_deleted) VALUES
       ($1,'C01','TOEIC',10,'Ongoing',false), ($2,'C02','IELTS',8,'Completed',false), ($3,'C03','Ghost',5,'Ongoing',true)`,
    [C1, C2, C3]
  );
  await query(`INSERT INTO teams(id, name, class_id, is_deleted) VALUES ($1,'T1',$2,false), ($3,'T2',$2,true)`, [T1, C1, T2]);
  await query(
    `INSERT INTO schedules(id, class_id, start_time, end_time, status) VALUES
       ($1,$2,$3,$3,'scheduled'), ($4,$2,'2026-08-01T00:00:00Z','2026-08-01T00:00:00Z','scheduled'), ($5,$2,$3,$3,'cancelled')`,
    [S1, C1, OLD, S2, S3]
  );
  await query(
    `INSERT INTO enrollments(id, user_id, class_id, team_id, status) VALUES ($1,$2,$3,$4,'Dropped')`,
    [E1, U1, C1, T1]
  );
};

const BACKENDS = { mongo: { id: (h) => oid(h) }, pg: { id: (h) => h } };

describePg('pg-parity: class repository (legacy handlers seam)', () => {
  let mongod;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri('pg-parity-class'));
    BACKENDS.mongo.repo = repo.impls.mongo;
    BACKENDS.pg.repo = repo.impls.pg;
  });

  afterAll(async () => {
    await mongoose.disconnect();
    if (mongod) await mongod.stop();
    await closePool();
  });

  beforeEach(seed);

  test('courseSessionsMap: settings value map | {} on both', async () => {
    for (const b of Object.values(BACKENDS)) {
      expect(await b.repo.courseSessionsMap()).toEqual({ TOEIC: 10, IELTS: 8 });
    }
    await mongoose.connection.db.collection(coll('Setting')).deleteMany({});
    await query('TRUNCATE settings');
    for (const b of Object.values(BACKENDS)) {
      expect(await b.repo.courseSessionsMap()).toEqual({});
    }
  });

  test('findOngoingByClassCode: truthiness, excludeId, deleted hidden', async () => {
    for (const b of Object.values(BACKENDS)) {
      expect(await b.repo.findOngoingByClassCode('C01')).toBeTruthy();
      expect(await b.repo.findOngoingByClassCode('C02')).toBeNull();      // Closed
      expect(await b.repo.findOngoingByClassCode('C03')).toBeNull();      // soft-deleted
      expect(await b.repo.findOngoingByClassCode('C01', b.id(C1))).toBeNull(); // self excluded
    }
  });

  test('create → findClassDocById → update round trip; toObject non-enumerable', async () => {
    for (const b of Object.values(BACKENDS)) {
      const created = await b.repo.createClassDoc({
        classCode: `NEW-${b === BACKENDS.mongo ? 'M' : 'P'}`,
        courseName: 'TOEIC', totalSessions: 12, status: 'Ongoing',
      });
      expect(created.classCode).toMatch(/^NEW-/);

      const doc = await b.repo.findClassDocById(created._id);
      expect(doc.classCode).toBe(created.classCode);
      const before = doc.toObject();
      expect(typeof before).toBe('object');
      // Audit-diff safety: toObject must not appear as a data key.
      expect(Object.keys(before)).not.toContain('toObject');
      expect(JSON.parse(JSON.stringify(doc))).not.toHaveProperty('toObject');

      const updated = await b.repo.updateClassById(created._id, { status: 'Completed', totalSessions: 15 });
      expect(updated.status).toBe('Completed');
      expect(updated.totalSessions).toBe(15);
      expect(Object.keys(updated.toObject())).not.toContain('toObject');

      expect(await b.repo.updateClassById(b.id(hex(0xffff)), { status: 'Completed' })).toBeNull();

      // runValidators parity: an invalid status enum rejects on BOTH backends.
      await expect(b.repo.updateClassById(created._id, { status: 'Closed' }))
        .rejects.toMatchObject({ name: 'ValidationError' });
    }
  });

  test('findClasses: filter + sort + pagination, deleted hidden', async () => {
    for (const b of Object.values(BACKENDS)) {
      const all = await b.repo.findClasses({}, { page: 1, limit: 10 });
      expect(all.map((c) => c.classCode)).toEqual(['C01', 'C02']); // C03 deleted
      const ongoing = await b.repo.findClasses({ status: 'Ongoing' }, { page: 1, limit: 10 });
      expect(ongoing.map((c) => c.classCode)).toEqual(['C01']);
      const page2 = await b.repo.findClasses({}, { page: 2, limit: 1 });
      expect(page2.map((c) => c.classCode)).toEqual(['C02']);
    }
  });

  test('booked-session counts + team ids + enrollmentExists + countBookedSessions', async () => {
    for (const b of Object.values(BACKENDS)) {
      const counts = await b.repo.aggregateBookedSessionCounts([b.id(C1), b.id(C2)]);
      expect(counts.map((c) => ({ _id: String(c._id), bookedSessions: c.bookedSessions })))
        .toEqual([{ _id: C1, bookedSessions: 2 }]); // cancelled excluded

      const teamIds = (await b.repo.findTeamIdsForClass(b.id(C1))).map(String);
      expect(teamIds).toEqual([T1]); // deleted T2 hidden

      // ANY status counts (Dropped row still matches — history, not live-only).
      expect(await b.repo.enrollmentExists(b.id(U1), [b.id(T1)])).toBeTruthy();
      expect(await b.repo.enrollmentExists(b.id(U1), [b.id(T2)])).toBeNull();

      expect(await b.repo.countBookedSessions(b.id(C1))).toBe(2);
      expect(await b.repo.countBookedSessions(b.id(C2))).toBe(0);
    }
  });
});
