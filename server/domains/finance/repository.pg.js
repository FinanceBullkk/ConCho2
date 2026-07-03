const crypto = require('crypto');
const { query } = require('../../config/pg');

// ──────────────────────────────────────────────────────────
// finance/repository — POSTGRES impl. Same interface as ./repository.mongo.
// CostEntry + Budget CRUD, cost roll-ups, budget-vs-actual inputs, and the
// label lookups + tenant currency.
//
// Fidelity notes the parity test pins:
//   • CostEntry `scope` subobject ↔ the flat scope_* columns (migration 008);
//     an update with `scope` REPLACES all five (Mongo $set casts the subdoc with
//     defaults), mirrored here.
//   • soft-delete is EXPLICIT (is_deleted=false) on every CostEntry/Budget read
//     AND on the aggregations (CostEntry has a pre('aggregate') hook).
//   • label lookups mirror each model's soft-delete: Department/Class/Vendor are
//     hidden when deleted; LearningProgram has NO soft-delete (lifecycle=status).
//   • amount_minor is bigint → node-pg returns a string → Number() it (matches
//     the Mongo Number; values stay within JS safe-integer range for currency).
//   • currency is uppercased (Mongo schema `uppercase:true`).
// ──────────────────────────────────────────────────────────

const newId = () => crypto.randomBytes(12).toString('hex');
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const idOrNull = (v) => (v == null ? null : String(v));
const upper = (v) => (v == null ? v : String(v).toUpperCase());
// Runs on the caller's UoW tx client when provided (the planning scheduleItem
// transaction enlists createBudget); plain pool query otherwise.
const exec = (tx, text, params) =>
  (tx && tx.client ? tx.client.query(text, params) : query(text, params));

// isDeleted/deletedAt are `select:false` on both models → lean reads omit them;
// the row mappers mirror that (the columns are still used in WHERE predicates).
const costRow = (r) => (r == null ? null : {
  _id: r.id,
  scope: {
    programId: r.scope_program_id || null,
    cohortId: r.scope_cohort_id || null,
    sessionId: r.scope_session_id || null,
    departmentId: r.scope_department_id || null,
    vendorId: r.scope_vendor_id || null,
  },
  type: r.type,
  amountMinor: Number(r.amount_minor),
  currency: r.currency,
  incurredOn: r.incurred_on,
  poRef: r.po_ref || '',
  note: r.note || '',
  createdBy: r.created_by || null,
  createdAt: r.created_at, updatedAt: r.updated_at,
});

const budgetRow = (r) => (r == null ? null : {
  _id: r.id, fiscalYear: r.fiscal_year,
  departmentId: r.department_id || null, programId: r.program_id || null,
  amountMinor: Number(r.amount_minor), currency: r.currency, label: r.label || '',
  createdBy: r.created_by || null, createdAt: r.created_at, updatedAt: r.updated_at,
});

// ── Tenant currency (from the executive cost-config setting) ──
const COST_CONFIG_KEY = 'LND_COST_CONFIG';
const getTenantCurrency = async () => {
  const { rows } = await query(`SELECT value FROM settings WHERE key = $1 LIMIT 1`, [COST_CONFIG_KEY]);
  const configured = rows[0] && rows[0].value && rows[0].value.currency;
  return (configured || process.env.DEFAULT_CURRENCY || 'USD').toUpperCase();
};

// ── CostEntry CRUD ───────────────────────────────────────────
const createCostEntry = async (data) => {
  const s = data.scope || {};
  const { rows } = await query(
    `INSERT INTO cost_entries(id, scope_program_id, scope_cohort_id, scope_session_id, scope_department_id,
       scope_vendor_id, type, amount_minor, currency, incurred_on, po_ref, note, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
    [
      newId(), idOrNull(s.programId), idOrNull(s.cohortId), idOrNull(s.sessionId), idOrNull(s.departmentId),
      idOrNull(s.vendorId), data.type == null ? 'other' : data.type, data.amountMinor, upper(data.currency),
      new Date(data.incurredOn).toISOString(), data.poRef == null ? '' : data.poRef,
      data.note == null ? '' : data.note, idOrNull(data.createdBy),
    ]);
  return costRow(rows[0]);
};

// JS filter key (Mongo dot-path) → SQL column for the cost list.
const COST_FILTER_COL = {
  'scope.programId': 'scope_program_id',
  'scope.departmentId': 'scope_department_id',
  'scope.cohortId': 'scope_cohort_id',
  'scope.sessionId': 'scope_session_id',
  'scope.vendorId': 'scope_vendor_id',
  type: 'type',
};

const dateRangeConds = (range, col, conds, args) => {
  if (!range) return;
  if (range.$gte) { args.push(new Date(range.$gte).toISOString()); conds.push(`${col} >= $${args.length}`); }
  if (range.$lte) { args.push(new Date(range.$lte).toISOString()); conds.push(`${col} <= $${args.length}`); }
};

const listCostEntries = async (filter = {}) => {
  const conds = ['is_deleted = false'];
  const args = [];
  for (const [k, col] of Object.entries(COST_FILTER_COL)) {
    if (filter[k] != null) { args.push(String(filter[k])); conds.push(`${col} = $${args.length}`); }
  }
  dateRangeConds(filter.incurredOn, 'incurred_on', conds, args);
  const { rows } = await query(
    `SELECT * FROM cost_entries WHERE ${conds.join(' AND ')} ORDER BY incurred_on DESC, created_at DESC LIMIT 500`, args);
  return rows.map(costRow);
};

const findCostEntryById = async (id) => {
  const { rows } = await query(`SELECT * FROM cost_entries WHERE id = $1 AND is_deleted = false`, [String(id)]);
  return rows[0] ? costRow(rows[0]) : null;
};

const updateCostEntry = async (id, data) => {
  const sets = [];
  const args = [];
  const push = (col, val) => { args.push(val); sets.push(`${col} = $${args.length}`); };
  if (hasOwn(data, 'scope')) {
    const s = data.scope || {};
    // Mongo $set:{scope:{...}} replaces the whole subdoc (defaults fill the rest).
    push('scope_program_id', idOrNull(s.programId));
    push('scope_cohort_id', idOrNull(s.cohortId));
    push('scope_session_id', idOrNull(s.sessionId));
    push('scope_department_id', idOrNull(s.departmentId));
    push('scope_vendor_id', idOrNull(s.vendorId));
  }
  if (hasOwn(data, 'type')) push('type', data.type);
  if (hasOwn(data, 'amountMinor')) push('amount_minor', data.amountMinor);
  if (hasOwn(data, 'currency')) push('currency', upper(data.currency));
  if (hasOwn(data, 'incurredOn')) push('incurred_on', new Date(data.incurredOn).toISOString());
  if (hasOwn(data, 'poRef')) push('po_ref', data.poRef);
  if (hasOwn(data, 'note')) push('note', data.note);
  if (!sets.length) return findCostEntryById(id);
  sets.push('updated_at = now()');
  args.push(String(id));
  const { rows } = await query(
    `UPDATE cost_entries SET ${sets.join(', ')} WHERE id = $${args.length} AND is_deleted = false RETURNING *`, args);
  return rows[0] ? costRow(rows[0]) : null;
};

const softDeleteCostEntry = async (id) => {
  const { rows } = await query(
    `UPDATE cost_entries SET is_deleted = true, deleted_at = now(), updated_at = now()
      WHERE id = $1 AND is_deleted = false RETURNING *`, [String(id)]);
  return rows[0] ? costRow(rows[0]) : null;
};

// ── Budget CRUD ──────────────────────────────────────────────
// Optional `tx` (UoW wrapper) enlists the insert in the caller's transaction
// (the planning scheduleItem flow) — Wave-D closed the earlier deferral.
const createBudget = async (data, tx) => {
  const { rows } = await exec(
    tx,
    `INSERT INTO budgets(id, fiscal_year, department_id, program_id, amount_minor, currency, label, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [
      newId(), data.fiscalYear, idOrNull(data.departmentId), idOrNull(data.programId),
      data.amountMinor, upper(data.currency), data.label == null ? '' : data.label, idOrNull(data.createdBy),
    ]);
  return budgetRow(rows[0]);
};

const listBudgets = async (filter = {}) => {
  const conds = ['is_deleted = false'];
  const args = [];
  if (filter.fiscalYear != null) { args.push(String(filter.fiscalYear)); conds.push(`fiscal_year = $${args.length}`); }
  if (filter.departmentId != null) { args.push(String(filter.departmentId)); conds.push(`department_id = $${args.length}`); }
  const { rows } = await query(
    `SELECT * FROM budgets WHERE ${conds.join(' AND ')} ORDER BY fiscal_year DESC, created_at DESC LIMIT 500`, args);
  return rows.map(budgetRow);
};

const findBudgetById = async (id) => {
  const { rows } = await query(`SELECT * FROM budgets WHERE id = $1 AND is_deleted = false`, [String(id)]);
  return rows[0] ? budgetRow(rows[0]) : null;
};

const BUDGET_COL = {
  fiscalYear: 'fiscal_year', departmentId: 'department_id', programId: 'program_id',
  amountMinor: 'amount_minor', currency: 'currency', label: 'label',
};
const budgetVal = (k, v) => {
  if (k === 'departmentId' || k === 'programId') return idOrNull(v);
  if (k === 'currency') return upper(v);
  return v;
};

const updateBudget = async (id, data) => {
  const sets = [];
  const args = [];
  for (const [k, col] of Object.entries(BUDGET_COL)) {
    if (hasOwn(data, k)) { args.push(budgetVal(k, data[k])); sets.push(`${col} = $${args.length}`); }
  }
  if (!sets.length) return findBudgetById(id);
  sets.push('updated_at = now()');
  args.push(String(id));
  const { rows } = await query(
    `UPDATE budgets SET ${sets.join(', ')} WHERE id = $${args.length} AND is_deleted = false RETURNING *`, args);
  return rows[0] ? budgetRow(rows[0]) : null;
};

const softDeleteBudget = async (id) => {
  const { rows } = await query(
    `UPDATE budgets SET is_deleted = true, deleted_at = now(), updated_at = now()
      WHERE id = $1 AND is_deleted = false RETURNING *`, [String(id)]);
  return rows[0] ? budgetRow(rows[0]) : null;
};

// ── Aggregations (exclude soft-deleted — CostEntry aggregate hook) ──
const sumCostEntries = async ({ from, to } = {}) => {
  const conds = ['is_deleted = false'];
  const args = [];
  dateRangeConds({ $gte: from, $lte: to }, 'incurred_on', conds, args);
  const { rows } = await query(
    `SELECT COALESCE(SUM(amount_minor),0) AS total_minor, COUNT(*)::int AS count
       FROM cost_entries WHERE ${conds.join(' AND ')}`, args);
  return { totalMinor: Number(rows[0].total_minor), count: rows[0].count };
};

// JS groupField (Mongo dot-path / 'type') → SQL column for the roll-up.
const ROLLUP_COL = {
  'scope.programId': 'scope_program_id',
  'scope.departmentId': 'scope_department_id',
  'scope.cohortId': 'scope_cohort_id',
  'scope.vendorId': 'scope_vendor_id',
  type: 'type',
};

const rollupCostEntries = async ({ groupField, from, to } = {}) => {
  const col = ROLLUP_COL[groupField] || 'type';
  const conds = ['is_deleted = false'];
  const args = [];
  dateRangeConds({ $gte: from, $lte: to }, 'incurred_on', conds, args);
  const { rows } = await query(
    `SELECT ${col} AS gid, SUM(amount_minor) AS total_minor, COUNT(*)::int AS count
       FROM cost_entries WHERE ${conds.join(' AND ')}
      GROUP BY ${col} ORDER BY total_minor DESC`, args);
  return rows.map((r) => ({ _id: r.gid == null ? null : r.gid, totalMinor: Number(r.total_minor), count: r.count }));
};

const listCostScopesInRange = async ({ from, to } = {}) => {
  const conds = ['is_deleted = false'];
  const args = [];
  dateRangeConds({ $gte: from, $lte: to }, 'incurred_on', conds, args);
  const { rows } = await query(
    `SELECT id, scope_program_id, scope_cohort_id, scope_session_id, scope_department_id, scope_vendor_id, amount_minor
       FROM cost_entries WHERE ${conds.join(' AND ')}`, args);
  return rows.map((r) => ({
    _id: r.id,
    scope: {
      programId: r.scope_program_id || null,
      cohortId: r.scope_cohort_id || null,
      sessionId: r.scope_session_id || null,
      departmentId: r.scope_department_id || null,
      vendorId: r.scope_vendor_id || null,
    },
    amountMinor: Number(r.amount_minor),
  }));
};

// ── Label lookups (each mirrors its model's soft-delete) ──
const findProgramsByIds = async (ids) => {
  if (!ids.length) return [];
  // LearningProgram has NO soft-delete (lifecycle = status) → no is_deleted filter.
  const { rows } = await query(`SELECT id, name, code FROM learning_programs WHERE id = ANY($1)`, [ids.map(String)]);
  return rows.map((r) => ({ _id: r.id, name: r.name, code: r.code }));
};

const findDepartmentsByIds = async (ids) => {
  if (!ids.length) return [];
  const { rows } = await query(`SELECT id, name FROM departments WHERE id = ANY($1) AND is_deleted = false`, [ids.map(String)]);
  return rows.map((r) => ({ _id: r.id, name: r.name }));
};

const findClassesByIds = async (ids) => {
  if (!ids.length) return [];
  const { rows } = await query(
    `SELECT id, class_code, course_name FROM classes WHERE id = ANY($1) AND is_deleted = false`, [ids.map(String)]);
  return rows.map((r) => ({ _id: r.id, classCode: r.class_code, courseName: r.course_name }));
};

const findVendorsByIds = async (ids) => {
  if (!ids.length) return [];
  const { rows } = await query(`SELECT id, name FROM vendors WHERE id = ANY($1) AND is_deleted = false`, [ids.map(String)]);
  return rows.map((r) => ({ _id: r.id, name: r.name }));
};

module.exports = {
  getTenantCurrency,
  createCostEntry,
  listCostEntries,
  findCostEntryById,
  updateCostEntry,
  softDeleteCostEntry,
  createBudget,
  listBudgets,
  findBudgetById,
  updateBudget,
  softDeleteBudget,
  sumCostEntries,
  rollupCostEntries,
  listCostScopesInRange,
  findProgramsByIds,
  findDepartmentsByIds,
  findClassesByIds,
  findVendorsByIds,
};
