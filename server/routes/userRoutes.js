const router = require('express').Router();
const {
  getUsers, getUserById, createUser, updateUser, deleteUser,
  restoreUser, getDeletedUsers, getUserProgress,
} = require('../controllers/userController');
const { protect } = require('../middleware/auth');
const { roleGuard } = require('../middleware/roleGuard');
const { validate } = require('../middleware/validate');
const { idParam } = require('../schemas/common');
const { createUserBody, updateUserBody, listUsersQuery } = require('../schemas/user');

// All user CRUD is Admin-only
router.use(protect, roleGuard('Admin'));

// ── Soft-delete admin routes (UX-03) — must be BEFORE /:id ──
router.get('/deleted', getDeletedUsers);

router
  .route('/')
  .get(validate({ query: listUsersQuery }), getUsers)
  .post(validate({ body: createUserBody }), createUser);

router
  .route('/:id')
  .get(validate({ params: idParam }), getUserById)
  .put(validate({ params: idParam, body: updateUserBody }), updateUser)
  .delete(validate({ params: idParam }), deleteUser);

router.post('/:id/restore', validate({ params: idParam }), restoreUser);

router
  .route('/:id/progress')
  .get(validate({ params: idParam }), getUserProgress);

module.exports = router;
