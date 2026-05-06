const router = require('express').Router();
const { z } = require('zod');
const { login, logout, getMe, changePassword } = require('../controllers/authController');
const { protect } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { loginLimiter } = require('../middleware/rateLimiters');
const { loginBody } = require('../schemas/auth');

const changePasswordBody = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(10, 'New password must be at least 10 characters'),
});

router.post('/login', loginLimiter, validate({ body: loginBody }), login);
router.post('/logout', protect, logout);
router.get('/me', protect, getMe);
router.put('/change-password', protect, validate({ body: changePasswordBody }), changePassword);

module.exports = router;

