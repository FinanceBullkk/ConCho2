const mongoose = require('mongoose');

// ──────────────────────────────────────────────────────────
// Team Model
// ──────────────────────────────────────────────────────────
// Team Leader = a Participant referenced as leaderId.
//
// SCHEDULE SYNC:
//   syncSchedulesForTeamUpdate() — explicit, session-aware function
//   called by the controller INSIDE a MongoDB transaction.
//   When the members array changes, all future Schedules are synced:
//   - Removed members are $pulled from enrolledUsers
//   - New members are $pushed
//   If the process crashes, the entire transaction rolls back.

const teamSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Team name (PIC) is required'],
      trim: true,
      // NOT unique — same PIC can manage multiple courses
    },
    classId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Class',
      default: null,               // null = unassigned
    },
    leaderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    members: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],

    // ── Soft-delete fields (UX-03) ──────────────────────────
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// ── Soft-delete auto-filter (UX-03) ─────────────────────
// 'distinct' added in audit round 2 (DATA-012) — query middleware, was bypassed.
const SOFT_DELETE_HOOKS = ['find', 'findOne', 'countDocuments', 'findOneAndUpdate', 'findOneAndDelete', 'distinct'];
for (const hook of SOFT_DELETE_HOOKS) {
  teamSchema.pre(hook, function () {
    const filter = this.getFilter();
    if (filter.isDeleted === undefined) {
      this.where({ isDeleted: { $ne: true } });
    }
  });
}

// DATA-007 (audit PR 6): Team.aggregate did NOT receive a soft-delete
// filter. Analytics pipelines (attendanceService.analyticsByTeam,
// dashboardController) were silently including soft-deleted teams.
// User.js has the same hook (User.js:213-220); this mirrors it.
//
// We only inject the $match if the caller did not already constrain
// isDeleted explicitly — leaves room for "show me deleted teams" queries.
teamSchema.pre('aggregate', function () {
  const pipeline = this.pipeline();
  const hasExplicitFilter = pipeline.some(
    (stage) => stage && stage.$match && stage.$match.isDeleted !== undefined,
  );
  if (!hasExplicitFilter) {
    pipeline.unshift({ $match: { isDeleted: { $ne: true } } });
  }
});

// ── Indexes ───────────────────────────────────────────────
teamSchema.index({ leaderId: 1 });
teamSchema.index({ classId: 1 }); // multiple teams per class allowed (booking competition)

// PERF-010 (audit PR D): Team.members is queried as
// `Team.find({ members: userId })` from:
//   - scheduleService.js:481   (booking — find user's team for slot)
//   - dashboardController.js:201 (course-stats per user)
//   - searchService.js:100     (participant scope)
//   - userController.js:333    (soft-delete cascade)
// Multikey index lets each call hit the planned IXSCAN instead of
// COLLSCAN. Critical once team count grows past a few hundred.
teamSchema.index({ members: 1 });

// ──────────────────────────────────────────────────────────
// SCHEDULE SYNC — Explicit, Session-Aware
// ──────────────────────────────────────────────────────────
// Previously this was implicit Mongoose middleware (fire-and-forget).
// Moved here as an explicit function so the controller can call it
// INSIDE the same MongoDB transaction that updates the Team document.
//
// If the process crashes mid-way, the entire transaction rolls back
// and both Team.members + Schedule.enrolledUsers stay consistent.
// ──────────────────────────────────────────────────────────

/**
 * Sync future Schedule.enrolledUsers after a Team member change.
 *
 * @param {Object} params
 * @param {ObjectId|string} params.teamId
 * @param {string[]} params.oldMembers  — previous member ID strings
 * @param {string[]} params.newMembers  — new member ID strings
 * @param {import('mongoose').ClientSession} params.session — MongoDB session (for transaction)
 */
const syncSchedulesForTeamUpdate = async ({ teamId, oldMembers, newMembers, session, tx }) => {
  // Dual-backend delegation (2026-07-07, Wave G Slice B/C): the roster rebuild +
  // capacity guard + FIFO promotion + empty-sweep moved to
  // domains/schedule/roster-sync so it runs on either backend (Mongo $pull/$push
  // vs PG enrolled_users text[] SQL). Accept the whole UoW handle (`tx`) or a raw
  // mongoose session (legacy callers) — both resolve to a handle the schedule
  // repo understands. Lazy require avoids a circular import at model-load time.
  const rosterSync = require('../domains/schedule/roster-sync');
  const handle = tx || (session ? { session } : undefined);
  return rosterSync.syncTeamRoster({ teamId, oldMembers, newMembers }, handle);
};

const Team = mongoose.model('Team', teamSchema);

// Export both the model and the sync helper
module.exports = Team;
module.exports.syncSchedulesForTeamUpdate = syncSchedulesForTeamUpdate;

