const scheduleService = require('../../services/scheduleService');
const { parsePagination, paginatedResponse } = require('../../helpers/pagination');
const { handleError } = require('../../helpers/handleError');
const auditService = require('../../services/auditService');
const { invalidateAnalyticsCache } = require('../../middleware/analyticsCache');
const useCases = require('./use-cases');
const repository = require('./repository');

// ──────────────────────────────────────────────────────────
// Schedule Controller (Thin HTTP — delegates to scheduleService + use-cases)
// ──────────────────────────────────────────────────────────
// Phase 1 domain extraction: relocated from controllers/scheduleController.js
// (behavior-preserving — the `/api/schedules` URL is unchanged). Booking
// mutations stay in `services/scheduleService` (kept large by design,
// transaction-heavy); update/delete/setTrainers transaction logic lives in
// `./use-cases`. The previous adapter indirection (scheduleController →
// domains/schedule) is collapsed into this single controller.

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
    const cancelReason = req.body?.cancelReason || '';
    await scheduleService.cancelSlot(req.params.id, req.user, { cancelReason });

    auditService.record({
      req,
      action: 'cancelled',
      entity: 'Schedule',
      entityId: req.params.id,
      diff: {
        before: { status: 'scheduled' },
        after: { status: 'cancelled', cancelReason: cancelReason || null },
      },
      note: 'Cancelled by team leader (durable)',
    });

    invalidateAnalyticsCache();
    res.json({ success: true, message: 'Schedule cancelled' });
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
// Transaction logic (collision, weekly limit, attendance block, roster
// rebuild, calendar sync) lives in use-cases. The lightweight pre-snapshot
// is fetched here for the audit diff.
const updateSchedule = async (req, res) => {
  try {
    const existing = await repository.findScheduleByIdLean(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Schedule not found' });
    }

    const schedule = await useCases.updateSchedule(req.params.id, req.body);

    auditService.record({
      req,
      action: 'updated',
      entity: 'Schedule',
      entityId: req.params.id,
      diff: auditService.diff
        ? auditService.diff(existing, schedule.toObject())
        : { before: existing, after: schedule.toObject() },
    });

    // Calendar event update audit (if synced)
    if (schedule.googleEventId) {
      auditService.record({
        req,
        action: 'calendar-event-updated',
        entity: 'Schedule',
        entityId: schedule._id,
        note: `Google event ${schedule.googleEventId}`,
      });
    }

    invalidateAnalyticsCache();
    res.json({ success: true, data: schedule });
  } catch (error) {
    handleError(res, error);
  }
};

// ── Delete Schedule (admin) — durable cancel ────────────────────
// Wave E3 phase-04 slice A: "delete" flips the doc to status:'cancelled'
// (attendance preserved, room released); calendar cleanup lives in use-cases.
const deleteSchedule = async (req, res) => {
  try {
    const cancelReason = req.body?.cancelReason || '';
    const { schedule, calendarDeleted, googleEventId } =
      await useCases.deleteSchedule(req.params.id, {
        cancelledBy: req.user._id,
        cancelledByName: req.user.name || req.user.empCode || 'Admin',
        cancelReason,
      });

    // Calendar event deletion audit
    if (calendarDeleted && googleEventId) {
      auditService.record({
        req,
        action: 'calendar-event-deleted',
        entity: 'Schedule',
        entityId: schedule._id,
        note: `Google event ${googleEventId}`,
      });
    }

    auditService.record({
      req,
      action: 'cancelled',
      entity: 'Schedule',
      entityId: schedule._id,
      diff: {
        before: { status: 'scheduled' },
        after: { status: 'cancelled', cancelReason: cancelReason || null },
      },
      note: 'Cancelled by admin (durable — doc preserved)',
    });

    res.json({ success: true, message: 'Schedule cancelled' });
  } catch (error) {
    handleError(res, error);
  }
};

// ── Set Trainers (admin/coordinator) ───────────────────────────
// re-center Phase 3 (DELTA B): assign a session's internal trainers (UNION
// authz) and/or an external trainer (calendar + display only) in one mutation.
const setTrainers = async (req, res) => {
  try {
    const { before, after, schedule } = await useCases.setTrainers(req.params.id, req.body);
    auditService.record({
      req,
      action: 'updated',
      entity: 'Schedule',
      entityId: req.params.id,
      diff: auditService.diff(before, after),
      note: 'Trainers updated',
    });
    invalidateAnalyticsCache();
    res.json({ success: true, data: schedule });
  } catch (error) {
    handleError(res, error);
  }
};

const getAttendanceCalendar = async (req, res) => {
  try {
    const { from, to, mode } = req.query;
    const data = await scheduleService.getAttendanceCalendar({ from, to, mode }, req.user);
    res.json({ success: true, count: data.length, data });
  } catch (error) {
    handleError(res, error);
  }
};

module.exports = {
  getSchedules, getScheduleById, createSchedule, updateSchedule, deleteSchedule,
  bookTeamSlot, cancelSlot, getAvailability, getMyClassSchedules,
  getAttendanceCalendar, setTrainers,
};
