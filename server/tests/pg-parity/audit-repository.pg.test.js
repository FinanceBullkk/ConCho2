/**
 * ──────────────────────────────────────────────────────────
 * PG-parity — audit write path (Mongo ↔ Postgres)
 * ──────────────────────────────────────────────────────────
 * The tamper-evident audit chain (Phase 3 Wave-E slice E1, mig 029):
 * services/audit-repository.{mongo,pg} under auditService's serialized append
 * queue + audit-chain's verifyChain. Append-only, no transactions → standalone
 * mongod. Runs only when a Postgres URL is present (the pg-parity CI job);
 * SKIPS otherwise.
 *
 * Pinned identical on both backends:
 *   1. chain append: same logical docs → SAME seq/prevHash/hash on both
 *      backends (canonicalPayload normalizes ObjectId→String, Date→ISO —
 *      Mongo Mixed keeps Date objects, PG jsonb keeps ISO strings, hashes
 *      must agree anyway);
 *   2. findChainHead: empty → null; after N appends → {seq:N, hash} equal;
 *   3. findChainWindow: every row re-hashes to its stored hash on both;
 *   4. verifyChain: ok on an intact chain; 'hash-mismatch' on a tampered
 *      field; 'missing-rows' on a deleted middle row — same verdicts;
 *   5. duplicate seq (chain fork) → rejected by the partial-unique index,
 *      PG 23505 re-thrown Mongo-style ({code:11000});
 *   6. enum parity: invalid entity / actorRole → ValidationError on both
 *      (Mongoose schema enum ⇔ pg impl validating from the same enumValues);
 *   7. queue/fire-and-forget semantics live in auditService (backend-agnostic,
 *      covered by tests/integration/auditHashChain.test.js on Mongo).
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env.pg-prototype') });
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const PG_URL = process.env.PG_URL || process.env.PG_PROTOTYPE_URL;
const describePg = PG_URL ? describe : describe.skip;

const { query, closePool } = require('../../config/pg');
const auditRepo = require('../../services/audit-repository');
const { GENESIS_PREV_HASH, computeHash, verifyChain } = require('../../services/audit-chain');
const AuditLog = require('../../models/AuditLog');

const hex = (n) => n.toString(16).padStart(24, '0');
const oid = (h) => new mongoose.Types.ObjectId(h);

const ACTOR = hex(0xe01);
const ENTITY1 = hex(0xe11);
const ENTITY2 = hex(0xe12);

// The same logical docs, per backend id-typing (Mongo casts hex → ObjectId;
// PG stores text). diff carries a Date on purpose — the Mixed-vs-jsonb
// normalization is exactly what fidelity note 1 pins.
const DOCS = (id) => [
  {
    actorId: id(ACTOR), actorRole: 'Admin', actorEmpCode: '000001',
    action: 'created', entity: 'User', entityId: id(ENTITY1),
    diff: { status: { before: null, after: 'active' }, at: new Date('2026-07-04T00:00:00.123Z') },
    requestId: 'req-1', ip: '10.0.0.1', userAgent: 'jest', note: 'row one',
  },
  {
    actorId: null, actorRole: 'System', actorEmpCode: null,
    action: 'updated', entity: 'Setting', entityId: null,
    diff: null, requestId: null, ip: null, userAgent: null, note: null,
  },
  {
    actorId: id(ACTOR), actorRole: 'Admin', actorEmpCode: '000001',
    action: 'soft-deleted', entity: 'Team', entityId: id(ENTITY2),
    diff: { isDeleted: { before: false, after: true } },
    requestId: 'req-3', ip: '10.0.0.1', userAgent: 'jest', note: null,
  },
];

const BACKENDS = {
  mongo: { repo: auditRepo.impls.mongo, id: (h) => oid(h) },
  pg: { repo: auditRepo.impls.pg, id: (h) => h },
};

// Mirror auditService.appendChained without its module-level queue/cache so
// each backend's chain is driven explicitly.
const append = async (repo, head, doc) => {
  const seq = head.seq + 1;
  const prevHash = head.hash;
  const hash = computeHash({ ...doc, seq, prevHash });
  await repo.insertChainedRow({ ...doc, seq, prevHash, hash });
  return { seq, hash };
};

const buildChain = async (backend) => {
  const heads = [];
  let head = (await backend.repo.findChainHead()) || { seq: 0, hash: GENESIS_PREV_HASH };
  for (const doc of DOCS(backend.id)) {
    head = await append(backend.repo, head, doc);
    heads.push(head);
  }
  return heads;
};

const resetBoth = async () => {
  await AuditLog.deleteMany({});
  await query('TRUNCATE audit_log');
};

describePg('pg-parity: audit write path (chain append + verify)', () => {
  let mongod;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri('pg-parity-audit'));
    // Build the partial-unique {seq} index BEFORE the dup-seq test — the
    // autoIndex race passes locally but fails on CI (phase-03 lesson).
    await AuditLog.init();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    if (mongod) await mongod.stop();
    await closePool();
  });

  beforeEach(resetBoth);

  test('empty chain: findChainHead → null on both; verifyChain → empty-chain', async () => {
    for (const backend of Object.values(BACKENDS)) {
      expect(await backend.repo.findChainHead()).toBeNull();
      const v = await verifyChain({ repo: backend.repo });
      expect(v).toMatchObject({ ok: true, checked: 0, reason: 'empty-chain' });
    }
  });

  test('append: same logical docs → identical seq/hash chain on both backends', async () => {
    const mongoHeads = await buildChain(BACKENDS.mongo);
    const pgHeads = await buildChain(BACKENDS.pg);

    // Write-time hashes agree row by row (ObjectId vs text, Date vs ISO).
    expect(pgHeads).toEqual(mongoHeads);

    const mongoHead = await BACKENDS.mongo.repo.findChainHead();
    const pgHead = await BACKENDS.pg.repo.findChainHead();
    expect(mongoHead).toEqual({ seq: 3, hash: mongoHeads[2].hash });
    expect(pgHead).toEqual(mongoHead);
  });

  test('findChainWindow: every stored row re-hashes to its own hash on both', async () => {
    await buildChain(BACKENDS.mongo);
    await buildChain(BACKENDS.pg);

    for (const backend of Object.values(BACKENDS)) {
      const rows = await backend.repo.findChainWindow(1, 3);
      expect(rows.map((r) => r.seq)).toEqual([1, 2, 3]);
      for (const row of rows) {
        expect(computeHash(row)).toBe(row.hash);
      }
      expect(rows[1].prevHash).toBe(rows[0].hash);
      expect(rows[2].prevHash).toBe(rows[1].hash);
    }
  });

  test('verifyChain: intact chain verifies on both backends', async () => {
    await buildChain(BACKENDS.mongo);
    await buildChain(BACKENDS.pg);

    for (const backend of Object.values(BACKENDS)) {
      const v = await verifyChain({ repo: backend.repo });
      expect(v).toMatchObject({ ok: true, checked: 3, from: 1, to: 3, reason: 'verified' });
    }
  });

  test('verifyChain: tampered field → hash-mismatch at the same seq on both', async () => {
    await buildChain(BACKENDS.mongo);
    await buildChain(BACKENDS.pg);

    await AuditLog.updateOne({ seq: 2 }, { $set: { note: 'tampered' } });
    await query(`UPDATE audit_log SET note = 'tampered' WHERE seq = 2`);

    for (const backend of Object.values(BACKENDS)) {
      const v = await verifyChain({ repo: backend.repo });
      expect(v).toMatchObject({ ok: false, firstBrokenSeq: 2, reason: 'hash-mismatch' });
    }
  });

  test('verifyChain: deleted middle row → missing-rows at the same seq on both', async () => {
    await buildChain(BACKENDS.mongo);
    await buildChain(BACKENDS.pg);

    await AuditLog.deleteOne({ seq: 2 });
    await query('DELETE FROM audit_log WHERE seq = 2');

    for (const backend of Object.values(BACKENDS)) {
      const v = await verifyChain({ repo: backend.repo });
      expect(v).toMatchObject({ ok: false, firstBrokenSeq: 3, reason: 'missing-rows' });
    }
  });

  test('duplicate seq (chain fork) → rejected as dup key {code:11000} on both', async () => {
    await buildChain(BACKENDS.mongo);
    await buildChain(BACKENDS.pg);

    for (const backend of Object.values(BACKENDS)) {
      const doc = { ...DOCS(backend.id)[1], seq: 3, prevHash: 'x'.repeat(64) };
      const forged = { ...doc, hash: computeHash(doc) };
      await expect(backend.repo.insertChainedRow(forged)).rejects.toMatchObject({ code: 11000 });
    }
  });

  test('enum parity: invalid entity / actorRole → ValidationError on both', async () => {
    for (const backend of Object.values(BACKENDS)) {
      const head = { seq: 0, hash: GENESIS_PREV_HASH };
      const base = DOCS(backend.id)[0];

      const badEntity = { ...base, entity: 'NotAThing' };
      await expect(append(backend.repo, head, badEntity)).rejects.toMatchObject({
        name: 'ValidationError',
      });

      const badRole = { ...base, actorRole: 'Root' };
      await expect(append(backend.repo, head, badRole)).rejects.toMatchObject({
        name: 'ValidationError',
      });

      // Nothing landed — both rejections were pre-insert.
      expect(await backend.repo.findChainHead()).toBeNull();
    }
  });
});
