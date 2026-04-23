const router = require('express').Router();
const { 
  bulkMarkAttendance, getAttendanceBySchedule, getAttendanceByUser,
  getAnalyticsByEmployee, getAnalyticsByTeam, getAnalyticsByClass, getMyStats
} = require('../controllers/attendanceController');
const { protect } = require('../middleware/auth');
const { roleGuard } = require('../middleware/roleGuard');
const { cacheMiddleware } = require('../middleware/analyticsCache');
const { attendanceLimiter } = require('../middleware/rateLimiters');

// Analytics endpoints — cached for 30 min, invalidated on new attendance writes
router.get('/analytics/by-employee', protect, cacheMiddleware('analytics:by-employee'), getAnalyticsByEmployee);
router.get('/analytics/by-team',     protect, cacheMiddleware('analytics:by-team'),     getAnalyticsByTeam);
router.get('/analytics/by-class',    protect, cacheMiddleware('analytics:by-class'),    getAnalyticsByClass);

// Participant personal stats
router.get('/my-stats', protect, getMyStats);

// Bulk mark: Teacher or Admin (rate limited + invalidates analytics cache)
router.post('/:scheduleId', protect, roleGuard('Admin', 'Teacher'), attendanceLimiter, bulkMarkAttendance);

// Query by schedule: Teacher or Admin
router.get('/schedule/:scheduleId', protect, roleGuard('Admin', 'Teacher'), getAttendanceBySchedule);

// Query by user: Participants restricted to own records, Admin/Teacher can view anyone
router.get('/user/:userId', protect, (req, res, next) => {
  if (req.user.role === 'Participant' && req.params.userId !== req.user._id.toString()) {
    return res.status(403).json({
      success: false,
      message: 'You can only view your own attendance records',
    });
  }
  next();
}, getAttendanceByUser);

module.exports = router;
