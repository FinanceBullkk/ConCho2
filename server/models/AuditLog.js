const mongoose = require('mongoose');

// ──────────────────────────────────────────────────────────
// AuditLog (Phase 1.1)
// ──────────────────────────────────────────────────────────
// Append-only record of who changed what. Written async by
// auditService so the hot path is not slowed by audit I/O.
//
// Retention: 2 years (TTL index on createdAt). Tunable via
// AUDIT_RETENTION_DAYS env. The corporate retention norm is
// 1-3 years; longer than that and storage cost spirals.
//
// Indexes are tuned for the two query patterns that matter:
//   - "Show me everything that happened to entity X" (entity, entityId, createdAt)
//   - "Show me everything user Y did" (actorId, createdAt)
// ──────────────────────────────────────────────────────────

const RETENTION_DAYS = Number(process.env.AUDIT_RETENTION_DAYS || 730);

const auditLogSchema = new mongoose.Schema(
  {
    // Who acted. Nullable so system jobs (cron, migrations) can write
    // audit lines too with actorId=null + actorRole='System'.
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    actorRole: {
      type: String,
      enum: ['Admin', 'Teacher', 'Participant', 'System'],
      required: true,
    },
    actorEmpCode: {
      type: String,
      default: null,
    },

    // What happened. `action` is a free-form verb in past tense:
    // 'created' | 'updated' | 'deleted' | 'soft-deleted' | 'restored' |
    // 'logged-in' | 'logged-out' | 'force-logged-out' | 'password-changed' |
    // 'imported' | 'exported' | 'erased' | etc.
    action: {
      type: String,
      required: true,
      index: true,
    },

    // Which entity changed.
    entity: {
      type: String,
      enum: ['User', 'Team', 'Class', 'Schedule', 'Attendance', 'Evaluation',
             'Enrollment', 'Setting', 'Auth', 'Import', 'Export'],
      required: true,
    },
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },

    // Optional snapshot of the changed fields. Stored as Mixed so we can
    // capture any shape; the auditService.diff() helper produces the
    // {before, after} skeleton with passwords + tokens redacted.
    diff: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    // Request context — invaluable when correlating audit entries with
    // server logs and Sentry events.
    requestId: { type: String, default: null },
    ip: { type: String, default: null },
    userAgent: { type: String, default: null },

    // Free-form note set by the caller. e.g. 'Bulk import of 312 users'.
    note: { type: String, default: null },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    // Disable __v to keep documents tight.
    versionKey: false,
  }
);

// TTL index — Mongo automatically deletes documents older than this.
auditLogSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: RETENTION_DAYS * 24 * 60 * 60 }
);

// Hot query path: "everything that happened to this entity, newest first".
auditLogSchema.index({ entity: 1, entityId: 1, createdAt: -1 });

// Secondary query path: "everything this actor did".
auditLogSchema.index({ actorId: 1, createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
