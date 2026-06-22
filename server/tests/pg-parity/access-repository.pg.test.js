/**
 * ──────────────────────────────────────────────────────────
 * PG-parity test — access (roles) repository (Mongo ↔ Postgres)
 * ──────────────────────────────────────────────────────────
 * Role CRUD. Runs only when a Postgres URL is present; SKIPS otherwise. Asserts:
 * create defaults; listLive order (system desc, key asc) excluding soft-deleted;
 * findByKey; updateByKey; key partial-unique among live + reusable after soft-delete.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env.pg-prototype') });
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const PG_URL = process.env.PG_URL || process.env.PG_PROTOTYPE_URL;
const describePg = PG_URL ? describe : describe.skip;

const { query, closePool } = require('../../config/pg');
const repo = require('../../domains/access/repository');

const both = (fn) => Promise.all([fn(repo.impls.mongo), fn(repo.impls.pg)]);
const rproj = (r) => (r == null ? null : { key: r.key, name: r.name, system: r.system, capabilities: (r.capabilities || []).map(String).sort() });

describePg('PG-parity: access (roles) repository', () => {
  let mem;

  beforeAll(async () => {
    mem = await MongoMemoryServer.create();
    await mongoose.connect(mem.getUri());
    await mongoose.model('Role').init(); // partial-unique key
    await query('TRUNCATE roles');
    await both((r) => r.create({ key: 'admin', name: 'Admin', system: true, capabilities: ['user.manage', 'role.manage'] }));
    await both((r) => r.create({ key: 'editor', name: 'Editor', capabilities: ['program.manage'] }));
  }, 60_000);

  afterAll(async () => {
    if (mongoose.connection.readyState) await mongoose.disconnect();
    if (mem) await mem.stop();
    await closePool();
  });

  test('create defaults (system false, caps) + findByKey — identical', async () => {
    const [m, p] = await both((r) => r.findByKey('editor'));
    expect(rproj(m)).toEqual({ key: 'editor', name: 'Editor', system: false, capabilities: ['program.manage'] });
    expect(rproj(p)).toEqual(rproj(m));
    expect(await repo.impls.mongo.findByKey('nope')).toBeNull();
    expect(await repo.impls.pg.findByKey('nope')).toBeNull();
  });

  test('listLive: system roles first, then key asc — identical', async () => {
    const [m, p] = await both((r) => r.listLive());
    expect(m.map((r) => r.key)).toEqual(['admin', 'editor']); // system(admin) first, then key asc
    expect(p.map(rproj)).toEqual(m.map(rproj));
  });

  test('updateByKey patches capabilities — identical', async () => {
    const upd = await Promise.all([
      repo.impls.mongo.updateByKey('editor', { capabilities: ['program.manage', 'cohort.manage'] }),
      repo.impls.pg.updateByKey('editor', { capabilities: ['program.manage', 'cohort.manage'] }),
    ]);
    expect(rproj(upd[0]).capabilities).toEqual(['cohort.manage', 'program.manage']);
    expect(rproj(upd[1])).toEqual(rproj(upd[0]));
  });

  test('key partial-unique among live + reusable after soft-delete — both', async () => {
    await expect(repo.impls.mongo.create({ key: 'admin', name: 'Dup' })).rejects.toBeDefined();
    await expect(repo.impls.pg.create({ key: 'admin', name: 'Dup' })).rejects.toBeDefined();

    await both((r) => r.softDeleteByKey('editor'));
    expect(await repo.impls.mongo.findByKey('editor')).toBeNull(); // hidden
    expect(await repo.impls.pg.findByKey('editor')).toBeNull();
    const [m2, p2] = await both((r) => r.create({ key: 'editor', name: 'Editor 2' })); // key freed
    expect(rproj(m2).name).toBe('Editor 2');
    expect(rproj(p2).name).toBe('Editor 2');
  });
});
