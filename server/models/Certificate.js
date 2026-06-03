const mongoose = require('mongoose');

// ──────────────────────────────────────────────────────────
// Certificate Model (Wave B — completion & certification)
// ──────────────────────────────────────────────────────────
// An immutable record that a learner completed a cohort under its program's
// completionPolicy. Issued by an Admin once the completion check passes; the
// evidence is snapshotted onto the certificate so it stays true even if the
// cohort/program/attendance later change.
//
// Lifecycle: Issued → (optionally) Revoked. We never hard-delete — revocation
// is a status change, and isDeleted is reserved for the soft-delete/trash flow.
// A public verification endpoint resolves a certificate by its verificationCode.
// ──────────────────────────────────────────────────────────

const certificateSchema = new mongoose.Schema(
  {
    // Human-facing serial, e.g. CERT-2026-000001 (atomic Counter sequence).
    certificateNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    // Opaque token used by the public verification endpoint (not the serial,
    // so the serial can be printed without exposing the lookup key).
    verificationCode: {
      type: String,
      required: true,
      unique: true,
    },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User reference is required'],
      index: true,
    },
    cohortId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Class',
      required: [true, 'Cohort reference is required'],
      index: true,
    },
    programId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LearningProgram',
      default: null,
    },

    // ── Snapshot (frozen at issue — certificates are immutable evidence) ──
    learnerName: { type: String, default: '' },
    programName: { type: String, default: '' },
    cohortCode: { type: String, default: '' },

    completionSnapshot: {
      attendancePercent: { type: Number, default: 0 },
      attendanceThresholdPercent: { type: Number, default: 0 },
      assessmentRequired: { type: Boolean, default: false },
      assessmentMet: { type: Boolean, default: false },
      averageScore: { type: Number, default: null },
      feedbackRequired: { type: Boolean, default: false },
      feedbackMet: { type: Boolean, default: false },
    },

    issuedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    issuedAt: {
      type: Date,
      default: () => new Date(),
    },

    status: {
      type: String,
      enum: {
        values: ['Issued', 'Revoked'],
        message: '{VALUE} is not a valid certificate status',
      },
      default: 'Issued',
    },
    revokedAt: { type: Date, default: null },
    revokedReason: { type: String, trim: true, default: '' },

    // Soft delete (trash) — distinct from Revoked, which is a lifecycle status.
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// One active (non-deleted, Issued) certificate per learner per cohort. Enforced
// in the use-case (findActiveCertificate); this index speeds those lookups and
// the per-learner / per-cohort listings.
certificateSchema.index({ userId: 1, cohortId: 1, status: 1 });

module.exports = mongoose.model('Certificate', certificateSchema);
