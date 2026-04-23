const scheduleService = require('../services/scheduleService');
const Schedule = require('../models/Schedule');
const { parsePagination, paginatedResponse } = require('../helpers/pagination');
const { handleError } = require('../helpers/handleError');
const User = require('../models/User');

// ──────────────────────────────────────────────────────────
// Schedule Controller (Thin — delegates to Service Layer)
// ──────────────────────────────────────────────────────────
// Controllers are responsible ONLY for:
//   1. Parsing request data (req.body, req.params, req.query)
//   2. Calling the appropriate service method
//   3. Formatting the HTTP response (status code, JSON shape)
//
// All business logic (validation, transactions, authorization)
// lives in services/scheduleService.js.
// ──────────────────────────────────────────────────────────

const bookTeamSlot = async (req, res) => {
  try {
    const result = await scheduleService.bookSlot({
      teamId: req.body.teamId,
      startTime: req.body.startTime,
      endTime: req.body.endTime,
      requestUser: req.user,
    });
    res.status(201).json({
      success: true,
      message: `Đặt lịch thành công! ${result.enrolledUsers?.length || 0} thành viên đã được ghi danh.`,
      data: result,
    });
  } catch (error) {
    handleError(res, error);
  }
};

const cancelSlot = async (req, res) => {
  try {
    await scheduleService.cancelSlot(req.params.id, req.user);
    res.json({ success: true, message: 'Đã hủy lịch — Schedule cancelled and removed' });
  } catch (error) {
    handleError(res, error);
  }
};

// ── Query Endpoints ──────────────────────────────────────

const getAvailability = async (req, res) => {
  try {
    const schedules = await scheduleService.getAvailability({ classId: req.query.classId });
    res.json({ success: true, count: schedules.length, data: schedules });
  } catch (error) {
    handleError(res, error);
  }
};

const getSchedules = async (req, res) => {
  try {
    const pagination = parsePagination(req);
    const { schedules, total } = await scheduleService.listSchedules(req.query, pagination);
    res.json(paginatedResponse({ data: schedules, total, page: pagination.page, limit: pagination.limit }));
  } catch (error) {
    handleError(res, error);
  }
};

const getScheduleById = async (req, res) => {
  try {
    const schedule = await scheduleService.getById(req.params.id);
    res.json({ success: true, data: schedule });
  } catch (error) {
    handleError(res, error);
  }
};

const getMyClassSchedules = async (req, res) => {
  try {
    const { schedules, team } = await scheduleService.getMyClassSchedules(req.user._id);
    res.json({ success: true, count: schedules.length, data: schedules, team });
  } catch (error) {
    handleError(res, error);
  }
};

// ── Admin CRUD (simple passthrough) ──────────────────────

const createSchedule = async (req, res) => {
  try {
    const schedule = await scheduleService.adminCreate(req.body);
    res.status(201).json({ success: true, data: schedule });
  } catch (error) {
    handleError(res, error);
  }
};

const updateSchedule = async (req, res) => {
  try {
    // ── Collision check if time is being changed ──────────
    if (req.body.startTime || req.body.endTime) {
      const existing = await Schedule.findById(req.params.id);
      if (!existing) return res.status(404).json({ success: false, message: 'Schedule not found' });

      const start = new Date(req.body.startTime || existing.startTime);
      const end = new Date(req.body.endTime || existing.endTime);

      if (end <= start) {
        return res.status(400).json({ success: false, message: 'endTime must be after startTime' });
      }

      const collision = await Schedule.findOne({
        _id: { $ne: existing._id },  // Exclude self
        startTime: { $lt: end },
        endTime: { $gt: start },
      });
      if (collision) {
        return res.status(409).json({
          success: false,
          message: 'Cannot move schedule — time slot overlaps with an existing schedule',
        });
      }
    }

    const schedule = await Schedule.findByIdAndUpdate(req.params.id, req.body, {
      new: true, runValidators: true,
    });
    if (!schedule) return res.status(404).json({ success: false, message: 'Schedule not found' });
    res.json({ success: true, data: schedule });
  } catch (error) {
    handleError(res, error);
  }
};

const deleteSchedule = async (req, res) => {
  try {
    const schedule = await Schedule.findByIdAndDelete(req.params.id);
    if (!schedule) return res.status(404).json({ success: false, message: 'Schedule not found' });
    res.json({ success: true, message: 'Schedule deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── Teacher Assignment ───────────────────────────────────
// PATCH /schedules/:id/assign-teacher
// Admin: can assign any teacher (body.teacherId)
// Teacher: can self-assign to unassigned schedules (no body needed)

const assignTeacher = async (req, res) => {
  try {
    const schedule = await Schedule.findById(req.params.id);
    if (!schedule) return res.status(404).json({ success: false, message: 'Schedule not found' });

    const isAdmin = req.user.role === 'Admin';
    const isTeacher = req.user.role === 'Teacher';

    let teacherId;

    if (isAdmin) {
      // Admin can assign or reassign any teacher
      teacherId = req.body.teacherId || null;
      if (teacherId) {
        const teacher = await User.findById(teacherId);
        if (!teacher || teacher.role !== 'Teacher') {
          return res.status(400).json({ success: false, message: 'Invalid teacher ID — user is not a Teacher' });
        }
      }
    } else if (isTeacher) {
      // Teacher can only self-assign to unassigned schedules
      if (schedule.teacherId && schedule.teacherId.toString() !== req.user._id.toString()) {
        return res.status(403).json({ success: false, message: 'This schedule is already assigned to another teacher' });
      }
      teacherId = req.user._id;
    } else {
      return res.status(403).json({ success: false, message: 'Only Admin or Teacher can assign teachers' });
    }

    schedule.teacherId = teacherId;
    await schedule.save();

    // Re-populate for response
    await schedule.populate('teacherId', 'name empCode');
    await schedule.populate('classId', 'classCode courseName');

    res.json({
      success: true,
      message: teacherId ? `Teacher ${schedule.teacherId?.name || ''} assigned successfully` : 'Teacher unassigned',
      data: schedule,
    });
  } catch (error) {
    handleError(res, error);
  }
};

// ── Attendance Calendar ──────────────────────────────────
// GET /schedules/attendance-calendar?from=&to=
// Returns schedules with pre-computed attendance status
// Optional date range filtering for performance

const getAttendanceCalendar = async (req, res) => {
  try {
    const { from, to } = req.query;
    const data = await scheduleService.getAttendanceCalendar({ from, to });
    res.json({ success: true, count: data.length, data });
  } catch (error) {
    handleError(res, error);
  }
};

module.exports = {
  getSchedules, getScheduleById, createSchedule, updateSchedule, deleteSchedule,
  bookTeamSlot, cancelSlot, getAvailability, getMyClassSchedules, assignTeacher,
  getAttendanceCalendar,
};
