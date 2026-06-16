const repository = require('./repository');
const { ServiceError } = require('../../helpers/ServiceError');

// ──────────────────────────────────────────────────────────
// finance/use-cases — budget & cost business rules (A1, Horizon 1).
// Money is integer MINOR units. Single currency per tenant is ENFORCED: any
// supplied currency must equal the tenant currency (executive cost-config →
// env DEFAULT_CURRENCY → 'USD'); omitted currency defaults to it.
// ──────────────────────────────────────────────────────────

// fiscalYear '2026' → the UTC calendar-year window [Jan 1 00:00 … Dec 31 23:59:59.999].
const fiscalYearRange = (fiscalYear) => {
  const y = Number(fiscalYear);
  return { from: new Date(Date.UTC(y, 0, 1)), to: new Date(Date.UTC(y, 11, 31, 23, 59, 59, 999)) };
};

const resolveCurrency = async (provided) => {
  const tenant = await repository.getTenantCurrency();
  if (provided && provided !== tenant) {
    throw new ServiceError(`Currency must be ${tenant} (the configured tenant currency)`, 400);
  }
  return tenant;
};

const getTenantCurrency = () => repository.getTenantCurrency();

// ── Cost entries ─────────────────────────────────────────────────────────────
const createCostEntry = async (body, actorId) => {
  const currency = await resolveCurrency(body.currency);
  return repository.createCostEntry({ ...body, currency, createdBy: actorId || null });
};

const listCostEntries = (query = {}) => {
  const filter = {};
  if (query.programId) filter['scope.programId'] = query.programId;
  if (query.departmentId) filter['scope.departmentId'] = query.departmentId;
  if (query.cohortId) filter['scope.cohortId'] = query.cohortId;
  if (query.type) filter.type = query.type;
  if (query.fiscalYear) {
    const { from, to } = fiscalYearRange(query.fiscalYear);
    filter.incurredOn = { $gte: from, $lte: to };
  }
  return repository.listCostEntries(filter);
};

const updateCostEntry = async (id, body) => {
  const before = await repository.findCostEntryById(id);
  if (!before) throw new ServiceError('Cost entry not found', 404);
  const patch = { ...body };
  if (body.currency) patch.currency = await resolveCurrency(body.currency);
  const after = await repository.updateCostEntry(id, patch);
  return { before, after };
};

const archiveCostEntry = async (id) => {
  const before = await repository.findCostEntryById(id);
  if (!before) throw new ServiceError('Cost entry not found', 404);
  const after = await repository.softDeleteCostEntry(id);
  return { before, after };
};

// ── Budgets ──────────────────────────────────────────────────────────────────
const createBudget = async (body, actorId) => {
  const currency = await resolveCurrency(body.currency);
  return repository.createBudget({ ...body, currency, createdBy: actorId || null });
};

const listBudgets = (query = {}) => {
  const filter = {};
  if (query.fiscalYear) filter.fiscalYear = query.fiscalYear;
  if (query.departmentId) filter.departmentId = query.departmentId;
  return repository.listBudgets(filter);
};

const updateBudget = async (id, body) => {
  const before = await repository.findBudgetById(id);
  if (!before) throw new ServiceError('Budget not found', 404);
  const patch = { ...body };
  if (body.currency) patch.currency = await resolveCurrency(body.currency);
  const after = await repository.updateBudget(id, patch);
  return { before, after };
};

const archiveBudget = async (id) => {
  const before = await repository.findBudgetById(id);
  if (!before) throw new ServiceError('Budget not found', 404);
  const after = await repository.softDeleteBudget(id);
  return { before, after };
};

// ── Roll-up (Σ cost by scope dimension) ──────────────────────────────────────
const GROUP_FIELD = Object.freeze({
  program: 'scope.programId',
  department: 'scope.departmentId',
  cohort: 'scope.cohortId',
  vendor: 'scope.vendorId',
  type: 'type',
});

const resolveLabels = async (by, ids) => {
  const map = new Map();
  if (!ids.length) return map;
  if (by === 'program') {
    (await repository.findProgramsByIds(ids)).forEach((p) => map.set(String(p._id), p.name || p.code));
  } else if (by === 'department') {
    (await repository.findDepartmentsByIds(ids)).forEach((d) => map.set(String(d._id), d.name));
  } else if (by === 'cohort') {
    (await repository.findClassesByIds(ids)).forEach((c) => map.set(String(c._id), c.courseName || c.classCode));
  } else if (by === 'vendor') {
    // A2: real vendor names; an entry pointing at a trashed vendor falls back to
    // the id string (resolveLabels' default) — acceptable for a roll-up label.
    (await repository.findVendorsByIds(ids)).forEach((v) => map.set(String(v._id), v.name));
  } else if (by === 'type') {
    ids.forEach((id) => map.set(String(id), String(id)));
  }
  return map;
};

const buildCostRollup = async (query = {}) => {
  const by = query.by || 'program';
  const groupField = GROUP_FIELD[by];
  let { from, to } = query;
  if (query.fiscalYear && !from && !to) ({ from, to } = fiscalYearRange(query.fiscalYear));

  const rows = await repository.rollupCostEntries({ groupField, from, to });
  const labels = await resolveLabels(by, rows.map((r) => r._id).filter((id) => id != null));
  const grandTotalMinor = rows.reduce((sum, r) => sum + r.totalMinor, 0);

  return {
    by,
    grandTotalMinor,
    rows: rows.map((r) => ({
      key: r._id == null ? null : String(r._id),
      label: r._id == null ? 'Unallocated' : (labels.get(String(r._id)) || String(r._id)),
      totalMinor: r.totalMinor,
      count: r.count,
    })),
  };
};

// ── Budget vs actual variance ────────────────────────────────────────────────
// A cost matches a budget when it satisfies ALL of the budget's set scope
// constraints (department / program); a budget with neither is org-wide for the
// year. Per-budget actuals can overlap, so `totals` is the sum of the rows
// (not a deduplicated org figure) — documented in the spec.
const matchesBudget = (budget, cost) => {
  const scope = cost.scope || {};
  if (budget.departmentId && String(scope.departmentId) !== String(budget.departmentId)) return false;
  if (budget.programId && String(scope.programId) !== String(budget.programId)) return false;
  return true;
};

const buildBudgetVariance = async (query) => {
  const { fiscalYear } = query;
  const filter = { fiscalYear };
  if (query.departmentId) filter.departmentId = query.departmentId;

  const budgets = await repository.listBudgets(filter);
  const { from, to } = fiscalYearRange(fiscalYear);
  const costs = await repository.listCostScopesInRange({ from, to });

  const programIds = [...new Set(budgets.map((b) => b.programId).filter(Boolean).map(String))];
  const departmentIds = [...new Set(budgets.map((b) => b.departmentId).filter(Boolean).map(String))];
  const [programs, departments] = await Promise.all([
    repository.findProgramsByIds(programIds),
    repository.findDepartmentsByIds(departmentIds),
  ]);
  const programName = new Map(programs.map((p) => [String(p._id), p.name || p.code]));
  const departmentName = new Map(departments.map((d) => [String(d._id), d.name]));

  const rows = budgets.map((b) => {
    const actualMinor = costs.reduce((sum, c) => (matchesBudget(b, c) ? sum + c.amountMinor : sum), 0);
    return {
      budgetId: String(b._id),
      fiscalYear: b.fiscalYear,
      departmentId: b.departmentId ? String(b.departmentId) : null,
      department: b.departmentId ? (departmentName.get(String(b.departmentId)) || null) : null,
      programId: b.programId ? String(b.programId) : null,
      program: b.programId ? (programName.get(String(b.programId)) || null) : null,
      label: b.label || null,
      currency: b.currency,
      budgetMinor: b.amountMinor,
      actualMinor,
      varianceMinor: b.amountMinor - actualMinor,
      utilizationPct: b.amountMinor > 0 ? Math.round((actualMinor / b.amountMinor) * 100) : null,
      overBudget: actualMinor > b.amountMinor,
    };
  });

  const totals = rows.reduce(
    (acc, r) => ({ budgetMinor: acc.budgetMinor + r.budgetMinor, actualMinor: acc.actualMinor + r.actualMinor }),
    { budgetMinor: 0, actualMinor: 0 },
  );
  totals.varianceMinor = totals.budgetMinor - totals.actualMinor;
  totals.overBudget = totals.actualMinor > totals.budgetMinor;

  return { fiscalYear, currency: budgets[0]?.currency || null, rows, totals };
};

module.exports = {
  getTenantCurrency,
  createCostEntry,
  listCostEntries,
  updateCostEntry,
  archiveCostEntry,
  createBudget,
  listBudgets,
  updateBudget,
  archiveBudget,
  buildCostRollup,
  buildBudgetVariance,
};
