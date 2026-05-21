const router = require('express').Router();
const { upsertEvaluation, getEvaluations, getEvaluationById, deleteEvaluation } = require('../controllers/evaluationController');
const { protect } = require('../middleware/auth');
const { roleGuard } = require('../middleware/roleGuard');
const { validate } = require('../middleware/validate');
const { upsertEvaluationBody } = require('../schemas/evaluation');
const { idParam } = require('../schemas/common');

// Create/update: Teacher or Admin (validated)
router.post('/', protect, roleGuard('Admin', 'Teacher'), validate({ body: upsertEvaluationBody }), upsertEvaluation);

// Read: Admin/Teacher see all, Participants restricted to own records (SEC-IDOR-01)
router.get('/', protect, (req, _res, next) => {
  if (req.user.role === 'Participant') {
    req.query.userId = req.user._id.toString();
  }
  next();
}, getEvaluations);
router.get('/:id', protect, roleGuard('Admin', 'Teacher'), validate({ params: idParam }), getEvaluationById);

// Delete: Admin only
router.delete('/:id', protect, roleGuard('Admin'), validate({ params: idParam }), deleteEvaluation);

module.exports = router;
