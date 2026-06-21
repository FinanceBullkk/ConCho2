// Funnel reference repository — POSTGRES implementation (Phase 2 / 2.6).
// Same semantic interface as ./mongo — `getFunnelCounts({ programId })` — but
// reads the relational tables via config/pg. This is the Phase-3 port pattern:
// the interface is identical; only the internals (Mongo ↔ SQL) swap. Soft-delete
// is an explicit predicate (DATA-009 discipline), not a hook.
const { query } = require('../../config/pg');

const getFunnelCounts = async ({ programId = null } = {}) => {
  let classIds = null;
  if (programId) {
    const { rows } = await query(`SELECT id FROM classes WHERE program_id = $1 AND is_deleted = false`, [programId]);
    classIds = rows.map((r) => r.id);
  }
  const enrCond = classIds ? ' AND class_id = ANY($1)' : '';
  const enrArgs = classIds ? [classIds] : [];

  const enrolled = await query(`SELECT count(*)::int AS n FROM enrollments WHERE status <> 'Transferred'${enrCond}`, enrArgs);
  const completed = await query(`SELECT count(*)::int AS n FROM enrollments WHERE status = 'Completed'${enrCond}`, enrArgs);

  const certCond = programId ? ' AND program_id = $1' : '';
  const certArgs = programId ? [programId] : [];
  const certified = await query(
    `SELECT count(*)::int AS n FROM certificates WHERE status = 'Issued' AND is_deleted = false${certCond}`, certArgs);

  return { enrolled: enrolled.rows[0].n, completed: completed.rows[0].n, certified: certified.rows[0].n };
};

module.exports = { getFunnelCounts };
