/**
 * ──────────────────────────────────────────────────────────
 * PG-parity — metrics repository (Mongo ↔ Postgres)
 * ──────────────────────────────────────────────────────────
 * Wave-F: the shared writer/reader seam of metricSnapshotService +
 * analyticsSeriesService. Read/upsert only → standalone mongod. SKIPS
 * without a Postgres URL.
 *
 * Pinned identical on both backends:
 *   1. writer sources: program classes (deleted hidden), enrollment
 *      (classId,status) groups, issued-cert program groups;
 *   2. upsertSnapshots idempotency: fresh → upserted; SAME value re-run →
 *      {upserted:0, modified:0} (Mongo modifiedCount semantics); changed
 *      value → modified; global (scopeId null) vs program scope collide
 *      correctly (COALESCE unique, mig 002);
 *   3. backfill readers' row shapes;
 *   4. findSnapshotSeries: scope/scopeId/key filter + since + date ASC;
 *   5. the funnel count grammar (status $ne / equality-clobber, classId $in,
 *      isDeleted $ne:true) — and unknown filter keys throw on PG (fail-loud).
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env.pg-prototype') });
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const PG_URL = process.env.PG_URL || process.env.PG_PROTOTYPE_URL;
const describePg = PG_URL ? describe : describe.skip;

const { query, closePool } = require('../../config/pg');
const repo = require('../../services/metrics-repository');
require('../../models/MetricSnapshot');
require('../../models/Enrollment');
require('../../models/Certificate');
require('../../models/Class');

const hex = (n) => n.toString(16).padStart(24, '0');
const oid = (h) => new mongoose.Types.ObjectId(h);
const coll = (m) => mongoose.model(m).collection.name;

const P1 = hex(0xf701);
const C1 = hex(0xf711); const C2 = hex(0xf712); const C3 = hex(0xf713); // C3 deleted
const U1 = hex(0xf721); const U2 = hex(0xf722);
const DAY = new Date('2026-07-01T00:00:00.000Z');
const EARLIER = new Date('2026-06-01T00:00:00.000Z');

const seed = async () => {
  const db = mongoose.connection.db;
  await Promise.all(['MetricSnapshot', 'Enrollment', 'Certificate', 'Class'].map((m) => db.collection(coll(m)).deleteMany({})));

  await db.collection(coll('Class')).insertMany([
    { _id: oid(C1), classCode: 'M01', courseName: 'TOEIC', programId: oid(P1), status: 'Ongoing', isDeleted: false },
    { _id: oid(C2), classCode: 'M02', courseName: 'IELTS', programId: null, status: 'Ongoing', isDeleted: false },
    { _id: oid(C3), classCode: 'M03', courseName: 'Ghost', programId: oid(P1), status: 'Ongoing', isDeleted: true },
  ]);
  await db.collection(coll('Enrollment')).insertMany([
    { userId: oid(U1), classId: oid(C1), status: 'Active', joinedAt: EARLIER, leftAt: null, createdAt: EARLIER, updatedAt: EARLIER },
    { userId: oid(U2), classId: oid(C1), status: 'Completed', joinedAt: EARLIER, leftAt: null, createdAt: EARLIER, updatedAt: EARLIER },
    { userId: oid(U2), classId: oid(C2), status: 'Transferred', joinedAt: EARLIER, leftAt: DAY, createdAt: EARLIER, updatedAt: DAY },
  ]);
  // Phase-03 lesson: raw seeds must satisfy ALL Certificate unique indexes
  // (serial / verificationCode / cohort combo) — the autoIndex race bit twice.
  await db.collection(coll('Certificate')).insertMany([
    { userId: oid(U2), programId: oid(P1), cohortId: oid(C1), certificateNumber: 'MC-1', serial: 'MS-1', verificationCode: 'MV-1', status: 'Issued', issuedAt: DAY, createdAt: DAY, isDeleted: false },
    { userId: oid(U1), programId: oid(P1), cohortId: oid(C1), certificateNumber: 'MC-2', serial: 'MS-2', verificationCode: 'MV-2', status: 'Revoked', issuedAt: EARLIER, createdAt: EARLIER, isDeleted: false },
    { userId: oid(U1), programId: oid(P1), cohortId: oid(C2), certificateNumber: 'MC-3', serial: 'MS-3', verificationCode: 'MV-3', status: 'Issued', issuedAt: EARLIER, createdAt: EARLIER, isDeleted: true },
  ]);

  await query('TRUNCATE metric_snapshots, enrollments, certificates, classes');
  await query(
    `INSERT INTO classes(id, class_code, course_name, program_id, status, is_deleted) VALUES
       ($1,'M01','TOEIC',$2,'Ongoing',false), ($3,'M02','IELTS',NULL,'Ongoing',false), ($4,'M03','Ghost',$2,'Ongoing',true)`,
    [C1, P1, C2, C3]
  );
  await query(
    `INSERT INTO enrollments(id, user_id, class_id, status, joined_at, left_at, created_at, updated_at) VALUES
       ($1,$2,$3,'Active',$4,NULL,$4,$4), ($5,$6,$3,'Completed',$4,NULL,$4,$4), ($7,$6,$8,'Transferred',$4,$9,$4,$9)`,
    [hex(0xf731), U1, C1, EARLIER, hex(0xf732), U2, hex(0xf733), C2, DAY]
  );
  await query(
    `INSERT INTO certificates(id, user_id, program_id, status, issued_at, created_at, is_deleted) VALUES
       ($1,$2,$3,'Issued',$4,$4,false), ($5,$6,$3,'Revoked',$7,$7,false), ($8,$6,$3,'Issued',$7,$7,true)`,
    [hex(0xf741), U2, P1, DAY, hex(0xf742), U1, EARLIER, hex(0xf743)]
  );
};

const BACKENDS = { mongo: { id: (h) => oid(h) }, pg: { id: (h) => h } };
const keyOf = (g) => `${String(g._id.classId)}|${g._id.status}`;

describePg('pg-parity: metrics repository (snapshot writer + funnel reader)', () => {
  let mongod;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri('pg-parity-metrics'));
    BACKENDS.mongo.repo = repo.impls.mongo;
    BACKENDS.pg.repo = repo.impls.pg;
  });

  afterAll(async () => {
    await mongoose.disconnect();
    if (mongod) await mongod.stop();
    await closePool();
  });

  beforeEach(seed);

  test('writer sources: program classes, enrollment groups, cert groups', async () => {
    for (const b of Object.values(BACKENDS)) {
      const classes = await b.repo.findProgramClasses();
      expect(classes.map((c) => String(c._id)).sort()).toEqual([C1]); // C2 no program, C3 deleted
      expect(String(classes[0].programId)).toBe(P1);

      const enr = await b.repo.aggregateEnrollmentsByClassStatus();
      expect(enr.map(keyOf).sort()).toEqual([`${C1}|Active`, `${C1}|Completed`, `${C2}|Transferred`]);
      expect(enr.every((g) => g.count === 1)).toBe(true);

      const certs = await b.repo.aggregateIssuedCertsByProgram();
      expect(certs.map((c) => ({ _id: String(c._id), count: c.count }))).toEqual([{ _id: P1, count: 1 }]);
    }
  });

  test('upsertSnapshots: fresh insert / identical re-run / changed value / scope collision', async () => {
    for (const b of Object.values(BACKENDS)) {
      const metrics = [
        { scope: 'global', scopeId: null, key: 'active_enrollments', value: 5 },
        { scope: 'program', scopeId: b.id(P1), key: 'active_enrollments', value: 2 },
      ];
      expect(await b.repo.upsertSnapshots(DAY, metrics)).toEqual({ upserted: 2, modified: 0 });
      // Identical values: Mongo modifiedCount stays 0 — pinned on both.
      expect(await b.repo.upsertSnapshots(DAY, metrics)).toEqual({ upserted: 0, modified: 0 });
      // Changed value: exactly one row modified, none inserted (COALESCE collision).
      metrics[0].value = 7;
      expect(await b.repo.upsertSnapshots(DAY, metrics)).toEqual({ upserted: 0, modified: 1 });

      const series = await b.repo.findSnapshotSeries({ key: 'active_enrollments', scope: 'global', scopeId: null, since: EARLIER });
      expect(series.map((s) => s.value)).toEqual([7]);
      const scoped = await b.repo.findSnapshotSeries({ key: 'active_enrollments', scope: 'program', scopeId: b.id(P1), since: EARLIER });
      expect(scoped.map((s) => s.value)).toEqual([2]);
    }
  });

  test('backfill readers: row shapes + filters', async () => {
    for (const b of Object.values(BACKENDS)) {
      const enr = await b.repo.findNonTransferredEnrollments();
      expect(enr).toHaveLength(2); // Transferred excluded
      expect(new Set(enr.map((e) => e.status))).toEqual(new Set(['Active', 'Completed']));
      expect(enr.every((e) => 'joinedAt' in e && 'classId' in e && 'leftAt' in e)).toBe(true);

      const certs = await b.repo.findIssuedCertificates();
      expect(certs).toHaveLength(1); // Revoked + deleted excluded
      expect(String(certs[0].programId)).toBe(P1);
      expect(new Date(certs[0].issuedAt).toISOString()).toBe(DAY.toISOString());
    }
  });

  test('funnel counts: $ne / clobbered equality / $in / isDeleted — same numbers; unknown key throws on PG', async () => {
    for (const b of Object.values(BACKENDS)) {
      const enrollMatch = { status: { $ne: 'Transferred' } };
      expect(await b.repo.countEnrollments(enrollMatch)).toBe(2);
      // The funnel spreads then overrides status — plain equality.
      expect(await b.repo.countEnrollments({ ...enrollMatch, status: 'Completed' })).toBe(1);
      expect(await b.repo.countEnrollments({ ...enrollMatch, classId: { $in: [b.id(C1)] } })).toBe(2);

      const certMatch = { status: 'Issued', isDeleted: { $ne: true } };
      expect(await b.repo.countCertificates(certMatch)).toBe(1);
      expect(await b.repo.countCertificates({ ...certMatch, programId: b.id(P1) })).toBe(1);
    }
    // Fail-loud grammar guard (PG-only by design — Mongo passes anything through).
    await expect(BACKENDS.pg.repo.countEnrollments({ nonsense: 1 })).rejects.toThrow(/unsupported filter key/);
  });
});
