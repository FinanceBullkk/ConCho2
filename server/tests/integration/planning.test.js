const request = require('supertest');
const jwt = require('jsonwebtoken');
const { getApp, getTokens, getSeedData, teardown, getCsrfHeaders } = require('../setup');
const TrainingRequest = require('../../models/TrainingRequest');
const TrainingPlan = require('../../models/TrainingPlan');
const Class = require('../../models/Class');
const LearningProgram = require('../../models/LearningProgram');
const Department = require('../../models/Department');
const Budget = require('../../models/Budget');
const Setting = require('../../models/Setting');
const AuditLog = require('../../models/AuditLog');
const User = require('../../models/User');

// ──────────────────────────────────────────────────────────
// Planning API — TNA → annual plan (Modernization H2 — A4).
// Covers request intake + audit, the status machine, demand aggregation, the
// plan upsert, scheduling a plan item into a cohort (+ A1 budget carry), and the
// training.plan authz boundary.
// ──────────────────────────────────────────────────────────

let app, tokens, coordToken;
let seq = 0;
const uniq = () => `${Date.now()}_${seq++}`;

beforeAll(async () => {
  app = await getApp();
  tokens = getTokens();
  getSeedData();
  const coord = await User.create({
    empCode: '000053', name: 'Plan Coord', role: 'Coordinator',
    department: 'Management', password: 'coord12345',
  });
  coordToken = jwt.sign({ id: coord._id.toString() }, process.env.JWT_SECRET, { expiresIn: '1h' });
});

afterAll(async () => {
  await User.deleteMany({ empCode: '000053' });
  await teardown();
});

afterEach(async () => {
  await Promise.all([
    TrainingRequest.deleteMany({}),
    TrainingPlan.deleteMany({}),
    Class.deleteMany({ classCode: /^TNA/ }),
    LearningProgram.deleteMany({}),
    Department.deleteMany({}),
    Budget.deleteMany({}),
    Setting.deleteMany({ key: 'LND_COST_CONFIG' }),
    AuditLog.deleteMany({ entity: { $in: ['TrainingRequest', 'TrainingPlan', 'Class'] } }),
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
const patch = async (token, path, body) => {
  const csrf = await getCsrfHeaders(app);
  return request(app).patch(path).set('Authorization', `Bearer ${token}`).set(csrf).send(body);
};
const del = async (token, path) => {
  const csrf = await getCsrfHeaders(app);
  return request(app).delete(path).set('Authorization', `Bearer ${token}`).set(csrf);
};

const makeProgram = (name) => LearningProgram.create({ code: `TNA_${uniq()}`, name, schedulingMode: 'self_enroll' });

describe('Planning API — TNA → annual plan (A4)', () => {
  test('request intake is audited; the status machine enforces valid transitions; archive soft-deletes', async () => {
    const program = await makeProgram('Safety 101');
    const created = await post(tokens.admin, '/api/planning/requests', {
      target: { kind: 'program', id: program._id.toString() },
      headcount: 12, priority: 'high', targetQuarter: '2026-Q1', rationale: 'Annual safety refresh',
    });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ headcount: 12, status: 'submitted' });
    const id = created.body.data._id;

    await new Promise((r) => setTimeout(r, 30));
    expect(await AuditLog.findOne({ entity: 'TrainingRequest', action: 'created' }).lean()).toBeTruthy();

    expect((await get(tokens.admin, '/api/planning/requests')).body.count).toBe(1);

    const approve = await patch(tokens.admin, `/api/planning/requests/${id}/status`, { status: 'approved' });
    expect(approve.status).toBe(200);
    expect(approve.body.data.status).toBe('approved');

    // approved → submitted is not a legal transition
    const illegal = await patch(tokens.admin, `/api/planning/requests/${id}/status`, { status: 'submitted' });
    expect(illegal.status).toBe(400);

    const arch = await del(tokens.admin, `/api/planning/requests/${id}`);
    expect(arch.status).toBe(200);
    expect((await get(tokens.admin, '/api/planning/requests')).body.count).toBe(0);
  });

  test('demand aggregates by program and by quarter (headcount summed)', async () => {
    const a = await makeProgram('Prog A');
    const b = await makeProgram('Prog B');
    const req = (id, hc, q) => post(tokens.admin, '/api/planning/requests', { target: { kind: 'program', id }, headcount: hc, targetQuarter: q });
    await req(a._id.toString(), 5, '2026-Q1');
    await req(a._id.toString(), 3, '2026-Q2');
    await req(b._id.toString(), 4, '2026-Q1');

    const byProgram = await get(tokens.admin, '/api/planning/demand?by=program&fiscalYear=2026');
    expect(byProgram.status).toBe(200);
    expect(byProgram.body.data.totalDemand).toBe(12);
    expect(byProgram.body.data.rows.find((r) => r.label === 'Prog A')).toMatchObject({ demand: 8, count: 2 });
    expect(byProgram.body.data.rows.find((r) => r.label === 'Prog B')).toMatchObject({ demand: 4, count: 1 });

    const byQuarter = await get(tokens.admin, '/api/planning/demand?by=quarter&fiscalYear=2026');
    expect(byQuarter.body.data.rows.find((r) => r.key === '2026-Q1')).toMatchObject({ demand: 9 });
    expect(byQuarter.body.data.rows.find((r) => r.key === '2026-Q2')).toMatchObject({ demand: 3 });
  });

  test('scheduling a plan item creates a cohort, marks approved requests planned, and carries the est cost into a budget', async () => {
    await Setting.findOneAndUpdate({ key: 'LND_COST_CONFIG' }, { value: { currency: 'VND', annualBudgetMinor: 1000000 } }, { upsert: true });
    const program = await makeProgram('Leadership');
    // Two approved requests for this program/quarter (set directly).
    await TrainingRequest.create({ target: { kind: 'program', id: program._id }, headcount: 5, targetQuarter: '2026-Q1', status: 'approved' });
    await TrainingRequest.create({ target: { kind: 'program', id: program._id }, headcount: 3, targetQuarter: '2026-Q1', status: 'approved' });

    const planRes = await put(tokens.admin, '/api/planning/plan/2026', {
      items: [{ target: { kind: 'program', id: program._id.toString() }, quarter: '2026-Q1', demand: 8, estCostMinor: 500000 }],
    });
    expect(planRes.status).toBe(201);
    const itemId = planRes.body.data.items[0]._id;

    const sched = await post(tokens.admin, `/api/planning/plan/2026/items/${itemId}/schedule`, { classCode: 'TNA001', totalSessions: 10 });
    expect(sched.status).toBe(201);
    expect(sched.body.data.cohort).toMatchObject({ classCode: 'TNA001' });
    expect(sched.body.data.budgetId).toBeTruthy();

    // Cohort exists + linked to the plan item
    const cohort = await Class.findOne({ classCode: 'TNA001' }).lean();
    expect(String(cohort.programId)).toBe(program._id.toString());
    const plan = await TrainingPlan.findOne({ fiscalYear: '2026' }).lean();
    expect(plan.items[0].cohortIds.map(String)).toContain(cohort._id.toString());

    // Approved requests flipped to planned
    const planned = await TrainingRequest.countDocuments({ 'target.id': program._id, status: 'planned' });
    expect(planned).toBe(2);

    // Est cost carried into an A1 budget
    const budget = await Budget.findOne({ fiscalYear: '2026', programId: program._id }).lean();
    expect(budget).toMatchObject({ amountMinor: 500000, currency: 'VND' });
  });

  test('scheduling a skill plan item is rejected (cohorts come from programs)', async () => {
    const planRes = await put(tokens.admin, '/api/planning/plan/2027', {
      items: [{ target: { kind: 'skill', id: '64b7f0c2f1a2c3d4e5f60718' }, quarter: '2027-Q1', demand: 4 }],
    });
    const itemId = planRes.body.data.items[0]._id;
    const sched = await post(tokens.admin, `/api/planning/plan/2027/items/${itemId}/schedule`, { classCode: 'TNA999', totalSessions: 5 });
    expect(sched.status).toBe(400);
  });

  test('training.plan gate: Teacher + Participant denied; Coordinator allowed', async () => {
    expect((await get(tokens.teacher, '/api/planning/requests')).status).toBe(403);
    expect((await get(tokens.leader, '/api/planning/requests')).status).toBe(403);
    const program = await makeProgram('Coord Prog');
    const coordWrite = await post(coordToken, '/api/planning/requests', { target: { kind: 'program', id: program._id.toString() }, headcount: 2, targetQuarter: '2026-Q3' });
    expect(coordWrite.status).toBe(201);
    expect((await get(coordToken, '/api/planning/requests')).status).toBe(200);
  });
});
