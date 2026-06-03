const mongoose = require('mongoose');
const NodeCache = require('node-cache');
const { toVN, todayVN } = require('../helpers/dayjsConfig');
const Schedule = require('../models/Schedule');
const Team = require('../models/Team');
const Attendance = require('../models/Attendance');
const calendarService = require('./calendarService');
const auditService = require('./auditService');
const logger = require('../lib/logger');
const { sendMail } = require('../lib/mailer');
const {
  sendBookingConfirmation,
  sendClassCancellation,
} = require('../lib/emailTemplates');

// Per-class ordered schedule ID list — 5 min TTL.
// Invalidated on create/delete so sessionNumbers stay accurate.
const sessionOrderCache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

// ──────────────────────────────────────────────────────────
// Schedule Service
// ──────────────────────────────────────────────────────────
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

// ── Helpers ───────────────────────────────────────────────

/**
 * Get Monday 00:00:00 UTC – Sunday 23:59:59.999 UTC
 * of the ISO week containing `date`.
 */
const getWeekBounds = (date) => {
  const d = new Date(date);
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

  return { weekStart, weekEnd };
};

/**
 * Return midnight today in Vietnam timezone (as UTC Date for MongoDB).
 * Example: 23:30 VN May 2 → returns 17:00 UTC May 1 (= 00:00 VN May 2)
 */
const utcToday = () => todayVN();

/**
 * Validate a booking window: valid dates, end > start, and the slot matches one
 * of the dynamically-configured ALLOWED_TIME_SLOTS (stored in VN-hour terms).
 * Shared by team booking (bookSlot) and cohort booking (bookCohortSlot).
 * @throws {ServiceError} on invalid dates / range / disallowed slot
 */
const assertValidBookingSlot = async (start, end) => {
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    throw new ServiceError('startTime and endTime must be valid ISO dates');
  }
  if (end <= start) {
    throw new ServiceError('endTime must be after startTime');
  }

  const Setting = mongoose.model('Setting');
  const allowedSlotsSetting = await Setting.findOne({ key: 'ALLOWED_TIME_SLOTS' });
  const ALLOWED_TIME_SLOTS = allowedSlotsSetting ? allowedSlotsSetting.value : [];

  // ALLOWED_TIME_SLOTS stores hours in VN time (e.g. sh:10 = 10:00 VN).
  const startVN = toVN(start);
  const endVN = toVN(end);
  const sH = startVN.hour(), sM = startVN.minute();
  const eH = endVN.hour(), eM = endVN.minute();
  const isValid = ALLOWED_TIME_SLOTS.some(s => s.sh === sH && s.sm === sM && s.eh === eH && s.em === eM);

  if (!isValid) {
    throw new ServiceError('Khung giờ không hợp lệ — Please select an allowed time slot.');
  }
};

/**
 * Attach `sessionNumber` to an array of schedule objects.
 * sessionNumber = 1-based position among all sessions of the same class, ordered by startTime.
 *
 * Uses a per-classId cache (5 min TTL) so repeated calls within a request window
 * do not re-query MongoDB. Call invalidateSessionOrderCache(classId) after
 * creating or deleting a schedule to keep numbers accurate.
 */
const attachSessionNumbers = async (schedules) => {
  if (schedules.length === 0) return schedules;

  // Collect unique classIds, check cache for each
  const orderMap = {};
  const uncachedIds = [];

  for (const s of schedules) {
    const cId = s.classId?._id?.toString() || s.classId?.toString();
    if (!cId) continue;
    if (orderMap[cId]) continue; // already resolved this classId in this call
    const cached = sessionOrderCache.get(cId);
    if (cached) {
      orderMap[cId] = cached;
    } else {
      uncachedIds.push(cId);
    }
  }

  // Single query for all uncached classes
  if (uncachedIds.length > 0) {
    const objectIds = uncachedIds.map(id => new mongoose.Types.ObjectId(id));
    const allSchedules = await Schedule.find({ classId: { $in: objectIds } })
      .select('_id classId startTime')
      .sort({ startTime: 1 })
      .lean();

    const tempMap = {};
    for (const s of allSchedules) {
      const cId = s.classId.toString();
      if (!tempMap[cId]) tempMap[cId] = [];
      tempMap[cId].push(s._id.toString());
    }
    for (const [cId, ids] of Object.entries(tempMap)) {
      orderMap[cId] = ids;
      sessionOrderCache.set(cId, ids);
    }
  }

  // Attach sessionNumber
  for (const s of schedules) {
    const cId = s.classId?._id?.toString() || s.classId?.toString();
    const sId = s._id.toString();
    const order = orderMap[cId] || [];
    const idx = order.indexOf(sId);
    s.sessionNumber = idx >= 0 ? idx + 1 : null;
  }

  return schedules;
};

/**
 * Invalidate the session-order cache for a class.
 * Call after creating or deleting a schedule so sessionNumbers are recomputed.
 */
const invalidateSessionOrderCache = (classId) => {
  if (classId) sessionOrderCache.del(classId.toString());
};

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
        throw new ServiceError('Team chưa được gán lớp — This team has no assigned class');
      }

      // ── Authorization check ───────────────────────────────
      if (requestUser.role !== 'Admin') {
        if (!team.leaderId || team.leaderId.toString() !== requestUser._id.toString()) {
          throw new ServiceError('Only Admin or the Team Leader can book for this team', 403);
        }
      }

      const activeMembers = team.members.filter(m => m.status === 'Active');
      const memberIds = activeMembers.map(m => m._id);
      // Step 2: Weekly Limit — max 2 sessions per team per week
      const { weekStart, weekEnd } = getWeekBounds(start);
      const weeklyCount = await Schedule.countDocuments({
        bookedTeamId: teamId,
        startTime: { $gte: weekStart, $lte: weekEnd },
      }).session(session);

      if (weeklyCount >= 2) {
        throw new ServiceError(
          `Team đã đặt tối đa 2 buổi/tuần — This team already has ${weeklyCount} session(s) this week`
        );
      }

      // Step 3: Collision — no overlapping schedule FOR THIS CLASS
      const collision = await Schedule.findOne({
        classId: team.classId,
        startTime: { $lt: end },
        endTime: { $gt: start },
      }).session(session);

      if (collision) {
        throw new ServiceError(
          'Khung giờ này đã bị Team khác đặt — This time slot is already taken',
          409
        );
      }

      // Step 4: Create the Schedule
      const [doc] = await Schedule.create(
        [{
          classId: team.classId,
          bookedTeamId: teamId,
          startTime: start,
          endTime: end,
          enrolledUsers: memberIds,
        }],
        { session }
      );
      created = doc;
    });
  } catch (err) {
    // Part 2: Catch duplicate key error from unique index (concurrent booking)
    if (err.code === 11000 || err.message?.includes('E11000')) {
      throw new ServiceError(
        'Khung giờ này đã bị Team khác đặt — This time slot is already taken (concurrent booking detected)',
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
const bookCohortSlot = async ({ cohortId, startTime, endTime, enrolledUserIds = [], requestUser }) => {
  const start = new Date(startTime);
  const end = new Date(endTime);

  await assertValidBookingSlot(start, end);

  const session = await mongoose.startSession();
  let created;
  try {
    await session.withTransaction(async () => {
      // Collision — no overlapping schedule for this cohort.
      const collision = await Schedule.findOne({
        classId: cohortId,
        startTime: { $lt: end },
        endTime: { $gt: start },
      }).session(session);

      if (collision) {
        throw new ServiceError(
          'Khung giờ này đã bị đặt — This time slot is already taken',
          409,
        );
      }

      const [doc] = await Schedule.create(
        [{
          classId: cohortId,
          bookedTeamId: null,
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
        'Khung giờ này đã bị đặt — This time slot is already taken (concurrent booking detected)',
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
 * Get future schedules (availability view).
 * @param {Object} filters  { classId? }
 */
const getAvailability = async (filters = {}) => {
  const query = { startTime: { $gte: utcToday() } };
  if (filters.classId) query.classId = filters.classId;

  return Schedule.find(query)
    .populate('classId', 'classCode courseName')
    .populate('bookedTeamId', 'name')
    .sort({ startTime: 1 });
};

/**
 * Get schedules with filters and pagination.
 */
const listSchedules = async (filters, { page, limit, skip }) => {
  const query = {};
  if (filters.classId) query.classId = filters.classId;
  // Used by Participant scope (BUG #2 fix): restrict to schedules where
  // the user is enrolled. Multikey index on enrolledUsers makes this cheap.
  if (filters.enrolledUser) query.enrolledUsers = filters.enrolledUser;
  if (filters.from || filters.to) {
    query.startTime = {};
    if (filters.from) query.startTime.$gte = new Date(filters.from);
    if (filters.to) query.startTime.$lte = new Date(filters.to);
  }

  const [schedules, total] = await Promise.all([
    Schedule.find(query)
      .populate('classId', 'classCode courseName totalSessions')
      .populate('bookedTeamId', 'name')
      .populate('enrolledUsers', 'empCode name department')
      .sort({ startTime: 1 })
      .skip(skip).limit(limit)
      .lean({ virtuals: true }),
    Schedule.countDocuments(query),
  ]);

  await attachSessionNumbers(schedules);
  return { schedules, total };
};

/**
 * Get a single schedule by ID.
 */
const getById = async (id) => {
  const schedule = await Schedule.findById(id)
    .populate('classId', 'classCode courseName')
    .populate('bookedTeamId', 'name')
    .populate('enrolledUsers', 'empCode name department status');

  if (!schedule) throw new ServiceError('Schedule not found', 404);
  return schedule;
};

/**
 * Get upcoming schedules for a participant's team/class.
 */
const getMyClassSchedules = async (userId) => {
  const teams = await Team.find({ members: userId })
    .select('classId name leaderId')
    .populate('leaderId', 'name empCode email department')
    .lean();
  if (teams.length === 0) return { schedules: [], team: null, leader: null };

  const team = teams[0];
  const leader = team?.leaderId || null;

  const classIds = teams.map(t => t.classId).filter(Boolean);
  if (classIds.length === 0) return { schedules: [], team: team?.name, leader };

  const schedules = await Schedule.find({
    classId: { $in: classIds },
    startTime: { $gte: utcToday() },
  })
    .populate('classId', 'classCode courseName totalSessions')
    .populate('bookedTeamId', 'name')
    .sort({ startTime: 1 })
    .limit(20)
    .lean({ virtuals: true });

  await attachSessionNumbers(schedules);
  return { schedules, team: team?.name, leader };
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

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    throw new ServiceError('startTime and endTime must be valid ISO dates');
  }
  if (end <= start) {
    throw new ServiceError('endTime must be after startTime');
  }

  // ── Validate time slot against allowed settings ──────
  const Setting = mongoose.model('Setting');
  const allowedSlotsSetting = await Setting.findOne({ key: 'ALLOWED_TIME_SLOTS' });
  const ALLOWED_TIME_SLOTS = allowedSlotsSetting ? allowedSlotsSetting.value : [];
  // Convert to VN timezone for time-slot validation
  const startVN = toVN(start);
  const endVN = toVN(end);
  const sH = startVN.hour(), sM = startVN.minute();
  const eH = endVN.hour(), eM = endVN.minute();
  const isValid = ALLOWED_TIME_SLOTS.some(s => s.sh === sH && s.sm === sM && s.eh === eH && s.em === eM);

  if (!isValid) {
    throw new ServiceError(
      'Khung giờ không hợp lệ — Only allowed time slots can be booked'
    );
  }

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
            'Team này được gán lớp khác — This team is assigned to a different class. Cannot book for this classId.',
            400
          );
        }

        // ── Rule: Max 2 sessions per team per week (inside tx) ──
        const { weekStart, weekEnd } = getWeekBounds(start);
        const weeklyCount = await Schedule.countDocuments({
          bookedTeamId,
          startTime: { $gte: weekStart, $lte: weekEnd },
        }).session(session);

        if (weeklyCount >= 2) {
          throw new ServiceError(
            `Team đã đặt tối đa 2 buổi/tuần — This team already has ${weeklyCount} session(s) this week (limit: 2)`,
            400
          );
        }

        const activeMembers = team.members.filter(m => m.status === 'Active');
        enrolledUsers = activeMembers.map(m => m._id);
      }

      // ── Collision — no overlapping schedule FOR THIS CLASS ──
      const collision = await Schedule.findOne({
        classId,
        startTime: { $lt: end },
        endTime: { $gt: start },
      }).session(session);

      if (collision) {
        throw new ServiceError(
          'Khung giờ này đã bị trùng — This time slot overlaps with an existing schedule',
          409
        );
      }

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
        'Khung giờ này đã bị trùng — This time slot overlaps with an existing schedule (concurrent booking detected)',
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

/**
 * Get schedules with pre-computed attendance status for the calendar view.
 * Returns schedules with a reliable status field.
 *
 * @param {Object} opts
 * @param {Date|string} opts.from  Optional start date filter
 * @param {Date|string} opts.to    Optional end date filter
 *
 * Status logic:
 *   "none"    — enrolledCount === 0 (no students registered)
 *   "pending" — enrolledCount > 0 but 0 attendance records
 *   "partial" — some attendance marked but count < enrolledCount
 *   "done"    — attendance count >= enrolledCount
 */
const getAttendanceCalendar = async ({ from, to } = {}) => {
  // Step 1: Build filter (optional date range for performance)
  const filter = {};
  if (from || to) {
    filter.startTime = {};
    if (from) filter.startTime.$gte = new Date(from);
    if (to) filter.startTime.$lte = new Date(to);
  }

  const schedules = await Schedule.find(filter)
    .populate('classId', 'classCode courseName totalSessions')
    .populate('bookedTeamId', 'name')
    .sort({ startTime: 1 })
    .lean({ virtuals: true });

  if (schedules.length === 0) return [];

  // Step 2: Attach session numbers
  await attachSessionNumbers(schedules);

  // Step 3: Batch-count attendance records per schedule (single aggregation)
  const scheduleIds = schedules.map(s => s._id);
  const attCounts = await Attendance.aggregate([
    { $match: { scheduleId: { $in: scheduleIds } } },
    { $group: { _id: '$scheduleId', count: { $sum: 1 } } },
  ]);
  const countMap = {};
  attCounts.forEach(a => { countMap[a._id.toString()] = a.count; });

  // Step 4: Compute status for each schedule
  return schedules.map(s => {
    const enrolled = (s.enrolledUsers || []).length;
    const marked = countMap[s._id.toString()] || 0;

    let attendanceStatus;
    if (enrolled === 0) {
      attendanceStatus = 'none';    // No students → grey
    } else if (marked === 0) {
      attendanceStatus = 'pending'; // Has students, no attendance yet
    } else if (marked < enrolled) {
      attendanceStatus = 'partial'; // Some but not all
    } else {
      attendanceStatus = 'done';    // All marked
    }

    return { ...s, enrolledCount: enrolled, attendanceStatus, markedCount: marked };
  });
};

module.exports = {
  ServiceError,
  bookSlot,
  bookCohortSlot,
  adminCreate,
  cancelSlot,
  getAvailability,
  listSchedules,
  getById,
  getMyClassSchedules,
  getAttendanceCalendar,
  attachSessionNumbers,
  invalidateSessionOrderCache,
};
