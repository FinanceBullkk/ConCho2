const { query } = require('../../../config/pg');
const { ACTIVE_ENROLLMENT_STATUSES } = require('../../../helpers/cohortMembership');

// ──────────────────────────────────────────────────────────
// learning/dashboard/executive-repository — POSTGRES impl. Same interface as
// ./executive-repository.mongo. Org-wide strategic aggregations + the
// LND_COST_CONFIG Setting upsert.
//
// Fidelity notes the parity test pins:
//   • month buckets use UTC ($dateToString defaults to UTC) → `AT TIME ZONE 'UTC'`.
//   • soft-delete is explicit on User/Certificate/LearningPath reads; Enrollment +
//     Attendance have NO soft-delete (status lifecycle / none) → no is_deleted there.
//   • coverageByDepartment replicates the exact JS Set/Map grouping (active desc).
//   • $addToSet → array_agg(DISTINCT …); counts via FILTER.
// ──────────────────────────────────────────────────────────

const COST_CONFIG_KEY = 'LND_COST_CONFIG';
const DAY_MS = 86400000;

const getCostConfig = async () => {
  const { rows } = await query(`SELECT value FROM settings WHERE key = $1 LIMIT 1`, [COST_CONFIG_KEY]);
  return rows[0] ? (rows[0].value || null) : null;
};

const upsertCostConfig = async (value) => {
  const before = await getCostConfig();
  const crypto = require('crypto');
  await query(
    `INSERT INTO settings(id, key, value, description) VALUES ($1,$2,$3,$4)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description, updated_at = now()`,
    [crypto.randomBytes(12).toString('hex'), COST_CONFIG_KEY, JSON.stringify(value),
      'L&D cost inputs for the executive dashboard (integer minor currency units)']);
  return { before, after: value };
};

const activeEmployeeCount = async () => {
  const { rows } = await query(`SELECT count(*)::int AS n FROM users WHERE status = 'Active' AND is_deleted = false`);
  return rows[0].n;
};

// Month-bucketed events. $dateToString defaults to UTC → bucket in UTC.
const monthBuckets = async (table, dateCol, start, extraWhere = '') => {
  const { rows } = await query(
    `SELECT to_char(${dateCol} AT TIME ZONE 'UTC', 'YYYY-MM') AS m, count(*)::int AS count
       FROM ${table} WHERE ${dateCol} >= $1 ${extraWhere} GROUP BY m`, [new Date(start).toISOString()]);
  return rows.map((r) => ({ _id: r.m, count: r.count }));
};

const monthlyEventBuckets = async (start) => {
  const [enrollments, certificates] = await Promise.all([
    monthBuckets('enrollments', 'created_at', start), // Enrollment has no soft-delete
    monthBuckets('certificates', 'issued_at', start, 'AND is_deleted = false'),
  ]);
  return { enrollments, certificates };
};

const issuedCertificateCount = async (since) => {
  const { rows } = await query(
    `SELECT count(*)::int AS n FROM certificates WHERE status = 'Issued' AND is_deleted = false AND issued_at >= $1`,
    [new Date(since).toISOString()]);
  return rows[0].n;
};

const certificateValidityRollup = async (now) => {
  const d30 = new Date(now.getTime() + 30 * DAY_MS);
  const { rows } = await query(
    `SELECT
       count(*) FILTER (WHERE status='Issued' AND is_deleted=false)::int AS total_issued,
       count(*) FILTER (WHERE status='Issued' AND is_deleted=false AND valid_until IS NULL)::int AS non_expiring,
       count(*) FILTER (WHERE status='Issued' AND is_deleted=false AND valid_until >= $1 AND valid_until <= $2)::int AS expiring30,
       count(*) FILTER (WHERE status='Issued' AND is_deleted=false AND valid_until IS NOT NULL AND valid_until < $1)::int AS expired,
       count(*) FILTER (WHERE status='Revoked' AND is_deleted=false)::int AS revoked
     FROM certificates`,
    [now.toISOString(), d30.toISOString()]);
  const r = rows[0];
  return {
    totalIssued: r.total_issued,
    valid: r.total_issued - r.expired,
    nonExpiring: r.non_expiring,
    expiring30: r.expiring30,
    expired: r.expired,
    revoked: r.revoked,
  };
};

const engagedUserIds = async (windowStart) => {
  const ws = new Date(windowStart).toISOString();
  const [att, enr] = await Promise.all([
    query(`SELECT DISTINCT user_id FROM attendances WHERE created_at >= $1`, [ws]),
    query(`SELECT DISTINCT user_id FROM enrollments WHERE created_at >= $1 AND status = ANY($2)`, [ws, ACTIVE_ENROLLMENT_STATUSES]),
  ]);
  return [...new Set([...att.rows, ...enr.rows].map((r) => String(r.user_id)))];
};

const coverageByDepartment = async (windowStart) => {
  const engagedSet = new Set(await engagedUserIds(windowStart));
  const { rows: participants } = await query(
    `SELECT id, department FROM users WHERE role = 'Participant' AND status = 'Active' AND is_deleted = false`);

  const byDept = new Map();
  for (const user of participants) {
    const key = user.department || 'Unassigned';
    const row = byDept.get(key) || { department: key, active: 0, engaged: 0 };
    row.active += 1;
    if (engagedSet.has(String(user.id))) row.engaged += 1;
    byDept.set(key, row);
  }
  return [...byDept.values()].sort((a, b) => b.active - a.active);
};

const listActivePaths = async () => {
  const { rows } = await query(
    `SELECT id, title, programs FROM learning_paths WHERE status <> 'archived' AND is_deleted = false`);
  return rows.map((r) => ({ _id: r.id, title: r.title, programs: (r.programs || []).map(String) }));
};

const issuedProgramSetsByUser = async (programIds) => {
  if (!programIds.length) return [];
  const { rows } = await query(
    `SELECT user_id, array_agg(DISTINCT program_id) AS programs
       FROM certificates WHERE program_id = ANY($1) AND status = 'Issued' AND is_deleted = false
      GROUP BY user_id`, [programIds.map(String)]);
  return rows.map((r) => ({ _id: r.user_id, programs: (r.programs || []).map(String) }));
};

module.exports = {
  COST_CONFIG_KEY,
  getCostConfig,
  upsertCostConfig,
  activeEmployeeCount,
  monthlyEventBuckets,
  issuedCertificateCount,
  certificateValidityRollup,
  coverageByDepartment,
  listActivePaths,
  issuedProgramSetsByUser,
};
