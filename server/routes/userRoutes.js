const router = require('express').Router();
const { getUsers, getUserById, createUser, updateUser, deleteUser } = require('../controllers/userController');
const { protect } = require('../middleware/auth');
const { roleGuard } = require('../middleware/roleGuard');

// All user CRUD is Admin-only
router.use(protect, roleGuard('Admin'));

router.route('/').get(getUsers).post(createUser);
router.route('/:id').get(getUserById).put(updateUser).delete(deleteUser);

module.exports = router;
