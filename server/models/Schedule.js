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

    // ── Google Calendar integration ────────────────────────
    // Set when calendarService successfully creates an event for this
    // schedule. Used to update/delete the Calendar event when the
    // schedule is changed or cancelled. Null when:
    //   - Calendar integration is not configured (env vars missing), or
    //   - Calendar API call failed (we fail-soft so booking still succeeds).
    googleEventId: {
      type: String,
      default: null,
    },

    // Optional Google Meet link auto-created by Calendar API. If present,
    // the frontend should display this in place of the manual roomLink.
    meetLink: {
      type: String,
      default: '',
    },

    // Set by reminderService when the "starts soon" email batch is sent.
    // Null/missing = not yet reminded. The reminder cron uses an atomic
    // findOneAndUpdate gated on this field, so each schedule is reminded
    // at most once even if the cron fires concurrently.
    remindersSentAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ── Virtuals ──────────────────────────────────────────────
// enrolledCount is derived from the actual array — never drifts.
scheduleSchema.virtual('enrolledCount').get(function () {
  return this.enrolledUsers.length;
});

scheduleSchema.virtual('availableSpots').get(function () {
  return this.capacity - this.enrolledUsers.length;
});

// ── Indexes ───────────────────────────────────────────────
scheduleSchema.index({ classId: 1, startTime: 1, endTime: 1 }); // Collision-check: findOne({classId, startTime:{$lt:end}, endTime:{$gt:start}})
scheduleSchema.index({ bookedTeamId: 1, startTime: 1 });         // Weekly count: countDocuments({bookedTeamId, startTime:{$gte:weekStart,$lte:weekEnd}})
// Compound multikey index — covers both auto-release (User.Dropped middleware) and
// team-sync (syncSchedulesForTeamUpdate) which both filter on enrolledUsers + startTime.
// Replaces the standalone {enrolledUsers:1} which couldn't filter on startTime.
// NOTE: {classId:1, startTime:1} removed — it is a strict prefix of the
//   {classId:1, startTime:1, endTime:1} index above and would never be chosen.
scheduleSchema.index({ enrolledUsers: 1, startTime: 1 });

module.exports = mongoose.model('Schedule', scheduleSchema);
