const router = require('express').Router();
const { getClasses, getClassById, createClass, updateClass, deleteClass } = require('../controllers/classController');
const { protect } = require('../middleware/auth');
const { roleGuard } = require('../middleware/roleGuard');
const { validate } = require('../middleware/validate');
const { idParam } = require('../schemas/common');
const { createClassBody, updateClassBody } = require('../schemas/class');

// Read: all authenticated users. Write: Admin only.
router.route('/')
  .get(protect, getClasses)
  .post(protect, roleGuard('Admin'), validate({ body: createClassBody }), createClass);

router.route('/:id')
  .get(protect, validate({ params: idParam }), getClassById)
  .put(protect, roleGuard('Admin'), validate({ params: idParam, body: updateClassBody }), updateClass)
  .delete(protect, roleGuard('Admin'), validate({ params: idParam }), deleteClass);

module.exports = router;
