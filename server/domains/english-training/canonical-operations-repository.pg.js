const repository = require('./repository.pg');

const createCohort = async (row, client) => {
  const { rows } = await client.query(`
    INSERT INTO eng_cohorts (
      id, class_code, display_name, status, capacity, meta
    ) VALUES ($1,$2,$3,$4,$5,$6)
    RETURNING *
  `, [row.id, row.classCode, row.displayName, row.status, row.capacity, JSON.stringify(row.meta || {})]);
  return rows[0];
};

const findActiveCourse = async (courseId, client) => {
  const { rows } = await client.query(`
    SELECT id, course_code, course_name, expected_units,
      attendance_threshold_ratio, max_absences_allowed
    FROM eng_courses
    WHERE id = $1 AND is_active = true
    FOR SHARE
  `, [courseId]);
  return rows[0] || null;
};

const createPicAssignment = async (row, client) => {
  const { rows } = await client.query(`
    INSERT INTO eng_cohort_pic (
      id, cohort_id, pic_employee_id, pic_label, start_date, meta
    ) VALUES ($1,$2,$3,$4,$5,$6)
    RETURNING *
  `, [
    row.id, row.cohortId, row.picEmployeeId, row.picLabel,
    row.startDate, JSON.stringify(row.meta || {}),
  ]);
  return rows[0];
};

const createCourseRun = async (row, client) => {
  const { rows } = await client.query(`
    INSERT INTO eng_course_runs (
      id, cohort_id, course_id, run_number, status,
      expected_units_snapshot, max_absences_allowed_snapshot,
      attendance_threshold_ratio_snapshot, start_date
    ) VALUES ($1,$2,$3,1,$4,$5,$6,$7,$8)
    RETURNING *
  `, [
    row.id, row.cohortId, row.courseId, row.status,
    row.expectedUnits, row.maxAbsencesAllowed, row.attendanceThresholdRatio,
    row.startDate,
  ]);
  return rows[0];
};

const recordAudit = async (event, client) => {
  await client.query(`
    INSERT INTO eng_audit_events (
      actor_user_id, actor_emp_code, action, entity_type, entity_key, details
    ) VALUES ($1,$2,$3,$4,$5,$6)
  `, [
    event.actorUserId || null, event.actorEmpCode || null, event.action,
    event.entityType, event.entityKey || null, JSON.stringify(event.details || {}),
  ]);
};

module.exports = {
  newId: repository.newId,
  withTransaction: repository.withTransaction,
  createCohort,
  findActiveCourse,
  createPicAssignment,
  createCourseRun,
  recordAudit,
};
