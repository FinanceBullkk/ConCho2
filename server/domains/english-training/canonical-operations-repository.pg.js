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

const findCourseRunForUpdate = async (courseRunId, client) => {
  const { rows } = await client.query(`
    SELECT r.*, co.capacity, co.status AS cohort_status, co.class_code,
      c.course_code, c.course_name
    FROM eng_course_runs r
    JOIN eng_cohorts co ON co.id = r.cohort_id
    JOIN eng_courses c ON c.id = r.course_id
    WHERE r.id = $1
    FOR UPDATE OF r, co
  `, [courseRunId]);
  return rows[0] || null;
};

const findActiveEmployee = async (employeeId, client) => {
  const { rows } = await client.query(`
    SELECT * FROM eng_employees
    WHERE id = $1 AND employment_status = 'active'
    FOR SHARE
  `, [employeeId]);
  return rows[0] || null;
};

const getNextSessionNumber = async (courseRunId, client) => {
  const { rows } = await client.query(`
    SELECT COALESCE(MAX(su.session_number) FILTER (WHERE m.status <> 'cancelled'), 0)::int + 1 AS next_number
    FROM eng_session_units su
    JOIN eng_meetings m ON m.id = su.meeting_id
    WHERE su.course_run_id = $1
  `, [courseRunId]);
  return rows[0].next_number;
};

const getTransferStartSessionNumber = async (courseRunId, client) => {
  const { rows } = await client.query(`
    SELECT COALESCE(
      MIN(su.session_number) FILTER (WHERE m.status = 'planned'),
      MAX(su.session_number) FILTER (WHERE m.status = 'completed') + 1,
      1
    )::int AS start_number
    FROM eng_session_units su
    JOIN eng_meetings m ON m.id = su.meeting_id
    WHERE su.course_run_id = $1
  `, [courseRunId]);
  return rows[0].start_number;
};

const countActiveRunEnrollments = async (courseRunId, client) => {
  const { rows } = await client.query(`
    SELECT count(*)::int AS count FROM eng_run_enrollments
    WHERE course_run_id = $1 AND status = 'active'
  `, [courseRunId]);
  return rows[0].count;
};

const countActiveMemberships = async (cohortId, client) => {
  const { rows } = await client.query(`
    SELECT count(*)::int AS count FROM eng_cohort_memberships
    WHERE cohort_id = $1 AND status = 'active'
  `, [cohortId]);
  return rows[0].count;
};

const findActiveEnrollmentForEmployee = async (employeeId, client) => {
  const { rows } = await client.query(`
    SELECT en.id, en.course_run_id, co.class_code, c.course_name
    FROM eng_run_enrollments en
    JOIN eng_course_runs r ON r.id = en.course_run_id
    JOIN eng_cohorts co ON co.id = r.cohort_id
    JOIN eng_courses c ON c.id = r.course_id
    WHERE en.employee_id = $1 AND en.status = 'active'
    FOR UPDATE OF en
  `, [employeeId]);
  return rows[0] || null;
};

const findEnrollmentInRun = async (courseRunId, employeeId, client) => {
  const { rows } = await client.query(`
    SELECT id, status FROM eng_run_enrollments
    WHERE course_run_id = $1 AND employee_id = $2
    FOR UPDATE
  `, [courseRunId, employeeId]);
  return rows[0] || null;
};

const findRunEnrollmentForUpdate = async (courseRunId, enrollmentId, client) => {
  const { rows } = await client.query(`
    SELECT en.*, cm.status AS membership_status,
      cm.cohort_id AS membership_cohort_id,
      cm.start_date AS membership_start_date, cm.end_date AS membership_end_date,
      COALESCE(NULLIF(BTRIM(ec.business_unit), ''), NULLIF(BTRIM(u.department), ''),
        NULLIF(BTRIM(en.business_unit_id_snapshot), ''),
        NULLIF(BTRIM(e.meta->>'businessUnit'), '')) AS current_business_unit,
      COALESCE(NULLIF(BTRIM(ec.job_role), ''), NULLIF(BTRIM(u.position), ''),
        NULLIF(BTRIM(en.job_role_id_snapshot), ''),
        NULLIF(BTRIM(e.meta->>'jobRole'), '')) AS current_job_role
    FROM eng_run_enrollments en
    JOIN eng_cohort_memberships cm ON cm.id = en.cohort_membership_id
    JOIN eng_employees e ON e.id = en.employee_id
    LEFT JOIN users u ON u.id = e.user_id
    LEFT JOIN eng_employee_corrections ec ON lower(ec.emp_code) = lower(e.emp_code)
    WHERE en.id = $1 AND en.course_run_id = $2
    FOR UPDATE OF en, cm
  `, [enrollmentId, courseRunId]);
  return rows[0] || null;
};

const findCurrentMembership = async (cohortId, employeeId, client) => {
  const { rows } = await client.query(`
    SELECT * FROM eng_cohort_memberships
    WHERE cohort_id = $1 AND employee_id = $2 AND status = 'active'
    FOR UPDATE
  `, [cohortId, employeeId]);
  return rows[0] || null;
};

const createMembership = async (row, client) => {
  const { rows } = await client.query(`
    INSERT INTO eng_cohort_memberships (id, cohort_id, employee_id, start_date, status)
    VALUES ($1,$2,$3,$4,'active') RETURNING *
  `, [row.id, row.cohortId, row.employeeId, row.startDate]);
  return rows[0];
};

const createRunEnrollment = async (row, client) => {
  const { rows } = await client.query(`
    INSERT INTO eng_run_enrollments (
      id, course_run_id, employee_id, cohort_membership_id, status,
      start_session_number, business_unit_id_snapshot, job_role_id_snapshot,
      transfer_from_enrollment_id, meta
    ) VALUES ($1,$2,$3,$4,'active',$5,$6,$7,$8,$9) RETURNING *
  `, [
    row.id, row.courseRunId, row.employeeId, row.membershipId,
    row.startSessionNumber, row.businessUnit, row.jobRole,
    row.transferFromEnrollmentId || null, JSON.stringify(row.meta || {}),
  ]);
  return rows[0];
};

const markRunEnrollmentTransferred = async (enrollmentId, row, client) => {
  const { rows } = await client.query(`
    UPDATE eng_run_enrollments SET
      status = 'transferred',
      meta = COALESCE(meta, '{}'::jsonb) || jsonb_build_object(
        'transfer', jsonb_build_object(
          'transferDate', $2::text,
          'targetCourseRunId', $3::text,
          'targetEnrollmentId', $4::text,
          'authority', $5::text
        )
      ),
      updated_at = NOW()
    WHERE id = $1 AND status = 'active'
    RETURNING *
  `, [
    enrollmentId, row.transferDate, row.targetCourseRunId,
    row.targetEnrollmentId, row.authority,
  ]);
  return rows[0] || null;
};

const markMembershipTransferred = async (
  membershipId, targetMembershipId, transferDate, client,
) => {
  const { rows } = await client.query(`
    UPDATE eng_cohort_memberships SET
      status = 'transferred', end_date = $3::date,
      transfer_to_membership_id = $2
    WHERE id = $1 AND status = 'active'
    RETURNING *
  `, [membershipId, targetMembershipId, transferDate]);
  return rows[0] || null;
};

const dropRunEnrollment = async (enrollmentId, row, client) => {
  const { rows } = await client.query(`
    UPDATE eng_run_enrollments SET
      status = 'dropped',
      meta = COALESCE(meta, '{}'::jsonb) || jsonb_build_object(
        'leave', jsonb_build_object(
          'lastActiveDate', $2::text,
          'reason', $3::text,
          'authority', $4::text
        )
      ),
      updated_at = NOW()
    WHERE id = $1 AND status = 'active'
    RETURNING *
  `, [enrollmentId, row.lastActiveDate, row.reason, row.authority]);
  return rows[0] || null;
};

const endMembershipIfUnused = async (membershipId, lastActiveDate, client) => {
  const { rows } = await client.query(`
    UPDATE eng_cohort_memberships m SET
      status = 'cancelled', end_date = $2::date
    WHERE m.id = $1 AND m.status = 'active'
      AND NOT EXISTS (
        SELECT 1 FROM eng_run_enrollments en
        WHERE en.cohort_membership_id = m.id AND en.status = 'active'
      )
    RETURNING *
  `, [membershipId, lastActiveDate]);
  return rows[0] || null;
};

const createMeeting = async (row, client) => {
  const { rows } = await client.query(`
    INSERT INTO eng_meetings (
      id, course_run_id, starts_at, duration_minutes, status, meta
    ) VALUES ($1,$2,$3,$4,'planned',$5) RETURNING *
  `, [row.id, row.courseRunId, row.startsAt, row.durationMinutes, JSON.stringify(row.meta || {})]);
  return rows[0];
};

const createSessionUnit = async (row, client) => {
  const { rows } = await client.query(`
    INSERT INTO eng_session_units (
      id, course_run_id, meeting_id, session_number, held_at, status,
      unit_number_in_meeting, unit_type, source_sheet, source_row, meta
    ) VALUES ($1,$2,$3,$4,$5,'scheduled',1,'normal',NULL,NULL,$6)
    RETURNING *
  `, [
    row.id, row.courseRunId, row.meetingId, row.sessionNumber, row.startsAt,
    JSON.stringify(row.meta || {}),
  ]);
  return rows[0];
};

const findMeetingForUpdate = async (courseRunId, meetingId, client) => {
  const { rows } = await client.query(`
    SELECT m.*, su.id AS session_unit_id, su.session_number,
      su.status AS session_unit_status, su.source_sheet,
      co.class_code, c.course_name,
      (SELECT count(*)::int FROM eng_attendance_records ar
        WHERE ar.session_unit_id = su.id) AS attendance_count
    FROM eng_meetings m
    JOIN eng_session_units su
      ON su.meeting_id = m.id AND su.unit_type = 'normal'
    JOIN eng_course_runs r ON r.id = m.course_run_id
    JOIN eng_cohorts co ON co.id = r.cohort_id
    JOIN eng_courses c ON c.id = r.course_id
    WHERE m.id = $1 AND m.course_run_id = $2
    ORDER BY su.unit_number_in_meeting
    LIMIT 1
    FOR UPDATE OF m, su
  `, [meetingId, courseRunId]);
  return rows[0] || null;
};

const rescheduleMeeting = async (meetingId, row, client) => {
  const { rows } = await client.query(`
    UPDATE eng_meetings SET
      starts_at = $2,
      duration_minutes = $3,
      meta = COALESCE(meta, '{}'::jsonb) || $4::jsonb,
      updated_at = NOW()
    WHERE id = $1 AND status = 'planned'
    RETURNING *
  `, [
    meetingId, row.startsAt, row.durationMinutes,
    JSON.stringify({ endsAt: row.endsAt, rescheduleReason: row.reason || null }),
  ]);
  if (!rows[0]) return null;
  await client.query(`
    UPDATE eng_session_units SET
      held_at = $2,
      meta = COALESCE(meta, '{}'::jsonb) || $3::jsonb,
      updated_at = NOW()
    WHERE meeting_id = $1
  `, [meetingId, row.startsAt, JSON.stringify({ endsAt: row.endsAt })]);
  return rows[0];
};

const cancelMeeting = async (meetingId, cancellationReason, client) => {
  const { rows } = await client.query(`
    UPDATE eng_meetings SET
      status = 'cancelled', cancellation_reason = $2, updated_at = NOW()
    WHERE id = $1 AND status = 'planned'
    RETURNING *
  `, [meetingId, cancellationReason]);
  if (!rows[0]) return null;
  await client.query(`
    UPDATE eng_session_units SET status = 'cancelled', updated_at = NOW()
    WHERE meeting_id = $1 AND status = 'scheduled'
  `, [meetingId]);
  return rows[0];
};

const getMeetingDeliveryContext = async (meetingId) => {
  const { rows: meetings } = await repository.query(`
    SELECT m.*, su.id AS session_unit_id, su.session_number,
      co.class_code, c.course_name
    FROM eng_meetings m
    JOIN eng_session_units su
      ON su.meeting_id = m.id AND su.unit_type = 'normal'
    JOIN eng_course_runs r ON r.id = m.course_run_id
    JOIN eng_cohorts co ON co.id = r.cohort_id
    JOIN eng_courses c ON c.id = r.course_id
    WHERE m.id = $1
    ORDER BY su.unit_number_in_meeting
    LIMIT 1
  `, [meetingId]);
  const meeting = meetings[0];
  if (!meeting) return null;

  const { rows: audience } = await repository.query(`
    WITH recipients AS (
      SELECT e.id AS employee_id, e.user_id, e.email, e.full_name, 'learner'::text AS audience_role
      FROM eng_run_enrollments en
      JOIN eng_employees e ON e.id = en.employee_id
      WHERE en.course_run_id = $1
        AND en.start_session_number <= $2
        AND en.status IN ('active','completed')
      UNION ALL
      SELECT e.id, e.user_id, e.email, e.full_name, 'pic'::text
      FROM eng_course_runs r
      JOIN eng_cohort_pic pic
        ON pic.cohort_id = r.cohort_id
        AND pic.end_date IS NULL
      JOIN eng_employees e ON e.id = pic.pic_employee_id
      WHERE r.id = $1
    )
    SELECT DISTINCT ON (COALESCE(user_id, employee_id))
      employee_id, user_id, email, full_name, audience_role
    FROM recipients
    ORDER BY COALESCE(user_id, employee_id),
      CASE audience_role WHEN 'learner' THEN 0 ELSE 1 END
  `, [meeting.course_run_id, meeting.session_number]);
  return { meeting, audience };
};

const setMeetingCalendarDetails = async (meetingId, { googleEventId, meetLink }) => {
  await repository.query(`
    UPDATE eng_meetings SET google_event_id = $2, meet_link = $3, updated_at = NOW()
    WHERE id = $1
  `, [meetingId, googleEventId || null, meetLink || null]);
};

const getAttendanceRosterData = async (courseRunId, sessionUnitId, client, { lock = false } = {}) => {
  const { rows: units } = await client.query(`
    SELECT su.id, su.course_run_id, su.session_number, su.unit_type,
      m.id AS meeting_id, m.status AS meeting_status, m.starts_at,
      m.duration_minutes, m.updated_at AS meeting_updated_at
    FROM eng_session_units su
    JOIN eng_meetings m ON m.id = su.meeting_id
    WHERE su.id = $1 AND su.course_run_id = $2
    ${lock ? 'FOR UPDATE OF su, m' : ''}
  `, [sessionUnitId, courseRunId]);
  const unit = units[0] || null;
  if (!unit) return null;

  const { rows } = await client.query(`
    SELECT en.id AS run_enrollment_id, en.status AS enrollment_status,
      en.start_session_number, e.emp_code, e.full_name,
      ar.id AS attendance_id, ar.status AS recorded_status,
      CASE WHEN ar.id IS NOT NULL THEN ar.status
        WHEN $4 = 'planned' THEN 'present' END AS effective_status
    FROM eng_run_enrollments en
    JOIN eng_employees e ON e.id = en.employee_id
    LEFT JOIN eng_cohort_memberships cm ON cm.id = en.cohort_membership_id
    LEFT JOIN eng_attendance_records ar
      ON ar.run_enrollment_id = en.id AND ar.session_unit_id = $1
    WHERE en.course_run_id = $2
      AND en.start_session_number <= $3
      AND (
        ar.id IS NOT NULL
        OR ($4 = 'planned' AND en.status = 'active')
        OR ($4 = 'completed'
          AND cm.start_date <= $5::date
          AND (cm.end_date IS NULL OR $5::date <= cm.end_date))
      )
    ORDER BY e.full_name, e.emp_code
    ${lock ? 'FOR UPDATE OF en' : ''}
  `, [sessionUnitId, courseRunId, unit.session_number, unit.meeting_status, unit.starts_at]);
  return { unit, rows };
};

const upsertAttendance = async (row, client) => {
  const { rows } = await client.query(`
    INSERT INTO eng_attendance_records (
      id, session_unit_id, run_enrollment_id, status, original_status,
      source_enrollment_dropped, source_sheet, source_row, entered_by, meta
    ) VALUES ($1,$2,$3,$4,$4,false,NULL,NULL,$5,$6)
    ON CONFLICT (session_unit_id, run_enrollment_id) DO UPDATE SET
      status = EXCLUDED.status, entered_by = EXCLUDED.entered_by,
      meta = COALESCE(eng_attendance_records.meta, '{}'::jsonb) || EXCLUDED.meta,
      updated_at = NOW()
    RETURNING *, (xmax = 0) AS inserted
  `, [
    row.id, row.sessionUnitId, row.runEnrollmentId, row.status,
    row.enteredBy, JSON.stringify(row.meta || {}),
  ]);
  return rows[0];
};

const completeMeeting = async (meetingId, client) => {
  await client.query(`
    UPDATE eng_meetings SET status = 'completed', updated_at = NOW()
    WHERE id = $1 AND status = 'planned'
  `, [meetingId]);
  await client.query(`
    UPDATE eng_session_units SET status = 'held', updated_at = NOW()
    WHERE meeting_id = $1 AND status = 'scheduled'
  `, [meetingId]);
};

module.exports = {
  newId: repository.newId,
  withTransaction: repository.withTransaction,
  createCohort,
  findActiveCourse,
  createPicAssignment,
  createCourseRun,
  recordAudit,
  findCourseRunForUpdate,
  findActiveEmployee,
  getNextSessionNumber,
  getTransferStartSessionNumber,
  countActiveRunEnrollments,
  countActiveMemberships,
  findActiveEnrollmentForEmployee,
  findEnrollmentInRun,
  findRunEnrollmentForUpdate,
  findCurrentMembership,
  createMembership,
  createRunEnrollment,
  markRunEnrollmentTransferred,
  markMembershipTransferred,
  dropRunEnrollment,
  endMembershipIfUnused,
  createMeeting,
  createSessionUnit,
  findMeetingForUpdate,
  rescheduleMeeting,
  cancelMeeting,
  getMeetingDeliveryContext,
  setMeetingCalendarDetails,
  getAttendanceRosterData,
  upsertAttendance,
  completeMeeting,
};
