const router = require('express').Router();
const { bulkMarkAttendance, getAttendanceBySchedule, getAttendanceByUser } = require('../controllers/attendanceController');
const { protect } = require('../middleware/auth');
const { roleGuard } = require('../middleware/roleGuard');

// Bulk mark: Teacher or Admin
router.post('/:scheduleId', protect, roleGuard('Admin', 'Teacher'), bulkMarkAttendance);

// Query by schedule: Teacher or Admin
router.get('/schedule/:scheduleId', protect, roleGuard('Admin', 'Teacher'), getAttendanceBySchedule);

// Query by user: any authenticated user (participants can view their own)
router.get('/user/:userId', protect, getAttendanceByUser);

module.exports = router;
