const { query } = require('../../config/pg');

// audit-query-repository — POSTGRES impl (Phase 3 Wave-F).
// Same interface as ./audit-query-repository.mongo.
//
// Fidelity notes the parity test pins:
//   • The route hands this repo a Mongo-shaped filter object (entity, entityId,
//     actorId, action, createdAt:{$gte,$lte}) built from req.query — translated
//     here to a parameterized WHERE, columns prefixed `al.` (both audit_log and
//     users carry created_at, so an unqualified column would be ambiguous once
//     the actor join is added).
//   • `.populate('actorId', 'empCode name role')` ⇔ a LEFT JOIN users guarded by
//     `is_deleted = false`. Mongoose's soft-delete find-hook fires during
//     population too, so a null actorId OR a reference to a deleted/missing user
//     both resolve to `actorId: null` on lean() — mirrored by keying the "found"
//     branch off the joined user's own id (au.id), not off a selected label
//     column (a legitimately-null empCode must not be confused with "no match").
//   • seq is bigint → node-pg returns a string; normalized to Number (undefined
//     when absent, matching a Mongo doc that never had the field set pre-chain).
const findEntries = async (filter, { skip, limit }) => {
  const { where, args } = buildWhere(filter);
  const limitIdx = args.length + 1;
  const offsetIdx = args.length + 2;
  const { rows } = await query(
    `SELECT al.id, al.actor_id, al.actor_role, al.actor_emp_code, al.action,
            al.entity, al.entity_id, al.diff, al.request_id, al.ip, al.user_agent,
            al.note, al.seq, al.prev_hash, al.hash, al.created_at,
            au.id AS a_id, au.emp_code AS a_emp_code, au.name AS a_name, au.role AS a_role
       FROM audit_log al
       LEFT JOIN users au ON au.id = al.actor_id AND au.is_deleted = false
       ${where}
      ORDER BY al.created_at DESC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    [...args, limit, skip],
  );
  return rows.map(entryRow);
};

const countEntries = async (filter) => {
  const { where, args } = buildWhere(filter);
  const { rows } = await query(`SELECT count(*)::int AS n FROM audit_log al ${where}`, args);
  return rows[0].n;
};

// Full history for one entity (the "show me everything about X" support flow).
const findByEntity = async (entity, entityId, limit = 500) => {
  const { rows } = await query(
    `SELECT al.id, al.actor_id, al.actor_role, al.actor_emp_code, al.action,
            al.entity, al.entity_id, al.diff, al.request_id, al.ip, al.user_agent,
            al.note, al.seq, al.prev_hash, al.hash, al.created_at,
            au.id AS a_id, au.emp_code AS a_emp_code, au.name AS a_name, au.role AS a_role
       FROM audit_log al
       LEFT JOIN users au ON au.id = al.actor_id AND au.is_deleted = false
      WHERE al.entity = $1 AND al.entity_id = $2
      ORDER BY al.created_at DESC
      LIMIT $3`,
    [String(entity), String(entityId), limit],
  );
  return rows.map(entryRow);
};

// ── Filter → WHERE builder ───────────────────────────────────────────────────
// filter keys mirror the Mongo shape the route builds: entity / entityId /
// actorId / action (plain equality) + createdAt:{$gte,$lte} (range).
const FILTER_COL = { entity: 'al.entity', entityId: 'al.entity_id', actorId: 'al.actor_id', action: 'al.action' };
function buildWhere(filter = {}) {
  const conds = [];
  const args = [];
  for (const [k, col] of Object.entries(FILTER_COL)) {
    if (filter[k] !== undefined && filter[k] !== null) {
      args.push(String(filter[k]));
      conds.push(`${col} = $${args.length}`);
    }
  }
  if (filter.createdAt) {
    if (filter.createdAt.$gte) { args.push(filter.createdAt.$gte); conds.push(`al.created_at >= $${args.length}`); }
    if (filter.createdAt.$lte) { args.push(filter.createdAt.$lte); conds.push(`al.created_at <= $${args.length}`); }
  }
  return { where: conds.length ? `WHERE ${conds.join(' AND ')}` : '', args };
}

// ── Row shape (mirrors AuditLog.lean() + populated actorId) ─────────────────
function entryRow(r) {
  return {
    _id: r.id,
    actorId: r.a_id == null ? null : { _id: r.a_id, empCode: r.a_emp_code, name: r.a_name, role: r.a_role },
    actorRole: r.actor_role,
    actorEmpCode: r.actor_emp_code,
    action: r.action,
    entity: r.entity,
    entityId: r.entity_id,
    diff: r.diff,
    requestId: r.request_id,
    ip: r.ip,
    userAgent: r.user_agent,
    note: r.note,
    seq: r.seq == null ? undefined : Number(r.seq),
    prevHash: r.prev_hash,
    hash: r.hash,
    createdAt: r.created_at,
  };
}

module.exports = { findEntries, countEntries, findByEntity };
