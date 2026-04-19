const mongoose = require('mongoose');

// ──────────────────────────────────────────────────────────
// Attendance Model
// ──────────────────────────────────────────────────────────
// Status values:
//   P  = Present
//   A  = Absent
//   L  = Late
//   EL = Excused Leave
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
  },
  {
    timestamps: true,
  }
);

// ── Compound unique index: one record per user per session ─
attendanceSchema.index({ scheduleId: 1, userId: 1 }, { unique: true });

// ── Additional query indexes ──────────────────────────────
attendanceSchema.index({ userId: 1 });

module.exports = mongoose.model('Attendance', attendanceSchema);
