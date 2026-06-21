/**
 * ──────────────────────────────────────────────────────────
 * PG-parity test — session-type repository (Mongo ↔ Postgres)
 * ──────────────────────────────────────────────────────────
 * Whole-repository port of the metadata catalog. Runs only when a Postgres URL
 * is present (CI sets PG_URL; locally PG_PROTOTYPE_URL → Neon); SKIPS otherwise.
 * Asserts identical behaviour: create defaults, list order (display_order),
 * findByIdLean live/null, updateById, soft-delete hides the row, maxOrder over
 * live rows. `order` maps to the `display_order` column.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env.pg-prototype') });
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const PG_URL = process.env.PG_URL || process.env.PG_PROTOTYPE_URL;
const describePg = PG_URL ? describe : describe.skip;

const { query, closePool } = require('../../config/pg');
const typeRepo = require('../../domains/session-type/repository');

const hex = (n) => n.toString(16).padStart(24, '0');
const TYPES = [{ name: 'Alpha', order: 0 }, { name: 'Bravo', order: 1 }, { name: 'Charlie', order: 2 }, { name: 'Delta', order: 3 }];
const ids = { mongo: {}, pg: {} };

const both = (fn) => Promise.all([fn(typeRepo.impls.mongo), fn(typeRepo.impls.pg)]);
const proj = (t) => (t == null ? null : {
  name: t.name, color: t.color, defaultDurationMin: t.defaultDurationMin,
  defaultCapacity: t.defaultCapacity, order: t.order,
});

describePg('PG-parity: session-type repository (metadata catalog)', () => {
  let mem;

  beforeAll(async () => {
    mem = await MongoMemoryServer.create();
    await mongoose.connect(mem.getUri());
    await query('TRUNCATE session_types');
    for (const t of TYPES) {
      // eslint-disable-next-line no-await-in-loop
      const [m, p] = await both((r) => r.create({ name: t.name, order: t.order, color: '#111111' }));
      ids.mongo[t.name] = m._id;
      ids.pg[t.name] = p._id;
    }
  }, 60_000);

  afterAll(async () => {
    if (mongoose.connection.readyState) await mongoose.disconnect();
    if (mem) await mem.stop();
    await closePool();
  });

  test('list: live rows in display_order — identical sequence', async () => {
    const [m, p] = await both((r) => r.list());
    expect(m.map((t) => t.name)).toEqual(['Alpha', 'Bravo', 'Charlie', 'Delta']);
    expect(p.map(proj)).toEqual(m.map(proj));
  });

  test('findByIdLean: live → fields; missing → null (both)', async () => {
    const m = await typeRepo.impls.mongo.findByIdLean(ids.mongo.Alpha);
    const p = await typeRepo.impls.pg.findByIdLean(ids.pg.Alpha);
    expect(proj(m)).toEqual({ name: 'Alpha', color: '#111111', defaultDurationMin: 60, defaultCapacity: null, order: 0 });
    expect(proj(p)).toEqual(proj(m));
    expect(await typeRepo.impls.mongo.findByIdLean(hex(999001))).toBeNull();
    expect(await typeRepo.impls.pg.findByIdLean(hex(999001))).toBeNull();
  });

  test('maxOrder: highest live display_order — identical', async () => {
    const [m, p] = await both((r) => r.maxOrder());
    expect(m).toBe(3);
    expect(p).toBe(3);
  });

  test('updateById: normalizes + returns updated — identical', async () => {
    const upd = await Promise.all([
      typeRepo.impls.mongo.updateById(ids.mongo.Bravo, { color: '  #222222 ', defaultCapacity: 25 }),
      typeRepo.impls.pg.updateById(ids.pg.Bravo, { color: '  #222222 ', defaultCapacity: 25 }),
    ]);
    expect(proj(upd[0])).toMatchObject({ name: 'Bravo', color: '#222222', defaultCapacity: 25, order: 1 });
    expect(proj(upd[1])).toEqual(proj(upd[0]));
  });

  test('softDelete: hides the row from reads + drops maxOrder/list — identical', async () => {
    await Promise.all([
      typeRepo.impls.mongo.softDelete(ids.mongo.Delta),
      typeRepo.impls.pg.softDelete(ids.pg.Delta),
    ]);
    expect(await typeRepo.impls.mongo.findByIdLean(ids.mongo.Delta)).toBeNull();
    expect(await typeRepo.impls.pg.findByIdLean(ids.pg.Delta)).toBeNull();
    const [ml, pl] = await both((r) => r.list());
    expect(ml.map((t) => t.name)).toEqual(['Alpha', 'Bravo', 'Charlie']); // Delta gone
    expect(pl.map((t) => t.name)).toEqual(ml.map((t) => t.name));
    const [mo, po] = await both((r) => r.maxOrder());
    expect(mo).toBe(2); // Charlie now highest live
    expect(po).toBe(2);
  });

  test('create: schema defaults (color/duration/capacity/order) — identical', async () => {
    const [m, p] = await both((r) => r.create({ name: '  Workshop ' }));
    expect(proj(m)).toEqual({ name: 'Workshop', color: '#6366f1', defaultDurationMin: 60, defaultCapacity: null, order: 0 });
    expect(proj(p)).toEqual(proj(m));
  });
});
