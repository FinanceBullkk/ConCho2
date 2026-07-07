/**
 * reminderService.js — Send "your class starts soon" emails.
 *
 * Strategy:
 *   - Called by the cron endpoint (or manually for testing).
 *   - Finds Schedules whose startTime falls inside a "lookahead" window
 *     starting from `now` (default 24h ahead).
 *   - For each enrolled user with an email, sends one reminder.
 *   - Records the reminder on Schedule.remindersSentAt so the next cron
 *     pass doesn't re-send. (Cron runs every hour but we want at most
 *     one reminder per schedule.)
 *
 * PERF-005 (audit PR F): old version was strictly sequential — claim
 * one schedule, send all its emails, repeat. With 100 schedules × 5
 * recipients each, that's 500 sequential SMTP round-trips per cron
 * tick — easily exceeded Render's 100s HTTP timeout for the pinger.
 * New version:
 *   1. Bulk-claims ALL candidates in a single atomic updateMany.
 *   2. Re-fetches the claimed set with populate.
 *   3. Runs per-schedule send-fan-outs in a bounded concurrency pool
 *      (REMINDER_CONCURRENCY env, default 8). Each send has a 5s
 *      Promise.race timeout so a single hung SMTP doesn't stall the batch.
 *   4. Tracks per-schedule failure; rolls back ONLY the schedules whose
 *      sends all failed.
 *
 * Idempotency:
 *   - The bulk updateMany sets remindersSentAt only on docs where it
 *     was still null, so a concurrent cron either claims a disjoint
 *     set or claims zero.
 */
// Dual-backend (Mongo ⇔ Postgres) — Phase 5 slice 4 (B7); the claim/stamp
// concurrency control rides the schedule repository (mig 034 on PG).
const scheduleRepo = require('../domains/schedule/repository');
const logger = require('../lib/logger');
const { sendScheduleReminder } = require('../lib/emailTemplates');

const DEFAULT_CONCURRENCY = Number(process.env.REMINDER_CONCURRENCY) || 8;
const PER_SEND_TIMEOUT_MS = Number(process.env.REMINDER_SEND_TIMEOUT_MS) || 5000;

// Race a send against a timeout so a hung SMTP doesn't stall the pool.
const withTimeout = (promise, ms) =>
  Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve(null), ms)),
  ]);

// Hand-rolled bounded-concurrency map. Avoids pulling in `p-limit`.
const mapWithConcurrency = async (items, concurrency, worker) => {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = new Array(Math.min(concurrency, items.length)).fill(null).map(async () => {
    while (cursor < items.length) {
      const idx = cursor++;
      try {
        results[idx] = await worker(items[idx], idx);
      } catch (err) {
        results[idx] = { __error: err };
      }
    }
  });
  await Promise.all(runners);
  return results;
};

/**
 * @param {Object} opts
 * @param {number} [opts.lookaheadHours=24]  Window in hours past `now`
 * @param {Date}   [opts.now=new Date()]     Override "now" for testing
 * @param {number} [opts.concurrency]        Override REMINDER_CONCURRENCY
 * @returns {Promise<{ scanned: number, notified: number, emailed: number, failed: number }>}
 */
const sendUpcomingReminders = async ({
  lookaheadHours = 24,
  now = new Date(),
  concurrency = DEFAULT_CONCURRENCY,
} = {}) => {
  const windowEnd = new Date(now.getTime() + lookaheadHours * 60 * 60 * 1000);

  // BUG #11 mitigation: if SMTP isn't configured, every send returns null
  // and we'd infinite-rollback the claim. Detect once up-front.
  const smtpConfigured = !!process.env.SMTP_HOST;

  // ── PHASE 1: BULK CLAIM ─────────────────────────────────────
  // One atomic updateMany sets remindersSentAt on every candidate.
  // Concurrent cron firings either claim a disjoint slice or claim
  // zero — never the same schedule twice.
  const claimStamp = new Date();
  await scheduleRepo.claimUpcomingReminders(now, windowEnd, claimStamp);

  // Re-fetch ONLY the schedules we just claimed (matched on claimStamp),
  // populated so the email template has user + class context.
  const claimed = await scheduleRepo.findClaimedForReminder(claimStamp);

  if (claimed.length === 0) {
    return { scanned: 0, notified: 0, emailed: 0, failed: 0 };
  }

  let notified = 0;
  let emailed = 0;
  let failed = 0;
  const rollbackIds = [];

  // ── PHASE 2: BOUNDED-CONCURRENCY FAN-OUT ────────────────────
  await mapWithConcurrency(claimed, concurrency, async (sched) => {
    const className = sched.classId
      ? `${sched.classId.classCode} — ${sched.classId.courseName}`
      : 'your class';
    const recipients = (sched.enrolledUsers || []).filter((u) => u && u.email);

    if (recipients.length === 0) {
      notified += 1; // claimed but no one to email — still counts as "handled"
      return;
    }

    // Send all recipients in parallel — but each send is wrapped in a 5s
    // timeout so a single hung SMTP can't stall the whole pool slot.
    const results = await Promise.all(
      recipients.map((u) =>
        withTimeout(
          sendScheduleReminder({
            to: u.email,
            userName: u.name,
            className,
            startTime: sched.startTime,
            roomLink: sched.roomLink,
          }),
          PER_SEND_TIMEOUT_MS,
        ),
      ),
    );

    const okCount = smtpConfigured
      ? results.filter((r) => r !== null).length
      : recipients.length;

    if (smtpConfigured && okCount === 0) {
      // Total failure on this schedule — queue for rollback.
      rollbackIds.push(sched._id);
      failed += 1;
      logger.warn(
        { scheduleId: sched._id.toString(), recipients: recipients.length },
        'All reminders failed — claim rolled back for retry',
      );
      return;
    }

    notified += 1;
    emailed += okCount;
  });

  // ── PHASE 3: ROLL BACK FAILURES IN ONE UPDATE ──────────────
  if (rollbackIds.length > 0) {
    await scheduleRepo.rollbackReminderClaim(rollbackIds);
  }

  logger.info(
    { scanned: claimed.length, notified, emailed, failed, concurrency },
    'Reminder batch complete',
  );

  return { scanned: claimed.length, notified, emailed, failed };
};

module.exports = { sendUpcomingReminders };
