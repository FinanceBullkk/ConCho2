const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const { login, getMe } = require('../controllers/authController');
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

router.post('/login', loginLimiter, validate({ body: loginBody }), login);
router.get('/me', protect, getMe);

module.exports = router;
