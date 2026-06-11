const mongoose = require('mongoose');
const calendarService = require('../../services/calendarService');
const { ServiceError } = require('../../helpers/ServiceError');
const Schedule = require('../../models/Schedule');
const User = require('../../models/User');
const { sendClassCancellation } = require('../../lib/emailTemplates');
const { invalidateSessionOrderCache } = require('./session-order');
const schedulingWindowPolicy = require('./scheduling-window-policy');
const repository = require('./repository');
const bookingPolicy = require('./session-booking-policy');
const schedulingModePolicy = require('./scheduling-mode-policy');
const roomLockPolicy = require('./room-lock-policy');
const { releaseScheduleResources } = require('./release-resources');
const waitlistPromotion = require('./waitlist/promotion');
const scheduleService = require('../../services/scheduleService');

// ── Shared helpers ────────────────────────────────────────

// roomId is NOT in this whitelist: the room is set ONLY via the room lock
// (room-lock-policy) so Schedule.roomId and the RoomBooking ledger never drift.
// updateSchedule handles roomId separately (release + reacquire) below.
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

  // Durable-cancelled rows are history — editing one would silently resurrect
  // it past every booking guard. Re-book the slot instead.
  if (existing.status === 'cancelled') {
    throw new ServiceError('Cannot edit a cancelled session — book the slot again instead', 409);
  }

  const session = await mongoose.startSession();
  let schedule;
  let capacityPromotions = [];

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

        // schedulingMode gate (Pass C): cannot attach a team to a cohort-based
        // program's session (structural). Class is unchanged on reassign, so the
        // mode is resolved from the existing class. Admin override otherwise.
        const schedulingMode = await schedulingModePolicy.resolveSchedulingMode(
          { classId: existing.classId }, session,
        );
        schedulingModePolicy.assertTeamModeStructural({ schedulingMode });

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

      // ── Capacity guard (Wave E2 / D3) ──────────────────
      // An edit must never leave the roster above the effective per-session cap.
      // Compare the FINAL roster being written (rebuilt on reassign, else the
      // existing roster) against the FINAL capacity (body.capacity ?? existing),
      // with the program override resolved for the final class — all in-tx.
      if (updateData.capacity !== undefined || updateData.enrolledUsers !== undefined) {
        const finalRoster = updateData.enrolledUsers ?? existing.enrolledUsers ?? [];
        const finalCapacity = updateData.capacity !== undefined ? updateData.capacity : existing.capacity;
        const finalClassId = updateData.classId || existing.classId;
        const { maxParticipantsPerSession } = await repository.findClassCapacityPolicy(finalClassId, session);
        const cap = bookingPolicy.effectiveSessionCapacity({
          scheduleCapacity: finalCapacity,
          maxPerSession: maxParticipantsPerSession,
        });
        if (finalRoster.length > cap) {
          throw new ServiceError(bookingPolicy.capacityMessage(cap), 422);
        }
      }

      schedule = await repository.updateScheduleById(id, updateData, session);
      if (!schedule) {
        throw new ServiceError('Schedule not found', 404);
      }

      // ── Capacity-raise promotion (phase-04 slice B, M3) ──
      // A capacity edit can free seats — seat FIFO waiters INSIDE this tx so
      // the freed seat and the promotion are atomic (never post-commit).
      // promoteIfSeatFree no-ops when nothing is free, so a lower/equal
      // capacity edit costs one indexed read.
      if (body.capacity !== undefined) {
        capacityPromotions = await waitlistPromotion.promoteIfSeatFree(id, session);
      }

      // ── Room reassignment (Phase 3, DELTA A) ────────────
      // The ledger key is (roomId, startTime). Fire release+reacquire whenever
      // the final room is present AND the key would change (room/start/class),
      // or release-only when the room is being cleared. roomId is handled here
      // — never via the field whitelist — so Schedule.roomId and the ledger
      // stay atomic. office is immutable on this path, so the same-Office guard
      // uses the existing officeId.
      if (body.roomId !== undefined) {
        const existingRoomId = existing.roomId ? String(existing.roomId) : null;
        const requestedRoomId = body.roomId || null;
        const finalStart = new Date(body.startTime || existing.startTime);
        const finalClassId = updateData.classId || existing.classId;
        const startChanged = finalStart.getTime() !== new Date(existing.startTime).getTime();
        const classChanged = String(finalClassId) !== String(existing.classId);
        const roomChanged = requestedRoomId !== existingRoomId;

        if (requestedRoomId === null) {
          // Clear the room → drop the ledger row + null the field.
          await roomLockPolicy.releaseRoomLock([existing._id], session);
          await repository.updateScheduleById(id, { roomId: null }, session);
          schedule.roomId = null;
        } else if (roomChanged || startChanged || classChanged) {
          // Key would change → release the old claim then reacquire the new one.
          await roomLockPolicy.releaseRoomLock([existing._id], session);
          await roomLockPolicy.acquireRoomLock(
            {
              roomId: requestedRoomId,
              scheduleId: existing._id,
              classId: finalClassId,
              startTime: finalStart,
              officeId: existing.officeId || null,
            },
            { session },
          );
          schedule.roomId = requestedRoomId;
        }
      } else if (body.startTime || updateData.classId) {
        // Room unchanged but the slot/class moved → the existing ledger row's
        // key is now stale. Reacquire at the new key (release old first).
        if (existing.roomId) {
          const finalStart = new Date(body.startTime || existing.startTime);
          const finalClassId = updateData.classId || existing.classId;
          await roomLockPolicy.releaseRoomLock([existing._id], session);
          await roomLockPolicy.acquireRoomLock(
            {
              roomId: existing.roomId,
              scheduleId: existing._id,
              classId: finalClassId,
              startTime: finalStart,
              officeId: existing.officeId || null,
            },
            { session },
          );
        }
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
        .populate('sessionInstructorIds', 'empCode name email')
        .lean();
      await calendarService.updateEventForSchedule({
        schedule: populated,
        classDoc: populated.classId,
        team: populated.bookedTeamId,
        // Phase 3 (B3): include trainers so an edit never drops them from the
        // calendar event (Google replaces the attendee list on update).
        attendees: scheduleService.effectiveAttendeesForSchedule(populated),
      });
    } catch (e) {
      // Already logged inside calendarService
    }
  }

  // Post-commit: notify any waiters promoted by a capacity raise (fail-soft
  // email + idempotent NotificationLog + one calendar refresh).
  await waitlistPromotion.notifyPromotions(id, capacityPromotions);

  // Invalidate session-order cache for old and new classId
  const oldClassId = existing.classId?.toString();
  const newClassId = schedule.classId?.toString();
  if (oldClassId) invalidateSessionOrderCache(existing.classId);
  if (newClassId && newClassId !== oldClassId) {
    invalidateSessionOrderCache(schedule.classId);
  }

  return schedule;
};

// ── Delete Schedule (admin) — durable cancel ──────────────
// Wave E3 phase-04 slice A: the admin "delete" is now a durable cancellation.
// The doc flips to status:'cancelled' (who/when/why preserved), attendance
// rows are KEPT, the room-lock ledger row is released (+ roomId nulled, B3),
// and the freed slot re-books (partial-unique index skips cancelled rows).

const deleteSchedule = async (id, { cancelledBy = null, cancelledByName = 'Admin', cancelReason = '' } = {}) => {
  const schedule = await repository.findScheduleByIdRaw(id);
  if (!schedule) throw new ServiceError('Schedule not found', 404);

  if (schedule.status === 'cancelled') {
    throw new ServiceError('This session is already cancelled', 409);
  }

  // Cannot cancel past sessions (preserve attendance evidence)
  if (new Date(schedule.startTime) <= new Date()) {
    throw new ServiceError(
      'Cannot delete a session that has already started. Past attendance is preserved for reporting.', 409,
    );
  }

  const googleEventId = schedule.googleEventId;
  const session = await mongoose.startSession();
  let waiterUserIds = [];

  try {
    await session.withTransaction(async () => {
      // Same-tx resource release: room ledger row dropped + live waitlist
      // entries dissolved to 'cancelled' (slice B).
      ({ waiterUserIds } = await releaseScheduleResources([schedule._id], session));
      const flipped = await repository.cancelScheduleById(
        schedule._id, { cancelledBy, cancelReason }, session,
      );
      // Atomic conditional flip: a concurrent cancel already won.
      if (!flipped) {
        throw new ServiceError('This session is already cancelled', 409);
      }
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

  // Dissolved waiters are emailed post-commit (owner decision 2026-06-11) —
  // fail-soft, same cancellation template as enrolled learners.
  if (waiterUserIds.length > 0) {
    const cls = await Schedule.findById(schedule._id)
      .populate('classId', 'classCode courseName').select('classId').lean();
    const className = cls?.classId
      ? `${cls.classId.classCode} — ${cls.classId.courseName}`
      : 'your class';
    const waiters = await User.find({ _id: { $in: waiterUserIds } })
      .select('name email').lean();
    for (const w of waiters) {
      if (!w.email) continue;
      sendClassCancellation({
        to: w.email,
        userName: w.name,
        className,
        startTime: schedule.startTime,
        cancelledBy: cancelledByName,
      });
    }
  }

  return { schedule, calendarDeleted, googleEventId };
};

// ── Set Trainers (re-center Phase 3, DELTA B) ─────────────
// Assign a session's trainers in ONE mutation:
//   internalIds      → Schedule.sessionInstructorIds (join the UNION authz)
//   externalTrainer  → Schedule.externalTrainer subdoc (calendar + display only)
// No transaction (orthogonal field, like Wave E3 M1). Returns
// { before, after } so the controller can audit a single before/after diff
// (clearing a trainer silently revokes access — needs a trail).
// Plain (audit-safe) view of an external-trainer subdoc — strips Mongoose's
// circular $parent refs so auditService.diff (JSON.stringify) doesn't recurse.
const plainExternalTrainer = (ext) => {
  if (!ext) return null;
  const o = typeof ext.toObject === 'function' ? ext.toObject() : ext;
  return { name: o.name, email: o.email || null, phone: o.phone || null, org: o.org || null };
};

const setTrainers = async (id, { internalIds, externalTrainer }) => {
  const existing = await repository.findScheduleByIdRaw(id);
  if (!existing) throw new ServiceError('Schedule not found', 404);

  const before = {
    sessionInstructorIds: (existing.sessionInstructorIds || []).map(String),
    externalTrainer: plainExternalTrainer(existing.externalTrainer),
  };

  const update = {};

  if (internalIds !== undefined) {
    // Dedupe (z.array accepts dups; countDocuments($in) silently de-dupes —
    // store the deduped set so audit/DTO are clean).
    const deduped = [...new Set((internalIds || []).map(String))];
    const valid = await repository.findValidInstructorIds(deduped);
    if (valid.length !== deduped.length) {
      throw new ServiceError(
        'One or more trainers are not valid active Teacher/Admin users', 400,
      );
    }
    update.sessionInstructorIds = valid;
  }

  if (externalTrainer !== undefined) {
    // null clears it; an object sets/replaces it (zod already shaped/trimmed).
    update.externalTrainer = externalTrainer || null;
  }

  if (Object.keys(update).length === 0) {
    throw new ServiceError('Provide internalIds and/or externalTrainer', 400);
  }

  const after = await repository.updateScheduleById(id, update);
  if (!after) throw new ServiceError('Schedule not found', 404);

  // Sync the calendar event (effective attendees now include trainers) —
  // post-update, fail-soft. Skipped for past sessions inside the helper.
  await scheduleService.syncCalendarForSchedule(after._id);

  return {
    before,
    after: {
      sessionInstructorIds: (after.sessionInstructorIds || []).map(String),
      externalTrainer: plainExternalTrainer(after.externalTrainer),
    },
    schedule: after,
  };
};

module.exports = {
  updateSchedule,
  deleteSchedule,
  setTrainers,
};