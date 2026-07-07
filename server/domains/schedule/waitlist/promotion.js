const logger = require('../../../lib/logger');
const { sendWaitlistPromoted } = require('../../../lib/emailTemplates');
const scheduleRepository = require('../repository');
const repository = require('./repository');
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
 * Dual-backend (slice S4): the business logic stays here; every DB op flows
 * through the waitlist repository (tx-aware). `tx` is a Unit-of-Work handle OR a
 * raw mongoose session (legacy callers) — the repo's sessionOf shim accepts both.
 * @returns {Promise<Array<{ userId, entryId }>>} promotions (for post-commit notify)
 */
const promoteIfSeatFree = async (scheduleId, tx) => {
  const sched = await repository.findScheduleForPromotion(scheduleId, tx);
  if (!sched || sched.status !== 'scheduled') return [];
  if (new Date(sched.startTime) <= new Date()) return [];

  const { maxParticipantsPerSession } =
    await scheduleRepository.findClassCapacityPolicy(sched.classId, tx);
  const cap = bookingPolicy.effectiveSessionCapacity({
    scheduleCapacity: sched.capacity,
    maxPerSession: maxParticipantsPerSession,
  });

  const roster = new Set((sched.enrolledUsers || []).map(String));
  let freeRemaining = cap - roster.size;
  if (freeRemaining <= 0) return [];

  // Scan the WHOLE waiting queue FIFO — not just `free` rows. A stale head
  // (its user already on the roster via a manual admin add / another path)
  // would otherwise be re-fetched on EVERY free event, fail the guarded push,
  // and permanently clog the queue for everyone behind it. Stale rows are
  // resolved in place WITHOUT consuming a seat and the scan continues.
  const candidates = await repository.findWaitingEntriesForPromotion(scheduleId, tx);

  const promotions = [];
  const resolveEntry = async (entry, { notify }) => {
    await repository.markEntryPromoted(entry._id, tx);
    // Stale rows get no promotion email — the path that seated them already
    // notified; only genuinely seated waiters go to notifyPromotions.
    if (notify) promotions.push({ userId: entry.userId, entryId: entry._id });
  };

  for (const entry of candidates) {
    if (freeRemaining <= 0) break;
    const userKey = String(entry.userId);

    if (roster.has(userKey)) {
      // eslint-disable-next-line no-await-in-loop -- FIFO must resolve in order
      await resolveEntry(entry, { notify: false });
      continue;
    }

    // eslint-disable-next-line no-await-in-loop -- FIFO must seat in order
    const modified = await repository.seatWaiterIfRoom(scheduleId, entry.userId, cap, tx);

    if (modified !== 1) {
      // Guard refused despite local tracking — re-read (defense-in-depth):
      // user actually seated → resolve the stale row; else the cap is
      // genuinely hit and no further seat exists — stop scanning.
      // eslint-disable-next-line no-await-in-loop
      const enrolled = await repository.findScheduleEnrolledUsers(scheduleId, tx);
      if (enrolled.some((u) => String(u) === userKey)) {
        // eslint-disable-next-line no-await-in-loop
        await resolveEntry(entry, { notify: false });
        continue;
      }
      break;
    }

    roster.add(userKey);
    freeRemaining -= 1;
    // eslint-disable-next-line no-await-in-loop
    await resolveEntry(entry, { notify: true });
  }

  // M5 belt: the roster must never exceed the effective cap — abort the whole
  // seat-freeing transaction rather than persist an overfull session.
  const after = await repository.findScheduleEnrolledUsers(scheduleId, tx);
  if (after.length > cap) {
    throw new Error(`waitlist promotion overfilled schedule ${scheduleId} (> ${cap})`);
  }

  return promotions;
};

// ── Post-commit notification (fail-soft) ──────────────────
// One NotificationLog row per promotion — the unique tuple (type + recipient
// + cadenceKey `<scheduleId>:<userId>`) makes retries idempotent: a duplicate
// insert means "already notified", so the email is skipped, never doubled.
// Dual-backend (#256): every DB op flows through the dual repositories —
// schedule/class-label + user emails via schedule/repository, the log
// insert/status via the waitlist repository (Mongo E11000 ⇔ PG 23505→11000
// on the mig-032 unique index) — so the bell/email record lands in the ACTIVE
// backend, not always Mongo.
const notifyPromotions = async (scheduleId, promotions = []) => {
  if (!promotions.length) return;
  try {
    // Schedule + populated class label (also embeds the roster — unused here).
    const sched = await scheduleRepository.findScheduleForCancellation(scheduleId);
    if (!sched) return;
    const className = sched.classId
      ? `${sched.classId.classCode} — ${sched.classId.courseName}`
      : 'your class';

    const users = await scheduleRepository.findUsersForEmail(promotions.map((p) => p.userId));
    const byId = new Map(users.map((u) => [String(u._id), u]));

    for (const { userId } of promotions) {
      const user = byId.get(String(userId));
      let log;
      try {
        // eslint-disable-next-line no-await-in-loop
        log = await repository.insertPromotionLog({
          scheduleId, userId, recipientEmail: user?.email || '',
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
        await repository.setPromotionLogStatus(
          log._id,
          sent ? { status: 'sent', sentAt: new Date() } : { status: 'failed', error: 'send returned null' },
        );
      } else {
        // eslint-disable-next-line no-await-in-loop
        await repository.setPromotionLogStatus(log._id, { status: 'skipped', error: 'no email' });
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
