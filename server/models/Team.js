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
const syncSchedulesForTeamUpdate = async ({ teamId, oldMembers, newMembers, session }) => {
  const removedSet = new Set(oldMembers.filter((id) => !newMembers.includes(id)));
  const addedSet = new Set(newMembers.filter((id) => !oldMembers.includes(id)));

  // Nothing changed — skip
  if (removedSet.size === 0 && addedSet.size === 0) return { promotions: [] };

  logger.info(
    { teamId: String(teamId), removed: removedSet.size, added: addedSet.size },
    'Team Sync triggered'
  );

  // Lazy-load to avoid circular dependency
  const Schedule = mongoose.model('Schedule');
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  // 1 DB query: fetch all future LIVE schedules for this team. Durable-
  // cancelled sessions are frozen history — member changes never mutate
  // their roster snapshot (phase-04 slice A).
  const futureSchedules = await Schedule.find({
    startTime: { $gte: today },
    bookedTeamId: teamId,
    status: 'scheduled',
  }).session(session).lean();

  if (futureSchedules.length === 0) {
    logger.info({ teamId: String(teamId) }, 'Team Sync: no future schedules');
    return { promotions: [] };
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
  const freedScheduleIds = []; // Schedules whose roster shrank (waitlist may promote)

  for (const schedule of futureSchedules) {
    const enrolledSet = new Set(schedule.enrolledUsers.map((id) => id.toString()));

    // Compute who to remove and who to add for THIS schedule
    const toRemove = [...removedSet].filter((id) => enrolledSet.has(id));
    const toAdd = [...addedSet].filter((id) => !enrolledSet.has(id));

    if (toRemove.length === 0 && toAdd.length === 0) continue;

    // Calculate the new enrolled count for the capacity guard below.
    // A would-be-empty schedule is NOT short-circuited here anymore
    // (slice B): its pull op still runs, the promotion pass may rescue it
    // with a waiter, and only the STILL-empty ones are swept afterwards.
    const newCount = enrolledSet.size - toRemove.length + toAdd.length;

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
      freedScheduleIds.push(schedule._id);
    } else if (toRemove.length > 0) {
      const removeIds = toRemove.map((id) => new mongoose.Types.ObjectId(id));
      bulkOps.push({
        updateOne: {
          filter: { _id: schedule._id },
          update: { $pull: { enrolledUsers: { $in: removeIds } } },
        },
      });
      freedScheduleIds.push(schedule._id);
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

  // Seat-freer (phase-04 slice B): a member removal freed seats — seat FIFO
  // waiters INSIDE this tx, BEFORE the empty sweep, so a waiting teammate can
  // rescue a session that just lost its last enrolled member. Promotions are
  // returned so the CALLER can notify post-commit (this helper never owns the
  // transaction). Lazy require at call time, same as the policy modules above.
  const promotions = [];
  if (freedScheduleIds.length > 0) {
    const { promoteIfSeatFree } = require('../domains/schedule/waitlist/promotion');
    for (const scheduleId of freedScheduleIds) {
      // eslint-disable-next-line no-await-in-loop -- few schedules per team
      const promoted = await promoteIfSeatFree(scheduleId, session);
      if (promoted.length > 0) promotions.push({ scheduleId, promoted });
    }
  }

  // Sweep the schedules that are STILL empty after the promotion pass:
  // release their room-lock ledger rows AND dissolve any waitlist rows in the
  // same tx (a synced-away session must never brick a room or strand a
  // waiter), then hard-delete the empty placeholder (pre-slice-A behaviour,
  // owner Q4: empties are cleanup, not history).
  if (freedScheduleIds.length > 0) {
    const stillEmptyIds = await Schedule.find(
      { _id: { $in: freedScheduleIds }, enrolledUsers: { $size: 0 } },
      { _id: 1 },
      { session },
    ).distinct('_id');
    if (stillEmptyIds.length > 0) {
      const { releaseScheduleResources } = require('../domains/schedule/release-resources');
      await releaseScheduleResources(stillEmptyIds, session);
      await Schedule.deleteMany({ _id: { $in: stillEmptyIds } }, { session });
      logger.info({ teamId: String(teamId), deleted: stillEmptyIds.length }, 'Team Sync: empty schedules deleted');
    }
  }

  logger.info({ teamId: String(teamId) }, 'Team Sync complete');
  return { promotions };
};

const Team = mongoose.model('Team', teamSchema);

// Export both the model and the sync helper
module.exports = Team;
module.exports.syncSchedulesForTeamUpdate = syncSchedulesForTeamUpdate;

