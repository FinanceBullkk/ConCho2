const router = require('express').Router();
const { z } = require('zod');
const {
  bulkMarkAttendance, getAttendanceBySchedule, getAttendanceByUser,
  getAnalyticsByEmployee, getAnalyticsByTeam, getAnalyticsByClass, getMyStats
} = require('./controller');
const { protect } = require('../../middleware/auth');
const { roleGuard } = require('../../middleware/roleGuard');
const { cacheMiddleware } = require('../../middleware/analyticsCache');
const { attendanceLimiter } = require('../../middleware/rateLimiters');
const { validate } = require('../../middleware/validate');
const { bulkMarkBody } = require('./schemas');
const { idParam } = require('../../schemas/common');

// ──────────────────────────────────────────────────────────
// Attendance routes — mounted at /api/attendance (Phase 1 domain extraction;
// relocated from routes/attendanceRoutes.js, behavior-preserving).
// ──────────────────────────────────────────────────────────

// Analytics endpoints — cached for 30 min, invalidated on new attendance writes
// SEC-IDOR-02 / QB-007: Admin sees org-wide analytics; Teacher reads are scoped
// by Class.teacherIds in the controller/service layer.
router.get('/analytics/by-employee', protect, roleGuard('Admin', 'Teacher'), cacheMiddleware('analytics:by-employee'), getAnalyticsByEmployee);
router.get('/analytics/by-team',     protect, roleGuard('Admin', 'Teacher'), cacheMiddleware('analytics:by-team'),     getAnalyticsByTeam);
router.get('/analytics/by-class',    protect, roleGuard('Admin', 'Teacher'), cacheMiddleware('analytics:by-class'),    getAnalyticsByClass);

// Participant personal stats
router.get('/my-stats', protect, getMyStats);

// Bulk mark: Teacher or Admin (rate limited + validated + invalidates analytics cache)
router.post('/:scheduleId', protect, roleGuard('Admin', 'Teacher'), attendanceLimiter,
  validate({ params: z.object({ scheduleId: idParam.shape.id }), body: bulkMarkBody }), bulkMarkAttendance);

// Query by schedule: Teacher or Admin.
// SEC-014: params validated so a malformed ObjectId is a 400, never a 500.
router.get('/schedule/:scheduleId', protect, roleGuard('Admin', 'Teacher'),
  validate({ params: z.object({ scheduleId: idParam.shape.id }) }), getAttendanceBySchedule);

// Query by user: Participants restricted to own records; Teachers only receive
// records from classes visible through Class.teacherIds.
router.get('/user/:userId', protect,
  validate({ params: z.object({ userId: idParam.shape.id }) }), (req, res, next) => {
  if (req.user.role === 'Participant' && req.params.userId !== req.user._id.toString()) {
    return res.status(403).json({
      success: false,
      message: 'You can only view your own attendance records',
    });
  }
  next();
}, getAttendanceByUser);

module.exports = router;
