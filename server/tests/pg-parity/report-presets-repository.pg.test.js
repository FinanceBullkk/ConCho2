/**
 * ──────────────────────────────────────────────────────────
 * PG-parity test — learning/reports/presets-repository (Mongo ↔ Postgres)
 * ──────────────────────────────────────────────────────────
 * Saved report-preset CRUD. Runs only when a Postgres URL is present; SKIPS
 * otherwise. Asserts identical behaviour + traps:
 *   • soft-delete excluded on reads (isDeleted/deletedAt select:false omitted)
 *   • filters subdoc → jsonb; create/replace apply subdoc defaults; ObjectId
 *     fields round-trip as hex strings
 *   • list sort updatedAt desc + limit; update/softDelete hide soft-deleted
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env.pg-prototype') });
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const PG_URL = process.env.PG_URL || process.env.PG_PROTOTYPE_URL;
const describePg = PG_URL ? describe : describe.skip;

const { query, closePool } = require('../../config/pg');
const repo = require('../../domains/learning/reports/presets-repository');

const hex = (n) => n.toString(16).padStart(24, '0');
const oid = (h) => new mongoose.Types.ObjectId(h);
const coll = (m) => mongoose.model(m).collection.name;
const day = (n) => new Date(Date.UTC(2026, 0, n, 0, 0, 0));
const norm = (x) => (x == null ? null : JSON.parse(JSON.stringify(x)));

const D1 = hex(1311); const P1 = hex(1321); const P2 = hex(1322);
const R1 = hex(1331); const R2 = hex(1332); const RD = hex(1333);

const presetProj = (p) => {
  const o = norm(p);
  return o == null ? null : { name: o.name, kind: o.kind, schedule: o.schedule, filters: o.filters };
};

describePg('PG-parity: learning/reports/presets-repository', () => {
  let mem;

  beforeAll(async () => {
    mem = await MongoMemoryServer.create();
    await mongoose.connect(mem.getUri());
    const db = mongoose.connection.db;

    const fullFilters = { from: '2026-01-01', to: '2026-12-31', departmentId: oid(D1), role: 'Teacher', programIds: [oid(P1), oid(P2)] };
    const emptyFilters = { from: '', to: '', departmentId: null, role: '', programIds: [] };
    await db.collection(coll('ReportPreset')).insertMany([
      { _id: oid(R1), name: 'Q1 Hours', kind: 'hours', filters: fullFilters, schedule: 'quarterly', createdBy: null, isDeleted: false, updatedAt: day(1) },
      { _id: oid(R2), name: 'Compliance', kind: 'compliance', filters: emptyFilters, schedule: 'none', createdBy: null, isDeleted: false, updatedAt: day(2) },
      { _id: oid(RD), name: 'Gone', kind: 'evidence', filters: emptyFilters, schedule: 'none', isDeleted: true, updatedAt: day(3) },
    ]);

    await query('TRUNCATE report_presets');
    await query(`INSERT INTO report_presets(id,name,kind,filters,schedule,is_deleted,updated_at) VALUES
      ($1,'Q1 Hours','hours',$2,'quarterly',false,$3),
      ($4,'Compliance','compliance',$5,'none',false,$6),
      ($7,'Gone','evidence',$5,'none',true,$8)`,
    [R1, JSON.stringify({ from: '2026-01-01', to: '2026-12-31', departmentId: D1, role: 'Teacher', programIds: [P1, P2] }), day(1).toISOString(),
      R2, JSON.stringify({ from: '', to: '', departmentId: null, role: '', programIds: [] }), day(2).toISOString(),
      RD, day(3).toISOString()]);
  }, 60_000);

  afterAll(async () => {
    if (mongoose.connection.readyState) await mongoose.disconnect();
    if (mem) await mem.stop();
    await closePool();
  });

  const both = (fn) => Promise.all([fn(repo.impls.mongo), fn(repo.impls.pg)]);

  test('list (live only, updatedAt desc) + findById (deleted hidden) + filters round-trip — identical', async () => {
    const [m, p] = await both((r) => r.list());
    expect(m.map((x) => x.name)).toEqual(['Compliance', 'Q1 Hours']); // day2, day1; Gone excluded
    expect(p.map(presetProj)).toEqual(m.map(presetProj));

    const [m1, p1] = await both((r) => r.findById(R1));
    expect(presetProj(m1)).toEqual({
      name: 'Q1 Hours', kind: 'hours', schedule: 'quarterly',
      filters: { from: '2026-01-01', to: '2026-12-31', departmentId: D1, role: 'Teacher', programIds: [P1, P2] },
    });
    expect(presetProj(p1)).toEqual(presetProj(m1));
    expect(await repo.impls.mongo.findById(RD)).toBeNull();
    expect(await repo.impls.pg.findById(RD)).toBeNull();
  });

  test('create applies filters subdoc defaults (partial payload) — identical', async () => {
    // only `from` provided → other filter fields default
    const [mC, pC] = await both((r) => r.create({ name: 'New', filters: { from: '2026-06-01' } }));
    expect(presetProj(mC)).toEqual({
      name: 'New', kind: 'evidence', schedule: 'none',
      filters: { from: '2026-06-01', to: '', departmentId: null, role: '', programIds: [] },
    });
    expect(presetProj(pC)).toEqual(presetProj(mC));
  });

  test('updateById replaces filters + softDelete hides — identical', async () => {
    const [mU, pU] = await both((r) => r.updateById(R1, { name: 'Q1 Renamed', filters: { departmentId: D1 } }));
    // $set replaces the filters subdoc WITHOUT applying defaults (unlike create)
    // → only departmentId remains. PG must mirror (no normFilters on update).
    expect(presetProj(mU)).toMatchObject({ name: 'Q1 Renamed', filters: { departmentId: D1 } });
    expect(norm(mU.filters).from).toBeUndefined(); // no default filled on update
    expect(presetProj(pU)).toEqual(presetProj(mU));
    expect(await repo.impls.mongo.updateById(RD, { name: 'x' })).toBeNull(); // deleted → null
    expect(await repo.impls.pg.updateById(RD, { name: 'x' })).toBeNull();

    const [mD, pD] = await both((r) => r.softDeleteById(R2));
    expect(mD).toBeTruthy(); expect(pD).toBeTruthy();
    expect(await repo.impls.mongo.findById(R2)).toBeNull();
    expect(await repo.impls.pg.findById(R2)).toBeNull();
  });
});
