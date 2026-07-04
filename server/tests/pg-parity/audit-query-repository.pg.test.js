/**
 * ──────────────────────────────────────────────────────────
 * PG-parity — audit query repository (Mongo ↔ Postgres)
 * ──────────────────────────────────────────────────────────
 * The audit log READ side (routes/auditRoutes.js): services/audit/
 * audit-query-repository.{mongo,pg} (Phase 3 Wave-F, legacy-tail port).
 * Standalone mongod (read-only, no transactions). Runs only when a Postgres
 * URL is present (the pg-parity CI job); SKIPS otherwise.
 *
 * Pinned identical on both backends:
 *   1. findEntries/countEntries with no filter — newest-first (createdAt desc);
 *   2. entity/entityId/actorId/action equality filters + createdAt range filter,
 *      each producing the same row set + count;
 *   3. pagination (skip/limit) over a filtered set — same page boundaries;
 *   4. actor populate: a live actor resolves to {_id,empCode,name,role}; a
 *      soft-deleted actor OR a null actorId both resolve to actorId:null
 *      (Mongoose's soft-delete find-hook fires during population too);
 *   5. findByEntity: full history for one entity, newest-first, same populate
 *      rules, respects an explicit limit.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env.pg-prototype') });
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const PG_URL = process.env.PG_URL || process.env.PG_PROTOTYPE_URL;
const describePg = PG_URL ? describe : describe.skip;

const { query, closePool } = require('../../config/pg');
const auditQueryRepo = require('../../services/audit/audit-query-repository');
// The repo only references 'actorId'/'User' by populate ref-name string — the
// User schema must be registered explicitly (this test file never otherwise
// requires it), unlike the app boot path where every model gets required.
require('../../models/User');

const hex = (n) => n.toString(16).padStart(24, '0');
const oid = (h) => new mongoose.Types.ObjectId(h);
const coll = (m) => mongoose.model(m).collection.name;
// Round-trip through JSON so ObjectId/Date instances normalize to the same
// plain values as the Postgres impl's text ids/Date objects — a pure
// structural+value deep-equal that doesn't care about backend id typing.
const plain = (v) => JSON.parse(JSON.stringify(v));

const A1 = hex(0xa01); // live actor
const A2 = hex(0xa02); // soft-deleted actor (populate ⇒ null)
const E1 = hex(0xe01);
const E2 = hex(0xe02);
const E3 = hex(0xe03);

const BACKENDS = {
  mongo: { repo: auditQueryRepo.impls.mongo, id: (h) => oid(h) },
  pg: { repo: auditQueryRepo.impls.pg, id: (h) => h },
};

// Same 5 logical rows on both backends (deterministic createdAt pins the
// sort + the date-range filter). hash/prevHash are explicit null (the schema's
// real default for a non-chained row); seq is left OFF both backends entirely
// (its Mongo field has NO default — genuinely absent — mirrored by never
// inserting the pg column either, so `r.seq == null` on both).
const ROWS = (id) => [
  {
    _id: id(hex(0x511)), actorId: id(A1), actorRole: 'Admin', actorEmpCode: '000001',
    action: 'created', entity: 'User', entityId: id(E1), diff: null,
    requestId: 'r1', ip: '10.0.0.1', userAgent: 'jest', note: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'), prevHash: null, hash: null,
  },
  {
    _id: id(hex(0x512)), actorId: id(A2), actorRole: 'Admin', actorEmpCode: '000002',
    action: 'updated', entity: 'User', entityId: id(E1), diff: { a: 1 },
    requestId: 'r2', ip: '10.0.0.1', userAgent: 'jest', note: 'n2',
    createdAt: new Date('2026-01-02T00:00:00.000Z'), prevHash: null, hash: null,
  },
  {
    _id: id(hex(0x513)), actorId: null, actorRole: 'System', actorEmpCode: null,
    action: 'updated', entity: 'Team', entityId: id(E2), diff: null,
    requestId: null, ip: null, userAgent: null, note: null,
    createdAt: new Date('2026-01-03T00:00:00.000Z'), prevHash: null, hash: null,
  },
  {
    _id: id(hex(0x514)), actorId: id(A1), actorRole: 'Admin', actorEmpCode: '000001',
    action: 'deleted', entity: 'User', entityId: id(E3), diff: null,
    requestId: 'r4', ip: '10.0.0.1', userAgent: 'jest', note: null,
    createdAt: new Date('2026-01-04T00:00:00.000Z'), prevHash: null, hash: null,
  },
  {
    _id: id(hex(0x515)), actorId: id(A1), actorRole: 'Admin', actorEmpCode: '000001',
    action: 'created', entity: 'User', entityId: id(E1), diff: null,
    requestId: 'r5', ip: '10.0.0.1', userAgent: 'jest', note: null,
    createdAt: new Date('2026-01-05T00:00:00.000Z'), prevHash: null, hash: null,
  },
];

const seedMongo = async () => {
  const db = mongoose.connection.db;
  await Promise.all(['User', 'AuditLog'].map((m) => db.collection(coll(m)).deleteMany({})));
  await db.collection(coll('User')).insertMany([
    { _id: oid(A1), empCode: '000001', name: 'Alice', role: 'Admin', isDeleted: false },
    { _id: oid(A2), empCode: '000002', name: 'Bob', role: 'Admin', isDeleted: true },
  ]);
  await db.collection(coll('AuditLog')).insertMany(ROWS(oid));
};

const seedPg = async () => {
  await query('TRUNCATE users, audit_log');
  await query(
    `INSERT INTO users(id, emp_code, name, role, is_deleted) VALUES
      ($1,'000001','Alice','Admin',false), ($2,'000002','Bob','Admin',true)`,
    [A1, A2],
  );
  for (const r of ROWS((h) => h)) {
    // eslint-disable-next-line no-await-in-loop
    await query(
      `INSERT INTO audit_log(id, actor_id, actor_role, actor_emp_code, action, entity, entity_id,
                              diff, request_id, ip, user_agent, note, created_at, prev_hash, hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [
        r._id, r.actorId, r.actorRole, r.actorEmpCode, r.action, r.entity, r.entityId,
        r.diff == null ? null : JSON.stringify(r.diff), r.requestId, r.ip, r.userAgent, r.note, r.createdAt,
        r.prevHash, r.hash,
      ],
    );
  }
};

describePg('PG-parity: audit query repository', () => {
  let mongod;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri('pg-parity-audit-query'));
  });

  afterAll(async () => {
    await mongoose.disconnect();
    if (mongod) await mongod.stop();
    await closePool();
  });

  beforeEach(async () => {
    await seedMongo();
    await seedPg();
  });

  test('findEntries/countEntries: no filter — newest-first + actor populate — identical', async () => {
    const mongoEntries = await BACKENDS.mongo.repo.findEntries({}, { skip: 0, limit: 10 });
    const pgEntries = await BACKENDS.pg.repo.findEntries({}, { skip: 0, limit: 10 });

    expect(mongoEntries.map((e) => e.requestId)).toEqual(['r5', 'r4', null, 'r2', 'r1']); // createdAt desc
    expect(plain(pgEntries)).toEqual(plain(mongoEntries));
    expect(await BACKENDS.mongo.repo.countEntries({})).toBe(5);
    expect(await BACKENDS.pg.repo.countEntries({})).toBe(5);

    // Actor populate: live actor → object; soft-deleted actor → null; no actor → null.
    const byReq = (rows, id) => rows.find((r) => r.requestId === id);
    expect(byReq(mongoEntries, 'r1').actorId).toMatchObject({ empCode: '000001', name: 'Alice', role: 'Admin' });
    expect(byReq(mongoEntries, 'r2').actorId).toBeNull(); // ref points at a soft-deleted user
    expect(byReq(mongoEntries, null).actorId).toBeNull(); // actorId was never set
  });

  test('findEntries/countEntries: entity/entityId/actorId/action/date-range filters — identical', async () => {
    const cases = [
      [{ entity: 'User', entityId: String(E1) }, 3],
      [{ actorId: String(A1) }, 3],
      [{ action: 'updated' }, 2],
      [{ createdAt: { $gte: new Date('2026-01-02T00:00:00.000Z'), $lte: new Date('2026-01-04T00:00:00.000Z') } }, 3],
    ];
    for (const [filter, expectedCount] of cases) {
      /* eslint-disable no-await-in-loop */
      const mongoRows = await BACKENDS.mongo.repo.findEntries(filter, { skip: 0, limit: 10 });
      const pgRows = await BACKENDS.pg.repo.findEntries(filter, { skip: 0, limit: 10 });
      expect(mongoRows).toHaveLength(expectedCount);
      expect(plain(pgRows)).toEqual(plain(mongoRows));
      expect(await BACKENDS.mongo.repo.countEntries(filter)).toBe(expectedCount);
      expect(await BACKENDS.pg.repo.countEntries(filter)).toBe(expectedCount);
      /* eslint-enable no-await-in-loop */
    }
  });

  test('findEntries: pagination (skip/limit) over a filtered set — identical page boundaries', async () => {
    const filter = { entity: 'User', entityId: String(E1) }; // r5, r2, r1 desc
    const page1M = await BACKENDS.mongo.repo.findEntries(filter, { skip: 0, limit: 2 });
    const page1P = await BACKENDS.pg.repo.findEntries(filter, { skip: 0, limit: 2 });
    expect(page1M.map((e) => e.requestId)).toEqual(['r5', 'r2']);
    expect(plain(page1P)).toEqual(plain(page1M));

    const page2M = await BACKENDS.mongo.repo.findEntries(filter, { skip: 1, limit: 2 });
    const page2P = await BACKENDS.pg.repo.findEntries(filter, { skip: 1, limit: 2 });
    expect(page2M.map((e) => e.requestId)).toEqual(['r2', 'r1']);
    expect(plain(page2P)).toEqual(plain(page2M));

    const page3M = await BACKENDS.mongo.repo.findEntries(filter, { skip: 2, limit: 2 });
    const page3P = await BACKENDS.pg.repo.findEntries(filter, { skip: 2, limit: 2 });
    expect(page3M.map((e) => e.requestId)).toEqual(['r1']);
    expect(plain(page3P)).toEqual(plain(page3M));
  });

  test('findByEntity: full history for one entity, newest-first, actor populate, respects limit — identical', async () => {
    const mongoEntries = await BACKENDS.mongo.repo.findByEntity('User', String(E1));
    const pgEntries = await BACKENDS.pg.repo.findByEntity('User', String(E1));
    expect(mongoEntries.map((e) => e.requestId)).toEqual(['r5', 'r2', 'r1']);
    expect(plain(pgEntries)).toEqual(plain(mongoEntries));

    const limitedM = await BACKENDS.mongo.repo.findByEntity('User', String(E1), 1);
    const limitedP = await BACKENDS.pg.repo.findByEntity('User', String(E1), 1);
    expect(limitedM.map((e) => e.requestId)).toEqual(['r5']);
    expect(plain(limitedP)).toEqual(plain(limitedM));
  });
});
