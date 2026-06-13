const Certificate = require('../../../models/Certificate');
const NotificationLog = require('../../../models/NotificationLog');
const logger = require('../../../lib/logger');
const { sendCertificateExpiring } = require('../../../lib/emailTemplates');

// ──────────────────────────────────────────────────────────
// Certificate expiry reminders (D6 recertification signal)
// ──────────────────────────────────────────────────────────
// Cron-driven scan that warns a learner before an Issued certificate lapses.
// Mirrors the assignment-reminder service: a `NotificationLog` row (channel
// `email`) is the idempotency ledger AND the in-app bell item (the bell reads
// every non-pending row), so a learner sees the notice in-app even with no email.
//
// Idempotent via cadenceKey = `<certificateNumber>:<bucket>`:
//   expiry_30 — 8–30 days out (heads-up)    expiry_7 — 0–7 days out (imminent)
// Each cert sends at most one of each bucket over its lifetime.
// ──────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_DAYS = 30;

// Whole days from `now` until `validUntil` (floor — 5.6 days → 5).
const daysUntil = (now, validUntil) =>
  Math.floor((new Date(validUntil).getTime() - now.getTime()) / DAY_MS);

const bucketFor = (d) => (d <= 7 ? 'expiry_7' : 'expiry_30');

const createLog = async (data) => {
  try {
    return await NotificationLog.create(data);
  } catch (error) {
    if (error && error.code === 11000) return null; // this bucket already sent
    throw error;
  }
};

const finishLog = (id, patch) =>
  NotificationLog.updateOne(
    { _id: id },
    { $set: patch.status === 'sent' ? { ...patch, sentAt: new Date() } : patch },
  );

const sendCertificateExpiryReminders = async ({ now = new Date() } = {}) => {
  const summary = { scanned: 0, sent: 0, skipped: 0, failed: 0, duplicates: 0 };
  const windowEnd = new Date(now.getTime() + WINDOW_DAYS * DAY_MS);

  // Index-served: { status, validUntil, isDeleted }. Only future-but-soon certs.
  const certs = await Certificate.find({
    status: 'Issued',
    isDeleted: false,
    validUntil: { $ne: null, $gte: now, $lte: windowEnd },
  })
    .populate('userId', 'name email')
    .lean();
  summary.scanned = certs.length;

  for (const cert of certs) {
    const learner = cert.userId; // populated
    if (!learner) { summary.skipped += 1; continue; }
    const d = daysUntil(now, cert.validUntil);
    const bucket = bucketFor(d);

    // eslint-disable-next-line no-await-in-loop -- idempotent, bounded by expiring-cert count
    const log = await createLog({
      type: 'certificate_expiring',
      channel: 'email',
      recipientEmail: learner.email || '',
      recipientUserId: learner._id,
      learnerId: learner._id,
      cadenceKey: `${cert.certificateNumber}:${bucket}`,
      status: learner.email ? 'pending' : 'skipped',
      error: learner.email ? '' : 'recipient email missing',
      metadata: {
        certificateNumber: cert.certificateNumber,
        programName: cert.programName,
        cohortCode: cert.cohortCode,
        validUntil: cert.validUntil,
        daysUntil: d,
      },
    });
    if (!log) { summary.duplicates += 1; continue; }
    if (!learner.email) { summary.skipped += 1; continue; } // logged + bell-visible

    // eslint-disable-next-line no-await-in-loop
    const result = await sendCertificateExpiring({
      to: learner.email,
      userName: learner.name,
      programName: cert.programName || 'your program',
      certificateNumber: cert.certificateNumber,
      validUntil: cert.validUntil,
      daysUntil: d,
    });

    // eslint-disable-next-line no-await-in-loop
    if (result) {
      await finishLog(log._id, { status: 'sent', error: '' });
      summary.sent += 1;
    } else {
      await finishLog(log._id, { status: 'failed', error: 'email not sent' });
      summary.failed += 1;
    }
  }

  logger.info(summary, 'Certificate expiry reminder batch complete');
  return summary;
};

module.exports = { sendCertificateExpiryReminders };
