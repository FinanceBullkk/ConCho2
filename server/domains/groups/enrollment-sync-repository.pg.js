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

// The learner's Active enrollment in a team, populated for the transfer HTTP
// response — user/team/class + the transferred-to team, each dropped to null
// when soft-deleted (mirrors the Mongo populate hooks).
const findActiveTeamEnrollmentPopulated = async (userId, teamId) => {
  const { rows } = await query(
    `SELECT e.id, e.status, e.note, e.joined_at, e.left_at, e.created_at, e.updated_at,
            u.id AS u_id, u.emp_code AS u_emp, u.name AS u_name, u.department AS u_dept, u.status AS u_status,
            t.id AS t_id, t.name AS t_name,
            c.id AS c_id, c.class_code AS c_code, c.course_name AS c_course, c.total_sessions AS c_total,
            tt.id AS tt_id, tt.name AS tt_name
       FROM enrollments e
       LEFT JOIN users u    ON u.id = e.user_id         AND u.is_deleted = false
       LEFT JOIN teams t    ON t.id = e.team_id          AND t.is_deleted = false
       LEFT JOIN classes c  ON c.id = e.class_id         AND c.is_deleted = false
       LEFT JOIN teams tt   ON tt.id = e.transferred_to  AND tt.is_deleted = false
      WHERE e.user_id = $1 AND e.team_id = $2 AND e.status = 'Active'
      LIMIT 1`,
    [String(userId), String(teamId)]);
  const r = rows[0];
  if (!r) return null;
  return {
    _id: r.id, status: r.status, note: r.note == null ? undefined : r.note,
    joinedAt: r.joined_at, leftAt: r.left_at || null,
    userId: r.u_id ? { _id: r.u_id, empCode: r.u_emp, name: r.u_name, department: r.u_dept, status: r.u_status } : null,
    teamId: r.t_id ? { _id: r.t_id, name: r.t_name } : null,
    classId: r.c_id ? { _id: r.c_id, classCode: r.c_code, courseName: r.c_course, totalSessions: r.c_total == null ? null : Number(r.c_total) } : null,
    transferredTo: r.tt_id ? { _id: r.tt_id, name: r.tt_name } : null,
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
};

// Attach a note to the learner's Active enrollment in a team (transfer note,
// post-commit — non-tx pool write).
const setActiveTeamEnrollmentNote = (userId, teamId, note) =>
  query(`UPDATE enrollments SET note = $3, updated_at = now() WHERE user_id = $1 AND team_id = $2 AND status = 'Active'`,
    [String(userId), String(teamId), note]);

module.exports = {
  findTeamForEnrollmentContext,
  findActiveEnrollmentInOtherTeam,
  transferEnrollment,
  findActiveEnrollmentInTeam,
  dropEnrollment,
  pullTeamMember,
  findUserContact,
  findActiveTeamEnrollmentPopulated,
  setActiveTeamEnrollmentNote,
};
