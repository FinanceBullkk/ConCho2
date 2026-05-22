const mongoose = require('mongoose');

// ──────────────────────────────────────────────────────────
// Attendance Model
// ──────────────────────────────────────────────────────────
// Status values:
//   P  = Present
//   A  = Absent
//   L  = Late        (stored; v1.0 UI exposes P/A only — L backlogged)
//   EL = Excused Leave  (stored; v1.0 UI exposes P/A only — EL backlogged)
//
// Compound unique index on { scheduleId, userId } prevents
// duplicate attendance records for the same user in the
// same session.
// ──────────────────────────────────────────────────────────

const attendanceSchema = new mongoose.Schema(
  {
    scheduleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Schedule',
      required: [true, 'Schedule reference is required'],
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User reference is required'],
    },
    status: {
      type: String,
      enum: {
        values: ['P', 'A', 'L', 'EL'],
        message: '{VALUE} is not a valid attendance status. Use P, A, L, or EL.',
      },
      required: [true, 'Attendance status is required'],
    },
    remark: {
      type: String,
      trim: true,
      default: '',
    },
    photoUrl: {
      type: String,
      trim: true,
      default: '',
    },

    // ── Export tracking (chống trùng lặp khi xuất HR) ─────
    syncStatus: {
      type: String,
      enum: {
        // PENDING   → not yet exported
        // EXPORTING → claimed by an in-flight export (P2-08: prevents race)
        // EXPORTED  → included in a completed export file
        values: ['PENDING', 'EXPORTING', 'EXPORTED'],
        message: '{VALUE} is not a valid sync status',
      },
      default: 'PENDING',
    },
    // Set when status moves to EXPORTING so each export job owns its records.
    exportBatchId: {
      type: String,
      default: null,
    },
    exportedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// ── Compound unique index: one record per user per session ─
attendanceSchema.index({ scheduleId: 1, userId: 1 }, { unique: true });

// ── Additional query indexes ──────────────────────────────
attendanceSchema.index({ userId: 1, createdAt: -1 });   // User history queries (profile page timeline)
// Covers dashboard aggregate: $match {userId:{$in:userIds}, status:{$in:['P','L']}}
// Used in getUsers lastActive enrichment — more selective than userId+createdAt alone.
attendanceSchema.index({ userId: 1, status: 1 });
// Covered index for dashboard distinct query: distinct('userId', {createdAt:{$gte:30daysAgo}})
// Leading on createdAt so the date range scan is index-only (no doc fetch needed).
attendanceSchema.index({ createdAt: 1, userId: 1 });
attendanceSchema.index({ syncStatus: 1, createdAt: 1 });  // Export queries

module.exports = mongoose.model('Attendance', attendanceSchema);
