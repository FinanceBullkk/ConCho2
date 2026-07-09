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

// The cohort partial-unique (mig 010) rejects a concurrent-race duplicate with
// 23505 — re-throw it as a Mongo-style { code: 11000 } so the use-case's
// duplicate handler maps it to 409 (the sequential dup is caught earlier by the
// findActiveCohortEnrollment pre-check; only the race reaches the insert).
const duplicateError = () => {
  const e = new Error('duplicate active enrollment');
  e.code = 11000;
  return e;
};

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

// Transaction-aware (#255): when the caller passes the UoW tx handle
// ({client} on PG) the INSERT joins that BEGIN/COMMIT unit, so the transfer/
// team-sync enrollment create rolls back with the team + schedule writes. A raw
// mongoose session (legacy Mongo callers) has no client → pool autocommit.
// joinedAt defaults to now() like the model.
const insertActiveEnrollment = async ({ userId, classId = null, teamId = null, joinedAt }, handle = null) => {
  const exec = (text, params) => (handle && handle.client ? handle.client.query(text, params) : query(text, params));
  let rows;
  try {
    ({ rows } = await exec(
      `INSERT INTO enrollments(id,user_id,class_id,team_id,status,joined_at)
       VALUES ($1,$2,$3,$4,'Active',$5) RETURNING *`,
      [newId(), String(userId), classId == null ? null : String(classId), teamId == null ? null : String(teamId),
        joinedAt ? new Date(joinedAt).toISOString() : new Date().toISOString()]));
  } catch (error) {
    if (error && error.code === '23505') throw duplicateError();
    throw error;
  }
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

// ── Legacy /api/enrollments admin overrides (Phase 5 slice 4, B2-tail) ──────
// tx-aware exec: joins the caller's unit-of-work client, else pool autocommit.
const texec = (tx, text, params) => (tx && tx.client ? tx.client.query(text, params) : query(text, params));

const findEnrollmentByIdLean = async (id) => {
  const { rows } = await query('SELECT * FROM enrollments WHERE id = $1', [String(id)]);
  return rows[0] ? enrollmentRow(rows[0]) : null;
};

// Bounded $set twin — the admin-override patch keys only.
const ENROLLMENT_PATCH_COLS = { status: 'status', leftAt: 'left_at', note: 'note' };
const patchSets = (patch, args) => {
  const sets = [];
  for (const [k, col] of Object.entries(ENROLLMENT_PATCH_COLS)) {
    if (patch[k] === undefined) continue;
    args.push(k === 'leftAt' && patch[k] != null ? new Date(patch[k]).toISOString() : patch[k]);
    sets.push(`${col} = $${args.length}`);
  }
  return sets;
};

const updateEnrollmentById = async (id, patch, tx) => {
  const args = [String(id)];
  const sets = patchSets(patch, args);
  if (!sets.length) return findEnrollmentByIdLean(id);
  sets.push('updated_at = now()');
  const { rows } = await texec(tx,
    `UPDATE enrollments SET ${sets.join(', ')} WHERE id = $1 RETURNING *`, args);
  return rows[0] ? enrollmentRow(rows[0]) : null;
};

const findEnrollmentUserIdsByIds = async (ids) => {
  const { rows } = await query(
    'SELECT id, user_id FROM enrollments WHERE id = ANY($1::text[])', [ids.map(String)]);
  return rows.map((r) => ({ _id: r.id, userId: r.user_id }));
};

const bulkUpdateEnrollmentsByIds = async (ids, patch, tx) => {
  const args = [ids.map(String)];
  const sets = patchSets(patch, args);
  if (!sets.length) return { modifiedCount: 0 };
  sets.push('updated_at = now()');
  const { rowCount } = await texec(tx,
    `UPDATE enrollments SET ${sets.join(', ')} WHERE id = ANY($1::text[])`, args);
  return { modifiedCount: rowCount };
};

// Shared 4-way populate SELECT — populate('userId'/'teamId'/'classId'/
// 'transferredTo') ⇔ LEFT JOIN embeds with the same soft-delete drop semantics
// (User/Team/Class hooks hide trashed refs; transferredTo → teams). Reused by
// findEnrollmentByIdPopulated + the legacy /api/enrollments list reads.
const POPULATED_SELECT = `
  SELECT e.*,
         u.id AS u_id, u.emp_code AS u_emp, u.name AS u_name, u.department AS u_dept, u.status AS u_status,
         t.id AS t_id, t.name AS t_name, t.class_id AS t_class,
         c.id AS c_id, c.class_code AS c_code, c.course_name AS c_course, c.total_sessions AS c_total,
         x.id AS x_id, x.name AS x_name
    FROM enrollments e
    LEFT JOIN users u   ON u.id = e.user_id AND u.is_deleted = false
    LEFT JOIN teams t   ON t.id = e.team_id AND t.is_deleted = false
    LEFT JOIN classes c ON c.id = e.class_id AND c.is_deleted = false
    LEFT JOIN teams x   ON x.id = e.transferred_to AND x.is_deleted = false`;

// `teamClassId`: include the team's class_id ref on the populated teamId (the
// getTeamEnrollments variant populates teamId with 'name classId').
const mapPopulatedRow = (r, { teamClassId = false } = {}) => {
  const out = enrollmentRow(r);
  out.userId = r.u_id ? { _id: r.u_id, empCode: r.u_emp, name: r.u_name, department: r.u_dept, status: r.u_status } : null;
  out.teamId = r.t_id
    ? (teamClassId ? { _id: r.t_id, name: r.t_name, classId: r.t_class || null } : { _id: r.t_id, name: r.t_name })
    : null;
  out.classId = r.c_id ? { _id: r.c_id, classCode: r.c_code, courseName: r.c_course, totalSessions: r.c_total == null ? null : Number(r.c_total) } : null;
  out.transferredTo = r.x_id ? { _id: r.x_id, name: r.x_name } : null;
  return out;
};

const findEnrollmentByIdPopulated = async (id) => {
  const { rows } = await query(`${POPULATED_SELECT} WHERE e.id = $1`, [String(id)]);
  return rows[0] ? mapPopulatedRow(rows[0]) : null;
};

// ── Legacy /api/enrollments list reads (K1b slice 3) ────────────────────────
const listEnrollments = async ({ teamId, userId, status, classId } = {}) => {
  const conds = [];
  const args = [];
  if (teamId) { args.push(String(teamId)); conds.push(`e.team_id = $${args.length}`); }
  if (userId) { args.push(String(userId)); conds.push(`e.user_id = $${args.length}`); }
  if (status) { args.push(status); conds.push(`e.status = $${args.length}`); }
  if (classId) { args.push(String(classId)); conds.push(`e.class_id = $${args.length}`); }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const { rows } = await query(`${POPULATED_SELECT} ${where} ORDER BY e.joined_at DESC`, args);
  return rows.map((r) => mapPopulatedRow(r));
};

const listTeamEnrollments = async ({ teamId, status }) => {
  const args = [String(teamId)];
  let extra = '';
  if (status && status !== 'All') { args.push(status); extra = `AND e.status = $${args.length}`; }
  const { rows } = await query(
    `${POPULATED_SELECT} WHERE e.team_id = $1 ${extra} ORDER BY e.status ASC, e.joined_at DESC`, args);
  return rows.map((r) => mapPopulatedRow(r, { teamClassId: true }));
};

const listUserEnrollments = async (userId) => {
  const { rows } = await query(`${POPULATED_SELECT} WHERE e.user_id = $1 ORDER BY e.joined_at DESC`, [String(userId)]);
  return rows.map((r) => mapPopulatedRow(r));
};

// Mongo `teamId: { $ne: X }` matches teamId:null rows (cohort mode) too — the
// faithful SQL analogue is IS DISTINCT FROM (plain `<>` would drop NULLs).
const findActiveConflicts = async ({ memberIds, teamId }) => {
  const { rows } = await query(
    `${POPULATED_SELECT}
      WHERE e.user_id = ANY($1::text[]) AND e.status = 'Active' AND e.team_id IS DISTINCT FROM $2
      ORDER BY e.joined_at DESC`,
    [memberIds.map(String), teamId == null ? null : String(teamId)]);
  return rows.map((r) => mapPopulatedRow(r));
};

module.exports = {
  findActiveCohortEnrollment,
  insertActiveEnrollment,
  listCohortEnrollments,
  listEnrollmentsForLearner,
  findCohortEnrollmentById,
  markDropped,
  findEnrollmentByIdLean,
  updateEnrollmentById,
  findEnrollmentUserIdsByIds,
  bulkUpdateEnrollmentsByIds,
  findEnrollmentByIdPopulated,
  listEnrollments,
  listTeamEnrollments,
  listUserEnrollments,
  findActiveConflicts,
  findCohort,
  findCohortSchedulingMode,
  countActiveCohortEnrollments,
  findCohortCapacityPolicy,
};
