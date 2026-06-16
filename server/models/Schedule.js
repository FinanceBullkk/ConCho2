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
//   1. Each time slot allows exactly 1 LIVE schedule (collision check +
//      partial-unique index scoped to status:'scheduled').
//   2. Each team can create max 2 sessions per Mon–Sun week.
//   3. Cancelling a booking is DURABLE (Wave E3 phase-04 slice A): the doc
//      flips to status:'cancelled' (who/when/why preserved) — never deleted —
//      and the freed slot becomes re-bookable.
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

    // The team that created/owns this session. Optional: team-less sessions
    // exist for cohort-based scheduling modes (self_enroll / nomination), where
    // an Admin schedules a session against a Cohort and enrolls its per-learner
    // (cohort-based) enrollments rather than a Team. Team-based modes
    // (leader_booking / admin_scheduled) always set this.
    bookedTeamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Team',
      default: null,
    },

    // The physical Office this session is delivered at (re-center Phase 2).
    // Nullable: legacy/online sessions have none. Coordinator-scheduled
    // offline sessions REQUIRE it (enforced in the cohort-booking use-case);
    // Phase 3 scopes Room selection to this Office.
    officeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Office',
      default: null,
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

    // The physical Room this session occupies (re-center Phase 3, DELTA A).
    // Nullable: online/legacy sessions have none. When set, it is written
    // ATOMICALLY with a RoomBooking ledger row (room-lock-policy) so the field
    // and the per-room {roomId,startTime} lock never drift; the room MUST live
    // in this session's Office (422 otherwise).
    roomId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Room',
      default: null,
    },

    // ── Trainers (re-center Phase 3, DELTA B) ───────────────
    // A session may carry per-session INTERNAL trainers (User refs) that join
    // the attendance/visibility authz UNION (cohort teacher never revoked), and
    // /or ONE lightweight EXTERNAL trainer (no User, no login) that only feeds
    // calendar invite + display. The two are independent (a vendor may
    // co-deliver with an internal SME).
    sessionInstructorIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    externalTrainer: {
      type: new mongoose.Schema(
        {
          name: { type: String, required: true, trim: true },
          email: { type: String, trim: true, lowercase: true, default: null },
          phone: { type: String, trim: true, default: null },
          org: { type: String, trim: true, default: null },
        },
        { _id: false },
      ),
      default: null,
    },

    // The managed Vendor delivering this session (Modernization H2 — A2).
    // Nullable + additive: replaces the free-text `externalTrainer` name with a
    // referenceable provider so spend (CostEntry.scope.vendorId) + ratings roll
    // up per vendor. The legacy `externalTrainer` subdoc is kept for display +
    // calendar invites; the migration backfills a Vendor per distinct name. The
    // booking-picker wiring that SETS this is a follow-up — the field exists so
    // the link is possible without touching the booking transaction now.
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vendor',
      default: null,
    },

    capacity: {
      type: Number,
      min: [1, 'Capacity must be at least 1'],
      default: 9,
    },

    // ── Session details (TMS.update) ────────────────────────
    // Display/metadata only — never affect booking, room, or time logic.
    // sessionTypeId = optional SessionType taxonomy (prefill hints only — the
    // type NEVER gates slot/room/conflict logic); topic = session title;
    // agenda = ordered talking points; materials = labelled resource links;
    // customFields = CustomFieldDefinition entity='Session' value map.
    sessionTypeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SessionType',
      default: null,
    },
    topic: { type: String, trim: true, default: '' },
    agenda: { type: [String], default: [] },
    materials: {
      type: [new mongoose.Schema(
        { label: { type: String, trim: true }, url: { type: String, trim: true } },
        { _id: false },
      )],
      default: [],
    },
    customFields: { type: Object, default: {} },

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

    // ── Durable cancellation (Wave E3 phase-04, slice A) ────
    // Cancelling never deletes the doc: status flips to 'cancelled' and the
    // who/when/why are preserved (golden rule: no hard-delete of operational
    // history). Cancelled rows are excluded from every operational query
    // (collision, weekly cap, availability, calendars, reminders, reconcile,
    // session numbering) and escape the partial-unique slot index, so the
    // freed {classId,startTime} slot is immediately re-bookable.
    status: {
      type: String,
      enum: ['scheduled', 'cancelled'],
      default: 'scheduled',
    },
    cancelledAt: {
      type: Date,
      default: null,
    },
    cancelledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    cancelReason: {
      type: String,
      trim: true,
      maxlength: 500,
      default: '',
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ── Validators ────────────────────────────────────────────
// DATA-013 (audit PR 6): defence-in-depth — startTime < endTime must hold
// at the schema layer, not only at the service layer. Catches direct
// inserts (e.g. via migrations / admin DB tools / future seed scripts)
// that bypass scheduleService.bookSlot validation.
scheduleSchema.pre('validate', function (next) {
  if (this.startTime && this.endTime && this.endTime <= this.startTime) {
    return next(new Error('Schedule.endTime must be strictly greater than startTime'));
  }
  next();
});

// ── Virtuals ──────────────────────────────────────────────
// enrolledCount is derived from the actual array — never drifts.
scheduleSchema.virtual('enrolledCount').get(function () {
  return this.enrolledUsers.length;
});

scheduleSchema.virtual('availableSpots').get(function () {
  return this.capacity - this.enrolledUsers.length;
});

// ── Indexes ───────────────────────────────────────────────
// UNIQUE constraint: one LIVE booking per (class, time slot). This is the last
// line of defense against concurrent double-bookings — the transaction in
// scheduleService already does an explicit collision check, but two
// requests that pass the check simultaneously can still race to insert.
// MongoDB will reject the second insert with E11000; scheduleService
// catches that code and converts it to a 409 ServiceError.
//
// PARTIAL (Wave E3 phase-04 slice A): scoped to status:'scheduled' so durable-
// cancelled rows may share the slot as history while the freed slot re-books.
// Existing deployments must run scripts/migrate-schedule-partial-unique-index.js
// (backfill status + drop/recreate) — the old full-unique index with the same
// key pattern conflicts with this definition until dropped.
scheduleSchema.index(
  { classId: 1, startTime: 1 },
  { unique: true, partialFilterExpression: { status: 'scheduled' } },
);

scheduleSchema.index({ classId: 1, startTime: 1, endTime: 1 }); // Collision-check range query: findOne({classId, startTime:{$lt:end}, endTime:{$gt:start}})
scheduleSchema.index({ bookedTeamId: 1, startTime: 1 });         // Weekly count: countDocuments({bookedTeamId, startTime:{$gte:weekStart,$lte:weekEnd}})
// Compound multikey index — covers both auto-release (User.Dropped middleware) and
// team-sync (syncSchedulesForTeamUpdate) which both filter on enrolledUsers + startTime.
scheduleSchema.index({ enrolledUsers: 1, startTime: 1 });
// Office-scoped queries (re-center Phase 2/3: "sessions at this office", and
// Phase 3 room-conflict checks within an office).
scheduleSchema.index({ officeId: 1, startTime: 1 });

// Phase 3: per-session internal-trainer visibility (UNION authz filter
// `$or:[{classId:{$in:visible}},{sessionInstructorIds: me}]`).
scheduleSchema.index({ sessionInstructorIds: 1, startTime: 1 });

// PERF-010 (audit PR D): reconcileService.checkMissingAttendance
// (services/reconcileService.js:42) filters
// `endTime: { $lt: now, $gte: lookback }` across all schedules.
// Without an endTime index this is a full-coll scan once history
// grows past a few thousand schedules.
scheduleSchema.index({ endTime: 1 });

// PERF-010: reminderService scans for schedules due in the next 24h
// where remindersSentAt is null. The compound
// (remindersSentAt, startTime) lets the cron walk a narrow window
// without scanning the whole future calendar.
scheduleSchema.index({ remindersSentAt: 1, startTime: 1 });

module.exports = mongoose.model('Schedule', scheduleSchema);
