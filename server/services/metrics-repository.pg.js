const crypto = require('crypto');
const { query } = require('../config/pg');

// metrics-repository — POSTGRES impl (Phase 3 Wave-F). Same interface as
// ./metrics-repository.mongo.
//
// Fidelity notes the parity test pins:
//   • upsertSnapshots is idempotent per (scope, scopeId|'', key, date) via
//     ON CONFLICT on uq_metric_snap_series (COALESCE index, mig 002);
//     `modified` counts only rows whose value actually CHANGED — mirroring
//     Mongo bulkWrite's modifiedCount ($set to the same value counts 0);
//   • countEnrollments/countCertificates accept the funnel's KNOWN filter
//     grammar (equality, status $ne, classId $in, isDeleted $ne:true) and
//     throw on anything else — fail-loud beats silently wrong counts;
//   • classes soft-delete predicate mirrors the Class find-hook; Enrollment
//     has no soft-delete hook (status-driven), certificates carry their own
//     isDeleted flag in BOTH the Mongo filter and the SQL.

const newId = () => crypto.randomBytes(12).toString('hex');

// ── Snapshot writer (metricSnapshotService) ───────────────

const findProgramClasses = async () => {
  const { rows } = await query(
    `SELECT id, program_id FROM classes WHERE program_id IS NOT NULL AND is_deleted = false`
  );
  return rows.map((r) => ({ _id: r.id, programId: r.program_id }));
};

const aggregateEnrollmentsByClassStatus = async () => {
  const { rows } = await query(
    `SELECT class_id, status, count(*)::int AS count FROM enrollments GROUP BY class_id, status`
  );
  return rows.map((r) => ({ _id: { classId: r.class_id, status: r.status }, count: r.count }));
};

const aggregateIssuedCertsByProgram = async () => {
  const { rows } = await query(
    `SELECT program_id AS "_id", count(*)::int AS count
       FROM certificates WHERE status = 'Issued' AND is_deleted = false
      GROUP BY program_id`
  );
  return rows;
};

const upsertSnapshots = async (day, metrics) => {
  let upserted = 0;
  let modified = 0;
  for (const m of metrics) {
    const scopeId = m.scopeId ? String(m.scopeId) : null;
    const { rows } = await query(
      `INSERT INTO metric_snapshots(id, date, scope, scope_id, key, value)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (scope, coalesce(scope_id, ''), key, date)
       DO UPDATE SET value = EXCLUDED.value
         WHERE metric_snapshots.value IS DISTINCT FROM EXCLUDED.value
       RETURNING (xmax = 0) AS inserted`,
      [newId(), day, m.scope, scopeId, m.key, m.value]
    );
    if (rows[0]) {
      if (rows[0].inserted) upserted += 1;
      else modified += 1;
    }
    // no row returned = conflict with an IDENTICAL value → neither counter,
    // exactly Mongo's modifiedCount semantics.
  }
  return { upserted, modified };
};

const findNonTransferredEnrollments = async () => {
  const { rows } = await query(
    `SELECT id, joined_at, created_at, status, left_at, updated_at, class_id
       FROM enrollments WHERE status <> 'Transferred'`
  );
  return rows.map((r) => ({
    _id: r.id,
    joinedAt: r.joined_at,
    createdAt: r.created_at,
    status: r.status,
    leftAt: r.left_at,
    updatedAt: r.updated_at,
    classId: r.class_id,
  }));
};

const findIssuedCertificates = async () => {
  const { rows } = await query(
    `SELECT id, issued_at, created_at, program_id
       FROM certificates WHERE status = 'Issued' AND is_deleted = false`
  );
  return rows.map((r) => ({
    _id: r.id,
    issuedAt: r.issued_at,
    createdAt: r.created_at,
    programId: r.program_id,
  }));
};

// ── Series + funnel reader (analyticsSeriesService) ───────

const findSnapshotSeries = async ({ key, scope, scopeId, since }) => {
  const sid = scopeId ? String(scopeId) : null;
  const { rows } = await query(
    `SELECT date, value FROM metric_snapshots
      WHERE key = $1 AND scope = $2 AND scope_id IS NOT DISTINCT FROM $3 AND date >= $4
      ORDER BY date ASC`,
    [key, scope, sid, since]
  );
  return rows.map((r) => ({ date: r.date, value: Number(r.value) }));
};

const findClassIdsForProgram = async (programId) => {
  const { rows } = await query(
    `SELECT id FROM classes WHERE program_id = $1 AND is_deleted = false`,
    [String(programId)]
  );
  return rows.map((r) => ({ _id: r.id }));
};

// The funnel's known filter grammar → WHERE. Throws on unknown shapes so a
// future filter change fails loudly instead of counting wrong.
const matchToWhere = (match, columns) => {
  const parts = [];
  const params = [];
  for (const [key, val] of Object.entries(match)) {
    const col = columns[key];
    if (!col) throw new Error(`metrics-repository.pg: unsupported filter key "${key}"`);
    if (val !== null && typeof val === 'object') {
      if ('$ne' in val && Object.keys(val).length === 1) {
        if (key === 'isDeleted' && val.$ne === true) {
          parts.push(`${col} = false`);
        } else {
          params.push(val.$ne);
          parts.push(`${col} <> $${params.length}`);
        }
      } else if ('$in' in val && Object.keys(val).length === 1) {
        params.push(val.$in.map(String));
        parts.push(`${col} = ANY($${params.length})`);
      } else {
        throw new Error(`metrics-repository.pg: unsupported operator on "${key}"`);
      }
    } else {
      params.push(typeof val === 'boolean' ? val : String(val));
      parts.push(`${col} = $${params.length}`);
    }
  }
  return { where: parts.length ? parts.join(' AND ') : 'true', params };
};

const countEnrollments = async (match) => {
  const { where, params } = matchToWhere(match, {
    status: 'status',
    classId: 'class_id',
  });
  const { rows } = await query(`SELECT count(*)::int AS n FROM enrollments WHERE ${where}`, params);
  return rows[0].n;
};

const countCertificates = async (match) => {
  const { where, params } = matchToWhere(match, {
    status: 'status',
    isDeleted: 'is_deleted',
    programId: 'program_id',
  });
  const { rows } = await query(`SELECT count(*)::int AS n FROM certificates WHERE ${where}`, params);
  return rows[0].n;
};

module.exports = {
  findProgramClasses,
  aggregateEnrollmentsByClassStatus,
  aggregateIssuedCertsByProgram,
  upsertSnapshots,
  findNonTransferredEnrollments,
  findIssuedCertificates,
  findSnapshotSeries,
  findClassIdsForProgram,
  countEnrollments,
  countCertificates,
};
