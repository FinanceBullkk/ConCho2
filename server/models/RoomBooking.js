const mongoose = require('mongoose');

// ──────────────────────────────────────────────────────────
// RoomBooking — the per-room conflict-lock ledger
// (re-center Phase 3 / Wave E3 D5).
//
// One row per (room, time-slot) claim. The unique {roomId,startTime}
// index is the DB-FINAL guard against two different sessions claiming the
// same physical room at the same slot — app-level checks can race; the
// unique index cannot. `Schedule.roomId` is written ATOMICALLY with the
// ledger row (same transaction) so the two never drift.
//
// HARD-DELETE by design (NOT soft-delete): a soft-deleted ledger row would
// keep the unique key occupied and permanently brick the slot. Every
// Schedule-removal path (cancel / delete / auto-release / team-sync) must
// drop the matching ledger row via releaseRoomLock so the slot frees up.
// A reconcile orphan-sweep deletes rows whose scheduleId no longer resolves.
// ──────────────────────────────────────────────────────────

const roomBookingSchema = new mongoose.Schema(
  {
    roomId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Room',
      required: true,
    },
    scheduleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Schedule',
      required: true,
    },
    classId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Class',
      required: true,
    },
    startTime: { type: Date, required: true },
  },
  { timestamps: true }
);

// THE lock: at most one claim per room per slot. E11000 on a duplicate is
// caught at the booking chokepoint and converted to a 409 "room taken".
roomBookingSchema.index({ roomId: 1, startTime: 1 }, { unique: true });
// Reverse lookup for release/orphan-sweep (delete all rows for a schedule).
roomBookingSchema.index({ scheduleId: 1 });

module.exports = mongoose.model('RoomBooking', roomBookingSchema);
