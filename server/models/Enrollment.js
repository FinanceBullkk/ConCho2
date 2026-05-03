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
      required: [true, 'Team reference is required'],
    },
    classId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Class',
      default: null, // Team might not have a class when member joins
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
        values: ['Active', 'Completed', 'Dropped', 'Transferred'],
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

module.exports = mongoose.model('Enrollment', enrollmentSchema);
