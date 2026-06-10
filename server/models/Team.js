const mongoose = require('mongoose');
const logger = require('../lib/logger');

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
const SOFT_DELETE_HOOKS = ['find', 'findOne', 'countDocuments', 'findOneAndUpdate', 'findOneAndDelete'];
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
const syncSchedulesForTeamUpdate = async ({ teamId, oldMembers, newMembers, session }) => {
  const removedSet = new Set(oldMembers.filter((id) => !newMembers.includes(id)));
  const addedSet = new Set(newMembers.filter((id) => !oldMembers.includes(id)));

  // Nothing changed — skip
  if (removedSet.size === 0 && addedSet.size === 0) return;

  logger.info(
    { teamId: String(teamId), removed: removedSet.size, added: addedSet.size },
    'Team Sync triggered'
  );

  // Lazy-load to avoid circular dependency
  const Schedule = mongoose.model('Schedule');
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  // 1 DB query: fetch all future schedules for this team
  const futureSchedules = await Schedule.find({
    startTime: { $gte: today },
    bookedTeamId: teamId,
  }).session(session).lean();

  if (futureSchedules.length === 0) {
    logger.info({ teamId: String(teamId) }, 'Team Sync: no future schedules');
    return;
  }

  logger.debug({ teamId: String(teamId), count: futureSchedules.length }, 'Team Sync: processing future schedules');

  // ── Wave E2 / D5: resolve the program per-session cap once. All of this
  // team's future schedules share its class, so one lookup suffices. Lazy
  // requires avoid a circular import (session-booking-policy / repository ->
  // models -> Team); at call time every module is fully loaded.
  const { effectiveSessionCapacity, capacityMessage } = require('../domains/schedule/session-booking-policy');
  const { ServiceError } = require('../helpers/ServiceError');
  let maxPerSession = null;
  if (addedSet.size > 0) {
    const scheduleRepo = require('../domains/schedule/repository');
    const policy = await scheduleRepo.findClassCapacityPolicy(futureSchedules[0].classId, session);
    maxPerSession = policy.maxParticipantsPerSession ?? null;
  }

  // ── Build all operations in-memory (0 DB calls) ────────
  const bulkOps = [];
  const emptyScheduleIds = []; // Schedules that will have 0 enrolled users

  for (const schedule of futureSchedules) {
    const enrolledSet = new Set(schedule.enrolledUsers.map((id) => id.toString()));

    // Compute who to remove and who to add for THIS schedule
    const toRemove = [...removedSet].filter((id) => enrolledSet.has(id));
    const toAdd = [...addedSet].filter((id) => !enrolledSet.has(id));

    if (toRemove.length === 0 && toAdd.length === 0) continue;

    // Calculate new enrolled count to check for auto-release
    const newCount = enrolledSet.size - toRemove.length + toAdd.length;

    if (newCount <= 0) {
      // Schedule will be empty — mark for deletion instead of update
      emptyScheduleIds.push(schedule._id);
      continue;
    }

    // Wave E2 / D5: reject a team-member ADD that would push this session's
    // roster above its effective cap (keeps enrolledCount <= capacity true on
    // the routine admin team-edit path, not just create/edit).
    if (toAdd.length > 0) {
      const cap = effectiveSessionCapacity({ scheduleCapacity: schedule.capacity, maxPerSession });
      if (newCount > cap) {
        throw new ServiceError(capacityMessage(cap), 422);
      }
    }

    // enrolledCount is a virtual (enrolledUsers.length) — only array ops needed.
    if (toRemove.length > 0 && toAdd.length > 0) {
      // MongoDB forbids $pull + $push in one op — use two updateOnes.
      const removeIds = toRemove.map((id) => new mongoose.Types.ObjectId(id));
      const addIds = toAdd.map((id) => new mongoose.Types.ObjectId(id));
      bulkOps.push({
        updateOne: {
          filter: { _id: schedule._id },
          update: { $pull: { enrolledUsers: { $in: removeIds } } },
        },
      });
      bulkOps.push({
        updateOne: {
          filter: { _id: schedule._id },
          update: { $push: { enrolledUsers: { $each: addIds } } },
        },
      });
    } else if (toRemove.length > 0) {
      const removeIds = toRemove.map((id) => new mongoose.Types.ObjectId(id));
      bulkOps.push({
        updateOne: {
          filter: { _id: schedule._id },
          update: { $pull: { enrolledUsers: { $in: removeIds } } },
        },
      });
    } else {
      const addIds = toAdd.map((id) => new mongoose.Types.ObjectId(id));
      bulkOps.push({
        updateOne: {
          filter: { _id: schedule._id },
          update: { $push: { enrolledUsers: { $each: addIds } } },
        },
      });
    }
  }

  // ── Execute within the same session/transaction ──────────
  if (bulkOps.length > 0) {
    await Schedule.bulkWrite(bulkOps, { session });
    logger.info({ teamId: String(teamId), ops: bulkOps.length }, 'Team Sync: bulkWrite executed');
  }

  if (emptyScheduleIds.length > 0) {
    // Phase 3: free the room-lock ledger rows for the schedules we are about to
    // delete (same tx) so a synced-away session never bricks a room slot.
    await mongoose.model('RoomBooking').deleteMany(
      { scheduleId: { $in: emptyScheduleIds } }, { session },
    );
    await Schedule.deleteMany({ _id: { $in: emptyScheduleIds } }, { session });
    logger.info({ teamId: String(teamId), deleted: emptyScheduleIds.length }, 'Team Sync: empty schedules deleted');
  }

  logger.info({ teamId: String(teamId) }, 'Team Sync complete');
};

const Team = mongoose.model('Team', teamSchema);

// Export both the model and the sync helper
module.exports = Team;
module.exports.syncSchedulesForTeamUpdate = syncSchedulesForTeamUpdate;

