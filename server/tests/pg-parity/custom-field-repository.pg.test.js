/**
 * ──────────────────────────────────────────────────────────
 * PG-parity test — custom-field repository (Mongo ↔ Postgres)
 * ──────────────────────────────────────────────────────────
 * Custom field definition CRUD + drag-reorder. Runs only when a Postgres URL is
 * present; SKIPS otherwise. Asserts identical behaviour + traps:
 *   • list sort (entity asc, order asc, createdAt asc) + soft-delete excluded +
 *     entity filter
 *   • create applies defaults (type/options/showIn/required/order) + lowercases key
 *   • (entity,key) live-row unique → both reject { code: 11000 } on create AND on a
 *     key-collision update; a key freed by soft-delete can be re-created
 *   • updateById / softDelete hide soft-deleted; reorder rewrites display_order
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env.pg-prototype') });
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const PG_URL = process.env.PG_URL || process.env.PG_PROTOTYPE_URL;
const describePg = PG_URL ? describe : describe.skip;

const { query, closePool } = require('../../config/pg');
const repo = require('../../domains/custom-field/repository');

const hex = (n) => n.toString(16).padStart(24, '0');
const oid = (h) => new mongoose.Types.ObjectId(h);
const coll = (m) => mongoose.model(m).collection.name;
const day = (n) => new Date(Date.UTC(2026, 0, n, 0, 0, 0));
const norm = (x) => (x == null ? null : JSON.parse(JSON.stringify(x)));

const D1 = hex(501); const D2 = hex(502); const D3 = hex(503); const DD = hex(504);

const proj = (d) => {
  const o = norm(d);
  return o == null ? null : {
    entity: o.entity, key: o.key, label: o.label, type: o.type,
    options: o.options || [], showIn: o.showIn || [], required: Boolean(o.required), order: o.order || 0,
  };
};

describePg('PG-parity: custom-field repository', () => {
  let mem;

  beforeAll(async () => {
    mem = await MongoMemoryServer.create();
    await mongoose.connect(mem.getUri());
    await mongoose.model('CustomFieldDefinition').init(); // (entity,key) partial-unique
    const db = mongoose.connection.db;

    const seed = [
      { _id: oid(D1), entity: 'Program', key: 'team_size', label: 'Team Size', type: 'number', options: [], showIn: ['form'], required: true, order: 1, isDeleted: false, createdAt: day(1) },
      { _id: oid(D2), entity: 'Program', key: 'region', label: 'Region', type: 'select', options: ['North', 'South'], showIn: ['form', 'filter'], required: false, order: 0, isDeleted: false, createdAt: day(2) },
      { _id: oid(D3), entity: 'User', key: 'badge', label: 'Badge', type: 'text', options: [], showIn: ['form'], required: false, order: 0, isDeleted: false, createdAt: day(3) },
      { _id: oid(DD), entity: 'Program', key: 'gone', label: 'Gone', type: 'text', options: [], showIn: ['form'], required: false, order: 0, isDeleted: true, createdAt: day(4) },
    ];
    await db.collection(coll('CustomFieldDefinition')).insertMany(seed);

    await query('TRUNCATE custom_field_definitions');
    for (const d of seed) {
      // eslint-disable-next-line no-await-in-loop
      await query(
        `INSERT INTO custom_field_definitions(id,entity,key,label,type,options,show_in,required,display_order,is_deleted,created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [String(d._id), d.entity, d.key, d.label, d.type, d.options, d.showIn, d.required, d.order, d.isDeleted, d.createdAt.toISOString()]);
    }
  }, 60_000);

  afterAll(async () => {
    if (mongoose.connection.readyState) await mongoose.disconnect();
    if (mem) await mem.stop();
    await closePool();
  });

  const both = (fn) => Promise.all([fn(repo.impls.mongo), fn(repo.impls.pg)]);

  test('list: sort (entity,order,createdAt) + soft-delete excluded + entity filter — identical', async () => {
    const [mAll, pAll] = await both((r) => r.list({}));
    // Program(region order0), Program(team_size order1), User(badge order0); 'gone' deleted out.
    expect(mAll.map(proj).map((f) => f.key)).toEqual(['region', 'team_size', 'badge']);
    expect(pAll.map(proj)).toEqual(mAll.map(proj));

    const [mP, pP] = await both((r) => r.list({ entity: 'Program' }));
    expect(mP.map(proj).map((f) => f.key)).toEqual(['region', 'team_size']);
    expect(pP.map(proj)).toEqual(mP.map(proj));
  });

  test('findByIdLean: found + soft-deleted hidden — identical', async () => {
    const [m1, p1] = await both((r) => r.findByIdLean(D1));
    expect(proj(m1)).toEqual({ entity: 'Program', key: 'team_size', label: 'Team Size', type: 'number', options: [], showIn: ['form'], required: true, order: 1 });
    expect(proj(p1)).toEqual(proj(m1));
    expect(await repo.impls.mongo.findByIdLean(DD)).toBeNull(); // deleted hidden
    expect(await repo.impls.pg.findByIdLean(DD)).toBeNull();
  });

  test('create: defaults applied + key lowercased; re-create a soft-deleted key works — identical', async () => {
    const [mNew, pNew] = await both((r) => r.create({ entity: 'Program', key: 'New_Field', label: 'New Field' }));
    // minimal payload → defaults type text / options [] / showIn ['form'] / required false / order 0; key lowercased.
    const expected = { entity: 'Program', key: 'new_field', label: 'New Field', type: 'text', options: [], showIn: ['form'], required: false, order: 0 };
    expect(proj(mNew)).toEqual(expected);
    expect(proj(pNew)).toEqual(proj(mNew));

    // 'gone' is soft-deleted (DD) → the live partial-unique lets it be re-created.
    const [mG, pG] = await both((r) => r.create({ entity: 'Program', key: 'gone', label: 'Reborn' }));
    expect(proj(mG).key).toBe('gone');
    expect(proj(pG).key).toBe('gone');
  });

  test('create + update key-collision → both reject { code: 11000 } — identical', async () => {
    // live (Program, team_size) already exists (D1) → duplicate create rejects.
    await expect(repo.impls.mongo.create({ entity: 'Program', key: 'team_size', label: 'Dup' })).rejects.toMatchObject({ code: 11000 });
    await expect(repo.impls.pg.create({ entity: 'Program', key: 'team_size', label: 'Dup' })).rejects.toMatchObject({ code: 11000 });

    // renaming D2 (region) onto the live key 'team_size' collides → rejects (D2 unchanged).
    await expect(repo.impls.mongo.updateById(D2, { key: 'team_size' })).rejects.toMatchObject({ code: 11000 });
    await expect(repo.impls.pg.updateById(D2, { key: 'team_size' })).rejects.toMatchObject({ code: 11000 });
  });

  test('updateById: patch fields + soft-deleted not updatable — identical', async () => {
    const [mU, pU] = await both((r) => r.updateById(D1, { label: 'Renamed', required: false, order: 5 }));
    expect(proj(mU)).toMatchObject({ key: 'team_size', label: 'Renamed', required: false, order: 5 });
    expect(proj(pU)).toEqual(proj(mU));
    expect(await repo.impls.mongo.updateById(DD, { label: 'X' })).toBeNull(); // deleted → no-op null
    expect(await repo.impls.pg.updateById(DD, { label: 'X' })).toBeNull();
  });

  test('reorder: display_order rewritten by index — identical', async () => {
    await both((r) => r.reorder('Program', [D2, D1])); // D2→0, D1→1
    const [mD1, pD1] = await both((r) => r.findByIdLean(D1));
    const [mD2, pD2] = await both((r) => r.findByIdLean(D2));
    expect(proj(mD1).order).toBe(1); expect(proj(pD1).order).toBe(1);
    expect(proj(mD2).order).toBe(0); expect(proj(pD2).order).toBe(0);
  });

  test('softDelete: hides the row + entity list shrinks — identical', async () => {
    const [mS, pS] = await both((r) => r.softDelete(D3));
    expect(norm(mS).isDeleted).toBe(true);
    expect(norm(pS).isDeleted).toBe(true);
    expect(await repo.impls.mongo.findByIdLean(D3)).toBeNull();
    expect(await repo.impls.pg.findByIdLean(D3)).toBeNull();
    const [mU, pU] = await both((r) => r.list({ entity: 'User' }));
    expect(mU.map(proj)).toEqual([]); // only field for User was D3
    expect(pU.map(proj)).toEqual([]);
  });
});
