const request = require('supertest');
const jwt = require('jsonwebtoken');
const { getApp, getTokens, getSeedData, teardown, getCsrfHeaders } = require('../setup');
const { pollUntil, findActiveRowWhere } = require('../pg-test-utils');
const Vendor = require('../../models/Vendor');
const CostEntry = require('../../models/CostEntry');
const AuditLog = require('../../models/AuditLog');
const Setting = require('../../models/Setting');
const User = require('../../models/User');

// ──────────────────────────────────────────────────────────
// Vendor API — vendor & external-provider management (Modernization H2 — A2).
// Covers CRUD + audit, validation, ratings aggregate, contract-renewal signal,
// per-vendor spend (from A1 cost entries), the finance vendor-name roll-up wire,
// and the vendor.manage authz boundary.
// ──────────────────────────────────────────────────────────

let app, tokens, coordToken;
let seq = 0;
const uniq = () => `${Date.now()}_${seq++}`;

beforeAll(async () => {
  app = await getApp();
  tokens = getTokens();
  getSeedData();
  const coord = await User.create({
    empCode: '000051', name: 'Vendor Coord', role: 'Coordinator',
    department: 'Management', password: 'coord12345',
  });
  coordToken = jwt.sign({ id: coord._id.toString() }, process.env.JWT_SECRET, { expiresIn: '1h' });
});

afterAll(async () => {
  await User.deleteMany({ empCode: '000051' });
  await teardown();
});

afterEach(async () => {
  await Promise.all([
    Vendor.deleteMany({}),
    CostEntry.deleteMany({}),
    AuditLog.deleteMany({ entity: { $in: ['Vendor', 'CostEntry'] } }),
    Setting.deleteMany({ key: 'LND_COST_CONFIG' }),
  ]);
});

const get = (token, path) => request(app).get(path).set('Authorization', `Bearer ${token}`);
const post = async (token, path, body) => {
  const csrf = await getCsrfHeaders(app);
  return request(app).post(path).set('Authorization', `Bearer ${token}`).set(csrf).send(body);
};
const put = async (token, path, body) => {
  const csrf = await getCsrfHeaders(app);
  return request(app).put(path).set('Authorization', `Bearer ${token}`).set(csrf).send(body);
};
const del = async (token, path) => {
  const csrf = await getCsrfHeaders(app);
  return request(app).delete(path).set('Authorization', `Bearer ${token}`).set(csrf);
};

const daysFromNow = (n) => new Date(Date.now() + n * 24 * 60 * 60 * 1000).toISOString();

describe('Vendor API — vendor management (A2)', () => {
  test('vendor CRUD is audited; list returns derived counts; archive soft-deletes + flips status', async () => {
    const created = await post(tokens.admin, '/api/vendors', {
      name: 'Acme Training', type: 'provider',
      contacts: [{ name: 'Jane Doe', email: 'jane@acme.test', role: 'Account lead' }],
      note: 'Compliance specialist',
    });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ name: 'Acme Training', type: 'provider', status: 'active' });
    const id = created.body.data._id;

    // Audit is fire-and-forget — poll instead of a fixed sleep (CI-load flake).
    const log = await pollUntil(() => findActiveRowWhere('AuditLog', { entity: 'Vendor', action: 'created' }));
    expect(log).toMatchObject({ actorRole: 'Admin' });

    const list = await get(tokens.admin, '/api/vendors');
    expect(list.body.count).toBe(1);
    expect(list.body.data[0]).toMatchObject({ name: 'Acme Training', contactCount: 1, ratingCount: 0, renewalStatus: 'none' });

    const upd = await put(tokens.admin, `/api/vendors/${id}`, { note: 'Preferred provider' });
    expect(upd.status).toBe(200);
    expect(upd.body.data.note).toBe('Preferred provider');

    const arch = await del(tokens.admin, `/api/vendors/${id}`);
    expect(arch.status).toBe(200);
    expect(arch.body.data.status).toBe('archived');
    expect((await get(tokens.admin, '/api/vendors')).body.count).toBe(0); // soft-deleted, hidden
  });

  test('rejects missing name, an unknown type, and an out-of-range rating', async () => {
    expect((await post(tokens.admin, '/api/vendors', { type: 'provider' })).status).toBe(400);
    expect((await post(tokens.admin, '/api/vendors', { name: 'X', type: 'bogus' })).status).toBe(400);

    const v = await post(tokens.admin, '/api/vendors', { name: 'Rate Co' });
    const bad = await post(tokens.admin, `/api/vendors/${v.body.data._id}/ratings`, { value: 9 });
    expect(bad.status).toBe(400);
  });

  test('ratings aggregate to an average score', async () => {
    const v = await post(tokens.admin, '/api/vendors', { name: 'Rated Co' });
    const id = v.body.data._id;
    await post(tokens.admin, `/api/vendors/${id}/ratings`, { value: 4, note: 'solid' });
    const second = await post(tokens.admin, `/api/vendors/${id}/ratings`, { value: 5 });
    expect(second.status).toBe(201);
    expect(second.body.data).toMatchObject({ ratingAvg: 4.5, ratingCount: 2 });
  });

  test('contract end dates drive the renewal signal (expired / due-soon / ok)', async () => {
    const expired = await post(tokens.admin, '/api/vendors', {
      name: 'Lapsed Co', contracts: [{ ref: 'C1', endsOn: daysFromNow(-5), valueMinor: 100, currency: 'USD' }],
    });
    expect(expired.body.data.renewalStatus).toBe('expired');

    const dueSoon = await post(tokens.admin, '/api/vendors', {
      name: 'Renew Co', contracts: [{ ref: 'C2', endsOn: daysFromNow(30), valueMinor: 100, currency: 'USD' }],
    });
    expect(dueSoon.body.data.renewalStatus).toBe('due-soon');

    const ok = await post(tokens.admin, '/api/vendors', {
      name: 'Healthy Co', contracts: [{ ref: 'C3', endsOn: daysFromNow(300), valueMinor: 100, currency: 'USD' }],
    });
    expect(ok.body.data.renewalStatus).toBe('ok');
  });

  test('per-vendor spend rolls up from A1 cost entries; finance roll-up resolves the vendor name', async () => {
    await Setting.findOneAndUpdate(
      { key: 'LND_COST_CONFIG' },
      { value: { currency: 'VND', annualBudgetMinor: 1000000 } },
      { upsert: true },
    );
    const v = await post(tokens.admin, '/api/vendors', { name: 'Spendy Co' });
    const vendorId = v.body.data._id;

    await post(tokens.admin, '/api/finance/costs', { scope: { vendorId }, type: 'vendor', amountMinor: 300000, incurredOn: '2026-03-01' });
    await post(tokens.admin, '/api/finance/costs', { scope: { vendorId }, type: 'travel', amountMinor: 50000, incurredOn: '2026-03-02' });

    const spend = await get(tokens.admin, `/api/vendors/${vendorId}/spend?fiscalYear=2026`);
    expect(spend.status).toBe(200);
    expect(spend.body.data.totalMinor).toBe(350000);
    expect(spend.body.data.byType).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'vendor', totalMinor: 300000, count: 1 }),
        expect.objectContaining({ type: 'travel', totalMinor: 50000, count: 1 }),
      ]),
    );

    const rollup = await get(tokens.admin, '/api/finance/costs/rollup?by=vendor&fiscalYear=2026');
    expect(rollup.body.data.rows.find((r) => r.key === String(vendorId))).toMatchObject({ label: 'Spendy Co', totalMinor: 350000 });
  });

  test('vendor.manage gate: Teacher + Participant denied; Coordinator allowed', async () => {
    expect((await get(tokens.teacher, '/api/vendors')).status).toBe(403);
    expect((await post(tokens.teacher, '/api/vendors', { name: 'Nope' })).status).toBe(403);
    expect((await get(tokens.leader, '/api/vendors')).status).toBe(403);

    const coordWrite = await post(coordToken, '/api/vendors', { name: 'Coord Co' });
    expect(coordWrite.status).toBe(201);
    expect((await get(coordToken, '/api/vendors')).status).toBe(200);
  });
});
