const Certificate = require('../../../models/Certificate');
const LearningProgram = require('../../../models/LearningProgram');
const Assignment = require('../../../models/Assignment');
const logger = require('../../../lib/logger');

// ──────────────────────────────────────────────────────────
// Recertification auto-assignment (D6 — close the recert loop)
// ──────────────────────────────────────────────────────────
// Turns the certificate-expiry SIGNAL into an ACTION: for a program that opts
// in (recertifyPolicy.autoAssign), an Issued certificate nearing expiry
// auto-creates a recert Assignment (program target, the single learner, due at
// the certificate's validUntil). The new Assignment then rides the existing
// machinery — learner /home feed, reminder cadence, manager overdue digest.
//
// Idempotent: at most ONE recert assignment EVER per certificate (existence
// check incl. archived → an Admin who archives it is respected and it is NOT
// recreated; the partial unique index on sourceCertificateId is the race
// backstop). Opt-in, so programs without autoAssign are untouched.

const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_DAYS = 30;

const createRecertificationAssignments = async ({ now = new Date() } = {}) => {
  const summary = { scanned: 0, created: 0, skipped: 0 };
  const windowEnd = new Date(now.getTime() + WINDOW_DAYS * DAY_MS);

  const autoPrograms = await LearningProgram.find({ 'recertifyPolicy.autoAssign': true })
    .select('_id name').lean();
  if (!autoPrograms.length) return summary;

  const programIds = autoPrograms.map((p) => p._id);
  const nameById = new Map(autoPrograms.map((p) => [String(p._id), p.name]));

  const certs = await Certificate.find({
    status: 'Issued',
    isDeleted: false,
    programId: { $in: programIds },
    validUntil: { $ne: null, $gte: now, $lte: windowEnd },
  }).select('_id userId programId validUntil certificateNumber programName').lean();
  summary.scanned = certs.length;

  for (const cert of certs) {
    // eslint-disable-next-line no-await-in-loop -- idempotency check, bounded by cert count
    const exists = await Assignment.findOne({ sourceCertificateId: cert._id }).select('_id').lean();
    if (exists) { summary.skipped += 1; continue; }

    const programLabel = cert.programName || nameById.get(String(cert.programId)) || 'program';
    try {
      // eslint-disable-next-line no-await-in-loop
      await Assignment.create({
        title: `Recertify: ${programLabel}`,
        description: `Auto-created because certificate ${cert.certificateNumber} is nearing expiry.`,
        targetType: 'program',
        programId: cert.programId,
        userIds: [cert.userId],
        dueDate: cert.validUntil,
        createdBy: null,
        sourceCertificateId: cert._id,
        status: 'active',
      });
      summary.created += 1;
    } catch (error) {
      if (error && error.code === 11000) { summary.skipped += 1; continue; } // lost the race
      throw error;
    }
  }

  logger.info(summary, 'Recertification auto-assignment batch complete');
  return summary;
};

module.exports = { createRecertificationAssignments };
