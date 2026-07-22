/* eslint-disable no-console */

// Read-only grain audit for the canonical English module. This intentionally
// reports the source English entities separately from the incorrect generic
// active-handoff rows so an operator can reconcile before any cleanup.

require('dotenv').config();

const { query, closePool } = require('../../config/pg');

const checks = [
  ['archiveControl', `SELECT is_frozen, cutover_at FROM english_archive_control WHERE singleton = true`],
  ['courseRunsByStatus', `SELECT status, count(*)::int AS count FROM eng_course_runs GROUP BY status ORDER BY status`],
  ['runEnrollmentsByStatus', `SELECT status, count(*)::int AS count FROM eng_run_enrollments GROUP BY status ORDER BY status`],
  ['picAssignments', `SELECT count(*)::int AS total,
      count(*) FILTER (WHERE end_date IS NULL)::int AS current,
      count(*) FILTER (WHERE pic_employee_id IS NOT NULL)::int AS employee,
      count(*) FILTER (WHERE pic_label IS NOT NULL)::int AS label
    FROM eng_cohort_pic`],
  ['multipleCurrentPics', `SELECT cohort_id, count(*)::int AS count
    FROM eng_cohort_pic WHERE end_date IS NULL GROUP BY cohort_id HAVING count(*) > 1`],
  ['multipleActiveMemberships', `SELECT e.emp_code, e.full_name, count(*)::int AS count,
      string_agg(c.class_code, ', ' ORDER BY c.class_code) AS classes
    FROM eng_cohort_memberships m
    JOIN eng_employees e ON e.id = m.employee_id
    JOIN eng_cohorts c ON c.id = m.cohort_id
    WHERE m.status = 'active'
    GROUP BY e.id HAVING count(*) > 1 ORDER BY e.emp_code`],
  ['multiActiveIssues', `SELECT id, entity_type, entity_key, detail, status
    FROM eng_data_quality_issues WHERE issue_code = 'multi_active_enrollment'
    ORDER BY entity_key`],
  ['conflictingMembershipDetails', `SELECT e.emp_code, c.class_code, m.id AS membership_id,
      m.status, m.start_date, m.end_date, en.id AS enrollment_id,
      en.status AS enrollment_status,
      (SELECT count(*)::int FROM eng_attendance_records ar WHERE ar.run_enrollment_id = en.id) AS attendance_count
    FROM eng_cohort_memberships m
    JOIN eng_employees e ON e.id = m.employee_id
    JOIN eng_cohorts c ON c.id = m.cohort_id
    JOIN eng_run_enrollments en ON en.cohort_membership_id = m.id
    WHERE e.emp_code IN ('213817', '267040')
    ORDER BY e.emp_code, c.class_code`],
  ['multipleActiveEnrollments', `
    WITH conflicted AS (
      SELECT employee_id
      FROM eng_run_enrollments
      WHERE status = 'active'
      GROUP BY employee_id
      HAVING count(*) > 1
    )
    SELECT e.emp_code, e.full_name, en.id AS enrollment_id,
      h.class_code, c.course_name, r.start_date, r.end_date,
      max(su.held_at) AS latest_session_at,
      count(ar.id)::int AS attendance_count
    FROM conflicted x
    JOIN eng_employees e ON e.id = x.employee_id
    JOIN eng_run_enrollments en ON en.employee_id = x.employee_id AND en.status = 'active'
    JOIN eng_course_runs r ON r.id = en.course_run_id
    JOIN eng_cohorts h ON h.id = r.cohort_id
    JOIN eng_courses c ON c.id = r.course_id
    LEFT JOIN eng_attendance_records ar ON ar.run_enrollment_id = en.id
    LEFT JOIN eng_session_units su ON su.id = ar.session_unit_id
    GROUP BY e.emp_code, e.full_name, en.id, h.class_code, c.course_name, r.start_date, r.end_date
    ORDER BY e.emp_code, latest_session_at DESC NULLS LAST, r.start_date DESC NULLS LAST`],
  ['incorrectPicTeams', `
    SELECT count(*)::int AS count
    FROM teams
    WHERE meta->>'englishArchiveTeamKey' IS NOT NULL AND is_deleted = false`],
  ['incorrectGenericEnrollments', `
    SELECT count(*)::int AS count
    FROM enrollments
    WHERE meta->>'englishArchiveEnrollmentKey' IS NOT NULL AND status = 'Active'`],
  ['incorrectGenericClasses', `
    SELECT count(*)::int AS count
    FROM classes
    WHERE meta->>'englishArchiveRunKey' IS NOT NULL AND is_deleted = false`],
  ['incorrectGenericPrograms', `
    SELECT count(*)::int AS count
    FROM learning_programs
    WHERE meta->>'englishArchiveCourseKey' IS NOT NULL AND is_deleted = false`],
  ['sessionUnits', `SELECT count(*)::int AS count FROM eng_session_units`],
  ['attendanceFacts', `SELECT count(*)::int AS count FROM eng_attendance_records`],
  ['canonicalAuditEvents', `SELECT action, count(*)::int AS count
    FROM eng_audit_events GROUP BY action ORDER BY action`],
];

const main = async () => {
  const report = {};
  for (const [name, sql] of checks) {
    // Sequential by design: this operational audit should stay gentle on Neon.
    // eslint-disable-next-line no-await-in-loop
    report[name] = (await query(sql)).rows;
  }
  console.log(JSON.stringify(report, null, 2));
};

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(closePool);
