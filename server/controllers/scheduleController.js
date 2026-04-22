const scheduleService = require('../services/scheduleService');
const Schedule = require('../models/Schedule');
const { parsePagination, paginatedResponse } = require('../helpers/pagination');

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

/**
 * Map ServiceError → HTTP response.
 */
const handleError = (res, error) => {
  const status = error.statusCode || 500;
  res.status(status).json({ success: false, message: error.message });
};

// ── Leader Booking Flow ──────────────────────────────────

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
    const schedule = await Schedule.findByIdAndUpdate(req.params.id, req.body, {
      new: true, runValidators: true,
    });
    if (!schedule) return res.status(404).json({ success: false, message: 'Schedule not found' });
    res.json({ success: true, data: schedule });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
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

module.exports = {
  getSchedules, getScheduleById, createSchedule, updateSchedule, deleteSchedule,
  bookTeamSlot, cancelSlot, getAvailability, getMyClassSchedules,
};
