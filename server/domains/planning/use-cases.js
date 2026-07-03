const repository = require('./repository');
const financeRepo = require('../finance/repository');
const { runInTransaction } = require('../_shared/unit-of-work');
const { ServiceError } = require('../../helpers/ServiceError');

// ──────────────────────────────────────────────────────────
// planning/use-cases — TNA → annual-plan business rules (A4, Horizon 2).
// Intake → demand aggregation → a costed annual plan → scheduled cohorts.
// ──────────────────────────────────────────────────────────

// Status machine. A7 (Horizon 3) will later DRIVE these; for now they are
// manual, capability-gated transitions. Empty = terminal.
const TRANSITIONS = Object.freeze({
  submitted: ['in-review', 'approved', 'rejected'],
  'in-review': ['approved', 'rejected'],
  approved: ['planned', 'rejected'],
  rejected: [],
  planned: [],
});

const isDuplicateKey = (e) => e?.code === 11000 || /E11000/.test(e?.message || '');

// ── Requests ─────────────────────────────────────────────────────────────────
const createRequest = (body, actorId) =>
  repository.createRequest({ ...body, requestedBy: actorId || null, createdBy: actorId || null });

const listRequests = (query = {}) => {
  const filter = {};
  if (query.status) filter.status = query.status;
  if (query.departmentId) filter.departmentId = query.departmentId;
  if (query.targetKind) filter['target.kind'] = query.targetKind;
  if (query.targetQuarter) filter.targetQuarter = query.targetQuarter;
  return repository.listRequests(filter);
};

const updateRequestStatus = async (id, status) => {
  const before = await repository.findRequestById(id);
  if (!before) throw new ServiceError('Training request not found', 404);
  const allowed = TRANSITIONS[before.status] || [];
  if (status !== before.status && !allowed.includes(status)) {
    throw new ServiceError(`Cannot move a '${before.status}' request to '${status}'`, 400);
  }
  const after = await repository.updateRequest(id, { status });
  return { before, after };
};

const archiveRequest = async (id) => {
  const before = await repository.findRequestById(id);
  if (!before) throw new ServiceError('Training request not found', 404);
  const after = await repository.softDeleteRequest(id);
  return { before, after };
};

// ── Demand aggregation ───────────────────────────────────────────────────────
const resolveDemandLabels = async (by, ids) => {
  const map = new Map();
  if (!ids.length) return map;
  if (by === 'program') (await repository.findProgramsByIds(ids)).forEach((p) => map.set(String(p._id), p.name || p.code));
  else if (by === 'skill') (await repository.findSkillsByIds(ids)).forEach((s) => map.set(String(s._id), s.name));
  else if (by === 'department') (await repository.findDepartmentsByIds(ids)).forEach((d) => map.set(String(d._id), d.name));
  return map;
};

const buildDemand = async (query = {}) => {
  const by = query.by || 'program';
  const rows = await repository.aggregateDemand({ by, fiscalYear: query.fiscalYear });
  const labels = await resolveDemandLabels(by, rows.map((r) => r._id).filter((id) => id != null));
  const totalDemand = rows.reduce((sum, r) => sum + r.demand, 0);
  return {
    by,
    totalDemand,
    rows: rows.map((r) => ({
      key: r._id == null ? null : String(r._id),
      label: r._id == null ? 'Unassigned' : (by === 'quarter' ? String(r._id) : (labels.get(String(r._id)) || String(r._id))),
      demand: r.demand,
      count: r.count,
    })),
  };
};

// ── Plan ─────────────────────────────────────────────────────────────────────
const getPlan = async (fiscalYear) =>
  (await repository.findPlan(fiscalYear)) || { fiscalYear, items: [] };

const upsertPlan = async (fiscalYear, body, actorId) => {
  const before = await repository.findPlan(fiscalYear);
  const after = await repository.upsertPlan(fiscalYear, {
    items: body.items || [],
    ...(before ? {} : { createdBy: actorId || null }),
  });
  return { before, after, created: !before };
};

// Convert a program plan item into a cohort (Class), link it, mark the matching
// approved requests 'planned', and (when an estimate is set) carry the cost into
// an A1 Budget row (tenant currency) — closing the TNA → schedule → budget loop.
const scheduleItem = async (fiscalYear, itemId, body, actorId) => {
  const plan = await repository.findPlan(fiscalYear);
  if (!plan) throw new ServiceError('Plan not found', 404);
  const item = (plan.items || []).find((i) => String(i._id) === String(itemId));
  if (!item) throw new ServiceError('Plan item not found', 404);
  if (item.target.kind !== 'program') {
    throw new ServiceError('Only program plan items can be scheduled into a cohort', 400);
  }
  const program = await repository.findProgramById(item.target.id);
  if (!program) throw new ServiceError('Program not found', 404);
  if (program.status === 'archived') throw new ServiceError('Program is archived', 400);
  const currency = item.estCostMinor > 0 ? await financeRepo.getTenantCurrency() : null;

  // Atomic write (audit P2): create the cohort, link it on the plan item, mark
  // the matching approved requests 'planned', and (when estimated) create the
  // A1 budget row — ALL-or-nothing on the backend-agnostic runInTransaction
  // (Mongo session ⇄ PG BEGIN/COMMIT). The plan link is an explicit positional
  // update (pushCohortIdToPlanItem) — the old hydrated-doc push had no
  // Postgres analogue.
  let cohort;
  let budgetId = null;
  await runInTransaction(async (tx) => {
    try {
      cohort = await repository.createCohortClass({
        classCode: body.classCode,
        courseName: program.name,
        programId: program._id,
        totalSessions: body.totalSessions,
      }, tx);
    } catch (e) {
      if (isDuplicateKey(e)) throw new ServiceError('A cohort with that class code already exists', 409);
      throw e;
    }

    const matched = await repository.pushCohortIdToPlanItem(fiscalYear, itemId, cohort._id, tx);
    if (!matched) throw new ServiceError('Plan item not found', 404);

    await repository.markRequestsPlanned('program', item.target.id, item.quarter, tx);

    if (item.estCostMinor > 0) {
      const budget = await financeRepo.createBudget({
        fiscalYear, programId: program._id, amountMinor: item.estCostMinor, currency,
        label: `TNA ${fiscalYear} · ${program.name}`, createdBy: actorId || null,
      }, tx);
      budgetId = budget._id;
    }
  });

  return { cohort, plan: await repository.findPlan(fiscalYear), budgetId };
};

module.exports = {
  createRequest,
  listRequests,
  updateRequestStatus,
  archiveRequest,
  buildDemand,
  getPlan,
  upsertPlan,
  scheduleItem,
};
