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
 * Idempotency:
 *   - The atomic findOneAndUpdate sets remindersSentAt only if it was
 *     unset, guaranteeing exactly one set of emails per schedule even
 *     if the cron fires concurrently.
 */
const Schedule = require('../models/Schedule');
const logger = require('../lib/logger');
const { sendScheduleReminder } = require('../lib/emailTemplates');

/**
 * @param {Object} opts
 * @param {number} [opts.lookaheadHours=24]  Window in hours past `now`
 * @param {Date}   [opts.now=new Date()]     Override "now" for testing
 * @returns {Promise<{ scanned: number, notified: number, emailed: number }>}
 */
const sendUpcomingReminders = async ({
  lookaheadHours = 24,
  now = new Date(),
} = {}) => {
  const windowEnd = new Date(now.getTime() + lookaheadHours * 60 * 60 * 1000);

  // Find schedules:
  //   - starting between now and windowEnd (future, not past)
  //   - not yet reminded
  const candidates = await Schedule.find({
    startTime: { $gte: now, $lte: windowEnd },
    $or: [{ remindersSentAt: { $exists: false } }, { remindersSentAt: null }],
  })
    .populate('classId', 'classCode courseName')
    .populate('enrolledUsers', 'name email');

  // BUG #11 fix: if SMTP isn't configured, every send returns null and
  // we'd infinite-rollback the claim. Detect once up-front: when SMTP is
  // missing, behave as before (mark claimed regardless) so dev/test
  // environments don't accumulate retries.
  const smtpConfigured = !!process.env.SMTP_HOST;

  let notified = 0;
  let emailed = 0;
  let failed = 0;

  for (const sched of candidates) {
    // Atomically claim this schedule — only proceed if remindersSentAt
    // is still unset (concurrent cron protection).
    const claimed = await Schedule.findOneAndUpdate(
      { _id: sched._id, $or: [{ remindersSentAt: { $exists: false } }, { remindersSentAt: null }] },
      { $set: { remindersSentAt: new Date() } },
      { new: true },
    );
    if (!claimed) continue;

    const className = sched.classId
      ? `${sched.classId.classCode} — ${sched.classId.courseName}`
      : 'your class';

    const recipients = (sched.enrolledUsers || []).filter(u => u && u.email);

    // Await every send so we can detect a total-failure scenario and roll
    // back the claim. Without this, a transient SMTP outage during the
    // cron tick would silently mark schedules "reminded" and the next
    // pass would skip them — users miss their reminder permanently.
    const results = await Promise.all(recipients.map((u) =>
      sendScheduleReminder({
        to: u.email,
        userName: u.name,
        className,
        startTime: sched.startTime,
        roomLink: sched.roomLink,
      }),
    ));

    // sendScheduleReminder is fail-soft and returns null on send failure
    // OR when SMTP is not configured. Only treat null as a failure if
    // SMTP *is* configured (otherwise we'd infinite-retry in no-SMTP envs).
    const okCount = smtpConfigured
      ? results.filter((r) => r !== null).length
      : recipients.length;

    if (smtpConfigured && recipients.length > 0 && okCount === 0) {
      // Total failure — roll back the claim so the next cron pass retries.
      await Schedule.findByIdAndUpdate(sched._id, { $set: { remindersSentAt: null } });
      failed += 1;
      logger.warn(
        { scheduleId: sched._id.toString(), recipients: recipients.length },
        'All reminders failed — claim rolled back for retry',
      );
      continue;
    }

    notified += 1;
    emailed += okCount;
    logger.info(
      { scheduleId: sched._id.toString(), recipients: recipients.length, ok: okCount },
      'Reminder dispatched',
    );
  }

  return { scanned: candidates.length, notified, emailed, failed };
};

module.exports = { sendUpcomingReminders };
