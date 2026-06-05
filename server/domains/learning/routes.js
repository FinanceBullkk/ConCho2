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
const completionController = require('./completion/controller');
const {
  completionQuery,
  issueCertificateBody,
  listCertificatesQuery,
  revokeCertificateBody,
  verifyCertificateParams,
} = require('./completion/schemas');
const feedbackController = require('./feedback/controller');
const { submitFeedbackBody, listFeedbackQuery } = require('./feedback/schemas');
const reportsController = require('./reports/controller');
const { completionReportQuery, completionRollupQuery, complianceReportQuery } = require('./reports/schemas');
const { exportLimiter } = require('../../middleware/rateLimiters');
const assignmentController = require('./assignment/controller');
const { createAssignmentBody, listAssignmentsQuery } = require('./assignment/schemas');
const pathController = require('./path/controller');
const { createPathBody, updatePathBody, listPathsQuery } = require('./path/schemas');

// ── PUBLIC: certificate verification (no auth) ────────────
// Registered BEFORE router.use(protect) so anyone can verify a certificate by
// its code, and before '/certificates/:id'-style routes so 'verify' is not
// swallowed as an id.
router.get(
  '/certificates/verify/:code',
  validate({ params: verifyCertificateParams }),
  completionController.verifyCertificate,
);

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

// ── Completion & certificates (Wave B) ────────────────────
router.get(
  '/completion',
  requireCapability('completion.read'),
  validate({ query: completionQuery }),
  completionController.getCompletion,
);

router
  .route('/certificates')
  .get(
    requireCapability('certificate.read'),
    validate({ query: listCertificatesQuery }),
    completionController.listCertificates,
  )
  .post(
    requireCapability('certificate.manage'),
    validate({ body: issueCertificateBody }),
    completionController.issueCertificate,
  );

router.delete(
  '/certificates/:id',
  requireCapability('certificate.manage'),
  validate({ params: idParam, body: revokeCertificateBody }),
  completionController.revokeCertificate,
);

// ── Completion reporting + export (Wave B — Phase 5) ──────
router.get(
  '/reports/completion/rollup',
  requireCapability('report.read'),
  validate({ query: completionRollupQuery }),
  reportsController.getCompletionRollup,
);

router.get(
  '/reports/compliance',
  requireCapability('report.read'),
  validate({ query: complianceReportQuery }),
  reportsController.getComplianceReport,
);

router.get(
  '/reports/compliance/export',
  requireCapability('report.read'),
  exportLimiter,
  validate({ query: complianceReportQuery }),
  reportsController.exportComplianceReport,
);

router.get(
  '/reports/completion',
  requireCapability('report.read'),
  validate({ query: completionReportQuery }),
  reportsController.getCompletionReport,
);

router.get(
  '/reports/completion/export',
  requireCapability('report.read'),
  exportLimiter,
  validate({ query: completionReportQuery }),
  reportsController.exportCompletionReport,
);

// ── Mandatory assignments + due dates (Wave D4 v1) ───────
router
  .route('/assignments')
  .get(
    requireCapability('assignment.read'),
    validate({ query: listAssignmentsQuery }),
    assignmentController.listAssignments,
  )
  .post(
    requireCapability('assignment.manage'),
    validate({ body: createAssignmentBody }),
    assignmentController.createAssignment,
  );

router
  .route('/assignments/:id')
  .get(
    requireCapability('assignment.read'),
    validate({ params: idParam }),
    assignmentController.getAssignment,
  )
  .delete(
    requireCapability('assignment.manage'),
    validate({ params: idParam }),
    assignmentController.archiveAssignment,
  );

// ── Cohort feedback / surveys (Wave B — unblocks requiresFeedback) ────
router
  .route('/feedback')
  .get(
    requireCapability('feedback.read'),
    validate({ query: listFeedbackQuery }),
    feedbackController.listFeedback,
  )
  .post(
    requireCapability('feedback.submit'),
    validate({ body: submitFeedbackBody }),
    feedbackController.submitFeedback,
  );

// ── Sequenced learning paths (Wave C v1) ──────────────────
// Read is open to any authenticated learner (browse catalog + own progress);
// manage (create/edit/archive) is Admin-only via the capability map.
router
  .route('/paths')
  .get(
    requireCapability('path.read'),
    validate({ query: listPathsQuery }),
    pathController.listPaths,
  )
  .post(
    requireCapability('path.manage'),
    validate({ body: createPathBody }),
    pathController.createPath,
  );

// '/:id/progress' is registered before '/:id' so 'progress' is never read as an id.
router.get(
  '/paths/:id/progress',
  requireCapability('path.read'),
  validate({ params: idParam }),
  pathController.getPathProgress,
);

router
  .route('/paths/:id')
  .get(requireCapability('path.read'), validate({ params: idParam }), pathController.getPath)
  .put(requireCapability('path.manage'), validate({ params: idParam, body: updatePathBody }), pathController.updatePath)
  .delete(requireCapability('path.manage'), validate({ params: idParam }), pathController.archivePath);

module.exports = router;
