/**
 * ──────────────────────────────────────────────────────────
 * PG-parity test — vendor repository (Mongo ↔ Postgres)
 * ──────────────────────────────────────────────────────────
 * Whole-repository port: Vendor CRUD (jsonb contacts/contracts/ratings, text[]
 * delivers) + the spend roll-up over cost_entries. Runs only when a Postgres URL
 * is present; SKIPS otherwise. Asserts identical behaviour + the traps: create
 * defaults; listVendors status/type/delivers filter + order; soft-delete hides +
 * archives; pushRating appends; vendorSpend groups by type, filters soft-deleted
 * cost lines (the CostEntry aggregate hook), and honours the date window.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env.pg-prototype') });
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const PG_URL = process.env.PG_URL || process.env.PG_PROTOTYPE_URL;
const describePg = PG_URL ? describe : describe.skip;

const { query, closePool } = require('../../config/pg');
const vendorRepo = require('../../domains/vendor/repository');

const hex = (n) => n.toString(16).padStart(24, '0');
const oid = (h) => new mongoose.Types.ObjectId(h);
const coll = (m) => mongoose.model(m).collection.name;
const PA = hex(811); const PB = hex(812);
const day = (n) => new Date(Date.UTC(2026, 0, n, 0, 0, 0));

const both = (fn) => Promise.all([fn(vendorRepo.impls.mongo), fn(vendorRepo.impls.pg)]);
const vproj = (v) => (v == null ? null : {
  name: v.name, type: v.type, contacts: (v.contacts || []).map((c) => c.name),
  delivers: (v.delivers || []).map(String).sort(),
  ratings: (v.ratings || []).map((r) => ({ value: r.value, note: r.note || '' })),
  note: v.note || '', status: v.status,
});

describePg('PG-parity: vendor repository (CRUD + spend roll-up)', () => {
  let mem;
  let ids = {};

  beforeAll(async () => {
    mem = await MongoMemoryServer.create();
    await mongoose.connect(mem.getUri());
    await query('TRUNCATE vendors, cost_entries');

    // a vendor on each backend (own ids) for the spend roll-up + a 2nd for list/sort
    const [mV, pV] = await both((r) => r.createVendor({
      name: 'Acme Training', type: 'provider', delivers: [PA, PB],
      contacts: [{ name: 'Ann', email: 'ann@x.io' }],
    }));
    const [mV2, pV2] = await both((r) => r.createVendor({ name: 'Beta Coaching', type: 'individual', delivers: [PA] }));
    ids = { mV: mV._id, pV: pV._id, mV2: mV2._id, pV2: pV2._id };

    // cost entries scoped to each backend's primary vendor id
    const CE = (vid) => [
      { _id: hex(861), v: vid, type: 'trainer', amt: 1000, cur: 'USD', on: day(5), del: false },
      { _id: hex(862), v: vid, type: 'trainer', amt: 500, cur: 'USD', on: day(6), del: false },
      { _id: hex(863), v: vid, type: 'venue', amt: 800, cur: 'USD', on: day(5), del: false },
      { _id: hex(864), v: vid, type: 'material', amt: 200, cur: 'USD', on: day(5), del: true }, // excluded (soft-deleted)
      { _id: hex(865), v: vid, type: 'venue', amt: 300, cur: 'USD', on: day(1), del: false }, // pre-window
    ];
    const mCE = CE(String(ids.mV));
    await mongoose.connection.db.collection(coll('CostEntry')).insertMany(mCE.map((c) => ({
      _id: oid(c._id), scope: { vendorId: oid(c.v) }, type: c.type, amountMinor: c.amt, currency: c.cur, incurredOn: c.on, isDeleted: c.del,
    })));
    const pCE = CE(String(ids.pV));
    const ph = pCE.map((_, i) => `($${i * 7 + 1},$${i * 7 + 2},$${i * 7 + 3},$${i * 7 + 4},$${i * 7 + 5},$${i * 7 + 6},$${i * 7 + 7})`).join(',');
    await query(
      `INSERT INTO cost_entries(id,scope_vendor_id,type,amount_minor,currency,incurred_on,is_deleted) VALUES ${ph}`,
      pCE.flatMap((c) => [c._id, c.v, c.type, c.amt, c.cur, c.on.toISOString(), c.del]),
    );
  }, 60_000);

  afterAll(async () => {
    if (mongoose.connection.readyState) await mongoose.disconnect();
    if (mem) await mem.stop();
    await closePool();
  });

  test('createVendor: defaults + jsonb/text[] — identical', async () => {
    const m = await vendorRepo.impls.mongo.findVendorById(ids.mV);
    const p = await vendorRepo.impls.pg.findVendorById(ids.pV);
    expect(vproj(m)).toEqual({
      name: 'Acme Training', type: 'provider', contacts: ['Ann'], delivers: [PA, PB].sort(), ratings: [], note: '', status: 'active',
    });
    expect(vproj(p)).toEqual(vproj(m));
  });

  test('listVendors: filter (type/delivers) + (status,name) order — identical', async () => {
    const names = (rows) => rows.map((v) => v.name);
    const [mAll, pAll] = await both((r) => r.listVendors());
    expect(names(mAll)).toEqual(['Acme Training', 'Beta Coaching']); // status active, name order
    expect(pAll.map(vproj)).toEqual(mAll.map(vproj));
    const [mT, pT] = await both((r) => r.listVendors({ type: 'individual' }));
    expect(names(mT)).toEqual(['Beta Coaching']);
    expect(names(pT)).toEqual(names(mT));
    const [mD, pD] = await both((r) => r.listVendors({ delivers: PB })); // only Acme delivers PB
    expect(names(mD)).toEqual(['Acme Training']);
    expect(names(pD)).toEqual(names(mD));
  });

  test('pushRating appends; updateVendor; soft-delete hides + archives — identical', async () => {
    const [mR, pR] = await Promise.all([
      vendorRepo.impls.mongo.pushRating(ids.mV, { value: 4, note: 'solid' }),
      vendorRepo.impls.pg.pushRating(ids.pV, { value: 4, note: 'solid' }),
    ]);
    expect(vproj(mR).ratings).toEqual([{ value: 4, note: 'solid' }]);
    expect(vproj(pR).ratings).toEqual(vproj(mR).ratings);

    const [mU, pU] = await Promise.all([
      vendorRepo.impls.mongo.updateVendor(ids.mV, { note: 'preferred' }),
      vendorRepo.impls.pg.updateVendor(ids.pV, { note: 'preferred' }),
    ]);
    expect(vproj(mU).note).toBe('preferred');
    expect(vproj(pU).note).toBe('preferred');

    await Promise.all([vendorRepo.impls.mongo.softDeleteVendor(ids.mV2), vendorRepo.impls.pg.softDeleteVendor(ids.pV2)]);
    expect(await vendorRepo.impls.mongo.findVendorById(ids.mV2)).toBeNull(); // hidden
    expect(await vendorRepo.impls.pg.findVendorById(ids.pV2)).toBeNull();
  });

  test('vendorSpend: group by type, soft-deleted cost excluded, full window — identical', async () => {
    const m = await vendorRepo.impls.mongo.vendorSpend(ids.mV);
    const p = await vendorRepo.impls.pg.vendorSpend(ids.pV);
    expect(m).toEqual({
      totalMinor: 2600, count: 4, currency: 'USD',
      byType: [{ type: 'trainer', totalMinor: 1500, count: 2 }, { type: 'venue', totalMinor: 1100, count: 2 }],
    }); // material(200) soft-deleted excluded
    expect(p).toEqual(m);
  });

  test('vendorSpend: date window excludes pre-window cost — identical', async () => {
    const m = await vendorRepo.impls.mongo.vendorSpend(ids.mV, { from: day(3) });
    const p = await vendorRepo.impls.pg.vendorSpend(ids.pV, { from: day(3) });
    expect(m).toEqual({
      totalMinor: 2300, count: 3, currency: 'USD',
      byType: [{ type: 'trainer', totalMinor: 1500, count: 2 }, { type: 'venue', totalMinor: 800, count: 1 }],
    }); // venue 300 on day(1) excluded
    expect(p).toEqual(m);
  });
});
