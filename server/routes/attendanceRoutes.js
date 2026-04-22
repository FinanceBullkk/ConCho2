const router = require('express').Router();
const { 
  bulkMarkAttendance, getAttendanceBySchedule, getAttendanceByUser,
  getAnalyticsByEmployee, getAnalyticsByTeam, getAnalyticsByClass, getMyStats
} = require('../controllers/attendanceController');
const { protect } = require('../middleware/auth');
const { roleGuard } = require('../middleware/roleGuard');
const { cacheMiddleware } = require('../middleware/analyticsCache');

// Analytics endpoints — cached for 30 min, invalidated on new attendance writes
router.get('/analytics/by-employee', protect, cacheMiddleware('analytics:by-employee'), getAnalyticsByEmployee);
router.get('/analytics/by-team',     protect, cacheMiddleware('analytics:by-team'),     getAnalyticsByTeam);
router.get('/analytics/by-class',    protect, cacheMiddleware('analytics:by-class'),    getAnalyticsByClass);

// Participant personal stats
router.get('/my-stats', protect, getMyStats);

// Bulk mark: Teacher or Admin (invalidates analytics cache — see controller)
router.post('/:scheduleId', protect, roleGuard('Admin', 'Teacher'), bulkMarkAttendance);

// Query by schedule: Teacher or Admin
router.get('/schedule/:scheduleId', protect, roleGuard('Admin', 'Teacher'), getAttendanceBySchedule);

// Query by user: any authenticated user
router.get('/user/:userId', protect, getAttendanceByUser);

module.exports = router;
