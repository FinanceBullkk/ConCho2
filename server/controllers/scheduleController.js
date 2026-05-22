const mongoose = require('mongoose');
const scheduleService = require('../services/scheduleService');
const calendarService = require('../services/calendarService');
const Schedule = require('../models/Schedule');
const Attendance = require('../models/Attendance');
const { parsePagination, paginatedResponse } = require('../helpers/pagination');
const { handleError } = require('../helpers/handleError');
const auditService = require('../services/auditService');
const { invalidateAnalyticsCache } = require('../middleware/analyticsCache');

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

const updateSchedule = async (req, res) => {
  try {
    const existing = await Schedule.findById(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: 'Schedule not found' });

    // ── TRANSACTION: Collision check + Update (SYNC-04) ────
    // Wrapping checks + update in a transaction eliminates the
    // TOCTOU window that could allow double-booking.
    const session = await mongoose.startSession();
    let schedule;
    try {
      await session.withTransaction(async () => {
        if (req.body.startTime || req.body.endTime) {
          const start = new Date(req.body.startTime || existing.startTime);
          const end = new Date(req.body.endTime || existing.endTime);

          if (end <= start) {
            throw Object.assign(new Error('endTime must be after startTime'), { statusCode: 400 });
          }

          // ── Collision check (scoped to same class) ──────────
          const classId = req.body.classId || existing.classId;
          const collision = await Schedule.findOne({
            _id: { $ne: existing._id },
            classId,
            startTime: { $lt: end },
            endTime: { $gt: start },
          }).session(session);
          if (collision) {
            throw Object.assign(
              new Error('Cannot move schedule - time slot overlaps with an existing schedule'),
              { statusCode: 409 }
            );
          }

          // ── Weekly limit check (max 2 sessions/team/week) ──
          if (req.body.startTime) {
            const teamId = req.body.bookedTeamId || existing.bookedTeamId;
            const d = new Date(start);
            const dayOfWeek = d.getUTCDay();
            const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
            const weekStart = new Date(Date.UTC(
              d.getUTCFullYear(), d.getUTCMonth(),
              d.getUTCDate() + diffToMonday, 0, 0, 0, 0
            ));
            const weekEnd = new Date(Date.UTC(
              weekStart.getUTCFullYear(), weekStart.getUTCMonth(),
              weekStart.getUTCDate() + 6, 23, 59, 59, 999
            ));

            const weeklyCount = await Schedule.countDocuments({
              _id: { $ne: existing._id },
              bookedTeamId: teamId,
              startTime: { $gte: weekStart, $lte: weekEnd },
            }).session(session);

            if (weeklyCount >= 2) {
              throw Object.assign(
                new Error('Cannot move schedule — target week already has 2 sessions for this team (limit: 2/week)'),
                { statusCode: 400 }
              );
            }
          }
        }

        // ── Also check weekly limit when changing bookedTeamId ──
        if (req.body.bookedTeamId && req.body.bookedTeamId !== existing.bookedTeamId?.toString()) {
          const start = new Date(req.body.startTime || existing.startTime);
          const d = new Date(start);
          const dayOfWeek = d.getUTCDay();
          const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
          const weekStart = new Date(Date.UTC(
            d.getUTCFullYear(), d.getUTCMonth(),
            d.getUTCDate() + diffToMonday, 0, 0, 0, 0
          ));
          const weekEnd = new Date(Date.UTC(
            weekStart.getUTCFullYear(), weekStart.getUTCMonth(),
            weekStart.getUTCDate() + 6, 23, 59, 59, 999
          ));

          const weeklyCount = await Schedule.countDocuments({
            _id: { $ne: existing._id },
            bookedTeamId: req.body.bookedTeamId,
            startTime: { $gte: weekStart, $lte: weekEnd },
          }).session(session);

          if (weeklyCount >= 2) {
            throw Object.assign(
              new Error('Cannot reassign schedule — target team already has 2 sessions this week (limit: 2/week)'),
              { statusCode: 400 }
            );
          }
        }

        // BUG #10 fix: previously passed raw req.body to findByIdAndUpdate,
        // relying entirely on validate middleware stripping unknown keys.
        // Defense in depth — explicitly whitelist the fields admins may
        // change. Server-managed fields (enrolledUsers, googleEventId,
        // meetLink, remindersSentAt, syncStatus) MUST NEVER be writable
        // through this endpoint.
        const ALLOWED = ['classId', 'bookedTeamId', 'startTime', 'endTime', 'roomLink', 'capacity'];
        const updateData = {};
        for (const k of ALLOWED) {
          if (req.body[k] !== undefined) updateData[k] = req.body[k];
        }

        schedule = await Schedule.findByIdAndUpdate(req.params.id, updateData, {
          new: true, runValidators: true, session,
        });
        if (!schedule) {
          throw Object.assign(new Error('Schedule not found'), { statusCode: 404 });
        }
      });
    } finally {
      session.endSession();
    }

    auditService.record({
      req,
      action: 'updated',
      entity: 'Schedule',
      entityId: req.params.id,
      diff: auditService.diff(existing.toObject(), schedule.toObject()),
    });

    // Sync the change to Google Calendar so attendees are notified of
    // the new time. Fail-soft.
    if (schedule.googleEventId && calendarService.isConfigured()) {
      try {
        const populated = await Schedule.findById(schedule._id)
          .populate('classId', 'classCode courseName')
          .populate('bookedTeamId', 'name')
          .populate('enrolledUsers', 'empCode name email')
          .lean();
        await calendarService.updateEventForSchedule({
          schedule: populated,
          classDoc: populated.classId,
          team: populated.bookedTeamId,
          attendees: populated.enrolledUsers,
        });
        auditService.record({
          req,
          action: 'calendar-event-updated',
          entity: 'Schedule',
          entityId: schedule._id,
          note: `Google event ${schedule.googleEventId}`,
        });
      } catch (e) {
        // Already logged inside calendarService — no-op here.
      }
    }

    // BUG #18 fix: when startTime changes the in-memory session-order cache
    // (used by attachSessionNumbers to label "Session N / M") becomes stale.
    // Invalidate for BOTH the old and new classId in case the update also
    // moved the schedule to a different class. createSchedule/deleteSchedule
    // already do this — updateSchedule was missing it.
    const oldClassId = existing.classId?.toString();
    const newClassId = schedule.classId?.toString();
    if (oldClassId) scheduleService.invalidateSessionOrderCache(existing.classId);
    if (newClassId && newClassId !== oldClassId) {
      scheduleService.invalidateSessionOrderCache(schedule.classId);
    }

    invalidateAnalyticsCache();
    res.json({ success: true, data: schedule });
  } catch (error) {
    handleError(res, error);
  }
};

const deleteSchedule = async (req, res) => {
  try {
    const schedule = await Schedule.findById(req.params.id);
    if (!schedule) return res.status(404).json({ success: false, message: 'Schedule not found' });

    // ── TRANSACTION: Cascade delete Attendance → Schedule (DI-01) ──
    const googleEventId = schedule.googleEventId; // capture before delete
    const session = await mongoose.startSession();
    let deletedAttendance = 0;
    try {
      await session.withTransaction(async () => {
        const attResult = await Attendance.deleteMany({ scheduleId: schedule._id }, { session });
        deletedAttendance = attResult.deletedCount;
        await Schedule.findByIdAndDelete(schedule._id, { session });
      });
    } finally {
      session.endSession();
    }

    scheduleService.invalidateSessionOrderCache(schedule.classId);

    // Best-effort calendar cleanup so attendees are notified.
    if (googleEventId) {
      const ok = await calendarService.deleteEventForSchedule(googleEventId);
      if (ok) {
        auditService.record({
          req,
          action: 'calendar-event-deleted',
          entity: 'Schedule',
          entityId: schedule._id,
          note: `Google event ${googleEventId}`,
        });
      }
    }

    auditService.record({
      req,
      action: 'deleted',
      entity: 'Schedule',
      entityId: schedule._id,
      note: `Cascade: ${deletedAttendance} attendance records`,
    });

    res.json({
      success: true,
      message: 'Schedule deleted',
      cascade: { deletedAttendance },
    });
  } catch (error) {
    handleError(res, error);
  }
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
