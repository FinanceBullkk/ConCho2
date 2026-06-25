// ──────────────────────────────────────────────────────────
// groups/lifecycle-repository — POSTGRES impl
// ──────────────────────────────────────────────────────────
// Same interface as ./lifecycle-repository.mongo. Writes run on the tx client
// (`tx.client`) so they join the caller's BEGIN/COMMIT unit; non-tx reads use
// the pool. Soft-delete = explicit is_deleted predicates (the SQL analogue of
// the Team pre-find hook), so a soft-deleted team is observed by findTeamById
// returning null while findDeletedTeamById still resolves it.
// ──────────────────────────────────────────────────────────
const { query } = require('../../config/pg');

const exec = (tx, text, params) =>
  (tx && tx.client ? tx.client.query(text, params) : query(text, params));

const teamShape = (r) => (r ? { _id: r.id, name: r.name } : null);

const findTeamById = async (id, tx = {}) => {
  const { rows } = await exec(tx, `SELECT id,name FROM teams WHERE id = $1 AND is_deleted = false`, [id]);
  return teamShape(rows[0]);
};

const findDeletedTeamById = async (id) => {
  const { rows } = await query(`SELECT id,name FROM teams WHERE id = $1 AND is_deleted = true`, [id]);
  return teamShape(rows[0]);
};

const closeActiveEnrollments = async (teamId, tx = {}) => {
  const { rowCount } = await exec(
    tx,
    `UPDATE enrollments SET status = 'Dropped', left_at = now(), updated_at = now()
      WHERE team_id = $1 AND status = 'Active'`,
    [teamId],
  );
  return { modifiedCount: rowCount };
};

const markTeamDeleted = (teamId, tx = {}) =>
  exec(
    tx,
    `UPDATE teams SET is_deleted = true, deleted_at = now(), updated_at = now() WHERE id = $1`,
    [teamId],
  );

const markTeamRestored = (id) =>
  query(
    `UPDATE teams SET is_deleted = false, deleted_at = null, updated_at = now() WHERE id = $1`,
    [id],
  );

module.exports = {
  findTeamById,
  findDeletedTeamById,
  closeActiveEnrollments,
  markTeamDeleted,
  markTeamRestored,
};
