const router = require('express').Router();
const { protect } = require('../../middleware/auth');
const { roleGuard } = require('../../middleware/roleGuard');
const { requireCapability } = require('../../middleware/requireCapability');
const { validate } = require('../../middleware/validate');
const controller = require('./controller');
const {
  idParams, empCodeParams, issueCodeParams, listEmployeesQuery, listSessionsQuery,
  employeeCorrectionBody, examResultBody,
  managedPersonCreateBody, managedPersonUpdateBody,
  canonicalClassBody,
  courseRunParams, courseRunEnrollmentParams, courseRunMeetingParams, attendanceRosterParams,
  runEnrollmentBody, runEnrollmentLeaveBody, runEnrollmentTransferBody,
  attendanceSessionBody, meetingRescheduleBody,
  meetingCancellationBody, attendanceRosterBody,
} = require('./schemas');

// ──────────────────────────────────────────────────────────
// English Training routes — mounted at /api/english-training (feature-flagged in
// server.js via ENGLISH_TRAINING_ENABLED). ConMeoGauGau owns business semantics;
// canonical English commands/read models live here while raw workbook evidence
// stays immutable. This is an Admin + Coordinator tool, never learner-facing.
// ──────────────────────────────────────────────────────────

router.use(protect);

// Live English Operations composition. Workspace visibility is never the
// authorization boundary: every route declares role + capability explicitly.
router.get(
  '/workspace/overview',
  roleGuard('Admin', 'Coordinator', 'Teacher'),
  requireCapability('report.read'),
  controller.getWorkspaceOverview,
);
router.get(
  '/managed-learners',
  roleGuard('Admin', 'Coordinator'),
  requireCapability('enrollment.manage'),
  validate({ query: listEmployeesQuery }),
  controller.listManagedPeople,
);
router.get(
  '/workspace/teachers',
  roleGuard('Admin', 'Coordinator'),
  requireCapability('cohort.manage'),
  controller.listEnglishTeachers,
);
router.get(
  '/workspace/classes',
  roleGuard('Admin', 'Coordinator'),
  requireCapability('report.read'),
  controller.listCohorts,
);
router.get(
  '/workspace/classes/:id',
  roleGuard('Admin', 'Coordinator'),
  requireCapability('report.read'),
  validate({ params: idParams }),
  controller.getClassDetail,
);
router.get(
  '/workspace/courses',
  roleGuard('Admin', 'Coordinator'),
  requireCapability('report.read'),
  controller.listCourses,
);
router.get(
  '/workspace/course-runs',
  roleGuard('Admin', 'Coordinator'),
  requireCapability('report.read'),
  controller.listCanonicalCourseRuns,
);
router.get(
  '/workspace/employees',
  roleGuard('Admin', 'Coordinator'),
  requireCapability('cohort.manage'),
  validate({ query: listEmployeesQuery }),
  controller.listEmployees,
);
router.post(
  '/workspace/classes',
  roleGuard('Admin', 'Coordinator'),
  requireCapability('cohort.manage'),
  validate({ body: canonicalClassBody }),
  controller.createCanonicalClass,
);
router.post(
  '/workspace/course-runs/:courseRunId/enrollments',
  roleGuard('Admin', 'Coordinator'),
  requireCapability('enrollment.manage'),
  validate({ params: courseRunParams, body: runEnrollmentBody }),
  controller.addCanonicalRunEnrollment,
);
router.post(
  '/workspace/course-runs/:courseRunId/enrollments/:enrollmentId/leave',
  roleGuard('Admin', 'Coordinator'),
  requireCapability('enrollment.manage'),
  validate({ params: courseRunEnrollmentParams, body: runEnrollmentLeaveBody }),
  controller.leaveCanonicalRunEnrollment,
);
router.post(
  '/workspace/course-runs/:courseRunId/enrollments/:enrollmentId/transfer',
  roleGuard('Admin', 'Coordinator'),
  requireCapability('enrollment.manage'),
  validate({ params: courseRunEnrollmentParams, body: runEnrollmentTransferBody }),
  controller.transferCanonicalRunEnrollment,
);
router.post(
  '/workspace/course-runs/:courseRunId/sessions',
  roleGuard('Admin', 'Coordinator'),
  requireCapability('session.book'),
  validate({ params: courseRunParams, body: attendanceSessionBody }),
  controller.createCanonicalAttendanceSession,
);
router.patch(
  '/workspace/course-runs/:courseRunId/meetings/:meetingId',
  roleGuard('Admin', 'Coordinator'),
  requireCapability('session.book'),
  validate({ params: courseRunMeetingParams, body: meetingRescheduleBody }),
  controller.rescheduleCanonicalMeeting,
);
router.delete(
  '/workspace/course-runs/:courseRunId/meetings/:meetingId',
  roleGuard('Admin', 'Coordinator'),
  requireCapability('session.book'),
  validate({ params: courseRunMeetingParams, body: meetingCancellationBody }),
  controller.cancelCanonicalMeeting,
);
router.get(
  '/workspace/course-runs/:courseRunId/session-units/:sessionUnitId/attendance',
  roleGuard('Admin', 'Coordinator'),
  requireCapability('attendance.read'),
  validate({ params: attendanceRosterParams }),
  controller.getCanonicalAttendanceRoster,
);
router.put(
  '/workspace/course-runs/:courseRunId/session-units/:sessionUnitId/attendance',
  roleGuard('Admin', 'Coordinator'),
  requireCapability('attendance.mark'),
  validate({ params: attendanceRosterParams, body: attendanceRosterBody }),
  controller.saveCanonicalAttendanceRoster,
);
router.post(
  '/managed-learners',
  roleGuard('Admin', 'Coordinator'),
  requireCapability('enrollment.manage'),
  validate({ body: managedPersonCreateBody }),
  controller.createManagedPerson,
);
router.patch(
  '/managed-learners/:id',
  roleGuard('Admin', 'Coordinator'),
  requireCapability('enrollment.manage'),
  validate({ params: idParams, body: managedPersonUpdateBody }),
  controller.updateManagedPerson,
);
router.delete(
  '/managed-learners/:id',
  roleGuard('Admin', 'Coordinator'),
  requireCapability('enrollment.manage'),
  validate({ params: idParams }),
  controller.deleteManagedPerson,
);
router.post(
  '/managed-learners/provision-archive',
  roleGuard('Admin', 'Coordinator'),
  requireCapability('enrollment.manage'),
  controller.provisionManagedPeople,
);

// Imported evidence and established English read/evaluation endpoints retain
// the narrower Admin/Coordinator operations policy.
router.use(roleGuard('Admin', 'Coordinator'));
router.use(requireCapability('report.read'));

router.get('/overview', controller.getOverview);
router.get('/cohorts', controller.listCohorts);
router.get('/cohorts/:id', validate({ params: idParams }), controller.getCohort);
router.get('/cohorts/:id/detail', validate({ params: idParams }), controller.getClassDetail);
router.get('/courses', controller.listCourses);
router.get('/course-runs/:id', validate({ params: idParams }), controller.getCourseRun);
router.get('/sessions', validate({ query: listSessionsQuery }), controller.listSessions);
router.get('/sessions/summary', controller.getSessionsSummary);
router.get('/sessions/:id/attendance', validate({ params: idParams }), controller.getSessionAttendance);
router.get('/eligibility', validate({ query: listEmployeesQuery }), controller.listEligibility);
router.get('/employees', validate({ query: listEmployeesQuery }), controller.listEmployees);
router.get('/employees/:empCode', validate({ params: empCodeParams }), controller.getEmployee);
router.patch(
  '/employees/:empCode/correction',
  requireCapability('enrollment.manage'),
  validate({ params: empCodeParams, body: employeeCorrectionBody }),
  controller.correctEmployee,
);
router.get('/issues', controller.listIssues);
router.get('/issues/:code', validate({ params: issueCodeParams }), controller.listIssueDetails);

// Phase 3 — exam result & level (evaluation).
router.get('/levels', controller.listLevels);
router.get('/pending-exam-entries', controller.listPendingExamEntries);
router.post(
  '/enrollments/:id/exam-result',
  requireCapability('enrollment.manage'),
  validate({ params: idParams, body: examResultBody }),
  controller.recordExamResult,
);
router.delete(
  '/enrollments/:id/exam-result',
  requireCapability('enrollment.manage'),
  validate({ params: idParams }),
  controller.deleteExamResult,
);

module.exports = router;
