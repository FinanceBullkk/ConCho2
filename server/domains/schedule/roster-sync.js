// ──────────────────────────────────────────────────────────
// Schedule roster-sync — dual-backend (Mongo ⇄ Postgres)
// ──────────────────────────────────────────────────────────
// Two Mongo-only side-effect paths shared one machinery (find future LIVE
// schedules → mutate roster → FIFO-promote freed seats → sweep still-empty):
//   • team member-edit    (was models/Team.js syncSchedulesForTeamUpdate)
//   • user auto-release    (was models/User.js post-findOneAndUpdate hook)
//
// Both are re-expressed here ONCE, backend-agnostic, over the already-dual
// schedule/waitlist repositories + the `_shared/unit-of-work` transaction
// abstraction (Mongo session ⇄ PG BEGIN/COMMIT). The roster WRITE stays
// backend-native (Mongo $pull/$push, PG enrolled_users text[] array SQL) inside
// `repository.applyRosterDelta`, so the Mongo behaviour is unchanged 1:1.
// ──────────────────────────────────────────────────────────

const logger = require('../../lib/logger');
const { ServiceError } = require('../../helpers/ServiceError');
const { runInTransaction } = require('../_shared/unit-of-work');
const repository = require('./repository');
const bookingPolicy = require('./session-booking-policy');
const { promoteIfSeatFree } = require('./waitlist/promotion');
const { releaseScheduleResources } = require('./release-resources');

// UTC midnight — timezone-safe LIVE-future cutoff (matches the legacy paths).
const utcMidnight = () => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
};

// Promote FIFO waiters on the freed schedules (in-tx), then sweep the ones that
// are STILL empty (release room-lock ledger + dissolve any waitlist, then hard-
// delete the empty placeholder). Returns the promotions for post-commit notify.
const promoteAndSweep = async (freedScheduleIds, tx) => {
  const promotions = [];
  for (const scheduleId of freedScheduleIds) {
    // eslint-disable-next-line no-await-in-loop -- few schedules per team/user
    const promoted = await promoteIfSeatFree(scheduleId, tx);
    if (promoted.length > 0) promotions.push({ scheduleId, promoted });
  }

  if (freedScheduleIds.length > 0) {
    const stillEmptyIds = await repository.findEmptyScheduleIds(freedScheduleIds, tx);
    if (stillEmptyIds.length > 0) {
      await releaseScheduleResources(stillEmptyIds, tx);
      await repository.deleteSchedulesByIds(stillEmptyIds, tx);
    }
  }
  return promotions;
};

/**
 * Sync future Schedule rosters after a team's member list changed. Runs INSIDE
 * the caller's team-update transaction (atomic with the Team doc write), so it
 * receives the enclosing UoW handle rather than opening its own.
 *
 * @param {Object} params
 * @param {string} params.teamId
 * @param {string[]} params.oldMembers  previous member id strings
 * @param {string[]} params.newMembers  new member id strings
 * @param {Object} tx  the enclosing UoW handle ({session} on Mongo, {client} on PG)
 * @returns {Promise<{promotions: Array}>}
 * @throws {ServiceError} 422 when an added member would push a session over cap
 */
const syncTeamRoster = async ({ teamId, oldMembers, newMembers }, tx) => {
  const removedSet = new Set(oldMembers.filter((id) => !newMembers.includes(id)));
  const addedSet = new Set(newMembers.filter((id) => !oldMembers.includes(id)));
  if (removedSet.size === 0 && addedSet.size === 0) return { promotions: [] };

  logger.info(
    { teamId: String(teamId), removed: removedSet.size, added: addedSet.size },
    'Team roster-sync triggered',
  );

  const today = utcMidnight();
  const futureSchedules = await repository.findFutureTeamSchedules(teamId, today, tx);
  if (futureSchedules.length === 0) return { promotions: [] };

  // Resolve the program per-session cap once — all future schedules share the
  // team's class (only needed when members are being ADDED).
  let maxPerSession = null;
  if (addedSet.size > 0) {
    const policy = await repository.findClassCapacityPolicy(futureSchedules[0].classId, tx);
    maxPerSession = policy.maxParticipantsPerSession ?? null;
  }

  const freedScheduleIds = [];
  for (const schedule of futureSchedules) {
    const enrolledSet = new Set((schedule.enrolledUsers || []).map(String));
    const toRemove = [...removedSet].filter((id) => enrolledSet.has(id));
    const toAdd = [...addedSet].filter((id) => !enrolledSet.has(id));
    if (toRemove.length === 0 && toAdd.length === 0) continue;

    // Capacity guard (Wave E2 / D5): an ADD must not push the roster over the
    // effective per-session cap on the routine admin team-edit path.
    if (toAdd.length > 0) {
      const newCount = enrolledSet.size - toRemove.length + toAdd.length;
      const cap = bookingPolicy.effectiveSessionCapacity({ scheduleCapacity: schedule.capacity, maxPerSession });
      if (newCount > cap) throw new ServiceError(bookingPolicy.capacityMessage(cap), 422);
    }

    // eslint-disable-next-line no-await-in-loop -- few schedules per team
    await repository.applyRosterDelta(schedule._id, toRemove, toAdd, tx);
    // A removal freed a seat → this session is a promotion/sweep candidate.
    if (toRemove.length > 0) freedScheduleIds.push(schedule._id);
  }

  const promotions = await promoteAndSweep(freedScheduleIds, tx);
  logger.info({ teamId: String(teamId) }, 'Team roster-sync complete');
  return { promotions };
};

/**
 * Release a user from every future LIVE schedule they're on (status→Dropped),
 * then FIFO-promote the freed seats and sweep still-empty sessions. Opens its
 * OWN transaction (this is a post-commit side-effect of the user-status change,
 * not part of that write's tx — same separation as the legacy hook).
 *
 * @param {string} userId
 * @returns {Promise<{promotions: Array}>}
 */
const releaseUserFromFutureSchedules = async (userId) => {
  const today = utcMidnight();
  return runInTransaction(async (tx) => {
    const affected = await repository.findFutureUserSchedules(userId, today, tx);
    if (affected.length === 0) {
      return { promotions: [] };
    }

    const affectedIds = affected.map((s) => s._id);
    for (const scheduleId of affectedIds) {
      // eslint-disable-next-line no-await-in-loop -- few schedules per user
      await repository.applyRosterDelta(scheduleId, [String(userId)], [], tx);
    }
    logger.info({ userId: String(userId), released: affectedIds.length }, 'Auto-Release: pulled user from future schedules');

    return { promotions: await promoteAndSweep(affectedIds, tx) };
  });
};

/**
 * Team member-edit side effect (was models/Team.js `syncSchedulesForTeamUpdate`,
 * re-homed here in Wave K D2e-1 so its consumers no longer require the model).
 * A thin adapter over `syncTeamRoster`: accepts either a UoW handle (`tx`) or a
 * raw mongoose `session` — both resolve to a handle the schedule repo understands.
 */
const syncSchedulesForTeamUpdate = ({ teamId, oldMembers, newMembers, session, tx }) => {
  const handle = tx || (session ? { session } : undefined);
  return syncTeamRoster({ teamId, oldMembers, newMembers }, handle);
};

module.exports = { syncTeamRoster, releaseUserFromFutureSchedules, syncSchedulesForTeamUpdate };
