const mongoose = require('mongoose');
const Schedule = require('../models/Schedule');
const Team = require('../models/Team');
const Attendance = require('../models/Attendance');
const calendarService = require('./calendarService');
const auditService = require('./auditService');
const logger = require('../lib/logger');
const {
  sendBookingConfirmation,
  sendClassCancellation,
} = require('../lib/emailTemplates');
const sessionOrder = require('../domains/schedule/session-order');
const queries = require('../domains/schedule/queries');

// Session-order cache + numbering live in domains/schedule/session-order.
// The booking functions below invalidate the cache on create/cancel.
const { invalidateSessionOrderCache } = sessionOrder;

// ──────────────────────────────────────────────────────────
// Schedule Service (booking/mutation logic + read facade)
// ──────────────────────────────────────────────────────────
// Transaction-heavy booking logic (bookSlot / bookCohortSlot / adminCreate /
// cancelSlot) lives here. The pure read/query use-cases were extracted to
// domains/schedule/queries (Phase 1 modular-monolith refactor); they are
// re-exported below so callers keep using `scheduleService.listSchedules` etc.
//
// Pure business logic — no req/res objects.
// Each method receives plain data and returns a result or
// throws a typed error with a statusCode property.
//
// ARCHITECTURE:
//   Controller (parse req/res) → Service (logic) → Model (DB)
// ──────────────────────────────────────────────────────────

/**
 * Custom error class with HTTP status code.
 * Controllers catch these and map statusCode → res.status().
 */
const { ServiceError } = require('../helpers/ServiceError');
const schedulingWindowPolicy = require('../domains/schedule/scheduling-window-policy');
const bookingPolicy = require('../domains/schedule/session-booking-policy');
const schedulingModePolicy = require('../domains/schedule/scheduling-mode-policy');

// ── Helpers ───────────────────────────────────────────────

/**
 * Validate a booking window against the configured ALLOWED_TIME_SLOTS.
 * Thin wrapper over the shared scheduling-window policy (Wave E1) so team
 * booking, cohort booking, and Admin create all enforce the SAME rules.
 * @throws {ServiceError} on invalid dates / range / disallowed slot
 */
const assertValidBookingSlot = (start, end) =>
  schedulingWindowPolicy.assertValidBookingWindow(start, end);

/**
 * After a Schedule is created, create a Google Calendar event for it
 * and store the event ID + Meet link back on the schedule.
 *
 * Always fail-soft: a calendar failure must never break the booking
 * flow. The schedule already exists; the worst outcome is that we
 * have a Schedule without a calendar event, which the admin can fix
 * by editing & re-saving (which would trigger an update).
 *
 * Returns { googleEventId, meetLink } or null.
 */
const createCalendarEventForSchedule = async (scheduleId) => {
  if (!calendarService.isConfigured()) return null;

  try {
    // Re-fetch with full population so we have everyone's email.
    const schedule = await Schedule.findById(scheduleId)
      .populate('classId', 'classCode courseName')
      .populate('bookedTeamId', 'name')
      .populate('enrolledUsers', 'empCode name email')
      .lean();
    if (!schedule) return null;

    const result = await calendarService.createEventForSchedule({
      schedule,
      classDoc: schedule.classId,
      team: schedule.bookedTeamId,
      attendees: schedule.enrolledUsers,
    });
    if (!result) return null;

    await Schedule.updateOne(
      { _id: scheduleId },
      { $set: { googleEventId: result.eventId, meetLink: result.meetLink || '' } }
    );

    return result;
  } catch (err) {
    logger.error(
      { err: err.message, scheduleId },
      'createCalendarEventForSchedule failed (booking already saved; calendar skipped)'
    );
    return null;
  }
};

// ── Core Business Logic ──────────────────────────────────

/**
 * Book a time slot for a team.
 *
 * @param {Object} params
 * @param {string} params.teamId
 * @param {string} params.startTime   ISO date string
 * @param {string} params.endTime     ISO date string
 * @param {Object} params.requestUser The authenticated user (req.user)
 * @returns {Object} populated Schedule document
 * @throws {ServiceError} on validation/conflict/limit failures
 */
const bookSlot = async ({ teamId, startTime, endTime, requestUser }) => {
  const start = new Date(startTime);
  const end = new Date(endTime);

  // ── Validate times + allowed slot ─────────────────────
  await assertValidBookingSlot(start, end);

  // ── schedulingMode gate (Pass C) ──────────────────────
  // This is the shared chokepoint for team booking: BOTH the legacy
  // /api/schedules/book-slot leader route AND the learning/session adapter call
  // bookSlot, so the mode rule is enforced regardless of entry point. A team
  // session is rejected for a cohort-based program (400) or an unknown mode
  // (501), and an admin_scheduled program may be booked only by an Admin (403).
  const schedulingMode = await schedulingModePolicy.resolveSchedulingMode({ teamId });
  schedulingModePolicy.assertTeamMode({ schedulingMode, actor: requestUser });

  // ── TRANSACTION: Atomic booking ───────────────────────
  const session = await mongoose.startSession();
  let created;

  try {
    await session.withTransaction(async () => {
      // Step 1: Acquire Write Lock on Team document
      // By updating 'updatedAt', we force MongoDB to serialize concurrent requests for the same team.
      const team = await Team.findByIdAndUpdate(
        teamId,
        { $set: { updatedAt: new Date() } },
        { session, new: true }
      ).populate('members', '_id status');

      if (!team) throw new ServiceError('Team not found', 404);
      if (!team.classId) {
        throw new ServiceError('This team has no assigned class');
      }

      // ── Authorization check ───────────────────────────────
      if (requestUser.role !== 'Admin') {
        if (!team.leaderId || team.leaderId.toString() !== requestUser._id.toString()) {
          throw new ServiceError('Only Admin or the Team Leader can book for this team', 403);
        }
      }

      // Snapshot the team's Active members + assert the slot is bookable
      // (weekly cap + same-class collision) via the shared session-booking policy.
      const enrolledUsers = bookingPolicy.snapshotActiveMembers(team);
      await bookingPolicy.assertBookable(
        { classId: team.classId, teamId, start, end, incomingCount: enrolledUsers.length },
        { session, enforceWeeklyCap: true },
      );

      // Create the Schedule
      const [doc] = await Schedule.create(
        [{
          classId: team.classId,
          bookedTeamId: teamId,
          startTime: start,
          endTime: end,
          enrolledUsers,
        }],
        { session }
      );
      created = doc;
    });
  } catch (err) {
    // Part 2: Catch duplicate key error from unique index (concurrent booking)
    if (err.code === 11000 || err.message?.includes('E11000')) {
      throw new ServiceError(
        'This time slot is already taken (concurrent booking detected)',
        409
      );
    }
    throw err;
  } finally {
    session.endSession();
  }

  // Invalidate session-order cache for the affected class
  invalidateSessionOrderCache(created.classId);

  // Create the Calendar event AFTER the transaction commits. Doing
  // this inside the transaction would mean a Calendar failure rolls
  // back the booking — we don't want that. Instead, the Schedule
  // exists first; calendar is best-effort augmentation.
  const calRes = await createCalendarEventForSchedule(created._id);
  if (calRes) {
    auditService.record({
      req: { user: requestUser },
      action: 'calendar-event-created',
      entity: 'Schedule',
      entityId: created._id,
      note: `Google event ${calRes.eventId}; Meet: ${calRes.meetLink || 'n/a'}`,
    });
  }

  // Populate for response (re-fetch so the response includes googleEventId/meetLink).
  const populated = await Schedule.findById(created._id)
    .populate('classId', 'classCode courseName')
    .populate('bookedTeamId', 'name')
    .populate('enrolledUsers', 'empCode name');

  // Send booking confirmation email to the requestUser (non-blocking, fail-soft).
  if (requestUser.email) {
    const className = populated.classId
      ? `${populated.classId.classCode} — ${populated.classId.courseName}`
      : 'your class';
    sendBookingConfirmation({
      to: requestUser.email,
      userName: requestUser.name,
      className,
      startTime: created.startTime,
    });
  }

  return populated;
};

/**
 * Create a team-less session for a Cohort (self_enroll / nomination modes).
 *
 * Unlike bookSlot, there is no Team: an Admin schedules the session against a
 * cohort and we snapshot the cohort's active cohort-based enrollments (passed in
 * as enrolledUserIds) onto the session. No leader-auth and no per-team weekly
 * limit apply — those are team-booking concepts. The {classId,startTime} unique
 * index + collision check still guard against double-booking the cohort.
 *
 * @param {Object} args { cohortId, startTime, endTime, enrolledUserIds, requestUser }
 * @returns {Promise<Object>} populated Schedule
 * @throws {ServiceError} on validation/collision failures
 */
const bookCohortSlot = async ({ cohortId, startTime, endTime, enrolledUserIds = [], officeId = null, requestUser }) => {
  const start = new Date(startTime);
  const end = new Date(endTime);

  await assertValidBookingSlot(start, end);

  const session = await mongoose.startSession();
  let created;
  try {
    await session.withTransaction(async () => {
      // No team, no weekly cap — same-cohort collision + capacity guard apply.
      await bookingPolicy.assertBookable(
        { classId: cohortId, start, end, incomingCount: enrolledUserIds.length },
        { session, enforceWeeklyCap: false },
      );

      const [doc] = await Schedule.create(
        [{
          classId: cohortId,
          bookedTeamId: null,
          officeId: officeId || null,
          startTime: start,
          endTime: end,
          enrolledUsers: enrolledUserIds,
        }],
        { session },
      );
      created = doc;
    });
  } catch (err) {
    if (err.code === 11000 || err.message?.includes('E11000')) {
      throw new ServiceError(
        'This time slot is already taken (concurrent booking detected)',
        409,
      );
    }
    throw err;
  } finally {
    session.endSession();
  }

  invalidateSessionOrderCache(created.classId);

  // Best-effort Google Calendar event (outside the transaction — same rationale
  // as bookSlot: a calendar hiccup must not roll back the booking).
  const calRes = await createCalendarEventForSchedule(created._id);
  if (calRes) {
    auditService.record({
      req: { user: requestUser },
      action: 'calendar-event-created',
      entity: 'Schedule',
      entityId: created._id,
      note: `Google event ${calRes.eventId}; Meet: ${calRes.meetLink || 'n/a'}`,
    });
  }

  return Schedule.findById(created._id)
    .populate('classId', 'classCode courseName')
    .populate('enrolledUsers', 'empCode name');
};

/**
 * Cancel (delete) a booked schedule.
 *
 * @param {string} scheduleId
 * @param {Object} requestUser
 * @throws {ServiceError} if not found or not authorized
 */
const cancelSlot = async (scheduleId, requestUser) => {
  // Populate before delete so we still have user emails + class info for notifications.
  const schedule = await Schedule.findById(scheduleId)
    .populate('classId', 'classCode courseName')
    .populate('enrolledUsers', 'name email');
  if (!schedule) throw new ServiceError('Schedule not found', 404);

  // Audit PR 6 (DATA-005): cancelSlot used to cascade-delete the schedule's
  // attendance unconditionally. For a PAST session that means roll-call
  // history is destroyed — compliance + reporting evidence vanishes.
  //
  // Policy: a schedule that has already started CANNOT be cancelled via
  // this endpoint. If admins need to remove a botched past session, they
  // must go through the admin-db tools (which preserve audit + history
  // collections — see SEC-010 in audit PR 3).
  if (new Date(schedule.startTime) <= new Date()) {
    throw new ServiceError(
      'Cannot cancel a session that has already started. Past attendance is preserved for reporting.',
      409,
    );
  }

  if (requestUser.role !== 'Admin') {
    const team = await Team.findById(schedule.bookedTeamId);
    if (!team || !team.leaderId || team.leaderId.toString() !== requestUser._id.toString()) {
      throw new ServiceError('Only Admin or the Team Leader can cancel this booking', 403);
    }
  }

  // Snapshot for post-commit email + calendar cleanup
  const classId = schedule.classId?._id || schedule.classId;
  const googleEventId = schedule.googleEventId;
  const className = schedule.classId
    ? `${schedule.classId.classCode} — ${schedule.classId.courseName}`
    : 'your class';
  const cancelledBy = requestUser.name || requestUser.empCode || 'Admin';
  const startTime = schedule.startTime;
  const enrolledUsers = Array.isArray(schedule.enrolledUsers)
    ? schedule.enrolledUsers.filter(u => u && u.email)
    : [];

  // ── TRANSACTION: Cascade delete Attendance → Schedule (BUG-03) ──
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await Attendance.deleteMany({ scheduleId: schedule._id }, { session });
      await Schedule.findByIdAndDelete(schedule._id, { session });
    });
  } finally {
    session.endSession();
  }
  invalidateSessionOrderCache(classId);

  // Best-effort: cancel the Google Calendar event so all attendees get
  // a cancellation notification. Outside the transaction so a Calendar
  // hiccup doesn't roll back the local cancellation.
  if (googleEventId) {
    const ok = await calendarService.deleteEventForSchedule(googleEventId);
    if (ok) {
      auditService.record({
        req: { user: requestUser },
        action: 'calendar-event-deleted',
        entity: 'Schedule',
        entityId: schedule._id,
        note: `Google event ${googleEventId}`,
      });
    }
  }

  // Notify all enrolled users via email (fire-and-forget, fail-soft).
  // Calendar already pings attendees but explicit email reaches users
  // who don't have the Calendar account linked.
  for (const u of enrolledUsers) {
    sendClassCancellation({
      to: u.email,
      userName: u.name,
      className,
      startTime,
      cancelledBy,
    });
  }
};

/**
 * Admin-create a schedule with full business rules.
 *
 * Enforces:
 *   - Team can only book for its assigned class code
 *   - Max 2 sessions per team per week
 *   - No overlapping time slots (collision detection)
 *   - Auto-enrolls team members
 *
 * @param {Object} data  Schedule fields from req.body
 * @returns {Object} populated Schedule document
 */
const adminCreate = async (data) => {
  const { startTime, endTime, classId, bookedTeamId } = data;

  // ── Validate required fields ──────────────────────────
  if (!classId) throw new ServiceError('classId is required');
  if (!bookedTeamId) throw new ServiceError('bookedTeamId is required');
  if (!startTime || !endTime) throw new ServiceError('startTime and endTime are required');

  const start = new Date(startTime);
  const end = new Date(endTime);

  // ── Validate dates + allowed slot (shared policy) ─────
  await assertValidBookingSlot(start, end);

  // ── schedulingMode gate (Pass C) ──────────────────────
  // Admin override (BR-6) keeps an Admin free to team-book any team-mode program,
  // but NOT a cohort-based program (self_enroll/nomination) — those are scheduled
  // against the cohort. Structural only (Admin-gated route, so no actor check).
  const schedulingMode = await schedulingModePolicy.resolveSchedulingMode({ classId });
  schedulingModePolicy.assertTeamModeStructural({ schedulingMode });

  // ── TRANSACTION: All checks + create (atomic) ─────────
  const session = await mongoose.startSession();
  let created;
  let enrolledUsers = [];

  try {
    await session.withTransaction(async () => {
      // ── Resolve team + class mismatch check ──────────────
      if (bookedTeamId) {
        const team = await Team.findById(bookedTeamId)
          .populate('members', '_id status')
          .session(session);
        if (!team) throw new ServiceError('Team not found', 404);

        if (team.classId && team.classId.toString() !== classId.toString()) {
          throw new ServiceError(
            'This team is assigned to a different class. Cannot book for this classId.',
            400
          );
        }

        // Snapshot the team's Active members; weekly cap + same-class collision
        // are asserted below via the shared session-booking policy.
        enrolledUsers = bookingPolicy.snapshotActiveMembers(team);
      }

      await bookingPolicy.assertBookable(
        { classId, teamId: bookedTeamId, start, end, incomingCount: enrolledUsers.length, scheduleCapacity: data.capacity },
        { session, enforceWeeklyCap: true },
      );

      const [doc] = await Schedule.create(
        [{
          ...data,
          startTime: start,
          endTime: end,
          enrolledUsers,
        }],
        { session }
      );
      created = doc;
    });
  } catch (err) {
    if (err.code === 11000 || err.message?.includes('E11000')) {
      throw new ServiceError(
        'This time slot overlaps with an existing schedule (concurrent booking detected)',
        409
      );
    }
    throw err;
  } finally {
    session.endSession();
  }

  invalidateSessionOrderCache(classId);

  // Best-effort calendar event (admin-created path).
  await createCalendarEventForSchedule(created._id);

  return Schedule.findById(created._id)
    .populate('classId', 'classCode courseName')
    .populate('bookedTeamId', 'name')
    .populate('enrolledUsers', 'empCode name');
};

// ── Public surface ────────────────────────────────────────
// Booking/mutation logic lives here; read use-cases and the session-order
// cache are re-exported from the domain modules so existing callers
// (scheduleController, learning/session, domains/schedule) are unchanged.
module.exports = {
  ServiceError,
  // Mutations (transaction-heavy — defined above)
  bookSlot,
  bookCohortSlot,
  adminCreate,
  cancelSlot,
  // Read use-cases (domains/schedule/queries)
  getAvailability: queries.getAvailability,
  listSchedules: queries.listSchedules,
  getById: queries.getById,
  getMyClassSchedules: queries.getMyClassSchedules,
  getAttendanceCalendar: queries.getAttendanceCalendar,
  // Session-order cache (domains/schedule/session-order)
  attachSessionNumbers: sessionOrder.attachSessionNumbers,
  invalidateSessionOrderCache: sessionOrder.invalidateSessionOrderCache,
};
