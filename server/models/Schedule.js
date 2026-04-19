const mongoose = require('mongoose');

// ──────────────────────────────────────────────────────────
// Schedule Model
// ──────────────────────────────────────────────────────────
// Represents a single class session / time slot.
// Enrollments are team-based: enrolledTeams tracks which
// teams booked this slot; enrolledUsers is the flattened
// list of individual members for attendance purposes.
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
      // e.g. "09:00-10:30", "14:00-15:30"
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
    },
    enrolledCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    enrolledTeams: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Team',
      },
    ],
    enrolledUsers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ── Virtual: available spots ──────────────────────────────
scheduleSchema.virtual('availableSpots').get(function () {
  return this.capacity - this.enrolledCount;
});

// ── Pre-save: prevent overbooking ─────────────────────────
scheduleSchema.pre('save', function (next) {
  if (this.enrolledCount > this.capacity) {
    const err = new Error(
      `Enrolled count (${this.enrolledCount}) cannot exceed capacity (${this.capacity})`
    );
    err.statusCode = 400;
    return next(err);
  }
  next();
});

// ── Indexes ───────────────────────────────────────────────
// Query patterns: find by class, find by date range, find by teacher
scheduleSchema.index({ classId: 1, date: 1 });
scheduleSchema.index({ date: 1 });
scheduleSchema.index({ teacherId: 1, date: 1 });
scheduleSchema.index({ enrolledTeams: 1 });
scheduleSchema.index({ enrolledUsers: 1 });

module.exports = mongoose.model('Schedule', scheduleSchema);
