const router = require('express').Router();
const { upsertEvaluation, getEvaluations, getEvaluationById, deleteEvaluation } = require('../controllers/evaluationController');
const { protect } = require('../middleware/auth');
const { roleGuard } = require('../middleware/roleGuard');

// Create/update: Teacher or Admin
router.post('/', protect, roleGuard('Admin', 'Teacher'), upsertEvaluation);

// Read: any authenticated user
router.get('/', protect, getEvaluations);
router.get('/:id', protect, getEvaluationById);

// Delete: Admin only
router.delete('/:id', protect, roleGuard('Admin'), deleteEvaluation);

module.exports = router;
