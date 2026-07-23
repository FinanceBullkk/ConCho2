// English-training — read models (task-oriented projections). Read-only SQL for
// the admin view + API. No generic table CRUD leaks; each function answers one
// question. Kept separate from repository.pg (writes/import) for clarity.

const { query } = require('../../config/pg');
const one = (rows) => rows[0] || null;

// Exam-eligibility projection — shared by the Eligibility tab and the class
// detail 360° so both always agree. Aliases used: en (run enrollment), ar
// (attendance record), r (course run). Requires a GROUP BY on the enrollment.
const ELIGIBILITY_STATUS_SQL = `CASE
        WHEN en.status IN ('waiting','dropped','transferred','cancelled') THEN 'not_applicable'
        WHEN count(ar.id) = 0 THEN 'unknown'
        WHEN count(ar.id) FILTER (WHERE ar.status = 'present')::numeric / count(ar.id)
          < r.attendance_threshold_ratio_snapshot THEN 'not_eligible'
        WHEN r.status = 'completed' AND en.status = 'completed' THEN 'eligible'
        ELSE 'within_limit'
      END`;

async function listCohorts() {
  const { rows } = await query(`
    SELECT co.id, co.class_code, co.display_name, co.status, co.capacity,
      (SELECT count(*)::int FROM eng_cohort_memberships m WHERE m.cohort_id = co.id AND m.status = 'active') AS active_members,
      (SELECT count(*)::int FROM eng_course_runs r WHERE r.cohort_id = co.id) AS runs,
      pic.id AS current_pic_assignment_id,
      pic.pic_employee_id AS current_pic_employee_id,
      coalesce(pe.full_name, pic.pic_label) AS current_pic,
      pe.emp_code AS current_pic_emp_code,
      pic.pic_label AS current_pic_label
    FROM eng_cohorts co
    LEFT JOIN eng_cohort_pic pic ON pic.cohort_id = co.id AND pic.end_date IS NULL
    LEFT JOIN eng_employees pe ON pe.id = pic.pic_employee_id
    ORDER BY co.class_code`);
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

// Class 360° — one round-trip so a class opens with everything HR needs in one
// place: header, its course runs, and per learner the attendance summary
// (absences / allowed), exam eligibility (same projection as the Eligibility
// tab), and level. Read-only. Rosters are grouped onto their run in the DTO.
async function getClassDetail(id) {
  const cohort = one((await query(
    `SELECT co.id, co.class_code, co.display_name, co.status, co.capacity,
      pic.id AS current_pic_assignment_id,
      pic.pic_employee_id AS current_pic_employee_id,
      coalesce(pe.full_name, pic.pic_label) AS current_pic,
      pe.emp_code AS current_pic_emp_code,
      pic.pic_label AS current_pic_label
    FROM eng_cohorts co
    LEFT JOIN eng_cohort_pic pic ON pic.cohort_id = co.id AND pic.end_date IS NULL
    LEFT JOIN eng_employees pe ON pe.id = pic.pic_employee_id
    WHERE co.id = $1`, [id],
  )).rows);
  if (!cohort) return null;
  const runs = (await query(`
    SELECT r.id, r.run_number, r.status, r.start_date, r.end_date,
      r.max_absences_allowed_snapshot AS max_absences_allowed,
      r.attendance_threshold_ratio_snapshot AS attendance_threshold_ratio,
      (SELECT COALESCE(MAX(su.session_number) FILTER (WHERE m.status <> 'cancelled'), 0)::int + 1
        FROM eng_session_units su JOIN eng_meetings m ON m.id = su.meeting_id
        WHERE su.course_run_id = r.id) AS next_session_number,
      c.course_code, c.course_name
    FROM eng_course_runs r JOIN eng_courses c ON c.id = r.course_id
    WHERE r.cohort_id = $1 ORDER BY c.course_name, r.run_number`, [id])).rows;
  const roster = (await query(`
    SELECT en.id AS enrollment_id, en.course_run_id, en.status AS enrollment_status,
      en.start_session_number,
      e.id AS employee_id, e.emp_code, e.full_name,
      r.max_absences_allowed_snapshot AS allowed_absences,
      r.attendance_threshold_ratio_snapshot AS attendance_threshold_ratio,
      count(ar.id)::int AS marked_count,
      count(ar.id) FILTER (WHERE ar.status = 'present')::int AS present_count,
      count(ar.id) FILTER (WHERE ar.status = 'absent')::int AS absence_count,
      CASE WHEN count(ar.id) = 0 THEN NULL
        ELSE count(ar.id) FILTER (WHERE ar.status = 'present')::numeric / count(ar.id)
      END AS attendance_ratio,
      xr.level_code AS exam_level_code, lv.display_name AS exam_level_name, xr.exam_date,
      ${ELIGIBILITY_STATUS_SQL} AS eligibility_status
    FROM eng_run_enrollments en
    JOIN eng_course_runs r ON r.id = en.course_run_id
    JOIN eng_employees e ON e.id = en.employee_id
    LEFT JOIN eng_attendance_records ar ON ar.run_enrollment_id = en.id
    LEFT JOIN eng_exam_results xr ON xr.run_enrollment_id = en.id AND xr.is_deleted = false
    LEFT JOIN eng_levels lv ON lv.code = xr.level_code
    WHERE r.cohort_id = $1
    GROUP BY en.id, e.id, r.id, xr.id, lv.code
    ORDER BY e.full_name`, [id])).rows;
  return { cohort, runs, roster };
}

async function listCourses() {
  const { rows } = await query(`
    SELECT c.id, c.course_code, c.course_name, c.expected_units, c.max_absences_allowed,
      c.attendance_threshold_ratio, c.is_active,
      (SELECT count(*)::int FROM eng_course_runs r WHERE r.course_id = c.id) AS runs
    FROM eng_courses c ORDER BY c.course_name`);
  return rows;
}

async function listActiveCourseRuns() {
  const { rows } = await query(`
    SELECT r.id, r.run_number, r.status, r.start_date, r.end_date,
      r.cohort_id, co.class_code, co.display_name,
      c.course_code, c.course_name,
      COALESCE(MAX(su.session_number) FILTER (WHERE m.status <> 'cancelled'), 0)::int + 1
        AS next_session_number,
      COALESCE(
        MIN(su.session_number) FILTER (WHERE m.status = 'planned'),
        MAX(su.session_number) FILTER (WHERE m.status = 'completed') + 1,
        1
      )::int AS transfer_start_session_number
    FROM eng_course_runs r
    JOIN eng_cohorts co ON co.id = r.cohort_id
    JOIN eng_courses c ON c.id = r.course_id
    LEFT JOIN eng_session_units su ON su.course_run_id = r.id
    LEFT JOIN eng_meetings m ON m.id = su.meeting_id
    WHERE r.status IN ('planned','active')
    GROUP BY r.id, co.id, c.id
    ORDER BY co.class_code, c.course_name, r.run_number
  `);
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
      e.emp_code, e.full_name, en.business_unit_id_snapshot, en.job_role_id_snapshot,
      r.attendance_threshold_ratio_snapshot AS attendance_threshold_ratio,
      count(ar.id)::int AS marked_count,
      count(ar.id) FILTER (WHERE ar.status = 'present')::int AS present_count,
      count(ar.id) FILTER (WHERE ar.status = 'absent')::int AS absence_count,
      CASE WHEN count(ar.id) = 0 THEN NULL
        ELSE count(ar.id) FILTER (WHERE ar.status = 'present')::numeric / count(ar.id)
      END AS attendance_ratio,
      xr.level_code AS exam_level_code, lv.display_name AS exam_level_name, xr.exam_date
    FROM eng_run_enrollments en
    JOIN eng_course_runs r ON r.id = en.course_run_id
    JOIN eng_employees e ON e.id = en.employee_id
    LEFT JOIN eng_attendance_records ar ON ar.run_enrollment_id = en.id
    LEFT JOIN eng_exam_results xr ON xr.run_enrollment_id = en.id AND xr.is_deleted = false
    LEFT JOIN eng_levels lv ON lv.code = xr.level_code
    WHERE en.course_run_id = $1
    GROUP BY en.id, e.id, r.id, xr.id, lv.code
    ORDER BY e.full_name`, [id])).rows;
  return { run, roster };
}

async function listEmployees({ q, limit = 50, offset = 0 } = {}) {
  const params = [];
  let where = '';
  if (q) { params.push(`%${q}%`); where = `WHERE e.emp_code ILIKE $1 OR e.full_name ILIKE $1`; }
  params.push(limit, offset);
  const { rows } = await query(`
    SELECT e.id, e.emp_code, e.full_name, e.english_name, e.email, e.employment_status,
      (SELECT en.course_run_id FROM eng_run_enrollments en
        WHERE en.employee_id = e.id AND en.status = 'active'
        LIMIT 1) AS active_course_run_id
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
    SELECT su.id, su.session_number, m.starts_at AS held_at, su.status,
      m.id AS meeting_id, m.status AS meeting_status, m.duration_minutes,
      m.cancellation_reason, m.meet_link,
      m.source_starts_at, m.source_duration_minutes, m.operational_at,
      (su.source_sheet IS NOT NULL) AS source_was_imported,
      CASE WHEN su.source_sheet IS NULL OR m.operational_at IS NOT NULL
        THEN 'live' ELSE 'imported' END AS source_kind,
      r.id AS course_run_id, co.class_code, c.course_name,
      count(ar.id)::int AS attendance_count,
      (SELECT count(*)::int FROM eng_run_enrollments en
        LEFT JOIN eng_cohort_memberships cm ON cm.id = en.cohort_membership_id
        WHERE en.course_run_id = r.id AND en.start_session_number <= su.session_number
          AND (EXISTS (SELECT 1 FROM eng_attendance_records ear
                WHERE ear.session_unit_id = su.id AND ear.run_enrollment_id = en.id)
            OR (m.status = 'planned' AND en.status = 'active')
            OR (m.status = 'completed' AND cm.start_date <= m.starts_at::date
              AND (cm.end_date IS NULL OR m.starts_at::date <= cm.end_date)))) AS expected_roster_count,
      count(ar.id) FILTER (WHERE ar.status = 'present')::int AS present_count,
      count(ar.id) FILTER (WHERE ar.status = 'absent')::int AS absent_count
    FROM eng_session_units su
    JOIN eng_meetings m ON m.id = su.meeting_id
    JOIN eng_course_runs r ON r.id = su.course_run_id
    JOIN eng_cohorts co ON co.id = r.cohort_id
    JOIN eng_courses c ON c.id = r.course_id
    LEFT JOIN eng_attendance_records ar ON ar.session_unit_id = su.id
    ${where}
    GROUP BY su.id, m.id, r.id, co.class_code, c.course_name
    ORDER BY m.starts_at DESC, co.class_code, su.session_number
    LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
  return rows;
}

async function getSessionAttendance(id) {
  const session = one((await query(`
    SELECT su.id, su.session_number, m.starts_at AS held_at, su.status,
      m.id AS meeting_id, m.status AS meeting_status, m.duration_minutes,
      m.cancellation_reason, m.meet_link,
      m.source_starts_at, m.source_duration_minutes, m.operational_at,
      (su.source_sheet IS NOT NULL) AS source_was_imported,
      CASE WHEN su.source_sheet IS NULL OR m.operational_at IS NOT NULL
        THEN 'live' ELSE 'imported' END AS source_kind,
      r.id AS course_run_id, co.class_code, c.course_name
    FROM eng_session_units su
    JOIN eng_meetings m ON m.id = su.meeting_id
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
    LEFT JOIN eng_cohort_memberships cm ON cm.id = en.cohort_membership_id
    LEFT JOIN eng_attendance_records ar
      ON ar.run_enrollment_id = en.id AND ar.session_unit_id = $1
    WHERE en.course_run_id = $2 AND en.start_session_number <= $3
      AND (
        ar.id IS NOT NULL
        OR ($4 = 'planned' AND en.status = 'active')
        OR ($4 = 'completed'
          AND cm.start_date <= $5::date
          AND (cm.end_date IS NULL OR $5::date <= cm.end_date))
      )
    ORDER BY e.full_name, e.emp_code`, [
    id, session.course_run_id, session.session_number,
    session.meeting_status, session.held_at,
  ])).rows;
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
      r.attendance_threshold_ratio_snapshot AS attendance_threshold_ratio,
      count(ar.id)::int AS marked_sessions,
      count(ar.id) FILTER (WHERE ar.status = 'present')::int AS present_count,
      count(ar.id) FILTER (WHERE ar.status = 'absent')::int AS absence_count,
      CASE WHEN count(ar.id) = 0 THEN NULL
        ELSE count(ar.id) FILTER (WHERE ar.status = 'present')::numeric / count(ar.id)
      END AS attendance_ratio,
      xr.level_code AS exam_level_code, lv.display_name AS exam_level_name, xr.exam_date,
      ${ELIGIBILITY_STATUS_SQL} AS eligibility_status
    FROM eng_run_enrollments en
    JOIN eng_employees e ON e.id = en.employee_id
    JOIN eng_course_runs r ON r.id = en.course_run_id
    JOIN eng_cohorts co ON co.id = r.cohort_id
    JOIN eng_courses c ON c.id = r.course_id
    LEFT JOIN eng_attendance_records ar ON ar.run_enrollment_id = en.id
    LEFT JOIN eng_exam_results xr ON xr.run_enrollment_id = en.id AND xr.is_deleted = false
    LEFT JOIN eng_levels lv ON lv.code = xr.level_code
    ${where}
    GROUP BY en.id, e.id, r.id, co.class_code, c.course_name, xr.id, lv.code
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

// ── Overview (HR ops landing) ───────────────────────────────────────────────

// One round-trip of headline counts for the overview dashboard. `pending`
// mirrors listPendingExamEntries (completed runs, eligible-to-sit, no level yet)
// so the "needs level" card and the Evaluation tab always agree.
async function getOverview() {
  const { rows } = await query(`
    WITH pending AS (
      SELECT r.id AS run_id, count(*)::int AS c
      FROM eng_run_enrollments en
      JOIN eng_course_runs r ON r.id = en.course_run_id
      LEFT JOIN eng_exam_results xr ON xr.run_enrollment_id = en.id AND xr.is_deleted = false
      WHERE r.status = 'completed' AND en.status IN ('active','completed') AND xr.id IS NULL
        AND (SELECT count(*) FROM eng_attendance_records ar
               WHERE ar.run_enrollment_id = en.id) > 0
        AND (SELECT count(*) FILTER (WHERE ar.status = 'present')::numeric / count(*)
               FROM eng_attendance_records ar WHERE ar.run_enrollment_id = en.id)
            >= r.attendance_threshold_ratio_snapshot
      GROUP BY r.id
    )
    SELECT
      (SELECT count(*)::int FROM eng_cohorts) AS cohorts_total,
      (SELECT count(*)::int FROM eng_cohorts WHERE status = 'active') AS cohorts_active,
      (SELECT count(*)::int FROM eng_employees) AS employees_total,
      (SELECT count(*)::int FROM eng_employees WHERE employment_status = 'active') AS employees_active,
      (SELECT count(*)::int FROM eng_courses) AS courses_total,
      (SELECT count(*)::int FROM eng_course_runs) AS runs_total,
      (SELECT count(*)::int FROM eng_course_runs WHERE status = 'completed') AS runs_completed,
      (SELECT count(*)::int FROM eng_data_quality_issues WHERE status = 'open') AS open_dq_issues,
      (SELECT count(*)::int FROM pending) AS pending_exam_runs,
      (SELECT COALESCE(sum(c),0)::int FROM pending) AS pending_exam_learners`);
  return rows[0];
}

// ── Phase 3: evaluation reads ───────────────────────────────────────────────

async function listLevels() {
  const { rows } = await query(
    'SELECT code, display_name, rank FROM eng_levels WHERE is_active = true ORDER BY rank',
  );
  return rows;
}

// Completed-run nudge: for each COMPLETED course run, count learners who are
// eligible to sit (participating + ≤2 absences) but have no active exam result.
// Drives the "needs level" worklist so HR does not miss anyone.
async function listPendingExamEntries() {
  const { rows } = await query(`
    SELECT r.id AS course_run_id, co.class_code, c.course_name,
      r.status AS run_status, r.end_date, count(*)::int AS pending_count
    FROM eng_run_enrollments en
    JOIN eng_course_runs r ON r.id = en.course_run_id
    JOIN eng_cohorts co ON co.id = r.cohort_id
    JOIN eng_courses c ON c.id = r.course_id
    LEFT JOIN eng_exam_results xr ON xr.run_enrollment_id = en.id AND xr.is_deleted = false
    WHERE r.status = 'completed'
      AND en.status IN ('active','completed')
      AND xr.id IS NULL
      AND (SELECT count(*) FROM eng_attendance_records ar
             WHERE ar.run_enrollment_id = en.id) > 0
      AND (SELECT count(*) FILTER (WHERE ar.status = 'present')::numeric / count(*)
             FROM eng_attendance_records ar WHERE ar.run_enrollment_id = en.id)
          >= r.attendance_threshold_ratio_snapshot
    GROUP BY r.id, co.class_code, c.course_name, r.status, r.end_date
    ORDER BY r.end_date DESC NULLS LAST, co.class_code`);
  return rows;
}

module.exports = {
  getOverview,
  listCohorts, getCohort, getClassDetail, listCourses, getCourseRun,
  listActiveCourseRuns,
  listEmployees, getEmployeeByCode, listSessions, getSessionAttendance, listEligibility,
  listDataQualityIssues, listDataQualityIssueDetails,
  listLevels, listPendingExamEntries,
};
