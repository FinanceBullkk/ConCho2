// English-training — DTO shaping (snake_case rows → camelCase API vocabulary).
// Keeps the HTTP surface stable + readable; no business logic here.

const cohortRow = (r) => ({
  id: r.id, classCode: r.class_code, displayName: r.display_name, status: r.status,
  capacity: r.capacity, activeMembers: r.active_members, runs: r.runs,
  currentPicAssignmentId: r.current_pic_assignment_id || null,
  currentPicEmployeeId: r.current_pic_employee_id || null,
  currentPic: r.current_pic || null,
  currentPicEmpCode: r.current_pic_emp_code || null,
  currentPicLabel: r.current_pic_label || null,
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
  attendanceThresholdRatio: r.attendance_threshold_ratio == null ? null : Number(r.attendance_threshold_ratio),
  isActive: r.is_active, runs: r.runs,
});
// Exam-sit gate (owner rule): a participating learner with ≤2 absences may sit.
const SITTABLE_STATUSES = ['active', 'completed'];
const sitEligible = (status, markedCount, attendanceRatio, threshold) =>
  SITTABLE_STATUSES.includes(status)
  && Number(markedCount) > 0
  && Number(attendanceRatio) >= Number(threshold);

const rosterRow = (r) => ({
  id: r.id, status: r.status, startSessionNumber: r.start_session_number, dq: r.dq,
  empCode: r.emp_code, fullName: r.full_name,
  businessUnit: r.business_unit_id_snapshot, jobRole: r.job_role_id_snapshot,
  markedCount: r.marked_count, presentCount: r.present_count, absenceCount: r.absence_count,
  attendanceRatio: r.attendance_ratio == null ? null : Number(r.attendance_ratio),
  attendanceThresholdRatio: r.attendance_threshold_ratio == null ? null : Number(r.attendance_threshold_ratio),
  sitEligible: sitEligible(r.status, r.marked_count, r.attendance_ratio, r.attendance_threshold_ratio),
  examLevelCode: r.exam_level_code || null,
  examLevelName: r.exam_level_name || null,
  examDate: r.exam_date || null,
});
// One learner row inside a class-detail course run: attendance summary,
// exam eligibility, and level — read-only 360°.
const classRosterRow = (r) => ({
  enrollmentId: r.enrollment_id, employeeId: r.employee_id,
  empCode: r.emp_code, fullName: r.full_name,
  enrollmentStatus: r.enrollment_status,
  startSessionNumber: r.start_session_number,
  allowedAbsences: r.allowed_absences, absenceCount: r.absence_count,
  markedCount: r.marked_count, presentCount: r.present_count,
  attendanceRatio: r.attendance_ratio == null ? null : Number(r.attendance_ratio),
  attendanceThresholdRatio: r.attendance_threshold_ratio == null ? null : Number(r.attendance_threshold_ratio),
  eligibilityStatus: r.eligibility_status,
  examLevelCode: r.exam_level_code || null,
  examLevelName: r.exam_level_name || null,
  examDate: r.exam_date || null,
});
const employeeRow = (r) => ({
  id: r.id, empCode: r.emp_code, fullName: r.full_name, englishName: r.english_name,
  email: r.email, employmentStatus: r.employment_status,
  activeCourseRunId: r.active_course_run_id || null,
});
const enrollmentRow = (r) => ({
  id: r.id, status: r.status, dq: r.dq, classCode: r.class_code,
  courseName: r.course_name, runNumber: r.run_number,
});
const sessionRow = (r) => ({
  id: r.id, sessionNumber: r.session_number, heldAt: r.held_at, status: r.status,
  meetingId: r.meeting_id || null, meetingStatus: r.meeting_status || null,
  durationMinutes: r.duration_minutes == null ? 60 : Number(r.duration_minutes),
  cancellationReason: r.cancellation_reason || null,
  meetLink: r.meet_link || null,
  sourceKind: r.source_kind || 'imported',
  sourceWasImported: Boolean(r.source_was_imported),
  sourceStartsAt: r.source_starts_at || null,
  sourceDurationMinutes: r.source_duration_minutes == null
    ? null : Number(r.source_duration_minutes),
  operationalAt: r.operational_at || null,
  courseRunId: r.course_run_id, classCode: r.class_code, courseName: r.course_name,
  attendanceCount: r.attendance_count, expectedRosterCount: r.expected_roster_count,
  presentCount: r.present_count, absentCount: r.absent_count,
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
  attendanceRatio: r.attendance_ratio == null ? null : Number(r.attendance_ratio),
  attendanceThresholdRatio: r.attendance_threshold_ratio == null ? null : Number(r.attendance_threshold_ratio),
  eligibilityStatus: r.eligibility_status,
  examLevelCode: r.exam_level_code || null,
  examLevelName: r.exam_level_name || null,
  examDate: r.exam_date || null,
});
const levelRow = (r) => ({ code: r.code, displayName: r.display_name, rank: r.rank });
const examResultRow = (r) => ({
  id: r.id, runEnrollmentId: r.run_enrollment_id, levelCode: r.level_code,
  examDate: r.exam_date, note: r.note, enteredBy: r.entered_by,
});
const pendingExamEntryRow = (r) => ({
  courseRunId: r.course_run_id, classCode: r.class_code, courseName: r.course_name,
  runStatus: r.run_status, endDate: r.end_date, pendingCount: r.pending_count,
});
const activeCourseRunRow = (r) => ({
  id: r.id, runNumber: r.run_number, status: r.status,
  cohortId: r.cohort_id, classCode: r.class_code, displayName: r.display_name,
  courseCode: r.course_code, courseName: r.course_name,
  startDate: r.start_date, endDate: r.end_date,
  nextSessionNumber: r.next_session_number,
  transferStartSessionNumber: r.transfer_start_session_number,
});

module.exports = {
  cohortList: (rows) => rows.map(cohortRow),
  cohortDetail: ({ cohort, members, runs, pics }) => ({
    ...cohortRow(cohort), members: members.map(memberRow),
    runs: runs.map(runRow), pics: pics.map(picRow),
  }),
  classDetail: ({ cohort, runs, roster }) => {
    const byRun = new Map();
    roster.forEach((r) => {
      const list = byRun.get(r.course_run_id) || [];
      list.push(classRosterRow(r));
      byRun.set(r.course_run_id, list);
    });
    return {
      id: cohort.id, classCode: cohort.class_code,
      displayName: cohort.display_name, status: cohort.status,
      capacity: cohort.capacity,
      currentPicAssignmentId: cohort.current_pic_assignment_id || null,
      currentPicEmployeeId: cohort.current_pic_employee_id || null,
      currentPic: cohort.current_pic || null,
      currentPicEmpCode: cohort.current_pic_emp_code || null,
      currentPicLabel: cohort.current_pic_label || null,
      runs: runs.map((r) => ({
        id: r.id, runNumber: r.run_number, status: r.status,
        courseCode: r.course_code, courseName: r.course_name,
        startDate: r.start_date, endDate: r.end_date,
        maxAbsencesAllowed: r.max_absences_allowed,
        attendanceThresholdRatio: Number(r.attendance_threshold_ratio),
        nextSessionNumber: r.next_session_number,
        roster: byRun.get(r.id) || [],
      })),
    };
  },
  courseList: (rows) => rows.map(courseRow),
  activeCourseRunList: (rows) => rows.map(activeCourseRunRow),
  courseRunDetail: ({ run, roster }) => ({
    id: run.id, runNumber: run.run_number, status: run.status,
    classCode: run.class_code, courseCode: run.course_code, courseName: run.course_name,
    startDate: run.start_date, endDate: run.end_date,
    expectedUnits: run.expected_units_snapshot, maxAbsencesAllowed: run.max_absences_allowed_snapshot,
    attendanceThresholdRatio: Number(run.attendance_threshold_ratio_snapshot),
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
  overview: (r) => ({
    cohortsTotal: r.cohorts_total, cohortsActive: r.cohorts_active,
    employeesTotal: r.employees_total, employeesActive: r.employees_active,
    coursesTotal: r.courses_total,
    runsTotal: r.runs_total, runsCompleted: r.runs_completed,
    openDqIssues: r.open_dq_issues,
    pendingExamRuns: r.pending_exam_runs, pendingExamLearners: r.pending_exam_learners,
  }),
  levelList: (rows) => rows.map(levelRow),
  examResult: examResultRow,
  pendingExamEntries: (rows) => rows.map(pendingExamEntryRow),
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
