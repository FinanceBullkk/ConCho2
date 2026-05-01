const mongoose = require('mongoose');

// ──────────────────────────────────────────────────────────
// Schedule Model (v2 — Leader-Created Sessions)
// ──────────────────────────────────────────────────────────
// Represents a single class session created by a Team Leader.
//
// NEW FLOW:
//   Team Leader clicks an empty time slot on the timetable →
//   system CREATES a new Schedule doc with startTime/endTime.
//
// BUSINESS RULES:
//   1. Each time slot allows exactly 1 schedule (collision check).
//   2. Each team can create max 2 sessions per Mon–Sun week.
//   3. Cancelling a booking DELETES the Schedule document.
//
// enrolledUsers is maintained as a flattened member list
// for attendance purposes.
// ──────────────────────────────────────────────────────────

const scheduleSchema = new mongoose.Schema(
  {
    classId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Class',
      required: [true, 'Class reference is required'],
    },

    // The team that created/owns this session
    bookedTeamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Team',
      required: [true, 'Team reference is required'],
    },

    // ── Time range ─────────────────────────────────────────
    startTime: {
      type: Date,
      required: [true, 'Start time is required'],
    },
    endTime: {
      type: Date,
      required: [true, 'End time is required'],
    },

    roomLink: {
      type: String,
      trim: true,
      default: '',
    },

    capacity: {
      type: Number,
      min: [1, 'Capacity must be at least 1'],
      default: 9,
    },

    // Flattened member list (for attendance / roster views)
    enrolledUsers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],

    enrolledCount: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ── Virtuals ──────────────────────────────────────────────
scheduleSchema.virtual('availableSpots').get(function () {
  return this.capacity - this.enrolledCount;
});

// ── Indexes ───────────────────────────────────────────────
scheduleSchema.index({ classId: 1, startTime: 1, endTime: 1 }, { unique: true }); // Same class can't have 2 sessions at same time
scheduleSchema.index({ bookedTeamId: 1, startTime: 1 });               // Weekly count queries
scheduleSchema.index({ classId: 1, startTime: 1 });
scheduleSchema.index({ enrolledUsers: 1 });

module.exports = mongoose.model('Schedule', scheduleSchema);
