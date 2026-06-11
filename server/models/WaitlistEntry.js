const mongoose = require('mongoose');

// ──────────────────────────────────────────────────────────
// WaitlistEntry Model (Wave E3 phase-04, slice B)
// ──────────────────────────────────────────────────────────
// A per-session FIFO queue row. A learner may join a session's waitlist ONLY
// when the session is at its effective capacity (owner decision 2026-06-11:
// free seats → 409, never instant-seat). Lifecycle is status-based — rows are
// NEVER hard-deleted (history):
//   waiting   — in the queue (FIFO by createdAt)
//   promoted  — a freed seat auto-enrolled this user (promotedAt stamped)
//   withdrawn — the user left the queue themselves
//   cancelled — the session was cancelled/removed; queue dissolved
//
// CONCURRENCY:
//   - The partial-unique {scheduleId,userId} where status:'waiting' index is
//     the DB-final double-join guard (two concurrent joins → one E11000).
//   - Promotion is performed INSIDE the seat-freeing transaction
//     (domains/schedule/waitlist/promotion.js) — never post-commit.

const waitlistEntrySchema = new mongoose.Schema(
  {
    scheduleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Schedule',
      required: true,
    },
    // Denormalised from the Schedule for cheap class-scoped queries/reports.
    classId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Class',
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    status: {
      type: String,
      enum: ['waiting', 'promoted', 'withdrawn', 'cancelled'],
      default: 'waiting',
    },
    promotedAt: {
      type: Date,
      default: null,
    },
    // Who created the entry (self-join today; kept for a future admin-join).
    joinedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true },
);

// DB-final double-join guard: one LIVE queue row per (session, user).
waitlistEntrySchema.index(
  { scheduleId: 1, userId: 1 },
  { unique: true, partialFilterExpression: { status: 'waiting' } },
);

// FIFO scan: promotion reads waiting rows oldest-first per session.
waitlistEntrySchema.index({ scheduleId: 1, status: 1, createdAt: 1 });

module.exports = mongoose.model('WaitlistEntry', waitlistEntrySchema);
