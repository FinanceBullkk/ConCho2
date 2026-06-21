/**
 * ──────────────────────────────────────────────────────────
 * PG-parity test — learning/path repository (Mongo ↔ Postgres)
 * ──────────────────────────────────────────────────────────
 * LearningPath CRUD with the ORDERED programs array-populate. Runs only when a
 * Postgres URL is present; SKIPS otherwise. Asserts: create → ordered program
 * summary embed; findByIdLean (populated) vs findById (raw ids); list filter +
 * title order; update reorders programs; soft-delete hides + archives; unique code.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env.pg-prototype') });
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const PG_URL = process.env.PG_URL || process.env.PG_PROTOTYPE_URL;
const describePg = PG_URL ? describe : describe.skip;

const { query, closePool } = require('../../config/pg');
require('../../models/LearningProgram'); // populate('programs') ref not loaded by the path repo
const repo = require('../../domains/learning/path/repository');

const hex = (n) => n.toString(16).padStart(24, '0');
const oid = (h) => new mongoose.Types.ObjectId(h);
const coll = (m) => mongoose.model(m).collection.name;
const norm = (x) => (x == null ? null : JSON.parse(JSON.stringify(x)));
const PA = hex(501); const PB = hex(502); const PC = hex(503);

const both = (fn) => Promise.all([fn(repo.impls.mongo), fn(repo.impls.pg)]);
const pproj = (raw) => { const x = norm(raw); return x == null ? null : {
  code: x.code, title: x.title, description: x.description, status: x.status,
  programs: (x.programs || []).map((p) => (p && p.code !== undefined ? { code: p.code, name: p.name } : String(p))),
}; };

describePg('PG-parity: learning/path repository', () => {
  let mem;
  const id = {};

  beforeAll(async () => {
    mem = await MongoMemoryServer.create();
    await mongoose.connect(mem.getUri());
    await mongoose.model('LearningPath').init(); // unique code
    await mongoose.model('LearningProgram').init();
    const db = mongoose.connection.db;
    const progs = [
      { _id: oid(PA), code: 'PA', name: 'Prog A', category: 'technical', status: 'active', schedulingMode: 'self_enroll' },
      { _id: oid(PB), code: 'PB', name: 'Prog B', category: 'onboarding', status: 'active', schedulingMode: 'admin_scheduled' },
      { _id: oid(PC), code: 'PC', name: 'Prog C', category: 'compliance', status: 'archived', schedulingMode: 'nomination' },
    ];
    await db.collection(coll('LearningProgram')).insertMany(progs);
    await query('TRUNCATE learning_paths, learning_programs');
    await query(
      `INSERT INTO learning_programs(id,code,name,category,status,scheduling_mode) VALUES
        ($1,'PA','Prog A','technical','active','self_enroll'),($2,'PB','Prog B','onboarding','active','admin_scheduled'),($3,'PC','Prog C','compliance','archived','nomination')`,
      [PA, PB, PC]);

    const [m1, p1] = await both((r) => r.create({ code: 'path-a', title: 'Alpha Path', programs: [PA, PB] }));
    const [m2, p2] = await both((r) => r.create({ code: 'path-b', title: 'Beta Path', programs: [PC] }));
    id.m1 = m1._id; id.p1 = p1._id; id.m2 = m2._id; id.p2 = p2._id;
  }, 60_000);

  afterAll(async () => {
    if (mongoose.connection.readyState) await mongoose.disconnect();
    if (mem) await mem.stop();
    await closePool();
  });

  test('create: code uppercased, ORDERED program summary embed — identical', async () => {
    const [m, p] = await both((r) => r.findByIdLean(r === repo.impls.pg ? id.p1 : id.m1));
    expect(pproj(m)).toEqual({
      code: 'PATH-A', title: 'Alpha Path', description: '', status: 'active',
      programs: [{ code: 'PA', name: 'Prog A' }, { code: 'PB', name: 'Prog B' }], // order preserved
    });
    expect(pproj(p)).toEqual(pproj(m));
  });

  test('findById returns raw program ids (un-populated) — identical', async () => {
    const [m, p] = await both((r) => r.findById(r === repo.impls.pg ? id.p1 : id.m1));
    expect(pproj(m).programs).toEqual([PA, PB]); // raw ids, ordered
    expect(pproj(p).programs).toEqual(pproj(m).programs);
  });

  test('list: filter + title order + populate — identical', async () => {
    const [m, p] = await both((r) => r.list({}));
    expect(m.map((x) => x.title)).toEqual(['Alpha Path', 'Beta Path']); // title asc
    expect(p.map(pproj)).toEqual(m.map(pproj));
    const [ms, ps] = await both((r) => r.list({ search: 'beta' }));
    expect(ms.map((x) => x.code)).toEqual(['PATH-B']);
    expect(ps.map(pproj)).toEqual(ms.map(pproj));
  });

  test('updateById reorders programs; softDelete hides + archives — identical', async () => {
    const upd = await Promise.all([
      repo.impls.mongo.updateById(id.m1, { programs: [PB, PA] }),
      repo.impls.pg.updateById(id.p1, { programs: [PB, PA] }),
    ]);
    expect(pproj(upd[0]).programs).toEqual([{ code: 'PB', name: 'Prog B' }, { code: 'PA', name: 'Prog A' }]);
    expect(pproj(upd[1])).toEqual(pproj(upd[0]));

    await Promise.all([repo.impls.mongo.softDelete(id.m2), repo.impls.pg.softDelete(id.p2)]);
    expect(await repo.impls.mongo.findByIdLean(id.m2)).toBeNull(); // hidden
    expect(await repo.impls.pg.findByIdLean(id.p2)).toBeNull();
  });

  test('unique code rejected on both backends', async () => {
    await expect(repo.impls.mongo.create({ code: 'PATH-A', title: 'Dup' })).rejects.toBeDefined();
    await expect(repo.impls.pg.create({ code: 'PATH-A', title: 'Dup' })).rejects.toBeDefined();
  });
});
