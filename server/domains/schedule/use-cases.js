const mongoose = require('mongoose');
const calendarService = require('../../services/calendarService');
const { ServiceError } = require('../../helpers/ServiceError');
const Schedule = require('../../models/Schedule');
const { invalidateSessionOrderCache } = require('../../services/scheduleService');
const schedulingWindowPolicy = require('./scheduling-window-policy');
const repository = require('./repository');
const bookingPolicy = require('./session-booking-policy');

// ── Shared helpers ────────────────────────────────────────

const ALLOWED_UPDATE_FIELDS = [
  'classId', 'bookedTeamId', 'startTime', 'endTime', 'roomLink', 'capacity',
];

const filterAllowedFields = (body) => {
  const out = {};
  for (const k of ALLOWED_UPDATE_FIELDS) {
    if (body[k] !== undefined) out[k] = body[k];
  }
  return out;
};

// ── Update Schedule (admin) ───────────────────────────────
// Extracted from scheduleController.updateSchedule — the largest
// function in the controller (100+ lines of transaction logic).

const updateSchedule = async (id, body) => {
  const existing = await repository.findScheduleByIdRaw(id);
  if (!existing) throw new ServiceError('Schedule not found', 404);

  const session = await mongoose.startSession();
  let schedule;

  try {
    await session.withTransaction(async () => {
      // ── Time validation ────────────────────────────────
      if (body.startTime || body.endTime) {
        const start = new Date(body.startTime || existing.startTime);
        const end = new Date(body.endTime || existing.endTime);

        if (end <= start) {
          throw new ServiceError('endTime must be after startTime', 400);
        }

        // Wave E1: Admin moves must land on a configured slot too. Previously
        // this path only checked end > start, letting Admins move sessions to
        // arbitrary off-policy times. The shared policy now enforces the same
        // ALLOWED_TIME_SLOTS windows as the create/booking paths.
        await schedulingWindowPolicy.assertValidBookingWindow(start, end);

        // Collision check (scoped to same class)
        const classId = body.classId || existing.classId;
        const collision = await repository.findScheduleForCollision(
          classId, start, end, existing._id, session,
        );
        if (collision) {
          throw new ServiceError(
            'Cannot move schedule — time slot overlaps with an existing schedule', 409,
          );
        }

        // Weekly limit check when startTime changes
        if (body.startTime) {
          const teamId = body.bookedTeamId || existing.bookedTeamId;
          const { weekStart, weekEnd } = bookingPolicy.getWeekBounds(start);
          const weeklyCount = await repository.countSchedulesForTeamInWeek(
            teamId, weekStart, weekEnd, existing._id, session,
          );
          if (weeklyCount >= bookingPolicy.WEEKLY_TEAM_LIMIT) {
            throw new ServiceError(
              'Cannot move schedule — target week already has 2 sessions for this team (limit: 2/week)', 400,
            );
          }
        }
      }

      // ── Attendance block ───────────────────────────────
      if (body.bookedTeamId && body.bookedTeamId !== existing.bookedTeamId?.toString()) {
        const hasAttendance = await repository.attendanceExistsForSchedule(existing._id, session);
        if (hasAttendance) {
          throw new ServiceError(
            'Cannot reassign schedule — attendance records already exist for this session', 409,
          );
        }

        // Cross-class guard
        const targetTeam = await repository.findTeamById(body.bookedTeamId, {
          select: 'classId', lean: true, session,
        });
        if (!targetTeam) {
          throw new ServiceError('Target team not found', 400);
        }
        if (targetTeam.classId.toString() !== existing.classId.toString()) {
          throw new ServiceError(
            'Cannot reassign schedule — target team belongs to a different class', 400,
          );
        }

        // Weekly limit for new team
        const start = new Date(body.startTime || existing.startTime);
        const { weekStart, weekEnd } = bookingPolicy.getWeekBounds(start);
        const weeklyCount = await repository.countSchedulesForTeamInWeek(
          body.bookedTeamId, weekStart, weekEnd, existing._id, session,
        );
        if (weeklyCount >= bookingPolicy.WEEKLY_TEAM_LIMIT) {
          throw new ServiceError(
            'Cannot reassign schedule — target team already has 2 sessions this week (limit: 2/week)', 400,
          );
        }
      }

      // ── Build update data (defense-in-depth whitelist) ──
      const updateData = filterAllowedFields(body);

      // Roster rebuild when team changes. Snapshot only the new team's Active
      // members (parity with bookSlot/adminCreate — a reassigned session must
      // not enroll Dropped members), so member `status` must be populated.
      if (body.bookedTeamId && body.bookedTeamId !== existing.bookedTeamId?.toString()) {
        const newTeam = await repository.findTeamById(body.bookedTeamId, {
          select: 'members',
          populate: { path: 'members', select: '_id status' },
          lean: true,
          session,
        });
        if (newTeam) {
          updateData.enrolledUsers = bookingPolicy.snapshotActiveMembers(newTeam);
        }
      }

      schedule = await repository.updateScheduleById(id, updateData, session);
      if (!schedule) {
        throw new ServiceError('Schedule not found', 404);
      }
    });
  } finally {
    session.endSession();
  }

  // ── Post-commit: calendar sync + cache invalidation ──

  // Sync to Google Calendar (fail-soft)
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
    } catch (e) {
      // Already logged inside calendarService
    }
  }

  // Invalidate session-order cache for old and new classId
  const oldClassId = existing.classId?.toString();
  const newClassId = schedule.classId?.toString();
  if (oldClassId) invalidateSessionOrderCache(existing.classId);
  if (newClassId && newClassId !== oldClassId) {
    invalidateSessionOrderCache(schedule.classId);
  }

  return schedule;
};

// ── Delete Schedule (admin) ───────────────────────────────
// Extracted from scheduleController.deleteSchedule.

const deleteSchedule = async (id) => {
  const schedule = await repository.findScheduleByIdRaw(id);
  if (!schedule) throw new ServiceError('Schedule not found', 404);

  // Cannot delete past sessions (preserve attendance evidence)
  if (new Date(schedule.startTime) <= new Date()) {
    throw new ServiceError(
      'Cannot delete a session that has already started. Past attendance is preserved for reporting.', 409,
    );
  }

  const googleEventId = schedule.googleEventId;
  const session = await mongoose.startSession();
  let deletedAttendance = 0;

  try {
    await session.withTransaction(async () => {
      const attResult = await repository.deleteAttendanceByScheduleId(schedule._id, session);
      deletedAttendance = attResult.deletedCount;
      await repository.deleteScheduleById(schedule._id, session);
    });
  } finally {
    session.endSession();
  }

  invalidateSessionOrderCache(schedule.classId);

  // Best-effort calendar cleanup
  let calendarDeleted = false;
  if (googleEventId) {
    calendarDeleted = await calendarService.deleteEventForSchedule(googleEventId);
  }

  return { deletedAttendance, schedule, calendarDeleted, googleEventId };
};

module.exports = {
  updateSchedule,
  deleteSchedule,
};