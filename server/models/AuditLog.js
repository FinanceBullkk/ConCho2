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
    // NOTE: no inline index:true here — the compound {actorId:1, createdAt:-1}
    // schema-level index below is a superset and covers all actorId-only queries.
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    actorRole: {
      type: String,
      enum: ['Admin', 'Coordinator', 'Teacher', 'Participant', 'System'],
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
      enum: ['User', 'Team', 'Class', 'LearningProgram', 'Schedule', 'Attendance', 'Evaluation',
             'Enrollment', 'Setting', 'Auth', 'Import', 'Export', 'Report',
             // Added in audit PR 3 — adminDb writes audit lines for Counter
             // mutations and any future collection we whitelist for direct
             // admin editing. Adding entries here is a one-way ratchet:
             // never remove a value or downstream queries will reject.
             'Counter', 'AdminDb',
             // Added in audit PR L (SEC-013) — sheets-sync run + reconcile run
             // produce their own audit lines so reviewers can reconstruct
             // operator activity without grepping pino logs.
             'Sync', 'Reconcile',
             // Added in re-center Phase 1 — these entities were ALREADY being
             // audited by their controllers, but the enum lagged behind, so
             // every such write failed schema validation SILENTLY (audit is
             // fire-and-forget). Backfilled here + 'Office' for the new model.
             'Department', 'Office', 'Certificate', 'Assessment',
             'AssessmentAttempt', 'AssessmentQuestion', 'Feedback',
             'Assignment', 'LearningPath',
             // Added in re-center Phase 3 — Office-scoped Rooms.
             'Room',
             // Added in Wave E3 phase-04 slice B — session waitlists.
             'WaitlistEntry'],
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

    // ── Tamper-evident hash chain (Investment Build Plan #3a) ──────────────
    // Each row links to the previous one by hash so the log is verifiable:
    // re-deriving the chain proves no row was silently altered, reordered or
    // deleted. Writes are serialized through auditService so seq + prevHash
    // stay consistent (see services/audit-chain.js).
    //
    // `seq` has NO default on purpose: pre-migration rows leave it ABSENT, so
    // the partial-unique index below ignores them and only enforces uniqueness
    // on chained rows. The backfill script assigns seq to legacy rows.
    seq: { type: Number },                       // monotonic chain position (1-based)
    prevHash: { type: String, default: null },   // hash of the prior entry (genesis seed for row 1)
    hash: { type: String, default: null },       // sha256 of this entry's content + prevHash
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

// Hash chain: seq is the chain position. Unique so a serialization bug or a
// second writer can never fork the chain by reusing a seq — the DB is the final
// guard. PARTIAL so the index only covers chained rows; pre-migration rows have
// no seq field and are excluded (a non-partial unique index would reject their
// shared "missing" key). Also the read path for verify (scan a seq window).
auditLogSchema.index(
  { seq: 1 },
  { unique: true, partialFilterExpression: { seq: { $exists: true } } }
);

module.exports = mongoose.model('AuditLog', auditLogSchema);
