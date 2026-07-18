const router = require('express').Router();
const { protect } = require('../../middleware/auth');
const { roleGuard } = require('../../middleware/roleGuard');
const { validate } = require('../../middleware/validate');
const controller = require('./controller');
const { idParams, empCodeParams, listEmployeesQuery } = require('./schemas');

// ──────────────────────────────────────────────────────────
// English Training routes — mounted at /api/english-training (feature-flagged in
// server.js via ENGLISH_TRAINING_ENABLED). Phase 1 is READ-ONLY: canonical data
// is loaded by the import script (scripts/eng-import.js); the HTTP surface only
// exposes task-oriented projections for the admin view. Reads are an ops tool →
// Admin + Coordinator, never learner-facing.
// ──────────────────────────────────────────────────────────

router.use(protect);
router.use(roleGuard('Admin', 'Coordinator'));

router.get('/cohorts', controller.listCohorts);
router.get('/cohorts/:id', validate({ params: idParams }), controller.getCohort);
router.get('/courses', controller.listCourses);
router.get('/course-runs/:id', validate({ params: idParams }), controller.getCourseRun);
router.get('/employees', validate({ query: listEmployeesQuery }), controller.listEmployees);
router.get('/employees/:empCode', validate({ params: empCodeParams }), controller.getEmployee);
router.get('/issues', controller.listIssues);

module.exports = router;
