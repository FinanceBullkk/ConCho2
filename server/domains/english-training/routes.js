const router = require('express').Router();
const { protect } = require('../../middleware/auth');
const { roleGuard } = require('../../middleware/roleGuard');
const { requireCapability } = require('../../middleware/requireCapability');
const { validate } = require('../../middleware/validate');
const controller = require('./controller');
const {
  idParams, empCodeParams, issueCodeParams, listEmployeesQuery,
  employeeCorrectionBody, examResultBody,
  managedPersonCreateBody, managedPersonUpdateBody,
  liveLevelBody,
  archiveCutoverBody,
} = require('./schemas');

// ──────────────────────────────────────────────────────────
// English Training routes — mounted at /api/english-training (feature-flagged in
// server.js via ENGLISH_TRAINING_ENABLED). Canonical workbook evidence remains
// read-only; the HTTP mutation writes to a separate audited correction overlay.
// The HTTP reads expose task-oriented projections for the admin view. This is
// an Admin + Coordinator operations tool, never learner-facing.
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
  '/live/cohorts/:id/eligibility',
  roleGuard('Admin', 'Coordinator', 'Teacher'),
  requireCapability('attendance.read'),
  validate({ params: idParams }),
  controller.getLiveEligibility,
);
router.get(
  '/live/history',
  roleGuard('Admin', 'Coordinator'),
  requireCapability('report.read'),
  controller.getCombinedHistory,
);
router.get(
  '/archive/status',
  roleGuard('Admin', 'Coordinator'),
  requireCapability('report.read'),
  controller.getArchiveStatus,
);
router.post(
  '/archive/cutover',
  roleGuard('Admin'),
  requireCapability('settings.manage'),
  validate({ body: archiveCutoverBody }),
  controller.cutoverArchive,
);
router.get(
  '/live/cohorts/:id/evaluations',
  roleGuard('Admin', 'Coordinator', 'Teacher'),
  requireCapability('english.evaluate'),
  validate({ params: idParams }),
  controller.getLiveEvaluationWorklist,
);
router.post(
  '/live/cohorts/:id/evaluations',
  roleGuard('Admin', 'Coordinator', 'Teacher'),
  requireCapability('english.evaluate'),
  validate({ params: idParams, body: liveLevelBody }),
  controller.recordLiveEnglishLevel,
);
router.delete(
  '/live/evaluations/:id',
  roleGuard('Admin', 'Coordinator', 'Teacher'),
  requireCapability('english.evaluate'),
  validate({ params: idParams }),
  controller.deleteLiveEnglishLevel,
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

// Historical archive endpoints retain their narrower operations policy.
router.use(roleGuard('Admin', 'Coordinator'));
router.use(requireCapability('report.read'));

router.get('/overview', controller.getOverview);
router.get('/cohorts', controller.listCohorts);
router.get('/cohorts/:id', validate({ params: idParams }), controller.getCohort);
router.get('/cohorts/:id/detail', validate({ params: idParams }), controller.getClassDetail);
router.get('/courses', controller.listCourses);
router.get('/course-runs/:id', validate({ params: idParams }), controller.getCourseRun);
router.get('/sessions', validate({ query: listEmployeesQuery }), controller.listSessions);
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
