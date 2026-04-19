const router = require('express').Router();
const { getClasses, getClassById, createClass, updateClass, deleteClass } = require('../controllers/classController');
const { protect } = require('../middleware/auth');
const { roleGuard } = require('../middleware/roleGuard');

// Read: all authenticated users. Write: Admin only.
router.route('/')
  .get(protect, getClasses)
  .post(protect, roleGuard('Admin'), createClass);

router.route('/:id')
  .get(protect, getClassById)
  .put(protect, roleGuard('Admin'), updateClass)
  .delete(protect, roleGuard('Admin'), deleteClass);

module.exports = router;
