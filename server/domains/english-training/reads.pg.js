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

async function listDataQualityIssues() {
  const { rows } = await query(`
    SELECT issue_code, count(*)::int AS count FROM eng_data_quality_issues
    GROUP BY issue_code ORDER BY count DESC`);
  return rows;
}

module.exports = {
  listCohorts, getCohort, listCourses, getCourseRun,
  listEmployees, getEmployeeByCode, listDataQualityIssues,
};
