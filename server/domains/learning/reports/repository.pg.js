const { query } = require('../../../config/pg');
const { ACTIVE_ENROLLMENT_STATUSES } = require('../../../helpers/cohortMembership');
const { ATTENDED_STATUSES } = require('../completion/repository');

// ──────────────────────────────────────────────────────────
// learning/reports/repository — POSTGRES impl (Phase 3 Wave-B dual-backend port).
// Read surface for the completion-rollup, compliance, org-export and A5
// training-hours reports. Same interface as ./repository.mongo; ./repository
// resolves by DB_BACKEND. No new tables (reuses 001/004/011/012/023/025).
//
// Fidelity notes the parity test pins (Mongo ⇔ SQL):
//   • Soft-delete predicates are EXPLICIT. The Mongo find-HOOKS that auto-filter
//     (Class, User, Department, Evaluation) → is_deleted = false here even where
//     the source query has no explicit isDeleted clause (listEvaluations!). The
//     models WITHOUT a hook (Schedule/Enrollment/Certificate/Feedback/Attempt/
//     LearningPath) only filter where the source query states it.
//   • LearningProgram / LearningPath have NO soft-delete hook → populate embeds
//     regardless of status (compliance assignment populate).
//   • Schedule.distinct('enrolledUsers') flattens the text[] → unnest + DISTINCT.
//   • populate('userId'/'departmentId'/'managerId') → LEFT JOIN … is_deleted=false
//     (a deleted ref drops to null).
//   • dueDate range uses the same UTC day-boundary snapping as the Mongo source.
// ──────────────────────────────────────────────────────────

const ids = (arr) => (arr || []).map(String);

// Same UTC day-boundary snapping as the Mongo source's dateBoundary().
const dateBoundary = (value, endOfDay = false) => {
  const d = new Date(value);
  d.setUTCHours(endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
  return d.toISOString();
};

// ── Cohort / program reads ────────────────────────────────
const cohortShape = (r) => ({
  _id: r.id, classCode: r.class_code, courseName: r.course_name,
  programId: r.program_id || null, teacherIds: ids(r.teacher_ids), isDeleted: r.is_deleted,
});

const findCohort = async (cohortId) => {
  // Class.findById = findOne → soft-delete hook → is_deleted = false.
  const { rows } = await query(
    `SELECT id, class_code, course_name, program_id, teacher_ids, is_deleted
       FROM classes WHERE id = $1 AND is_deleted = false`, [String(cohortId)]);
  return rows[0] ? cohortShape(rows[0]) : null;
};

const listActiveCohorts = async (scope = {}) => {
  // scope = classScopeForActor: {} (admin) | {_id:{$in:[classIds]}} (teacher).
  const scopeIds = scope && scope._id && Array.isArray(scope._id.$in) ? ids(scope._id.$in) : null;
  const args = [];
  let scopeSql = '';
  if (scopeIds) { args.push(scopeIds); scopeSql = `AND id = ANY($${args.length})`; }
  const { rows } = await query(
    `SELECT id, class_code, course_name, program_id, teacher_ids, is_deleted
       FROM classes WHERE is_deleted = false ${scopeSql}`, args);
  return rows.map(cohortShape);
};

const listProgramsByIds = async (programIds) => {
  if (!programIds || !programIds.length) return [];
  const { rows } = await query(
    `SELECT id, name, completion_policy, certificate_validity_days
       FROM learning_programs WHERE id = ANY($1)`, [ids(programIds)]);
  return rows.map((r) => ({
    _id: r.id, name: r.name,
    // Mongo .lean() returns the stored value or undefined (no schema defaults).
    completionPolicy: r.completion_policy == null ? undefined : r.completion_policy,
    certificateValidityDays: r.certificate_validity_days == null ? undefined : Number(r.certificate_validity_days),
  }));
};

const findProgramName = async (programId) => {
  if (!programId) return '';
  const { rows } = await query(`SELECT name FROM learning_programs WHERE id = $1`, [String(programId)]);
  return (rows[0] && rows[0].name) || '';
};

// roster (scheduled session enrolled_users, flattened) ∪ active-enrollment userIds.
const listCohortLearnerIds = async (cohortId) => {
  const { rows } = await query(
    `SELECT uid FROM (
        SELECT DISTINCT unnest(enrolled_users) AS uid FROM schedules
          WHERE class_id = $1 AND status = 'scheduled'
        UNION
        SELECT DISTINCT user_id AS uid FROM enrollments
          WHERE class_id = $1 AND status = ANY($2)
     ) t WHERE uid IS NOT NULL`, [String(cohortId), ACTIVE_ENROLLMENT_STATUSES]);
  return rows.map((r) => String(r.uid));
};

const findUsers = async (userIds) => {
  if (!userIds || !userIds.length) return [];
  const { rows } = await query(
    `SELECT id, emp_code, name, department FROM users WHERE id = ANY($1) AND is_deleted = false`,
    [ids(userIds)]);
  return rows.map((r) => ({ _id: r.id, empCode: r.emp_code, name: r.name, department: r.department }));
};

// ── Certificate / evidence reads (status columns) ─────────
const listCohortCertificates = async (cohortId) => {
  const { rows } = await query(
    `SELECT id, user_id, certificate_number, status, issued_at, valid_from, valid_until, validity_days
       FROM certificates WHERE cohort_id = $1 AND is_deleted = false`, [String(cohortId)]);
  return rows.map((r) => ({
    _id: r.id, userId: r.user_id, certificateNumber: r.certificate_number, status: r.status,
    issuedAt: r.issued_at, validFrom: r.valid_from, validUntil: r.valid_until,
    validityDays: r.validity_days == null ? null : Number(r.validity_days),
  }));
};

const listCohortSchedules = async (cohortIds) => {
  if (!cohortIds || !cohortIds.length) return [];
  const { rows } = await query(
    `SELECT id, class_id, enrolled_users FROM schedules
      WHERE class_id = ANY($1) AND status = 'scheduled'`, [ids(cohortIds)]);
  return rows.map((r) => ({ _id: r.id, classId: r.class_id, enrolledUsers: ids(r.enrolled_users) }));
};

const listCohortEnrollments = async (cohortIds) => {
  if (!cohortIds || !cohortIds.length) return [];
  const { rows } = await query(
    `SELECT id, class_id, user_id FROM enrollments
      WHERE class_id = ANY($1) AND status = ANY($2)`, [ids(cohortIds), ACTIVE_ENROLLMENT_STATUSES]);
  return rows.map((r) => ({ _id: r.id, classId: r.class_id, userId: r.user_id }));
};

const listAttendedAttendance = async ({ scheduleIds, userIds }) => {
  if (!scheduleIds.length || !userIds.length) return [];
  const { rows } = await query(
    `SELECT id, schedule_id, user_id FROM attendances
      WHERE schedule_id = ANY($1) AND user_id = ANY($2) AND status = ANY($3)`,
    [ids(scheduleIds), ids(userIds), ATTENDED_STATUSES]);
  return rows.map((r) => ({ _id: r.id, scheduleId: r.schedule_id, userId: r.user_id }));
};

const listEvaluations = async ({ cohortIds, userIds }) => {
  if (!cohortIds.length || !userIds.length) return [];
  // Evaluation has a soft-delete find-HOOK → is_deleted = false (source query omits it).
  const { rows } = await query(
    `SELECT id, class_id, user_id FROM evaluations
      WHERE class_id = ANY($1) AND user_id = ANY($2) AND is_deleted = false`, [ids(cohortIds), ids(userIds)]);
  return rows.map((r) => ({ _id: r.id, classId: r.class_id, userId: r.user_id }));
};

const listFeedbackSubmissions = async ({ cohortIds, userIds }) => {
  if (!cohortIds.length || !userIds.length) return [];
  const { rows } = await query(
    `SELECT id, cohort_id, user_id FROM feedbacks
      WHERE cohort_id = ANY($1) AND user_id = ANY($2) AND is_deleted = false`, [ids(cohortIds), ids(userIds)]);
  return rows.map((r) => ({ _id: r.id, cohortId: r.cohort_id, userId: r.user_id }));
};

const listPassingAttempts = async ({ cohortIds, userIds }) => {
  if (!cohortIds.length || !userIds.length) return [];
  const { rows } = await query(
    `SELECT id, cohort_id, user_id FROM assessment_attempts
      WHERE cohort_id = ANY($1) AND user_id = ANY($2) AND passed = true AND is_deleted = false`,
    [ids(cohortIds), ids(userIds)]);
  return rows.map((r) => ({ _id: r.id, cohortId: r.cohort_id, userId: r.user_id }));
};

const listIssuedCertificates = async ({ cohortIds, userIds }) => {
  if (!cohortIds.length || !userIds.length) return [];
  const { rows } = await query(
    `SELECT id, cohort_id, user_id FROM certificates
      WHERE cohort_id = ANY($1) AND user_id = ANY($2) AND status = 'Issued' AND is_deleted = false`,
    [ids(cohortIds), ids(userIds)]);
  return rows.map((r) => ({ _id: r.id, cohortId: r.cohort_id, userId: r.user_id }));
};

// ── Compliance assignments report ─────────────────────────
const progSummary = (r) => ({ _id: r.id, code: r.code, name: r.name, category: r.category, status: r.status });

const embedAssignmentProgram = async (programId) => {
  if (!programId) return null;
  const { rows } = await query(
    `SELECT id, code, name, category, status FROM learning_programs WHERE id = $1`, [String(programId)]);
  return rows[0] ? progSummary(rows[0]) : null;
};

// pathId populate with a NESTED programs populate → programs become full objects.
const embedAssignmentPath = async (pathId) => {
  if (!pathId) return null;
  // LearningPath has NO find-hook → a deleted path still populates (mirrors Mongo).
  const { rows } = await query(
    `SELECT id, code, title, status, programs FROM learning_paths WHERE id = $1`, [String(pathId)]);
  if (!rows[0]) return null;
  const p = rows[0];
  let programs = [];
  const pids = ids(p.programs);
  if (pids.length) {
    const sub = await query(
      `SELECT id, code, name, category, status FROM learning_programs WHERE id = ANY($1)`, [pids]);
    const map = new Map(sub.rows.map((x) => [x.id, progSummary(x)]));
    programs = pids.map((id) => map.get(id)).filter(Boolean); // ordered, drop-missing
  }
  return { _id: p.id, code: p.code, title: p.title, status: p.status, programs };
};

const assignmentRow = async (a) => {
  const [program, path] = await Promise.all([
    embedAssignmentProgram(a.program_id),
    embedAssignmentPath(a.path_id),
  ]);
  return {
    _id: a.id, title: a.title, description: a.description == null ? '' : a.description,
    targetType: a.target_type, programId: program, pathId: path,
    dueDate: a.due_date, userIds: ids(a.user_ids), departmentIds: ids(a.department_ids),
    status: a.status, createdBy: a.created_by || null,
    sourceCertificateId: a.source_certificate_id || null,
    isDeleted: a.is_deleted, deletedAt: a.deleted_at || null,
    createdAt: a.created_at, updatedAt: a.updated_at,
  };
};

const listComplianceAssignments = async (q = {}) => {
  const conds = ["status = 'active'", 'is_deleted = false'];
  const args = [];
  if (q.assignmentId) { args.push(String(q.assignmentId)); conds.push(`id = $${args.length}`); }
  if (q.dueFrom) { args.push(dateBoundary(q.dueFrom)); conds.push(`due_date >= $${args.length}`); }
  if (q.dueTo) { args.push(dateBoundary(q.dueTo, true)); conds.push(`due_date <= $${args.length}`); }
  if (q.programId) {
    const pathRows = await query(
      `SELECT id FROM learning_paths
        WHERE $1 = ANY(programs) AND status IS DISTINCT FROM 'archived' AND is_deleted = false`,
      [String(q.programId)]);
    const pathIds = pathRows.rows.map((r) => r.id);
    args.push(String(q.programId));
    const orParts = [`program_id = $${args.length}`];
    if (pathIds.length) { args.push(pathIds); orParts.push(`path_id = ANY($${args.length})`); }
    conds.push(`(${orParts.join(' OR ')})`);
  }
  const { rows } = await query(
    `SELECT * FROM assignments WHERE ${conds.join(' AND ')} ORDER BY due_date ASC, created_at DESC`, args);
  return Promise.all(rows.map(assignmentRow));
};

// ── Org-export users ──────────────────────────────────────
const findOrgUsers = async (userIds) => {
  if (!userIds || !userIds.length) return [];
  const { rows } = await query(
    `SELECT u.id, u.emp_code, u.name, u.email, u.department, u.department_id, u.manager_id,
            d.id AS d_id, d.code AS d_code, d.name AS d_name,
            m.id AS m_id, m.emp_code AS m_emp, m.name AS m_name, m.email AS m_email
       FROM users u
       LEFT JOIN departments d ON d.id = u.department_id AND d.is_deleted = false
       LEFT JOIN users       m ON m.id = u.manager_id    AND m.is_deleted = false
      WHERE u.id = ANY($1) AND u.is_deleted = false`, [ids(userIds)]);
  return rows.map((r) => ({
    _id: r.id, empCode: r.emp_code, name: r.name, email: r.email, department: r.department,
    departmentId: r.d_id ? { _id: r.d_id, code: r.d_code, name: r.d_name } : null,
    managerId: r.m_id ? { _id: r.m_id, empCode: r.m_emp, name: r.m_name, email: r.m_email } : null,
  }));
};

const listProgramCertificates = async (userIds, programIds) => {
  if (!userIds.length || !programIds.length) return [];
  const { rows } = await query(
    `SELECT id, user_id, program_id, certificate_number, status, issued_at, valid_from, valid_until, validity_days
       FROM certificates
      WHERE user_id = ANY($1) AND program_id = ANY($2) AND is_deleted = false
      ORDER BY issued_at DESC`, [ids(userIds), ids(programIds)]);
  return rows.map((r) => ({
    _id: r.id, userId: r.user_id, programId: r.program_id, certificateNumber: r.certificate_number,
    status: r.status, issuedAt: r.issued_at, validFrom: r.valid_from, validUntil: r.valid_until,
    validityDays: r.validity_days == null ? null : Number(r.validity_days),
  }));
};

// ── A5 training-hours ─────────────────────────────────────
const listSchedulesInRange = async ({ from, to }) => {
  const { rows } = await query(
    `SELECT id, start_time, end_time FROM schedules
      WHERE status = 'scheduled' AND start_time >= $1 AND start_time <= $2`,
    [new Date(from).toISOString(), new Date(to).toISOString()]);
  return rows.map((r) => ({ _id: r.id, startTime: r.start_time, endTime: r.end_time }));
};

const listAttendedByScheduleIds = async (scheduleIds) => {
  if (!scheduleIds.length) return [];
  const { rows } = await query(
    `SELECT id, user_id, schedule_id FROM attendances
      WHERE schedule_id = ANY($1) AND status = ANY($2)`, [ids(scheduleIds), ATTENDED_STATUSES]);
  return rows.map((r) => ({ _id: r.id, userId: r.user_id, scheduleId: r.schedule_id }));
};

const listParticipantsForHours = async ({ departmentId } = {}) => {
  const args = [];
  let deptSql = '';
  if (departmentId) { args.push(String(departmentId)); deptSql = `AND u.department_id = $${args.length}`; }
  const { rows } = await query(
    `SELECT u.id, u.emp_code, u.name, u.department, u.department_id,
            d.id AS d_id, d.code AS d_code, d.name AS d_name
       FROM users u
       LEFT JOIN departments d ON d.id = u.department_id AND d.is_deleted = false
      WHERE u.role = 'Participant' ${deptSql} AND u.is_deleted = false`, args);
  return rows.map((r) => ({
    _id: r.id, empCode: r.emp_code, name: r.name, department: r.department,
    departmentId: r.d_id ? { _id: r.d_id, code: r.d_code, name: r.d_name } : null,
  }));
};

module.exports = {
  findCohort,
  listActiveCohorts,
  listProgramsByIds,
  findProgramName,
  listCohortLearnerIds,
  findUsers,
  listCohortCertificates,
  listCohortSchedules,
  listCohortEnrollments,
  listAttendedAttendance,
  listEvaluations,
  listFeedbackSubmissions,
  listPassingAttempts,
  listIssuedCertificates,
  listComplianceAssignments,
  findOrgUsers,
  listProgramCertificates,
  listSchedulesInRange,
  listAttendedByScheduleIds,
  listParticipantsForHours,
};
