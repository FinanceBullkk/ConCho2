const crypto = require('crypto');
const { query } = require('../../config/pg');

// ──────────────────────────────────────────────────────────
// automation/repository — POSTGRES impl. Same interface as ./repository.mongo.
// AutomationRule CRUD + the runner's enabled-by-trigger hot path + recordRun.
//
// Fidelity notes the parity test pins:
//   • soft-delete is EXPLICIT (is_deleted=false) on every read/update; recordRun
//     matches Mongo's updateOne({_id}) — no is_deleted predicate.
//   • conditions/actions are jsonb arrays; create applies the Mongoose defaults
//     (enabled false, system false, conditions/actions []).
//   • listLive order = system DESC, name ASC.
// ──────────────────────────────────────────────────────────

const newId = () => crypto.randomBytes(12).toString('hex');
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

const ruleRow = (r) => (r == null ? null : {
  _id: r.id, name: r.name, trigger: r.trigger,
  conditions: r.conditions || [], actions: r.actions || [],
  enabled: r.enabled, runCount: Number(r.run_count), lastRunAt: r.last_run_at,
  system: r.system, isDeleted: r.is_deleted, deletedAt: r.deleted_at,
  createdAt: r.created_at, updatedAt: r.updated_at,
});

const listLive = async () => {
  const { rows } = await query(
    `SELECT * FROM automation_rules WHERE is_deleted = false ORDER BY system DESC, name ASC`);
  return rows.map(ruleRow);
};

const findById = async (id) => {
  const { rows } = await query(`SELECT * FROM automation_rules WHERE id = $1 AND is_deleted = false`, [String(id)]);
  return rows[0] ? ruleRow(rows[0]) : null;
};

const findEnabledByTrigger = async (trigger) => {
  const { rows } = await query(
    `SELECT * FROM automation_rules WHERE is_deleted = false AND enabled = true AND trigger = $1`, [trigger]);
  return rows.map(ruleRow);
};

const create = async (data) => {
  const { rows } = await query(
    `INSERT INTO automation_rules(id, name, trigger, conditions, actions, enabled, system)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [
      newId(), data.name, data.trigger,
      JSON.stringify(data.conditions || []), JSON.stringify(data.actions || []),
      data.enabled == null ? false : data.enabled, data.system == null ? false : data.system,
    ]);
  return ruleRow(rows[0]);
};

const COL = { name: 'name', trigger: 'trigger', conditions: 'conditions', actions: 'actions', enabled: 'enabled', system: 'system' };
const colVal = (k, v) => ((k === 'conditions' || k === 'actions') ? JSON.stringify(v || []) : v);

const updateById = async (id, patch) => {
  const sets = [];
  const args = [];
  for (const [k, col] of Object.entries(COL)) {
    if (hasOwn(patch, k)) { args.push(colVal(k, patch[k])); sets.push(`${col} = $${args.length}`); }
  }
  if (!sets.length) return findById(id);
  sets.push('updated_at = now()');
  args.push(String(id));
  const { rows } = await query(
    `UPDATE automation_rules SET ${sets.join(', ')} WHERE id = $${args.length} AND is_deleted = false RETURNING *`, args);
  return rows[0] ? ruleRow(rows[0]) : null;
};

const softDeleteById = async (id) => {
  const { rows } = await query(
    `UPDATE automation_rules SET is_deleted = true, deleted_at = now(), updated_at = now()
      WHERE id = $1 AND is_deleted = false RETURNING *`, [String(id)]);
  return rows[0] ? ruleRow(rows[0]) : null;
};

// Mirrors Mongo updateOne({_id}) — no is_deleted predicate.
const recordRun = async (id) => {
  const { rowCount } = await query(
    `UPDATE automation_rules SET run_count = run_count + 1, last_run_at = now() WHERE id = $1`, [String(id)]);
  return { acknowledged: true, matchedCount: rowCount, modifiedCount: rowCount };
};

// Boot-time system-rule seed (Phase 5 slice 3 — A8). Twin of the Mongo
// $setOnInsert upsert keyed (name, system) with NO deleted filter: a
// soft-deleted system rule still matches (NOT EXISTS fails) and stays deleted —
// admins hiding a system rule survive a restart. INSERT…WHERE NOT EXISTS is
// the slice-1 seedRoleIfMissing precedent (boot is single-threaded; the mig-017
// partial unique backstops a race).
const upsertSystemRuleByName = async (rule) => {
  await query(
    `INSERT INTO automation_rules(id, name, trigger, conditions, actions, enabled, system)
     SELECT $1, $2, $3, $4::jsonb, $5::jsonb, $6, true
      WHERE NOT EXISTS (SELECT 1 FROM automation_rules WHERE name = $2 AND system = true)`,
    [
      newId(), rule.name, rule.trigger,
      JSON.stringify(rule.conditions || []), JSON.stringify(rule.actions || []),
      rule.enabled == null ? false : rule.enabled,
    ]);
};

module.exports = { listLive, findById, findEnabledByTrigger, create, updateById, softDeleteById, recordRun, upsertSystemRuleByName };
