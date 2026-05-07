const mongoose = require('mongoose');

// ──────────────────────────────────────────────────────────
// ReconcileReport — stores the output of each reconciliation run.
//
// Each document captures a point-in-time snapshot of data drift
// detected across: Schedule↔Attendance, Enrollment↔Team,
// future empty schedules, and unattached active participants.
//
// Retention: 30 days (TTL index). We keep enough history to
// compare runs without growing unbounded. Admin can also
// trigger a fresh run at any time via POST /api/admin/reconcile/run.
// ──────────────────────────────────────────────────────────

const issueSchema = new mongoose.Schema(
  {
    // Which check raised this issue
    check: {
      type: String,
      enum: [
        'missing_attendance',    // Past schedule with incomplete attendance
        'orphaned_enrollment',   // Active enrollment but user not in team.members
        'ghost_member',          // User in team.members but no Active enrollment
        'empty_future_schedule', // Future schedule with 0 enrolled users
        'unattached_participant',// Active Participant with no Active enrollment
      ],
      required: true,
    },
    // Human-readable description of the specific issue
    description: { type: String, required: true },
    // Relevant entity IDs for quick lookup / drill-down
    refs: {
      userId:     { type: mongoose.Schema.Types.ObjectId, default: null },
      teamId:     { type: mongoose.Schema.Types.ObjectId, default: null },
      classId:    { type: mongoose.Schema.Types.ObjectId, default: null },
      scheduleId: { type: mongoose.Schema.Types.ObjectId, default: null },
      enrollmentId: { type: mongoose.Schema.Types.ObjectId, default: null },
    },
    // Extra detail (e.g. "3 of 8 users missing attendance")
    detail: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { _id: false }
);

const reconcileReportSchema = new mongoose.Schema(
  {
    // When this run started
    runAt: { type: Date, required: true, default: () => new Date() },
    // How long the full run took in milliseconds
    durationMs: { type: Number, default: 0 },
    // 'scheduled' (cron) or 'manual' (admin triggered via API)
    triggeredBy: {
      type: String,
      enum: ['scheduled', 'manual'],
      default: 'manual',
    },
    // Flat list of all detected issues
    issues: [issueSchema],
    // Counts by check type for quick dashboard display
    summary: {
      missing_attendance:     { type: Number, default: 0 },
      orphaned_enrollment:    { type: Number, default: 0 },
      ghost_member:           { type: Number, default: 0 },
      empty_future_schedule:  { type: Number, default: 0 },
      unattached_participant: { type: Number, default: 0 },
      total:                  { type: Number, default: 0 },
    },
    // 'ok' when no issues found, 'issues' otherwise
    status: {
      type: String,
      enum: ['ok', 'issues'],
      default: 'ok',
    },
  },
  {
    timestamps: { createdAt: 'runAt', updatedAt: false },
    versionKey: false,
  }
);

// TTL: auto-purge reports older than 30 days
reconcileReportSchema.index({ runAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

module.exports = mongoose.model('ReconcileReport', reconcileReportSchema);
