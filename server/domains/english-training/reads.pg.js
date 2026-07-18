// English-training — read models (task-oriented projections). Read-only SQL for
// the admin view + API. No generic table CRUD leaks; each function answers one
// question. Kept separate from repository.pg (writes/import) for clarity.

const { query } = require('../../config/pg');
const one = (rows) => rows[0] || null;

async function listCohorts() {
  const { rows } = await query(`
    SELECT co.id, co.class_code, co.display_name, co.status,
      (SELECT count(*)::int FROM eng_cohort_memberships m WHERE m.cohort_id = co.id AND m.status = 'active') AS active_members,
      (SELECT count(*)::int FROM eng_course_runs r WHERE r.cohort_id = co.id) AS runs
    FROM eng_cohorts co ORDER BY co.class_code`);
  return rows;
}

async function getCohort(id) {
  const cohort = one((await query('SELECT * FROM eng_cohorts WHERE id = $1', [id])).rows);
  if (!cohort) return null;
  const members = (await query(`
    SELECT m.id, m.status, m.start_date, e.emp_code, e.full_name, e.employment_status
    FROM eng_cohort_memberships m JOIN eng_employees e ON e.id = m.employee_id
    WHERE m.cohort_id = $1 ORDER BY e.full_name`, [id])).rows;
  const runs = (await query(`
    SELECT r.id, r.run_number, r.status, r.start_date, r.end_date,
      c.course_code, c.course_name,
      (SELECT count(*)::int FROM eng_run_enrollments en WHERE en.course_run_id = r.id) AS enrollments
    FROM eng_course_runs r JOIN eng_courses c ON c.id = r.course_id
    WHERE r.cohort_id = $1 ORDER BY c.course_name`, [id])).rows;
  const pics = (await query(`
    SELECT p.id, p.pic_label, e.emp_code, e.full_name
    FROM eng_cohort_pic p LEFT JOIN eng_employees e ON e.id = p.pic_employee_id
    WHERE p.cohort_id = $1`, [id])).rows;
  return { cohort, members, runs, pics };
}

async function listCourses() {
  const { rows } = await query(`
    SELECT c.id, c.course_code, c.course_name, c.expected_units, c.max_absences_allowed, c.is_active,
      (SELECT count(*)::int FROM eng_course_runs r WHERE r.course_id = c.id) AS runs
    FROM eng_courses c ORDER BY c.course_name`);
  return rows;
}

async function getCourseRun(id) {
  const run = one((await query(`
    SELECT r.*, c.course_code, c.course_name, co.class_code
    FROM eng_course_runs r JOIN eng_courses c ON c.id = r.course_id
    JOIN eng_cohorts co ON co.id = r.cohort_id WHERE r.id = $1`, [id])).rows);
  if (!run) return null;
  const roster = (await query(`
    SELECT en.id, en.status, en.start_session_number, (en.meta->>'dq') AS dq,
      e.emp_code, e.full_name, en.business_unit_id_snapshot, en.job_role_id_snapshot
    FROM eng_run_enrollments en JOIN eng_employees e ON e.id = en.employee_id
    WHERE en.course_run_id = $1 ORDER BY e.full_name`, [id])).rows;
  return { run, roster };
}

async function listEmployees({ q, limit = 50, offset = 0 } = {}) {
  const params = [];
  let where = '';
  if (q) { params.push(`%${q}%`); where = `WHERE e.emp_code ILIKE $1 OR e.full_name ILIKE $1`; }
  params.push(limit, offset);
  const { rows } = await query(`
    SELECT e.id, e.emp_code, e.full_name, e.email, e.employment_status
    FROM eng_employees e ${where}
    ORDER BY e.emp_code LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
  return rows;
}

async function getEmployeeByCode(empCode) {
  const employee = one((await query('SELECT * FROM eng_employees WHERE lower(emp_code) = lower($1)', [empCode])).rows);
  if (!employee) return null;
  const memberships = (await query(`
    SELECT m.id, m.status, m.start_date, co.class_code
    FROM eng_cohort_memberships m JOIN eng_cohorts co ON co.id = m.cohort_id
    WHERE m.employee_id = $1 ORDER BY m.start_date NULLS LAST`, [employee.id])).rows;
  const enrollments = (await query(`
    SELECT en.id, en.status, (en.meta->>'dq') AS dq, co.class_code, c.course_name, r.run_number
    FROM eng_run_enrollments en
    JOIN eng_course_runs r ON r.id = en.course_run_id
    JOIN eng_courses c ON c.id = r.course_id
    JOIN eng_cohorts co ON co.id = r.cohort_id
    WHERE en.employee_id = $1 ORDER BY c.course_name`, [employee.id])).rows;
  return { employee, memberships, enrollments };
}

async function listSessions({ q, limit = 100, offset = 0 } = {}) {
  const params = [];
  let where = '';
  if (q) {
    params.push(`%${q}%`);
    where = `WHERE co.class_code ILIKE $1 OR c.course_name ILIKE $1`;
  }
  params.push(limit, offset);
  const { rows } = await query(`
    SELECT su.id, su.session_number, su.held_at, su.status,
      r.id AS course_run_id, co.class_code, c.course_name,
      count(ar.id)::int AS attendance_count,
      count(ar.id) FILTER (WHERE ar.status = 'present')::int AS present_count,
      count(ar.id) FILTER (WHERE ar.status = 'absent')::int AS absent_count
    FROM eng_session_units su
    JOIN eng_course_runs r ON r.id = su.course_run_id
    JOIN eng_cohorts co ON co.id = r.cohort_id
    JOIN eng_courses c ON c.id = r.course_id
    LEFT JOIN eng_attendance_records ar ON ar.session_unit_id = su.id
    ${where}
    GROUP BY su.id, r.id, co.class_code, c.course_name
    ORDER BY su.held_at DESC, co.class_code, su.session_number
    LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
  return rows;
}

async function getSessionAttendance(id) {
  const session = one((await query(`
    SELECT su.id, su.session_number, su.held_at, su.status,
      r.id AS course_run_id, co.class_code, c.course_name
    FROM eng_session_units su
    JOIN eng_course_runs r ON r.id = su.course_run_id
    JOIN eng_cohorts co ON co.id = r.cohort_id
    JOIN eng_courses c ON c.id = r.course_id
    WHERE su.id = $1`, [id])).rows);
  if (!session) return null;
  const roster = (await query(`
    SELECT en.id AS enrollment_id, en.status AS enrollment_status,
      e.emp_code, e.full_name, ar.id AS attendance_id,
      ar.status AS attendance_status, ar.source_enrollment_dropped
    FROM eng_run_enrollments en
    JOIN eng_employees e ON e.id = en.employee_id
    LEFT JOIN eng_attendance_records ar
      ON ar.run_enrollment_id = en.id AND ar.session_unit_id = $1
    WHERE en.course_run_id = $2 AND en.start_session_number <= $3
    ORDER BY e.full_name`, [id, session.course_run_id, session.session_number])).rows;
  return { session, roster };
}

async function listEligibility({ q, limit = 100, offset = 0 } = {}) {
  const params = [];
  let where = '';
  if (q) {
    params.push(`%${q}%`);
    where = `WHERE e.emp_code ILIKE $1 OR e.full_name ILIKE $1
      OR co.class_code ILIKE $1 OR c.course_name ILIKE $1`;
  }
  params.push(limit, offset);
  const { rows } = await query(`
    SELECT en.id AS enrollment_id, en.status AS enrollment_status,
      e.emp_code, e.full_name, r.id AS course_run_id, r.status AS run_status,
      co.class_code, c.course_name, r.max_absences_allowed_snapshot AS allowed_absences,
      count(ar.id)::int AS marked_sessions,
      count(ar.id) FILTER (WHERE ar.status = 'present')::int AS present_count,
      count(ar.id) FILTER (WHERE ar.status = 'absent')::int AS absence_count,
      CASE
        WHEN en.status IN ('waiting','dropped','transferred','cancelled') THEN 'not_applicable'
        WHEN count(ar.id) = 0 THEN 'unknown'
        WHEN count(ar.id) FILTER (WHERE ar.status = 'absent') > r.max_absences_allowed_snapshot THEN 'not_eligible'
        WHEN r.status = 'completed' AND en.status = 'completed' THEN 'eligible'
        ELSE 'within_limit'
      END AS eligibility_status
    FROM eng_run_enrollments en
    JOIN eng_employees e ON e.id = en.employee_id
    JOIN eng_course_runs r ON r.id = en.course_run_id
    JOIN eng_cohorts co ON co.id = r.cohort_id
    JOIN eng_courses c ON c.id = r.course_id
    LEFT JOIN eng_attendance_records ar ON ar.run_enrollment_id = en.id
    ${where}
    GROUP BY en.id, e.id, r.id, co.class_code, c.course_name
    ORDER BY co.class_code, c.course_name, e.full_name
    LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
  return rows;
}

async function listDataQualityIssues() {
  const { rows } = await query(`
    SELECT issue_code, count(*)::int AS count FROM eng_data_quality_issues
    WHERE status = 'open' GROUP BY issue_code ORDER BY count DESC`);
  return rows;
}

async function listDataQualityIssueDetails(code) {
  const { rows } = await query(`
    SELECT i.id, i.issue_code, i.entity_type, i.entity_key,
      i.source_sheet, i.source_row, i.detail,
      COALESCE(e.emp_code, me.emp_code, iae.emp_code) AS emp_code,
      COALESCE(e.full_name, me.full_name, iae.full_name) AS full_name,
      COALESCE(co.class_code, mc.class_code, ico.class_code) AS class_code,
      ec.business_unit, ec.job_role
    FROM eng_data_quality_issues i
    LEFT JOIN eng_employees e
      ON i.entity_type = 'employee' AND lower(e.emp_code) = lower(i.entity_key)
    LEFT JOIN eng_cohort_memberships m
      ON i.entity_type = 'membership' AND m.id = i.entity_key
    LEFT JOIN eng_employees me ON me.id = m.employee_id
    LEFT JOIN eng_cohorts mc ON mc.id = m.cohort_id
    LEFT JOIN eng_cohorts co
      ON i.entity_type = 'cohort' AND lower(co.class_code) = lower(i.entity_key)
    LEFT JOIN eng_session_units isu
      ON i.entity_type = 'session_unit' AND isu.id = i.entity_key
    LEFT JOIN eng_attendance_records iar
      ON i.entity_type = 'attendance' AND iar.id = i.entity_key
    LEFT JOIN eng_run_enrollments iare ON iare.id = iar.run_enrollment_id
    LEFT JOIN eng_employees iae ON iae.id = iare.employee_id
    LEFT JOIN eng_session_units iasu ON iasu.id = iar.session_unit_id
    LEFT JOIN eng_course_runs ir ON ir.id = COALESCE(isu.course_run_id, iasu.course_run_id)
    LEFT JOIN eng_cohorts ico ON ico.id = ir.cohort_id
    LEFT JOIN eng_employee_corrections ec
      ON lower(ec.emp_code) = lower(COALESCE(e.emp_code, me.emp_code, iae.emp_code, i.entity_key))
    WHERE i.issue_code = $1 AND i.status = 'open'
    ORDER BY i.source_sheet NULLS LAST, i.source_row NULLS LAST, i.entity_key
  `, [code]);
  return rows;
}

module.exports = {
  listCohorts, getCohort, listCourses, getCourseRun,
  listEmployees, getEmployeeByCode, listSessions, getSessionAttendance, listEligibility,
  listDataQualityIssues, listDataQualityIssueDetails,
};
