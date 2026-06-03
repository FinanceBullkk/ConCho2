const router = require('express').Router();
const { protect } = require('../../middleware/auth');
const { requireCapability } = require('../../middleware/requireCapability');
const { validate } = require('../../middleware/validate');
const { idParam } = require('../../schemas/common');
const controller = require('./controller');
const {
  createAssessmentBody,
  updateAssessmentBody,
  listAssessmentsQuery,
  submitAttemptBody,
  listAttemptsQuery,
} = require('./schemas');

router.use(protect);

// ── Assessments ───────────────────────────────────────────
router
  .route('/assessments')
  .get(
    requireCapability('assessment.read'),
    validate({ query: listAssessmentsQuery }),
    controller.listAssessments,
  )
  .post(
    requireCapability('assessment.manage'),
    validate({ body: createAssessmentBody }),
    controller.createAssessment,
  );

router
  .route('/assessments/:id')
  .get(
    requireCapability('assessment.read'),
    validate({ params: idParam }),
    controller.getAssessment,
  )
  .put(
    requireCapability('assessment.manage'),
    validate({ params: idParam, body: updateAssessmentBody }),
    controller.updateAssessment,
  )
  .delete(
    requireCapability('assessment.manage'),
    validate({ params: idParam }),
    controller.archiveAssessment,
  );

// ── Attempts ──────────────────────────────────────────────
router.post(
  '/assessments/:id/attempts',
  requireCapability('assessment.attempt'),
  validate({ params: idParam, body: submitAttemptBody }),
  controller.submitAttempt,
);

router.get(
  '/attempts',
  requireCapability('assessment.read'),
  validate({ query: listAttemptsQuery }),
  controller.listAttempts,
);

module.exports = router;
