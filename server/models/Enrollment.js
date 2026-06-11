const mongoose = require('mongoose');

// ──────────────────────────────────────────────────────────
// Enrollment Model — Learning History Tracker
// ──────────────────────────────────────────────────────────
// Each record represents a participant's membership period
// in a specific team. When they transfer, the old record is
// closed (status → Transferred) and a new one is created.
//
// This provides a complete audit trail:
//   Who → was in which team → studying which course → when
// ──────────────────────────────────────────────────────────

const enrollmentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User reference is required'],
    },
    teamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Team',
      default: null, // null = cohort-based (L&D) enrollment, enrolled directly into a cohort
    },
    classId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Class',
      default: null, // Team might not have a class when member joins; required for cohort-based enrollment
    },
    joinedAt: {
      type: Date,
      required: true,
      default: () => new Date(),
    },
    leftAt: {
      type: Date,
      default: null, // null = still active
    },
    status: {
      type: String,
      enum: {
        values: ['Active', 'On-hold', 'Completed', 'Dropped', 'Transferred'],
        message: '{VALUE} is not a valid enrollment status',
      },
      default: 'Active',
    },
    transferredTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Team',
      default: null, // Set when status = 'Transferred'
    },
    note: {
      type: String,
      trim: true,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

// ── Indexes ───────────────────────────────────────────────
enrollmentSchema.index({ userId: 1, status: 1 });    // Find active enrollment for a user
enrollmentSchema.index({ teamId: 1, status: 1 });    // List enrollments for a team
enrollmentSchema.index({ userId: 1, joinedAt: -1 }); // User timeline
enrollmentSchema.index({ classId: 1 });               // Course-based queries

// DI-05: Prevent duplicate Active enrollments for same user+team.
// Scoped to records with a real teamId ($type objectId) so cohort-based
// enrollments (teamId = null) are excluded — otherwise multiple null-team
// cohort enrollments for one user would collide on { userId, null }.
enrollmentSchema.index(
  { userId: 1, teamId: 1 },
  { unique: true, partialFilterExpression: { status: 'Active', teamId: { $type: 'objectId' } } }
);

// DI-05b: Race-proof duplicate guard for cohort-based (teamId null) enrollments.
// The use-case findActiveCohortEnrollment check is the friendly fast path; this
// partial unique index is the concurrency backstop — two parallel enrolls can
// both pass the app-level check, but only one can win the index. $type:'null'
// (BSON type 10) scopes the index to cohort enrollments, mirroring the team
// index above ($type:'objectId') so the two never overlap.
enrollmentSchema.index(
  { userId: 1, classId: 1 },
  { unique: true, partialFilterExpression: { status: 'Active', teamId: { $type: 'null' } } }
);

module.exports = mongoose.model('Enrollment', enrollmentSchema);
