const Schedule = require('../../../models/Schedule');
const WaitlistEntry = require('../../../models/WaitlistEntry');
const NotificationLog = require('../../../models/NotificationLog');
const User = require('../../../models/User');
const logger = require('../../../lib/logger');
const { sendWaitlistPromoted } = require('../../../lib/emailTemplates');
const scheduleRepository = require('../repository');
const bookingPolicy = require('../session-booking-policy');

// ──────────────────────────────────────────────────────────
// FIFO auto-promotion (Wave E3 phase-04, slice B)
// ──────────────────────────────────────────────────────────
// promoteIfSeatFree runs INSIDE the seat-freeing transaction (M3 — the
// seat-free and the promote are atomic; a crash rolls both back). Each
// candidate is seated with a guarded $push:
//   { status:'scheduled', enrolledUsers:{$ne:user}, $expr: size < cap }
// so a concurrent promoter/booking can never overfill the roster — the
// post-loop assert is a belt on top (M5), aborting the tx if breached.

/**
 * Seat FIFO waiters into freed seats. Caller owns the transaction.
 * @returns {Promise<Array<{ userId, entryId }>>} promotions (for post-commit notify)
 */
const promoteIfSeatFree = async (scheduleId, session) => {
  const sched = await Schedule.findById(scheduleId)
    .select('status startTime classId capacity enrolledUsers')
    .session(session);
  if (!sched || sched.status !== 'scheduled') return [];
  if (new Date(sched.startTime) <= new Date()) return [];

  const { maxParticipantsPerSession } =
    await scheduleRepository.findClassCapacityPolicy(sched.classId, session);
  const cap = bookingPolicy.effectiveSessionCapacity({
    scheduleCapacity: sched.capacity,
    maxPerSession: maxParticipantsPerSession,
  });

  const free = cap - (sched.enrolledUsers || []).length;
  if (free <= 0) return [];

  const candidates = await WaitlistEntry.find({ scheduleId, status: 'waiting' })
    .sort({ createdAt: 1 })
    .limit(free)
    .session(session);

  const promotions = [];
  for (const entry of candidates) {
    // eslint-disable-next-line no-await-in-loop -- FIFO must seat in order
    const res = await Schedule.updateOne(
      {
        _id: scheduleId,
        status: 'scheduled',
        enrolledUsers: { $ne: entry.userId },
        $expr: { $lt: [{ $size: '$enrolledUsers' }, cap] },
      },
      { $push: { enrolledUsers: entry.userId } },
      { session },
    );
    if (res.modifiedCount !== 1) continue; // already enrolled or cap hit — leave waiting

    entry.status = 'promoted';
    entry.promotedAt = new Date();
    // eslint-disable-next-line no-await-in-loop
    await entry.save({ session });
    promotions.push({ userId: entry.userId, entryId: entry._id });
  }

  // M5 belt: the roster must never exceed the effective cap — abort the whole
  // seat-freeing transaction rather than persist an overfull session.
  const after = await Schedule.findById(scheduleId).select('enrolledUsers').session(session);
  if ((after?.enrolledUsers || []).length > cap) {
    throw new Error(`waitlist promotion overfilled schedule ${scheduleId} (> ${cap})`);
  }

  return promotions;
};

// ── Post-commit notification (fail-soft) ──────────────────
// One NotificationLog row per promotion — the unique tuple (type + recipient
// + cadenceKey `<scheduleId>:<userId>`) makes retries idempotent: a duplicate
// insert means "already notified", so the email is skipped, never doubled.
const notifyPromotions = async (scheduleId, promotions = []) => {
  if (!promotions.length) return;
  try {
    const sched = await Schedule.findById(scheduleId)
      .populate('classId', 'classCode courseName')
      .lean();
    if (!sched) return;
    const className = sched.classId
      ? `${sched.classId.classCode} — ${sched.classId.courseName}`
      : 'your class';

    const users = await User.find({ _id: { $in: promotions.map((p) => p.userId) } })
      .select('name email').lean();
    const byId = new Map(users.map((u) => [String(u._id), u]));

    for (const { userId } of promotions) {
      const user = byId.get(String(userId));
      const cadenceKey = `${scheduleId}:${userId}`;
      let log;
      try {
        // eslint-disable-next-line no-await-in-loop
        log = await NotificationLog.create({
          type: 'waitlist_promoted',
          recipientEmail: user?.email || '',
          recipientUserId: userId,
          learnerId: userId,
          cadenceKey,
          metadata: { scheduleId: String(scheduleId) },
        });
      } catch (err) {
        if (err.code === 11000) continue; // already notified (idempotent)
        throw err;
      }
      if (user?.email) {
        // eslint-disable-next-line no-await-in-loop
        const sent = await sendWaitlistPromoted({
          to: user.email,
          userName: user.name,
          className,
          startTime: sched.startTime,
        });
        // eslint-disable-next-line no-await-in-loop
        await NotificationLog.updateOne(
          { _id: log._id },
          { $set: sent ? { status: 'sent', sentAt: new Date() } : { status: 'failed', error: 'send returned null' } },
        );
      } else {
        // eslint-disable-next-line no-await-in-loop
        await NotificationLog.updateOne({ _id: log._id }, { $set: { status: 'skipped', error: 'no email' } });
      }
    }

    // Refresh the calendar event once so promoted learners get the invite.
    // Lazy require dodges a load-order cycle (scheduleService ← models).
    // eslint-disable-next-line global-require
    const scheduleService = require('../../../services/scheduleService');
    await scheduleService.syncCalendarForSchedule(scheduleId);
  } catch (err) {
    logger.error({ err: err.message, scheduleId }, 'notifyPromotions failed (fail-soft)');
  }
};

module.exports = { promoteIfSeatFree, notifyPromotions };
