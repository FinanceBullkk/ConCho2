const mongoose = require('mongoose');
const scheduleService = require('../services/scheduleService');
const calendarService = require('../services/calendarService');
const Schedule = require('../models/Schedule');
const Attendance = require('../models/Attendance');
const { parsePagination, paginatedResponse } = require('../helpers/pagination');
const { handleError } = require('../helpers/handleError');
const auditService = require('../services/auditService');
const { invalidateAnalyticsCache } = require('../middleware/analyticsCache');
const scheduleDomain = require('../domains/schedule/controller');

// ──────────────────────────────────────────────────────────
// Schedule Controller (Thin — delegates to Service Layer)
// ──────────────────────────────────────────────────────────

const bookTeamSlot = async (req, res) => {
  try {
    const result = await scheduleService.bookSlot({
      teamId: req.body.teamId,
      startTime: req.body.startTime,
      endTime: req.body.endTime,
      requestUser: req.user,
    });

    auditService.record({
      req,
      action: 'created',
      entity: 'Schedule',
      entityId: result._id,
      diff: { after: { teamId: req.body.teamId, startTime: req.body.startTime, endTime: req.body.endTime, enrolledCount: result.enrolledUsers?.length || 0 } },
      note: 'Booked by team leader',
    });

    invalidateAnalyticsCache();
    res.status(201).json({
      success: true,
      message: `Booked successfully! ${result.enrolledUsers?.length || 0} members enrolled.`,
      data: result,
    });
  } catch (error) {
    handleError(res, error);
  }
};

const cancelSlot = async (req, res) => {
  try {
    await scheduleService.cancelSlot(req.params.id, req.user);

    auditService.record({
      req,
      action: 'cancelled',
      entity: 'Schedule',
      entityId: req.params.id,
      note: 'Cancelled by team leader',
    });

    invalidateAnalyticsCache();
    res.json({ success: true, message: 'Schedule cancelled and removed' });
  } catch (error) {
    handleError(res, error);
  }
};

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

    // SCOPE FIX (BUG #2 — IDOR): The route only gates with `protect`, so
    // any authenticated user could list every schedule org-wide, including
    // other teams' enrolledUsers (empCode/name/department) and Meet links.
    // Participants are now restricted to schedules they are enrolled in.
    const filters = { ...req.query };
    if (req.user.role === 'Participant') {
      filters.enrolledUser = req.user._id;
    }

    const { schedules, total } = await scheduleService.listSchedules(filters, pagination);
    res.json(paginatedResponse({ data: schedules, total, page: pagination.page, limit: pagination.limit }));
  } catch (error) {
    handleError(res, error);
  }
};

const getScheduleById = async (req, res) => {
  try {
    const schedule = await scheduleService.getById(req.params.id);
    if (!schedule) {
      return res.status(404).json({ success: false, message: 'Schedule not found' });
    }

    // SCOPE FIX (BUG #2 — IDOR): Participants may only fetch schedules
    // they are enrolled in. Admin / Teacher unrestricted.
    if (req.user.role === 'Participant') {
      const userIdStr = req.user._id.toString();
      const enrolled = (schedule.enrolledUsers || []).some(
        (u) => (u?._id ? u._id.toString() : u.toString()) === userIdStr,
      );
      if (!enrolled) {
        return res.status(403).json({ success: false, message: 'Not authorized to view this schedule' });
      }
    }

    res.json({ success: true, data: schedule });
  } catch (error) {
    handleError(res, error);
  }
};

const getMyClassSchedules = async (req, res) => {
  try {
    const { schedules, team, leader } = await scheduleService.getMyClassSchedules(req.user._id);
    res.json({ success: true, count: schedules.length, data: schedules, team, leader });
  } catch (error) {
    handleError(res, error);
  }
};

const createSchedule = async (req, res) => {
  try {
    const schedule = await scheduleService.adminCreate(req.body);

    auditService.record({
      req,
      action: 'created',
      entity: 'Schedule',
      entityId: schedule._id,
      diff: { after: { classId: schedule.classId, bookedTeamId: schedule.bookedTeamId, startTime: schedule.startTime, endTime: schedule.endTime } },
      note: 'Created by admin',
    });

    invalidateAnalyticsCache();
    res.status(201).json({ success: true, data: schedule });
  } catch (error) {
    handleError(res, error);
  }
};

// ── Update Schedule (admin) ─────────────────────────────────────
// Delegates to domains/schedule — transaction logic extracted to use-cases.
const updateSchedule = async (req, res) => {
  // Fetch snapshot before update for audit diff (lightweight)
  const existing = await Schedule.findById(req.params.id).lean();
  if (!existing) {
    return res.status(404).json({ success: false, message: 'Schedule not found' });
  }

  // Delegate to domain controller (handles transaction, validation, calendar sync)
  req._preSnapshot = existing; // pass snapshot for audit
  return scheduleDomain.updateSchedule(req, res);
};

// ── Delete Schedule (admin) ─────────────────────────────────────
// Delegates to domains/schedule — transaction logic extracted to use-cases.
const deleteSchedule = async (req, res) => {
  return scheduleDomain.deleteSchedule(req, res);
};

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
  bookTeamSlot, cancelSlot, getAvailability, getMyClassSchedules,
  getAttendanceCalendar,
};
