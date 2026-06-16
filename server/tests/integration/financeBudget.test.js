const request = require('supertest');
const jwt = require('jsonwebtoken');
const { getApp, getTokens, getSeedData, teardown, getCsrfHeaders } = require('../setup');
const CostEntry = require('../../models/CostEntry');
const Budget = require('../../models/Budget');
const AuditLog = require('../../models/AuditLog');
const LearningProgram = require('../../models/LearningProgram');
const Department = require('../../models/Department');
const Setting = require('../../models/Setting');
const User = require('../../models/User');

// ──────────────────────────────────────────────────────────
// Finance API — budget & cost management (Modernization H1 — A1).
// Covers CRUD + audit, currency enforcement, roll-ups, budget variance,
// the executive-ROI actuals wire, and the budget.manage authz boundary.
// ──────────────────────────────────────────────────────────

let app, tokens, coordToken;
let seq = 0;
const uniq = () => `${Date.now()}_${seq++}`;

beforeAll(async () => {
  app = await getApp();
  tokens = getTokens();
  getSeedData();
  const coord = await User.create({
    empCode: '000050', name: 'Coord User', role: 'Coordinator',
    department: 'Management', password: 'coord12345',
  });
  coordToken = jwt.sign({ id: coord._id.toString() }, process.env.JWT_SECRET, { expiresIn: '1h' });
});

afterAll(async () => {
  await User.deleteMany({ empCode: '000050' });
  await teardown();
});

afterEach(async () => {
  await Promise.all([
    CostEntry.deleteMany({}),
    Budget.deleteMany({}),
    AuditLog.deleteMany({ entity: { $in: ['CostEntry', 'Budget'] } }),
    LearningProgram.deleteMany({}),
    Department.deleteMany({}),
    Setting.deleteMany({ key: 'LND_COST_CONFIG' }),
  ]);
});

// The tenant currency comes from the executive cost-config Setting.
const setCurrency = (currency) =>
  Setting.findOneAndUpdate(
    { key: 'LND_COST_CONFIG' },
    { value: { currency, annualBudgetMinor: 1000000 } },
    { upsert: true },
  );

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

const makeProgram = (name) =>
  LearningProgram.create({ code: `FIN_${uniq()}`, name, schedulingMode: 'self_enroll' });

describe('Finance API — budget & cost (A1)', () => {
  test('cost entry CRUD is audited; currency defaults to the tenant currency; archive soft-deletes', async () => {
    await setCurrency('VND');
    const program = await makeProgram('Finance Prog');

    const created = await post(tokens.admin, '/api/finance/costs', {
      scope: { programId: program._id.toString() },
      type: 'trainer', amountMinor: 500000, incurredOn: '2026-03-15', poRef: 'PO-1',
    });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ amountMinor: 500000, currency: 'VND', type: 'trainer' });
    const id = created.body.data._id;

    await new Promise((resolve) => setTimeout(resolve, 30)); // audit is fire-and-forget
    const log = await AuditLog.findOne({ entity: 'CostEntry', action: 'created' }).lean();
    expect(log).toMatchObject({ actorRole: 'Admin' });

    expect((await get(tokens.admin, '/api/finance/costs')).body.count).toBe(1);

    const upd = await put(tokens.admin, `/api/finance/costs/${id}`, { amountMinor: 600000 });
    expect(upd.status).toBe(200);
    expect(upd.body.data.amountMinor).toBe(600000);

    const arch = await del(tokens.admin, `/api/finance/costs/${id}`);
    expect(arch.status).toBe(200);
    expect((await get(tokens.admin, '/api/finance/costs')).body.count).toBe(0);
  });

  test('rejects mismatched currency, negative amount, missing date, and a non-ISO currency', async () => {
    await setCurrency('VND');
    const mismatch = await post(tokens.admin, '/api/finance/costs', { amountMinor: 100, currency: 'USD', incurredOn: '2026-01-01' });
    expect(mismatch.status).toBe(400);

    const negative = await post(tokens.admin, '/api/finance/costs', { amountMinor: -5, incurredOn: '2026-01-01' });
    expect(negative.status).toBe(400);

    const noDate = await post(tokens.admin, '/api/finance/costs', { amountMinor: 100 });
    expect(noDate.status).toBe(400);

    const badCurrency = await post(tokens.admin, '/api/finance/costs', { amountMinor: 100, currency: 'DONG', incurredOn: '2026-01-01' });
    expect(badCurrency.status).toBe(400);
  });

  test('cost roll-up groups by program and by type, sorted by spend desc', async () => {
    await setCurrency('VND');
    const progA = await makeProgram('Prog A');
    const progB = await makeProgram('Prog B');
    await post(tokens.admin, '/api/finance/costs', { scope: { programId: progA._id.toString() }, type: 'trainer', amountMinor: 300000, incurredOn: '2026-02-01' });
    await post(tokens.admin, '/api/finance/costs', { scope: { programId: progA._id.toString() }, type: 'venue', amountMinor: 200000, incurredOn: '2026-02-02' });
    await post(tokens.admin, '/api/finance/costs', { scope: { programId: progB._id.toString() }, type: 'trainer', amountMinor: 100000, incurredOn: '2026-02-03' });

    const byProgram = await get(tokens.admin, '/api/finance/costs/rollup?by=program&fiscalYear=2026');
    expect(byProgram.status).toBe(200);
    expect(byProgram.body.data.grandTotalMinor).toBe(600000);
    expect(byProgram.body.data.rows[0]).toMatchObject({ label: 'Prog A', totalMinor: 500000, count: 2 });
    expect(byProgram.body.data.rows.find((r) => r.label === 'Prog B')).toMatchObject({ totalMinor: 100000, count: 1 });

    const byType = await get(tokens.admin, '/api/finance/costs/rollup?by=type&fiscalYear=2026');
    expect(byType.body.data.rows.find((r) => r.key === 'trainer')).toMatchObject({ totalMinor: 400000, count: 2 });
    expect(byType.body.data.rows.find((r) => r.key === 'venue')).toMatchObject({ totalMinor: 200000, count: 1 });
  });

  test('budget variance flags over-budget per fiscal year and ignores other years', async () => {
    await setCurrency('VND');
    const dept = await Department.create({ name: 'Fin Dept', code: `FD${seq++}` });

    const budget = await post(tokens.admin, '/api/finance/budgets', { fiscalYear: '2026', departmentId: dept._id.toString(), amountMinor: 1000000 });
    expect(budget.status).toBe(201);
    expect(budget.body.data.currency).toBe('VND');

    await post(tokens.admin, '/api/finance/costs', { scope: { departmentId: dept._id.toString() }, type: 'trainer', amountMinor: 700000, incurredOn: '2026-05-01' });
    await post(tokens.admin, '/api/finance/costs', { scope: { departmentId: dept._id.toString() }, type: 'venue', amountMinor: 500000, incurredOn: '2026-06-01' });
    // Outside the fiscal year — must NOT count.
    await post(tokens.admin, '/api/finance/costs', { scope: { departmentId: dept._id.toString() }, type: 'other', amountMinor: 999999, incurredOn: '2025-12-31' });

    const variance = await get(tokens.admin, '/api/finance/budgets/variance?fiscalYear=2026');
    expect(variance.status).toBe(200);
    const row = variance.body.data.rows.find((r) => r.departmentId === dept._id.toString());
    expect(row).toMatchObject({
      budgetMinor: 1000000, actualMinor: 1200000, varianceMinor: -200000, overBudget: true, utilizationPct: 120,
    });
    expect(variance.body.data.totals).toMatchObject({ budgetMinor: 1000000, actualMinor: 1200000, overBudget: true });
  });

  test('executive ROI surfaces trailing-12-month actual spend from logged costs', async () => {
    await setCurrency('VND');
    await post(tokens.admin, '/api/finance/costs', { type: 'trainer', amountMinor: 250000, incurredOn: new Date().toISOString() });

    const exec = await get(tokens.admin, '/api/learning/dashboard/executive');
    expect(exec.status).toBe(200);
    expect(exec.body.data.financials).toMatchObject({ configured: true, actualSpendTrailing12MonthsMinor: 250000 });
  });

  test('budget.manage gate: Teacher (report.read) + Participant denied; Coordinator allowed', async () => {
    await setCurrency('VND');
    expect((await get(tokens.teacher, '/api/finance/costs')).status).toBe(403);
    expect((await post(tokens.teacher, '/api/finance/costs', { amountMinor: 1, incurredOn: '2026-01-01' })).status).toBe(403);
    expect((await get(tokens.leader, '/api/finance/budgets/variance?fiscalYear=2026')).status).toBe(403);

    const coordWrite = await post(coordToken, '/api/finance/budgets', { fiscalYear: '2026', amountMinor: 5000, currency: 'VND' });
    expect(coordWrite.status).toBe(201);
    expect((await get(coordToken, '/api/finance/costs')).status).toBe(200);
  });
});
