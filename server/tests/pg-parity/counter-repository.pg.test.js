/**
 * ──────────────────────────────────────────────────────────
 * PG-parity test — atomic sequence counter (Mongo ↔ Postgres)
 * ──────────────────────────────────────────────────────────
 * helpers/counter.getNextSequence — certificate numbering, empCode, classCode.
 * Runs only when a Postgres URL is present; SKIPS otherwise. Asserts identical
 * behaviour + traps:
 *   • fresh key starts at 1 (Mongo $inc-upsert ⇔ PG INSERT ON CONFLICT)
 *   • sequential calls increment 2, 3, … with no gaps
 *   • independent keys don't share a sequence
 *   • N concurrent calls → N DISTINCT values (atomicity, the whole point)
 *   • PG returns a Number (bigint→string coercion is normalized)
 *   • PG gapless-per-commit: a rolled-back transaction returns its number
 *     (the SEQUENCE-vs-row-lock owner decision, mig 033)
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env.pg-prototype') });
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const PG_URL = process.env.PG_URL || process.env.PG_PROTOTYPE_URL;
const describePg = PG_URL ? describe : describe.skip;

const { query, closePool, getPool } = require('../../config/pg');
const { impls } = require('../../helpers/counter');

describePg('PG-parity: counter (getNextSequence)', () => {
  let mem;

  beforeAll(async () => {
    mem = await MongoMemoryServer.create();
    await mongoose.connect(mem.getUri());
    await query('TRUNCATE counters');
  }, 60_000);

  afterAll(async () => {
    if (mongoose.connection.readyState) await mongoose.disconnect();
    if (mem) await mem.stop();
    await closePool();
  });

  const both = (fn) => Promise.all([fn(impls.mongo), fn(impls.pg)]);

  test('fresh key → 1; sequential calls → 2, 3 (no gaps) — identical', async () => {
    const [m1, p1] = await both((r) => r.getNextSequence('certificateNumber'));
    expect(m1).toBe(1); expect(p1).toBe(1);
    expect(typeof p1).toBe('number'); // bigint→string coercion normalized

    const [m2, p2] = await both((r) => r.getNextSequence('certificateNumber'));
    const [m3, p3] = await both((r) => r.getNextSequence('certificateNumber'));
    expect([m2, m3]).toEqual([2, 3]);
    expect([p2, p3]).toEqual([2, 3]);
  });

  test('independent keys keep independent sequences — identical', async () => {
    const [mA, pA] = await both((r) => r.getNextSequence('empCode'));
    expect(mA).toBe(1); expect(pA).toBe(1);
    // certificateNumber (at 3) untouched by empCode's increment.
    const [mC, pC] = await both((r) => r.getNextSequence('certificateNumber'));
    expect(mC).toBe(4); expect(pC).toBe(4);
  });

  test('N concurrent calls → N distinct values (atomic, no duplicates) — both backends', async () => {
    const N = 10;
    const run = async (r, key) => {
      const seqs = await Promise.all(Array.from({ length: N }, () => r.getNextSequence(key)));
      return seqs.sort((a, b) => a - b);
    };
    const [m, p] = await Promise.all([
      run(impls.mongo, 'concurrent-mongo'),
      run(impls.pg, 'concurrent-pg'),
    ]);
    const expected = Array.from({ length: N }, (_, i) => i + 1);
    expect(m).toEqual(expected);
    expect(p).toEqual(expected);
  });

  test('PG: increment inside a rolled-back transaction leaves no gap', async () => {
    await impls.pg.getNextSequence('gapless'); // → 1
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `INSERT INTO counters(id, seq) VALUES ($1, 1)
         ON CONFLICT (id) DO UPDATE SET seq = counters.seq + 1 RETURNING seq`,
        ['gapless']
      );
      expect(Number(rows[0].seq)).toBe(2); // handed out inside the tx…
      await client.query('ROLLBACK');       // …then the issuance fails
    } finally {
      client.release();
    }
    // The number is NOT burned — the next commit re-issues 2 (Mongo-style
    // gapless-per-commit; a PG SEQUENCE would have skipped to 3).
    expect(await impls.pg.getNextSequence('gapless')).toBe(2);
  });
});
