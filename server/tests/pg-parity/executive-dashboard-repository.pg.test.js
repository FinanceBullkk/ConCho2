/**
 * ──────────────────────────────────────────────────────────
 * PG-parity test — learning/dashboard/executive-repository (Mongo ↔ Postgres)
 * ──────────────────────────────────────────────────────────
 * Org-wide strategic aggregations + the LND_COST_CONFIG upsert. Runs only when a
 * Postgres URL is present; SKIPS otherwise. Asserts identical behaviour + traps:
 *   • month buckets in UTC ($dateToString default); Enrollment/Attendance have NO
 *     soft-delete; Certificate/User/LearningPath do
 *   • certificateValidityRollup buckets; coverageByDepartment Set/Map grouping
 *   • $addToSet → array_agg(DISTINCT …)
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env.pg-prototype') });
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const PG_URL = process.env.PG_URL || process.env.PG_PROTOTYPE_URL;
const describePg = PG_URL ? describe : describe.skip;

const { query, closePool } = require('../../config/pg');
const repo = require('../../domains/learning/dashboard/executive-repository');

const hex = (n) => n.toString(16).padStart(24, '0');
const oid = (h) => new mongoose.Types.ObjectId(h);
const coll = (m) => mongoose.model(m).collection.name;
const day = (n) => new Date(Date.UTC(2026, 0, n, 0, 0, 0)); // day(40) → 2026-02-09
const norm = (x) => (x == null ? null : JSON.parse(JSON.stringify(x)));
const byId = (a) => [...a].sort((x, y) => String(x._id).localeCompare(String(y._id)));

const U1 = hex(1411); const U2 = hex(1412); const U3 = hex(1413); const U4 = hex(1414); const UD = hex(1415); const UI = hex(1416);
const P1 = hex(1421); const P2 = hex(1422);
const PA1 = hex(1431); const PA2 = hex(1432); const PAD = hex(1433);

describePg('PG-parity: learning/dashboard/executive-repository', () => {
  let mem;

  beforeAll(async () => {
    mem = await MongoMemoryServer.create();
    await mongoose.connect(mem.getUri());
    const db = mongoose.connection.db;

    await db.collection(coll('Setting')).insertOne({ key: 'LND_COST_CONFIG', value: { hourly: 100 } });
    await db.collection(coll('User')).insertMany([
      { _id: oid(U1), empCode: 'U1', role: 'Participant', status: 'Active', department: 'Eng', isDeleted: false },
      { _id: oid(U2), empCode: 'U2', role: 'Participant', status: 'Active', department: 'Eng', isDeleted: false },
      { _id: oid(U3), empCode: 'U3', role: 'Participant', status: 'Active', department: 'Ops', isDeleted: false },
      { _id: oid(U4), empCode: 'U4', role: 'Teacher', status: 'Active', department: 'Eng', isDeleted: false },
      { _id: oid(UD), empCode: 'U5', role: 'Participant', status: 'Active', department: 'Eng', isDeleted: true },
      { _id: oid(UI), empCode: 'U6', role: 'Participant', status: 'Inactive', department: 'Ops', isDeleted: false },
    ]);
    await db.collection(coll('Enrollment')).insertMany([
      { _id: oid(hex(1441)), userId: oid(U1), status: 'Active', createdAt: day(5) },
      { _id: oid(hex(1442)), userId: oid(U2), status: 'Active', createdAt: day(40) },
      { _id: oid(hex(1443)), userId: oid(U3), status: 'Dropped', createdAt: day(6) },
    ]);
    await db.collection(coll('Attendance')).insertMany([
      { _id: oid(hex(1451)), userId: oid(U2), status: 'P', createdAt: day(5) },
    ]);
    const cert = (id, u, prog, status, issued, validUntil, del = false) => ({
      _id: oid(id), userId: oid(u), programId: oid(prog), status, isDeleted: del,
      issuedAt: day(issued), validUntil: validUntil == null ? null : day(validUntil),
      certificateNumber: `C-${id.slice(-3)}`, verificationCode: `v-${id.slice(-3)}`, cohortId: oid(hex(1461)),
    });
    await db.collection(coll('Certificate')).insertMany([
      cert(hex(1471), U1, P1, 'Issued', 7, 100),  // valid (future)
      cert(hex(1472), U2, P2, 'Issued', 8, null),  // non-expiring
      cert(hex(1473), U3, P1, 'Issued', 9, 3),     // expired (validUntil<now)
      cert(hex(1474), U1, P1, 'Revoked', 10, null), // revoked
      cert(hex(1475), U1, P2, 'Issued', 11, 100, true), // deleted → excluded
    ]);
    await db.collection(coll('LearningPath')).insertMany([
      { _id: oid(PA1), code: 'PA1', title: 'Path A', status: 'active', programs: [oid(P1), oid(P2)], isDeleted: false },
      { _id: oid(PA2), code: 'PA2', title: 'Path Arch', status: 'archived', programs: [oid(P1)], isDeleted: false },
      { _id: oid(PAD), code: 'PAD', title: 'Path Gone', status: 'active', programs: [], isDeleted: true },
    ]);

    await query('TRUNCATE settings, users, enrollments, attendances, certificates, learning_paths');
    await query(`INSERT INTO settings(id,key,value) VALUES ($1,'LND_COST_CONFIG','{"hourly":100}')`, [hex(1401)]);
    await query(`INSERT INTO users(id,emp_code,role,status,department,is_deleted) VALUES
      ($1,'U1','Participant','Active','Eng',false),($2,'U2','Participant','Active','Eng',false),
      ($3,'U3','Participant','Active','Ops',false),($4,'U4','Teacher','Active','Eng',false),
      ($5,'U5','Participant','Active','Eng',true),($6,'U6','Participant','Inactive','Ops',false)`, [U1, U2, U3, U4, UD, UI]);
    await query(`INSERT INTO enrollments(id,user_id,status,created_at) VALUES ($1,$2,'Active',$3),($4,$5,'Active',$6),($7,$8,'Dropped',$9)`,
      [hex(1441), U1, day(5).toISOString(), hex(1442), U2, day(40).toISOString(), hex(1443), U3, day(6).toISOString()]);
    await query(`INSERT INTO attendances(id,user_id,schedule_id,status,created_at) VALUES ($1,$2,$3,'P',$4)`, [hex(1451), U2, hex(1452), day(5).toISOString()]);
    const ipgCert = (id, u, prog, status, issued, validUntil, del = false) => query(
      `INSERT INTO certificates(id,user_id,program_id,status,is_deleted,issued_at,valid_until,certificate_number,verification_code,cohort_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [id, u, prog, status, del, day(issued).toISOString(), validUntil == null ? null : day(validUntil).toISOString(), `C-${id.slice(-3)}`, `v-${id.slice(-3)}`, hex(1461)]);
    await ipgCert(hex(1471), U1, P1, 'Issued', 7, 100);
    await ipgCert(hex(1472), U2, P2, 'Issued', 8, null);
    await ipgCert(hex(1473), U3, P1, 'Issued', 9, 3);
    await ipgCert(hex(1474), U1, P1, 'Revoked', 10, null);
    await ipgCert(hex(1475), U1, P2, 'Issued', 11, 100, true);
    await query(`INSERT INTO learning_paths(id,code,title,status,programs,is_deleted) VALUES
      ($1,'PA1','Path A','active',ARRAY[$2,$3],false),($4,'PA2','Path Arch','archived',ARRAY[$2],false),($5,'PAD','Path Gone','active',ARRAY[]::text[],true)`,
    [PA1, P1, P2, PA2, PAD]);
  }, 60_000);

  afterAll(async () => {
    if (mongoose.connection.readyState) await mongoose.disconnect();
    if (mem) await mem.stop();
    await closePool();
  });

  const both = (fn) => Promise.all([fn(repo.impls.mongo), fn(repo.impls.pg)]);

  test('getCostConfig + activeEmployeeCount — identical', async () => {
    const [mC, pC] = await both((r) => r.getCostConfig());
    expect(norm(mC)).toEqual({ hourly: 100 }); expect(norm(pC)).toEqual(norm(mC));
    const [mN, pN] = await both((r) => r.activeEmployeeCount()); // U1-U4 Active live; UD deleted, UI inactive
    expect(mN).toBe(4); expect(pN).toBe(4);
  });

  test('monthlyEventBuckets (UTC) + issuedCertificateCount + validityRollup — identical', async () => {
    const [mB, pB] = await both((r) => r.monthlyEventBuckets(day(1)));
    // enrollments: 2026-01 = E1+E3(2), 2026-02 = E2(1); certs(issued+revoked, not deleted): 2026-01 = 4
    expect(byMonth(mB.enrollments)).toEqual({ '2026-01': 2, '2026-02': 1 });
    expect(byMonth(pB.enrollments)).toEqual(byMonth(mB.enrollments));
    expect(byMonth(mB.certificates)).toEqual({ '2026-01': 4 });
    expect(byMonth(pB.certificates)).toEqual(byMonth(mB.certificates));

    const [mI, pI] = await both((r) => r.issuedCertificateCount(day(1))); // C1,C2,C3 Issued live
    expect(mI).toBe(3); expect(pI).toBe(3);

    const [mV, pV] = await both((r) => r.certificateValidityRollup(day(50)));
    expect(mV).toEqual({ totalIssued: 3, valid: 2, nonExpiring: 1, expiring30: 0, expired: 1, revoked: 1 });
    expect(pV).toEqual(mV);
  });

  test('coverageByDepartment + listActivePaths + issuedProgramSetsByUser — identical', async () => {
    const [mC, pC] = await both((r) => r.coverageByDepartment(day(1)));
    // Eng: active 2 (U1,U2) engaged 2; Ops: active 1 (U3) engaged 0; sort active desc
    expect(mC).toEqual([{ department: 'Eng', active: 2, engaged: 2 }, { department: 'Ops', active: 1, engaged: 0 }]);
    expect(pC).toEqual(mC);

    const [mP, pP] = await both((r) => r.listActivePaths());
    expect(mP.map((x) => x.title)).toEqual(['Path A']); // archived + deleted excluded
    expect(norm(pP)[0].programs.sort()).toEqual(norm(mP)[0].programs.sort());

    // Each backend gets program ids in ITS native form (the real flow: Mongo
    // listActivePaths returns ObjectIds, PG returns strings). Mongo aggregate $in
    // does NOT auto-cast string→ObjectId, so passing strings to Mongo would miss.
    const [mS, pS] = await Promise.all([
      repo.impls.mongo.issuedProgramSetsByUser([oid(P1), oid(P2)]),
      repo.impls.pg.issuedProgramSetsByUser([P1, P2]),
    ]);
    const proj = (rows) => byId(rows).map((r) => ({ user: String(r._id), programs: norm(r.programs).map(String).sort() }));
    expect(proj(mS)).toEqual([{ user: U1, programs: [P1] }, { user: U2, programs: [P2] }, { user: U3, programs: [P1] }].sort((a, b) => a.user.localeCompare(b.user)));
    expect(proj(pS)).toEqual(proj(mS));
  });

  test('upsertCostConfig returns {before, after} — identical', async () => {
    const [mU, pU] = await both((r) => r.upsertCostConfig({ hourly: 200 }));
    expect(norm(mU)).toEqual({ before: { hourly: 100 }, after: { hourly: 200 } });
    expect(norm(pU)).toEqual(norm(mU));
  });
});

const byMonth = (rows) => Object.fromEntries(rows.map((r) => [r._id, r.count]));
