/**
 * ──────────────────────────────────────────────────────────
 * PG-parity test — automation repository (Mongo ↔ Postgres)
 * ──────────────────────────────────────────────────────────
 * AutomationRule CRUD + the runner's enabled-by-trigger hot path + recordRun.
 * Runs only when a Postgres URL is present; SKIPS otherwise. Asserts identical
 * behaviour + traps:
 *   • listLive order (system desc, name asc) + soft-delete excluded
 *   • findEnabledByTrigger filters enabled + trigger + live
 *   • create defaults (enabled false, system false, conditions/actions [])
 *   • update/softDelete hide soft-deleted; recordRun increments runCount
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env.pg-prototype') });
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const PG_URL = process.env.PG_URL || process.env.PG_PROTOTYPE_URL;
const describePg = PG_URL ? describe : describe.skip;

const { query, closePool } = require('../../config/pg');
const repo = require('../../domains/automation/repository');

const hex = (n) => n.toString(16).padStart(24, '0');
const oid = (h) => new mongoose.Types.ObjectId(h);
const coll = (m) => mongoose.model(m).collection.name;
const norm = (x) => (x == null ? null : JSON.parse(JSON.stringify(x)));

const R1 = hex(711); const R2 = hex(712); const R3 = hex(713); const RD = hex(714);

const proj = (r) => {
  const o = norm(r);
  return o == null ? null : {
    name: o.name, trigger: o.trigger, conditions: o.conditions || [], actions: o.actions || [],
    enabled: o.enabled, system: o.system, runCount: o.runCount,
  };
};

describePg('PG-parity: automation repository', () => {
  let mem;

  beforeAll(async () => {
    mem = await MongoMemoryServer.create();
    await mongoose.connect(mem.getUri());
    const db = mongoose.connection.db;

    const seed = [
      { _id: oid(R1), name: 'Beta rule', trigger: 'ENROLLMENT_CREATED', conditions: [{ field: 'mode', op: 'eq', value: 'group' }], actions: [{ type: 'log', params: {} }], enabled: true, runCount: 2, system: false, isDeleted: false },
      { _id: oid(R2), name: 'Alpha rule', trigger: 'ENROLLMENT_CREATED', conditions: [], actions: [{ type: 'notify', params: { to: 'admin' } }], enabled: false, runCount: 0, system: true, isDeleted: false },
      { _id: oid(R3), name: 'Gamma rule', trigger: 'CERTIFICATE_ISSUED', conditions: [], actions: [], enabled: true, runCount: 5, system: false, isDeleted: false },
      { _id: oid(RD), name: 'Dead rule', trigger: 'ENROLLMENT_CREATED', conditions: [], actions: [], enabled: true, runCount: 0, system: false, isDeleted: true },
    ];
    await db.collection(coll('AutomationRule')).insertMany(seed);

    await query('TRUNCATE automation_rules');
    for (const r of seed) {
      // eslint-disable-next-line no-await-in-loop
      await query(
        `INSERT INTO automation_rules(id,name,trigger,conditions,actions,enabled,run_count,system,is_deleted)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [String(r._id), r.name, r.trigger, JSON.stringify(r.conditions), JSON.stringify(r.actions), r.enabled, r.runCount, r.system, r.isDeleted]);
    }
  }, 60_000);

  afterAll(async () => {
    if (mongoose.connection.readyState) await mongoose.disconnect();
    if (mem) await mem.stop();
    await closePool();
  });

  const both = (fn) => Promise.all([fn(repo.impls.mongo), fn(repo.impls.pg)]);

  test('listLive: order (system desc, name asc) + soft-delete excluded — identical', async () => {
    const [m, p] = await both((r) => r.listLive());
    // system rule (Alpha) first, then non-system by name asc (Beta, Gamma); Dead excluded.
    expect(m.map((r) => proj(r).name)).toEqual(['Alpha rule', 'Beta rule', 'Gamma rule']);
    expect(p.map(proj)).toEqual(m.map(proj));
  });

  test('findById + findEnabledByTrigger — identical', async () => {
    const [m1, p1] = await both((r) => r.findById(R1));
    expect(proj(m1)).toEqual({ name: 'Beta rule', trigger: 'ENROLLMENT_CREATED', conditions: [{ field: 'mode', op: 'eq', value: 'group' }], actions: [{ type: 'log', params: {} }], enabled: true, system: false, runCount: 2 });
    expect(proj(p1)).toEqual(proj(m1));
    expect(await repo.impls.mongo.findById(RD)).toBeNull(); // deleted hidden
    expect(await repo.impls.pg.findById(RD)).toBeNull();

    // enabled + trigger + live → only R1 (R2 disabled, RD deleted)
    const [mE, pE] = await both((r) => r.findEnabledByTrigger('ENROLLMENT_CREATED'));
    expect(mE.map((r) => proj(r).name)).toEqual(['Beta rule']);
    expect(pE.map(proj)).toEqual(mE.map(proj));
  });

  test('create: defaults (enabled/system false, conditions/actions []) — identical', async () => {
    const [m, p] = await both((r) => r.create({ name: 'New rule', trigger: 'SESSION_BOOKED' }));
    expect(proj(m)).toEqual({ name: 'New rule', trigger: 'SESSION_BOOKED', conditions: [], actions: [], enabled: false, system: false, runCount: 0 });
    expect(proj(p)).toEqual(proj(m));
  });

  test('updateById + softDelete hide soft-deleted; recordRun increments — identical', async () => {
    const [mU, pU] = await both((r) => r.updateById(R3, { enabled: false, conditions: [{ field: 'x', op: 'gt', value: 5 }] }));
    expect(proj(mU)).toMatchObject({ enabled: false, conditions: [{ field: 'x', op: 'gt', value: 5 }] });
    expect(proj(pU)).toEqual(proj(mU));
    expect(await repo.impls.mongo.updateById(RD, { enabled: false })).toBeNull(); // deleted → null
    expect(await repo.impls.pg.updateById(RD, { enabled: false })).toBeNull();

    await both((r) => r.recordRun(R1)); // 2 → 3 on both
    const [mR, pR] = await both((r) => r.findById(R1));
    expect(proj(mR).runCount).toBe(3); expect(proj(pR).runCount).toBe(3);

    const [mD, pD] = await both((r) => r.softDeleteById(R1));
    expect(norm(mD).isDeleted).toBe(true); expect(norm(pD).isDeleted).toBe(true);
    expect(await repo.impls.mongo.findById(R1)).toBeNull();
    expect(await repo.impls.pg.findById(R1)).toBeNull();
  });

  test('upsertSystemRuleByName (A8 seed): inserts when missing, never clobbers, never resurrects — identical', async () => {
    const rule = { name: 'Seeded sys rule', trigger: 'ENROLLMENT_CREATED', conditions: [], actions: [{ type: 'log', params: {} }], enabled: false, system: true };
    const find = () => both((r) => r.listLive().then((rows) => rows.find((x) => x.name === rule.name) || null));

    await both((r) => r.upsertSystemRuleByName(rule));
    let [m, p] = await find();
    // KNOWN benign divergence: Mongoose `minimize` strips an EMPTY params {}
    // on write (row has {type:'log'}), PG jsonb stores it verbatim. Consumers
    // read `action.params?.x`, so behaviour is identical — normalize here.
    const normParams = (x) => ({ ...x, actions: (x.actions || []).map((a) => ({ ...a, params: a.params || {} })) });
    const want = { name: 'Seeded sys rule', trigger: 'ENROLLMENT_CREATED', conditions: [], actions: [{ type: 'log', params: {} }], enabled: false, system: true, runCount: 0 };
    expect(normParams(proj(m))).toEqual(want);
    expect(normParams(proj(p))).toEqual(want);

    // Re-seed with a different payload → the ORIGINAL row is kept
    // ($setOnInsert ⇔ INSERT…WHERE NOT EXISTS).
    await both((r) => r.upsertSystemRuleByName({ ...rule, actions: [{ type: 'notify', params: { to: 'x' } }], enabled: true }));
    ;[m, p] = await find();
    expect(normParams(proj(m)).actions).toEqual([{ type: 'log', params: {} }]);
    expect(proj(m).enabled).toBe(false);
    expect(normParams(proj(p))).toEqual(normParams(proj(m)));

    // Admin-hidden (soft-deleted) system rule is NOT resurrected on reboot —
    // the match key deliberately ignores is_deleted (Mongo filter has no
    // isDeleted predicate; the PG NOT EXISTS mirrors it).
    await repo.impls.mongo.softDeleteById(String(m._id));
    await repo.impls.pg.softDeleteById(String(p._id));
    await both((r) => r.upsertSystemRuleByName(rule));
    const [m2, p2] = await find();
    expect(m2).toBeNull(); expect(p2).toBeNull();
  });
});
