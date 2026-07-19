const { query } = require('../../config/pg');

const getCohortContext = async (cohortId) => {
  const { rows } = await query(
    `SELECT c.id, c.class_code, c.course_name, c.status, c.teacher_ids,
            c.english_group_code, c.english_policy_snapshot,
            p.id AS program_id, p.category, p.name AS program_name
       FROM classes c
       JOIN learning_programs p ON p.id = c.program_id
      WHERE c.id = $1 AND c.is_deleted = false`,
    [String(cohortId)],
  );
  const row = rows[0];
  return row ? {
    id: row.id,
    cohortCode: row.class_code,
    courseName: row.course_name,
    status: row.status,
    teacherIds: (row.teacher_ids || []).map(String),
    englishGroupCode: row.english_group_code,
    englishPolicySnapshot: row.english_policy_snapshot,
    programId: row.program_id,
    programName: row.program_name,
    category: row.category,
  } : null;
};

const listCohortSessions = async (cohortId) => {
  const { rows } = await query(
    `SELECT id, start_time, end_time, status,
            row_number() OVER (ORDER BY start_time ASC, id ASC)::int AS session_number
       FROM schedules
      WHERE class_id = $1
      ORDER BY start_time ASC, id ASC`,
    [String(cohortId)],
  );
  return rows.map((row) => ({
    id: row.id,
    startTime: row.start_time,
    endTime: row.end_time,
    status: row.status,
    sessionNumber: row.session_number,
  }));
};

const listCohortEnrollments = async (cohortId) => {
  const { rows } = await query(
    `SELECT e.id, e.user_id, e.status, e.start_session_number,
            u.emp_code, u.name, u.department
       FROM enrollments e
       JOIN users u ON u.id = e.user_id AND u.is_deleted = false
      WHERE e.class_id = $1 AND e.team_id IS NULL AND e.status IN ('Active', 'Completed')
      ORDER BY u.emp_code COLLATE "C"`,
    [String(cohortId)],
  );
  return rows.map((row) => ({
    enrollmentId: row.id,
    userId: row.user_id,
    empCode: row.emp_code,
    name: row.name,
    department: row.department,
    enrollmentStatus: row.status,
    startSessionNumber: row.start_session_number == null ? 1 : Number(row.start_session_number),
  }));
};

const listAttendanceForCohort = async (cohortId) => {
  const { rows } = await query(
    `SELECT a.schedule_id, a.user_id, a.status
       FROM attendances a
       JOIN schedules s ON s.id = a.schedule_id
      WHERE s.class_id = $1`,
    [String(cohortId)],
  );
  return rows.map((row) => ({ scheduleId: row.schedule_id, userId: row.user_id, status: row.status }));
};

module.exports = {
  getCohortContext,
  listCohortSessions,
  listCohortEnrollments,
  listAttendanceForCohort,
};
