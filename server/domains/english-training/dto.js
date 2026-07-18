// English-training — DTO shaping (snake_case rows → camelCase API vocabulary).
// Keeps the HTTP surface stable + readable; no business logic here.

const cohortRow = (r) => ({
  id: r.id, classCode: r.class_code, displayName: r.display_name, status: r.status,
  activeMembers: r.active_members, runs: r.runs,
});
const memberRow = (r) => ({
  id: r.id, status: r.status, startDate: r.start_date,
  empCode: r.emp_code, fullName: r.full_name, employmentStatus: r.employment_status,
});
const runRow = (r) => ({
  id: r.id, runNumber: r.run_number, status: r.status,
  startDate: r.start_date, endDate: r.end_date,
  courseCode: r.course_code, courseName: r.course_name, enrollments: r.enrollments,
});
const picRow = (r) => ({ id: r.id, label: r.pic_label, empCode: r.emp_code, fullName: r.full_name });
const courseRow = (r) => ({
  id: r.id, courseCode: r.course_code, courseName: r.course_name,
  expectedUnits: r.expected_units, maxAbsencesAllowed: r.max_absences_allowed,
  isActive: r.is_active, runs: r.runs,
});
const rosterRow = (r) => ({
  id: r.id, status: r.status, startSessionNumber: r.start_session_number, dq: r.dq,
  empCode: r.emp_code, fullName: r.full_name,
  businessUnit: r.business_unit_id_snapshot, jobRole: r.job_role_id_snapshot,
});
const employeeRow = (r) => ({
  id: r.id, empCode: r.emp_code, fullName: r.full_name, englishName: r.english_name,
  email: r.email, employmentStatus: r.employment_status,
});
const enrollmentRow = (r) => ({
  id: r.id, status: r.status, dq: r.dq, classCode: r.class_code,
  courseName: r.course_name, runNumber: r.run_number,
});
const sessionRow = (r) => ({
  id: r.id, sessionNumber: r.session_number, heldAt: r.held_at, status: r.status,
  courseRunId: r.course_run_id, classCode: r.class_code, courseName: r.course_name,
  attendanceCount: r.attendance_count, presentCount: r.present_count, absentCount: r.absent_count,
});
const attendanceRow = (r) => ({
  attendanceId: r.attendance_id, enrollmentId: r.enrollment_id,
  employeeCode: r.emp_code, employeeName: r.full_name,
  enrollmentStatus: r.enrollment_status,
  attendanceStatus: r.attendance_status || 'unmarked',
  sourceEnrollmentDropped: r.source_enrollment_dropped || false,
});
const eligibilityRow = (r) => ({
  enrollmentId: r.enrollment_id, employeeCode: r.emp_code, employeeName: r.full_name,
  enrollmentStatus: r.enrollment_status, courseRunId: r.course_run_id,
  runStatus: r.run_status, classCode: r.class_code, courseName: r.course_name,
  allowedAbsences: r.allowed_absences, markedSessions: r.marked_sessions,
  presentCount: r.present_count, absenceCount: r.absence_count,
  eligibilityStatus: r.eligibility_status,
});

module.exports = {
  cohortList: (rows) => rows.map(cohortRow),
  cohortDetail: ({ cohort, members, runs, pics }) => ({
    ...cohortRow(cohort), members: members.map(memberRow),
    runs: runs.map(runRow), pics: pics.map(picRow),
  }),
  courseList: (rows) => rows.map(courseRow),
  courseRunDetail: ({ run, roster }) => ({
    id: run.id, runNumber: run.run_number, status: run.status,
    classCode: run.class_code, courseCode: run.course_code, courseName: run.course_name,
    startDate: run.start_date, endDate: run.end_date,
    expectedUnits: run.expected_units_snapshot, maxAbsencesAllowed: run.max_absences_allowed_snapshot,
    roster: roster.map(rosterRow),
  }),
  employeeList: (rows) => rows.map(employeeRow),
  employeeDetail: ({ employee, memberships, enrollments }) => ({
    ...employeeRow(employee),
    memberships: memberships.map((m) => ({ id: m.id, status: m.status, startDate: m.start_date, classCode: m.class_code })),
    enrollments: enrollments.map(enrollmentRow),
  }),
  sessionList: (rows) => rows.map(sessionRow),
  sessionAttendance: ({ session, roster }) => ({
    ...sessionRow(session), roster: roster.map(attendanceRow),
  }),
  eligibilityList: (rows) => rows.map(eligibilityRow),
  issues: (rows) => rows.map((r) => ({ code: r.issue_code, count: r.count })),
  issueDetails: (rows) => rows.map((r) => ({
    id: r.id,
    code: r.issue_code,
    entityType: r.entity_type,
    entityKey: r.entity_key,
    employeeCode: r.emp_code,
    employeeName: r.full_name,
    classCode: r.class_code,
    businessUnit: r.business_unit,
    jobRole: r.job_role,
    sourceSheet: r.source_sheet,
    sourceRow: r.source_row,
    detail: r.detail,
  })),
};
