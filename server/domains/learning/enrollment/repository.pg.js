const crypto = require('crypto');
const { query } = require('../../../config/pg');

// ──────────────────────────────────────────────────────────
// learning/enrollment/repository — POSTGRES impl. Same interface as
// ./repository.mongo. Cohort-scoped reads (team_id IS NULL) + the shared
// insertActiveEnrollment create spine + program-policy resolvers.
//
// Fidelity notes the parity test pins:
//   • populate('userId'/'classId'/'teamId') → LEFT JOIN … AND is_deleted=false
//     (User/Class/Team have soft-delete hooks → a deleted ref populates as null).
//   • insertActiveEnrollment is session-aware in Mongo (team-sync transaction);
//     PG ignores `session` — atomicity deferred to the Wave-D transaction
//     abstraction. The cohort duplicate guard is migration 010's partial-unique.
//   • Enrollment has NO soft-delete (lifecycle = status).
// ──────────────────────────────────────────────────────────

const newId = () => crypto.randomBytes(12).toString('hex');

const enrollmentRow = (r) => (r == null ? null : {
  _id: r.id, userId: r.user_id || null, classId: r.class_id || null, teamId: r.team_id || null,
  status: r.status, joinedAt: r.joined_at, leftAt: r.left_at || null, note: r.note == null ? undefined : r.note,
  createdAt: r.created_at, updatedAt: r.updated_at,
});
const popUser = (r) => (r.u_id ? { _id: r.u_id, empCode: r.u_emp, name: r.u_name, department: r.u_dept, status: r.u_status } : null);
const popClass = (r) => (r.c_id ? { _id: r.c_id, classCode: r.c_code, courseName: r.c_course, programId: r.c_prog || null } : null);
const popTeam = (r) => (r.t_id ? { _id: r.t_id, name: r.t_name } : null);

const findActiveCohortEnrollment = async (userId, cohortId) => {
  const { rows } = await query(
    `SELECT * FROM enrollments WHERE user_id = $1 AND class_id = $2 AND team_id IS NULL AND status = 'Active' LIMIT 1`,
    [String(userId), String(cohortId)]);
  return rows[0] ? enrollmentRow(rows[0]) : null;
};

// session IGNORED in PG (deferred to Wave-D); joinedAt defaults to now() like the model.
const insertActiveEnrollment = async ({ userId, classId = null, teamId = null, joinedAt } /* , session */) => {
  const { rows } = await query(
    `INSERT INTO enrollments(id,user_id,class_id,team_id,status,joined_at)
     VALUES ($1,$2,$3,$4,'Active',$5) RETURNING *`,
    [newId(), String(userId), classId == null ? null : String(classId), teamId == null ? null : String(teamId),
      joinedAt ? new Date(joinedAt).toISOString() : new Date().toISOString()]);
  return enrollmentRow(rows[0]);
};

const listCohortEnrollments = async ({ cohortId, learnerId }) => {
  const conds = ['e.team_id IS NULL'];
  const args = [];
  if (cohortId) { args.push(String(cohortId)); conds.push(`e.class_id = $${args.length}`); }
  if (learnerId) { args.push(String(learnerId)); conds.push(`e.user_id = $${args.length}`); }
  const { rows } = await query(
    `SELECT e.*, u.id AS u_id, u.emp_code AS u_emp, u.name AS u_name, u.department AS u_dept, u.status AS u_status,
            c.id AS c_id, c.class_code AS c_code, c.course_name AS c_course, c.program_id AS c_prog
       FROM enrollments e
       LEFT JOIN users u   ON u.id = e.user_id  AND u.is_deleted = false
       LEFT JOIN classes c ON c.id = e.class_id AND c.is_deleted = false
      WHERE ${conds.join(' AND ')}
      ORDER BY e.created_at DESC`, args);
  return rows.map((r) => ({ ...enrollmentRow(r), userId: popUser(r), classId: popClass(r) }));
};

const listEnrollmentsForLearner = async (userId) => {
  const { rows } = await query(
    `SELECT e.*, c.id AS c_id, c.class_code AS c_code, c.course_name AS c_course, c.program_id AS c_prog,
            t.id AS t_id, t.name AS t_name
       FROM enrollments e
       LEFT JOIN classes c ON c.id = e.class_id AND c.is_deleted = false
       LEFT JOIN teams   t ON t.id = e.team_id  AND t.is_deleted = false
      WHERE e.user_id = $1
      ORDER BY e.joined_at DESC`, [String(userId)]);
  return rows.map((r) => ({ ...enrollmentRow(r), classId: popClass(r), teamId: popTeam(r) }));
};

const findCohortEnrollmentById = async (id) => {
  const { rows } = await query(`SELECT * FROM enrollments WHERE id = $1 AND team_id IS NULL`, [String(id)]);
  return rows[0] ? enrollmentRow(rows[0]) : null;
};

const markDropped = async (id) => {
  const { rows } = await query(
    `UPDATE enrollments SET status = 'Dropped', left_at = now(), updated_at = now() WHERE id = $1 RETURNING *`,
    [String(id)]);
  return rows[0] ? enrollmentRow(rows[0]) : null;
};

const findCohort = async (cohortId) => {
  const { rows } = await query(
    `SELECT id, class_code, course_name, program_id, is_deleted FROM classes WHERE id = $1 AND is_deleted = false`,
    [String(cohortId)]);
  if (!rows[0]) return null;
  const r = rows[0];
  return { _id: r.id, classCode: r.class_code, courseName: r.course_name, programId: r.program_id || null, isDeleted: r.is_deleted };
};

const findCohortSchedulingMode = async (cohortId) => {
  const { rows } = await query(
    `SELECT p.scheduling_mode FROM classes c
       LEFT JOIN learning_programs p ON p.id = c.program_id
      WHERE c.id = $1 AND c.is_deleted = false`, [String(cohortId)]);
  return rows[0] ? (rows[0].scheduling_mode || null) : null;
};

const countActiveCohortEnrollments = async (cohortId) => {
  const { rows } = await query(
    `SELECT count(*)::int AS n FROM enrollments WHERE class_id = $1 AND team_id IS NULL AND status = 'Active'`,
    [String(cohortId)]);
  return rows[0].n;
};

const findCohortCapacityPolicy = async (cohortId) => {
  const { rows } = await query(
    `SELECT p.capacity_policy FROM classes c
       LEFT JOIN learning_programs p ON p.id = c.program_id
      WHERE c.id = $1 AND c.is_deleted = false`, [String(cohortId)]);
  return rows[0] && rows[0].capacity_policy ? rows[0].capacity_policy : {};
};

module.exports = {
  findActiveCohortEnrollment,
  insertActiveEnrollment,
  listCohortEnrollments,
  listEnrollmentsForLearner,
  findCohortEnrollmentById,
  markDropped,
  findCohort,
  findCohortSchedulingMode,
  countActiveCohortEnrollments,
  findCohortCapacityPolicy,
};
