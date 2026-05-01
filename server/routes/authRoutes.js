const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const { login, logout, getMe, changePassword } = require('../controllers/authController');
const { protect } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { loginBody } = require('../schemas/auth');

// Throttle login attempts: 5 per 15 minutes per IP.
// Successful logins are not counted so a legit user isn't locked out.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many login attempts. Please try again in 15 minutes.',
  },
});

const changePasswordBody = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(10, 'New password must be at least 10 characters'),
});

router.post('/login', loginLimiter, validate({ body: loginBody }), login);
router.post('/logout', protect, logout);
router.get('/me', protect, getMe);
router.put('/change-password', protect, validate({ body: changePasswordBody }), changePassword);

module.exports = router;

