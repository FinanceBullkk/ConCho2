const router = require('express').Router();
const { protect } = require('../../middleware/auth');
const { roleGuard } = require('../../middleware/roleGuard');
const { requireCapability } = require('../../middleware/requireCapability');
const { validate } = require('../../middleware/validate');
const controller = require('./controller');
const {
  idParams, empCodeParams, issueCodeParams, listEmployeesQuery, employeeCorrectionBody,
} = require('./schemas');

// ──────────────────────────────────────────────────────────
// English Training routes — mounted at /api/english-training (feature-flagged in
// server.js via ENGLISH_TRAINING_ENABLED). Canonical workbook evidence remains
// read-only; the HTTP mutation writes to a separate audited correction overlay.
// The HTTP reads expose task-oriented projections for the admin view. This is
// an Admin + Coordinator operations tool, never learner-facing.
// ──────────────────────────────────────────────────────────

router.use(protect);
router.use(roleGuard('Admin', 'Coordinator'));
router.use(requireCapability('report.read'));

router.get('/cohorts', controller.listCohorts);
router.get('/cohorts/:id', validate({ params: idParams }), controller.getCohort);
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

module.exports = router;
