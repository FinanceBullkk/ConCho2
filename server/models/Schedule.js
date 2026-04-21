const mongoose = require('mongoose');

// ──────────────────────────────────────────────────────────
// Schedule Model
// ──────────────────────────────────────────────────────────
// Represents a single class session / time slot.
//
// BOOKING RULES (updated):
//   1. Each slot allows exactly 1 team (bookedTeamId).
//   2. Each team can book max 2 slots per calendar week.
//   3. bookedTeamId = null → slot is available.
//      bookedTeamId = ObjectId → slot is taken.
//
// enrolledUsers is still maintained as a flattened member
// list for attendance purposes.
// ──────────────────────────────────────────────────────────

const scheduleSchema = new mongoose.Schema(
  {
    classId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Class',
      required: [true, 'Class reference is required'],
    },
    date: {
      type: Date,
      required: [true, 'Date is required'],
    },
    timeSlot: {
      type: String,
      required: [true, 'Time slot is required'],
      trim: true,
      // e.g. "09:00-10:00", "14:00-15:00"
    },
    teacherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Teacher is required'],
    },
    roomLink: {
      type: String,
      trim: true,
      default: '',
    },
    capacity: {
      type: Number,
      required: [true, 'Capacity is required'],
      min: [1, 'Capacity must be at least 1'],
      default: 9,           // Default: 1 team of max 9 members
    },

    // ── Booking fields ──────────────────────────────────
    // The single team that has booked this slot (null = available)
    bookedTeamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Team',
      default: null,
    },

    // Flattened member list (for attendance / roster views)
    enrolledUsers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],

    // Legacy fields kept for backward compatibility
    enrolledTeams: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Team',
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
scheduleSchema.virtual('isBooked').get(function () {
  return this.bookedTeamId != null;
});

scheduleSchema.virtual('availableSpots').get(function () {
  return this.capacity - this.enrolledCount;
});

// ── Indexes ───────────────────────────────────────────────
scheduleSchema.index({ classId: 1, date: 1 });
scheduleSchema.index({ date: 1 });
scheduleSchema.index({ teacherId: 1, date: 1 });
scheduleSchema.index({ bookedTeamId: 1, date: 1 });  // Weekly count query
scheduleSchema.index({ enrolledUsers: 1 });

module.exports = mongoose.model('Schedule', scheduleSchema);

