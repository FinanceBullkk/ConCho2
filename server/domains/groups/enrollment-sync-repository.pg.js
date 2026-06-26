// ──────────────────────────────────────────────────────────
// groups/enrollment-sync-repository — POSTGRES impl
// ──────────────────────────────────────────────────────────
// Same interface as ./enrollment-sync-repository.mongo. Writes run on the tx
// client (`tx.client`) so they join the caller's BEGIN/COMMIT unit. The transfer
// sets `transferred_to` (migration 024); team membership lives in the
// `team_members` junction (so pullTeamMember is a DELETE, not an array $pull).
// LEFT JOINs apply `is_deleted = false` to mirror the Mongo soft-delete find-hooks.
// ──────────────────────────────────────────────────────────
const { query } = require('../../config/pg');

const exec = (tx, text, params) => (tx && tx.client ? tx.client.query(text, params) : query(text, params));
const iso = (d) => (d ? new Date(d).toISOString() : new Date().toISOString());

const findTeamForEnrollmentContext = async (teamId, tx = {}) => {
  const { rows } = await exec(
    tx,
    `SELECT t.id, t.name, c.id AS class_id, c.class_code, c.course_name
       FROM teams t
       LEFT JOIN classes c ON c.id = t.class_id AND c.is_deleted = false
      WHERE t.id = $1 AND t.is_deleted = false`,
    [teamId],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    _id: r.id,
    name: r.name,
    classId: r.class_id != null ? { _id: r.class_id, classCode: r.class_code, courseName: r.course_name } : null,
  };
};

const findActiveEnrollmentInOtherTeam = async (userId, teamId, tx = {}) => {
  const { rows } = await exec(
    tx,
    `SELECT e.id, e.note, e.team_id, t.name AS team_name
       FROM enrollments e
       LEFT JOIN teams t ON t.id = e.team_id AND t.is_deleted = false
      WHERE e.user_id = $1 AND e.status = 'Active' AND e.team_id IS DISTINCT FROM $2
      LIMIT 1`,
    [userId, teamId],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    _id: r.id,
    teamId: r.team_id != null ? { _id: r.team_id, name: r.team_name } : null,
    note: r.note ?? null,
  };
};

const transferEnrollment = (enrollmentId, { toTeamId, leftAt }, tx = {}) =>
  exec(
    tx,
    `UPDATE enrollments SET status = 'Transferred', left_at = $2, transferred_to = $3, updated_at = now()
      WHERE id = $1`,
    [enrollmentId, iso(leftAt), toTeamId],
  );

const findActiveEnrollmentInTeam = async (userId, teamId, tx = {}) => {
  const { rows } = await exec(
    tx,
    `SELECT id FROM enrollments WHERE user_id = $1 AND team_id = $2 AND status = 'Active' LIMIT 1`,
    [userId, teamId],
  );
  return rows[0] ? { _id: rows[0].id } : null;
};

const dropEnrollment = (enrollmentId, { leftAt }, tx = {}) =>
  exec(
    tx,
    `UPDATE enrollments SET status = 'Dropped', left_at = $2, updated_at = now() WHERE id = $1`,
    [enrollmentId, iso(leftAt)],
  );

const pullTeamMember = (teamId, userId, tx = {}) =>
  exec(tx, `DELETE FROM team_members WHERE team_id = $1 AND user_id = $2`, [teamId, userId]);

const findUserContact = async (userId) => {
  const { rows } = await query(`SELECT name, email FROM users WHERE id = $1`, [userId]);
  return rows[0] ? { name: rows[0].name, email: rows[0].email } : null;
};

module.exports = {
  findTeamForEnrollmentContext,
  findActiveEnrollmentInOtherTeam,
  transferEnrollment,
  findActiveEnrollmentInTeam,
  dropEnrollment,
  pullTeamMember,
  findUserContact,
};
