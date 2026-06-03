const router = require('express').Router();
const { protect } = require('../../middleware/auth');
const { requireCapability } = require('../../middleware/requireCapability');
const { validate } = require('../../middleware/validate');
const { bookingLimiter } = require('../../middleware/rateLimiters');
const { idParam } = require('../../schemas/common');
const controller = require('./controller');
const sessionController = require('./session/controller');
const {
  createProgramBody,
  updateProgramBody,
  listProgramsQuery,
  listCohortsQuery,
  createCohortBody,
} = require('./schemas');
const {
  listSessionsQuery,
  bookSessionBody,
} = require('./session/schemas');
const enrollmentController = require('./enrollment/controller');
const { enrollBody, listEnrollmentsQuery } = require('./enrollment/schemas');

router.use(protect);

router
  .route('/programs')
  .get(validate({ query: listProgramsQuery }), controller.listPrograms)
  .post(requireCapability('program.manage'), validate({ body: createProgramBody }), controller.createProgram);

router
  .route('/programs/:id')
  .get(validate({ params: idParam }), controller.getProgram)
  .put(requireCapability('program.manage'), validate({ params: idParam, body: updateProgramBody }), controller.updateProgram)
  .delete(requireCapability('program.manage'), validate({ params: idParam }), controller.archiveProgram);

router
  .route('/cohorts')
  .get(validate({ query: listCohortsQuery }), controller.listCohorts)
  .post(requireCapability('cohort.manage'), validate({ body: createCohortBody }), controller.createCohort);

router
  .route('/cohorts/:id')
  .get(validate({ params: idParam }), controller.getCohort);

router
  .route('/sessions')
  .get(validate({ query: listSessionsQuery }), sessionController.listSessions);

router.post(
  '/sessions/book-slot',
  requireCapability('session.book'),
  bookingLimiter,
  validate({ body: bookSessionBody }),
  sessionController.bookSession,
);

router.delete(
  '/sessions/:id/cancel',
  requireCapability('session.book'),
  validate({ params: idParam }),
  sessionController.cancelSession,
);

router
  .route('/sessions/:id')
  .get(validate({ params: idParam }), sessionController.getSession);

// ── Cohort-based enrollment (L&D) ─────────────────────────
router
  .route('/enrollments')
  .get(
    requireCapability('enrollment.read'),
    validate({ query: listEnrollmentsQuery }),
    enrollmentController.list,
  )
  .post(
    requireCapability('enrollment.manage', 'enrollment.self'),
    validate({ body: enrollBody }),
    enrollmentController.enroll,
  );

router.delete(
  '/enrollments/:id',
  requireCapability('enrollment.manage', 'enrollment.self'),
  validate({ params: idParam }),
  enrollmentController.withdraw,
);

module.exports = router;
