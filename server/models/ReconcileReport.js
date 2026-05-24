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
        // ── Original 5 checks ───────────────────────────────
        'missing_attendance',    // Past schedule with incomplete attendance
        'orphaned_enrollment',   // Active enrollment but user not in team.members
        'ghost_member',          // User in team.members but no Active enrollment
        'empty_future_schedule', // Future schedule with 0 enrolled users
        'unattached_participant',// Active Participant with no Active enrollment

        // ── Audit PR C (DATA-011) — 5 new HIGH/MED checks ───
        // duplicate_active_enrollment: same user has ≥2 Active enrollments
        // (violates invariant #2; DATA-001 partial unique was deferred,
        // so reconcile is the safety net).
        'duplicate_active_enrollment',
        // orphan_schedule_class: Schedule.classId points to a Class doc
        // that no longer exists (Class hard-delete in classController did
        // delete attendance/enrollments but Schedule references can still
        // dangle until PR 6's cancelSlot-past-guard takes effect; this
        // checks for any remaining orphans).
        'orphan_schedule_class',
        // multi_team_class: two non-deleted teams claim the same classId
        // (violates invariant #14; DATA-003 partial unique was deferred).
        'multi_team_class',
        // counter_drift: Counter.seq is less than max(numeric portion of
        // empCode|classCode in the DB) — indicates the counter was reset
        // (e.g. admin restored an old DB dump) and next-create will
        // produce a duplicate code.
        'counter_drift',
        // soft_deleted_in_team_members: Team.members contains a userId
        // whose User document is isDeleted:true — populated members show
        // as null in the UI and analytics get noisy.
        'soft_deleted_in_team_members',
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
      // Audit PR C (DATA-011) — counters for the new checks.
      duplicate_active_enrollment:    { type: Number, default: 0 },
      orphan_schedule_class:          { type: Number, default: 0 },
      multi_team_class:               { type: Number, default: 0 },
      counter_drift:                  { type: Number, default: 0 },
      soft_deleted_in_team_members:   { type: Number, default: 0 },
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
