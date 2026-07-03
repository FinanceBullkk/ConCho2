const crypto = require('crypto');
const { query } = require('../../config/pg');

// ──────────────────────────────────────────────────────────
// planning/repository — POSTGRES impl for A4 (TNA → annual plan, H2).
// Same interface as ./repository.mongo.
//
// Fidelity notes the parity test pins:
//   • TrainingRequest/TrainingPlan soft-delete = explicit is_deleted predicates
//     (the SQL analogue of the Mongo find-hooks); row shapes OMIT
//     isDeleted/deletedAt (select:false → excluded from lean reads).
//   • target {kind,id} subobject ↔ flat target_kind/target_id columns (an
//     update replaces the pair — same precedent as compliance, mig 018).
//   • training_plans.items = jsonb subdoc array; upsertPlan REPLACES the array
//     and mints a FRESH _id per item (Mongo $set creates new subdocs) + applies
//     the planItemSchema defaults (quarter '', demand 0, estCostMinor 0,
//     cohortIds []).
//   • Label lookups mirror the hook asymmetry: departments hide deleted,
//     skills do NOT (Skill has no find-hook), programs have no soft-delete.
//   • Transaction methods run on the UoW tx client (`tx.client`) so they join
//     the scheduleItem BEGIN/COMMIT unit; 23505 on the cohort insert is
//     re-thrown Mongo-style ({ code: 11000 }) so the use-case's 409 branch is
//     backend-agnostic (established convention).
// ──────────────────────────────────────────────────────────

const newId = () => crypto.randomBytes(12).toString('hex');
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const exec = (tx, text, params) =>
  (tx && tx.client ? tx.client.query(text, params) : query(text, params));
const asDup = (err) => {
  if (err && err.code === '23505') {
    const dup = new Error(`E11000 duplicate key (${err.constraint || 'unique'})`);
    dup.code = 11000;
    return dup;
  }
  return err;
};

// ── Row shapes ───────────────────────────────────────────────────────────────
const reqRow = (r) => (r == null ? null : {
  _id: r.id,
  requestedBy: r.requested_by || null,
  departmentId: r.department_id || null,
  target: { kind: r.target_kind, id: r.target_id },
  headcount: Number(r.headcount),
  rationale: r.rationale || '',
  priority: r.priority,
  targetQuarter: r.target_quarter,
  status: r.status,
  createdBy: r.created_by || null,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const planRow = (r) => (r == null ? null : {
  _id: r.id,
  fiscalYear: r.fiscal_year,
  items: r.items || [],
  createdBy: r.created_by || null,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

// ── TrainingRequest ──────────────────────────────────────────────────────────
const createRequest = async (data) => {
  const { rows } = await query(
    `INSERT INTO training_requests(
       id, requested_by, department_id, target_kind, target_id,
       headcount, rationale, priority, target_quarter, status, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [
      newId(),
      data.requestedBy == null ? null : String(data.requestedBy),
      data.departmentId == null ? null : String(data.departmentId),
      data.target.kind, String(data.target.id),
      data.headcount,
      data.rationale == null ? '' : data.rationale,
      data.priority == null ? 'med' : data.priority,
      data.targetQuarter,
      data.status == null ? 'submitted' : data.status,
      data.createdBy == null ? null : String(data.createdBy),
    ],
  );
  return reqRow(rows[0]);
};

// use-case filter keys: status / departmentId / 'target.kind' / targetQuarter.
const REQ_FILTER_COL = {
  status: 'status', departmentId: 'department_id',
  'target.kind': 'target_kind', targetQuarter: 'target_quarter',
};
const listRequests = async (filter = {}) => {
  const conds = ['is_deleted = false'];
  const args = [];
  for (const [k, col] of Object.entries(REQ_FILTER_COL)) {
    if (hasOwn(filter, k)) { args.push(String(filter[k])); conds.push(`${col} = $${args.length}`); }
  }
  const { rows } = await query(
    `SELECT * FROM training_requests WHERE ${conds.join(' AND ')}
      ORDER BY created_at DESC LIMIT 500`, args);
  return rows.map(reqRow);
};

const findRequestById = async (id) => {
  const { rows } = await query(
    `SELECT * FROM training_requests WHERE id = $1 AND is_deleted = false`, [String(id)]);
  return reqRow(rows[0]);
};

const REQ_COL = {
  requestedBy: 'requested_by', departmentId: 'department_id', headcount: 'headcount',
  rationale: 'rationale', priority: 'priority', targetQuarter: 'target_quarter',
  status: 'status', createdBy: 'created_by',
};
const updateRequest = async (id, data) => {
  const sets = [];
  const args = [];
  for (const [k, col] of Object.entries(REQ_COL)) {
    if (hasOwn(data, k)) { args.push(data[k] == null ? null : data[k]); sets.push(`${col} = $${args.length}`); }
  }
  if (hasOwn(data, 'target')) { // $set: {target} replaces the whole pair
    args.push(data.target.kind); sets.push(`target_kind = $${args.length}`);
    args.push(String(data.target.id)); sets.push(`target_id = $${args.length}`);
  }
  if (!sets.length) return findRequestById(id);
  sets.push('updated_at = now()');
  args.push(String(id));
  const { rows } = await query(
    `UPDATE training_requests SET ${sets.join(', ')}
      WHERE id = $${args.length} AND is_deleted = false RETURNING *`, args);
  return reqRow(rows[0]);
};

const softDeleteRequest = async (id) => {
  const { rows } = await query(
    `UPDATE training_requests SET is_deleted = true, deleted_at = now(), updated_at = now()
      WHERE id = $1 AND is_deleted = false RETURNING *`, [String(id)]);
  return reqRow(rows[0]);
};

const markRequestsPlanned = async (kind, id, quarter, tx) => {
  const { rowCount } = await exec(
    tx,
    `UPDATE training_requests SET status = 'planned', updated_at = now()
      WHERE target_kind = $1 AND target_id = $2 AND target_quarter = $3
        AND status = 'approved' AND is_deleted = false`,
    [kind, String(id), quarter],
  );
  return { matchedCount: rowCount, modifiedCount: rowCount };
};

// ── Demand aggregation ───────────────────────────────────────────────────────
const aggregateDemand = async ({ by, fiscalYear } = {}) => {
  const conds = ['is_deleted = false', `status <> 'rejected'`];
  const args = [];
  if (fiscalYear) { args.push(`${fiscalYear}-Q%`); conds.push(`target_quarter LIKE $${args.length}`); }
  let groupCol;
  if (by === 'program' || by === 'skill') {
    args.push(by); conds.push(`target_kind = $${args.length}`);
    groupCol = 'target_id';
  } else if (by === 'quarter') {
    groupCol = 'target_quarter';
  } else {
    groupCol = 'department_id';
  }
  const { rows } = await query(
    `SELECT ${groupCol} AS key, SUM(headcount)::int AS demand, COUNT(*)::int AS count
       FROM training_requests WHERE ${conds.join(' AND ')}
      GROUP BY ${groupCol} ORDER BY demand DESC`, args);
  return rows.map((r) => ({ _id: r.key == null ? null : r.key, demand: r.demand, count: r.count }));
};

// ── TrainingPlan ─────────────────────────────────────────────────────────────
const findPlan = async (fiscalYear) => {
  const { rows } = await query(
    `SELECT * FROM training_plans WHERE fiscal_year = $1 AND is_deleted = false`, [fiscalYear]);
  return planRow(rows[0]);
};

// Mongo $set replaces items with NEW subdocs (fresh _ids) + schema defaults.
const normalizeItems = (items) => (items || []).map((it) => ({
  _id: it._id ? String(it._id) : newId(),
  target: { kind: it.target.kind, id: String(it.target.id) },
  quarter: it.quarter == null ? '' : it.quarter,
  demand: it.demand == null ? 0 : it.demand,
  estCostMinor: it.estCostMinor == null ? 0 : it.estCostMinor,
  cohortIds: (it.cohortIds || []).map(String),
}));

// NB: a soft-deleted plan row would make Mongo's hooked upsert throw E11000
// while this DO UPDATE would resurrect it — unreachable today (no plan
// soft-delete path exists), kept simple on purpose.
const upsertPlan = async (fiscalYear, data) => {
  const sets = [];
  if (hasOwn(data, 'items')) sets.push('items = EXCLUDED.items');
  if (hasOwn(data, 'createdBy')) sets.push('created_by = EXCLUDED.created_by');
  sets.push('updated_at = now()');
  const { rows } = await query(
    `INSERT INTO training_plans(id, fiscal_year, items, created_by)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (fiscal_year) DO UPDATE SET ${sets.join(', ')}
     RETURNING *`,
    [
      newId(), fiscalYear,
      JSON.stringify(normalizeItems(data.items)),
      data.createdBy == null ? null : String(data.createdBy),
    ],
  );
  return planRow(rows[0]);
};

// Link a scheduled cohort onto its plan item. FOR UPDATE holds the plan row
// inside the scheduleItem transaction (the analogue of Mongo's positional
// $push on the session). Returns matchedCount (0 = plan or item gone).
const pushCohortIdToPlanItem = async (fiscalYear, itemId, cohortId, tx) => {
  const { rows } = await exec(
    tx,
    `SELECT id, items FROM training_plans
      WHERE fiscal_year = $1 AND is_deleted = false FOR UPDATE`, [fiscalYear]);
  if (!rows[0]) return 0;
  const items = rows[0].items || [];
  const item = items.find((i) => String(i._id) === String(itemId));
  if (!item) return 0;
  item.cohortIds = [...(item.cohortIds || []), String(cohortId)];
  await exec(
    tx,
    `UPDATE training_plans SET items = $2, updated_at = now() WHERE id = $1`,
    [rows[0].id, JSON.stringify(items)],
  );
  return 1;
};

// ── Cohort creation (schedule a plan item) ───────────────────────────────────
const findProgramById = async (id) => {
  const { rows } = await query(
    `SELECT id, name, code, status FROM learning_programs WHERE id = $1`, [String(id)]);
  return rows[0] ? { _id: rows[0].id, name: rows[0].name, code: rows[0].code, status: rows[0].status } : null;
};

// Mirrors learning/repository.pg createCohort (status default 'Ongoing');
// duplicate classCode → uq_classes_code_ongoing / uq_classes_code_course_active
// → 23505 → Mongo-style { code: 11000 } → the use-case's 409.
const createCohortClass = async (data, tx) => {
  let rows;
  try {
    ({ rows } = await exec(
      tx,
      `INSERT INTO classes(id, class_code, course_name, program_id, total_sessions, status, custom_fields, teacher_ids)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [
        newId(), data.classCode, data.courseName == null ? null : data.courseName,
        data.programId == null ? null : String(data.programId),
        data.totalSessions == null ? null : data.totalSessions,
        data.status == null ? 'Ongoing' : data.status,
        JSON.stringify(data.customFields || {}), (data.teacherIds || []).map(String),
      ],
    ));
  } catch (err) {
    throw asDup(err);
  }
  const c = rows[0];
  return {
    _id: c.id, classCode: c.class_code, courseName: c.course_name,
    programId: c.program_id || null,
    totalSessions: c.total_sessions == null ? null : Number(c.total_sessions),
    status: c.status, customFields: c.custom_fields || {},
    teacherIds: (c.teacher_ids || []).map(String),
    createdAt: c.created_at, updatedAt: c.updated_at,
  };
};

// ── Label lookups (demand display) ───────────────────────────────────────────
const findProgramsByIds = async (ids) => {
  if (!ids.length) return [];
  const { rows } = await query(
    `SELECT id, name, code FROM learning_programs WHERE id = ANY($1)`, [ids.map(String)]);
  return rows.map((r) => ({ _id: r.id, name: r.name, code: r.code }));
};
// Skill has NO find-hook → deleted skills are still labelled (mirrored on purpose).
const findSkillsByIds = async (ids) => {
  if (!ids.length) return [];
  const { rows } = await query(
    `SELECT id, name FROM skills WHERE id = ANY($1)`, [ids.map(String)]);
  return rows.map((r) => ({ _id: r.id, name: r.name }));
};
const findDepartmentsByIds = async (ids) => {
  if (!ids.length) return [];
  const { rows } = await query(
    `SELECT id, name FROM departments WHERE id = ANY($1) AND is_deleted = false`, [ids.map(String)]);
  return rows.map((r) => ({ _id: r.id, name: r.name }));
};

module.exports = {
  createRequest,
  listRequests,
  findRequestById,
  updateRequest,
  softDeleteRequest,
  markRequestsPlanned,
  aggregateDemand,
  findPlan,
  upsertPlan,
  pushCohortIdToPlanItem,
  findProgramById,
  createCohortClass,
  findProgramsByIds,
  findSkillsByIds,
  findDepartmentsByIds,
};
