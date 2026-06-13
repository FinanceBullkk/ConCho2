const router = require('express').Router();
const { protect } = require('../../middleware/auth');
const { requireCapability } = require('../../middleware/requireCapability');
const { validate } = require('../../middleware/validate');
const { idParam } = require('../../schemas/common');
const controller = require('./controller');
const questionBankController = require('./question-bank-controller');
const {
  createAssessmentBody,
  updateAssessmentBody,
  listAssessmentsQuery,
  submitAttemptBody,
  listAttemptsQuery,
  manualGradeAttemptBody,
} = require('./schemas');
const {
  questionBankBody,
  questionBankQuery,
} = require('./question-bank-schemas');

router.use(protect);

// ── Question bank ────────────────────────────────────────
router
  .route('/question-bank')
  .get(
    requireCapability('assessment.manage'),
    validate({ query: questionBankQuery }),
    questionBankController.listQuestions,
  )
  .post(
    requireCapability('assessment.manage'),
    validate({ body: questionBankBody }),
    questionBankController.createQuestion,
  );

router
  .route('/question-bank/:id')
  .put(
    requireCapability('assessment.manage'),
    validate({ params: idParam, body: questionBankBody }),
    questionBankController.updateQuestion,
  )
  .delete(
    requireCapability('assessment.manage'),
    validate({ params: idParam }),
    questionBankController.archiveQuestion,
  );

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

router.put(
  '/attempts/:id/manual-grade',
  requireCapability('assessment.manage'),
  validate({ params: idParam, body: manualGradeAttemptBody }),
  controller.manualGradeAttempt,
);

// ── Unified results (rearchitecture Phase 1 convergence) ──
// The caller's own assessment results across BOTH modes (quiz attempts +
// instructor-scored English evaluations), one shape. Self-scoped read.
router.get(
  '/results/mine',
  requireCapability('assessment.read'),
  controller.getMyResults,
);

module.exports = router;
