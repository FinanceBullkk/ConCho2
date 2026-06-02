const router = require('express').Router();
const { protect } = require('../../middleware/auth');
const { roleGuard } = require('../../middleware/roleGuard');
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

router.use(protect);

router
  .route('/programs')
  .get(validate({ query: listProgramsQuery }), controller.listPrograms)
  .post(roleGuard('Admin'), validate({ body: createProgramBody }), controller.createProgram);

router
  .route('/programs/:id')
  .get(validate({ params: idParam }), controller.getProgram)
  .put(roleGuard('Admin'), validate({ params: idParam, body: updateProgramBody }), controller.updateProgram)
  .delete(roleGuard('Admin'), validate({ params: idParam }), controller.archiveProgram);

router
  .route('/cohorts')
  .get(validate({ query: listCohortsQuery }), controller.listCohorts)
  .post(roleGuard('Admin'), validate({ body: createCohortBody }), controller.createCohort);

router
  .route('/cohorts/:id')
  .get(validate({ params: idParam }), controller.getCohort);

router
  .route('/sessions')
  .get(validate({ query: listSessionsQuery }), sessionController.listSessions);

router.post(
  '/sessions/book-slot',
  roleGuard('Admin', 'Participant'),
  bookingLimiter,
  validate({ body: bookSessionBody }),
  sessionController.bookSession,
);

router.delete(
  '/sessions/:id/cancel',
  roleGuard('Admin', 'Participant'),
  validate({ params: idParam }),
  sessionController.cancelSession,
);

router
  .route('/sessions/:id')
  .get(validate({ params: idParam }), sessionController.getSession);

module.exports = router;
