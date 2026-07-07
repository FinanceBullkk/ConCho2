/**
 * ──────────────────────────────────────────────────────────
 * PG-parity test — settings repository (Mongo ↔ Postgres)
 * ──────────────────────────────────────────────────────────
 * settingController's read/upsert surface (B4). Runs only when a Postgres URL
 * is present; SKIPS otherwise. Asserts identical behaviour + traps:
 *   • upsertMany is upsert-by-key: insert when missing, $set value only on
 *     update (an existing row keeps its description)
 *   • value jsonb round-trips arrays/objects/scalars
 *   • findByKeys returns only the requested keys
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env.pg-prototype') });
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const PG_URL = process.env.PG_URL || process.env.PG_PROTOTYPE_URL;
const describePg = PG_URL ? describe : describe.skip;

const { query, closePool } = require('../../config/pg');
const repo = require('../../domains/settings/repository');

const hex = (n) => n.toString(16).padStart(24, '0');
const oid = (h) => new mongoose.Types.ObjectId(h);
const coll = (m) => mongoose.model(m).collection.name;
const norm = (x) => (x == null ? null : JSON.parse(JSON.stringify(x)));
const proj = (s) => { const n = norm(s); return { key: n.key, value: n.value, description: n.description || '' }; };

const S1 = hex(0xb01);

describePg('PG-parity: settings repository', () => {
  let mem;

  beforeAll(async () => {
    mem = await MongoMemoryServer.create();
    await mongoose.connect(mem.getUri());
    const db = mongoose.connection.db;

    const seed = { _id: oid(S1), key: 'ALLOWED_TIME_SLOTS', value: [{ start: '10:00', end: '11:00' }], description: 'booking windows' };
    await db.collection(coll('Setting')).insertOne(seed);

    await query('TRUNCATE settings');
    await query(
      'INSERT INTO settings(id, key, value, description) VALUES ($1, $2, $3::jsonb, $4)',
      [S1, seed.key, JSON.stringify(seed.value), seed.description]);
  }, 60_000);

  afterAll(async () => {
    if (mongoose.connection.readyState) await mongoose.disconnect();
    if (mem) await mem.stop();
    await closePool();
  });

  const both = (fn) => Promise.all([fn(repo.impls.mongo), fn(repo.impls.pg)]);

  test('findAll + findByKeys — identical', async () => {
    const [mA, pA] = await both((r) => r.findAll());
    expect(mA.map(proj)).toEqual([{ key: 'ALLOWED_TIME_SLOTS', value: [{ start: '10:00', end: '11:00' }], description: 'booking windows' }]);
    expect(pA.map(proj)).toEqual(mA.map(proj));

    const [mK, pK] = await both((r) => r.findByKeys(['ALLOWED_TIME_SLOTS', 'MISSING_KEY']));
    expect(mK).toHaveLength(1);
    expect(pK.map(proj)).toEqual(mK.map(proj));
  });

  test('upsertMany: update keeps description; insert creates fresh row — identical', async () => {
    await both((r) => r.upsertMany([
      { key: 'ALLOWED_TIME_SLOTS', value: [] },        // update (empty = booking disabled)
      { key: 'NEW_FLAG', value: { enabled: true } },   // insert
    ]));
    const [m, p] = await both((r) => r.findByKeys(['ALLOWED_TIME_SLOTS', 'NEW_FLAG']));
    const byKey = (rows) => Object.fromEntries(rows.map((r) => [r.key, proj(r)]));
    const mB = byKey(m); const pB = byKey(p);
    expect(mB.ALLOWED_TIME_SLOTS).toEqual({ key: 'ALLOWED_TIME_SLOTS', value: [], description: 'booking windows' });
    expect(mB.NEW_FLAG.value).toEqual({ enabled: true });
    expect(pB).toEqual(mB);
  });
});
