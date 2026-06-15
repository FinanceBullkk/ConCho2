const roomLockPolicy = require('./room-lock-policy');
const repository = require('./repository');

// ──────────────────────────────────────────────────────────
// releaseScheduleResources — the ONE cleanup for every Schedule-removal path
// (Wave E3 phase-04, slice B — extends slice A's room-lock release).
// ──────────────────────────────────────────────────────────
// When a session is durably cancelled (cancelSlot / admin delete) or an empty
// session is swept away (Team-sync / Dropped auto-release), the session's
// side-resources must go with it, in the SAME transaction:
//   1. RoomBooking ledger row → deleted (slice A — the room frees up), and
//   2. live waitlist entries → status:'cancelled' (slice B — the queue
//      dissolves; rows are kept as history, never deleted).
//
// Returns the dissolved waiters' userIds so cancel paths can email them
// post-commit (owner decision 2026-06-11: waiters are notified). The empty-
// session sweeps ignore the return value — a waitlist only ever exists on a
// FULL session, so an empty session structurally has no waiters.

// Dissolve the live queue of one/many schedules → status:'cancelled' (rows
// kept as history, never deleted). Exported on its own for the team-REASSIGN
// path (updateSchedule bookedTeamId/classId change): the session survives and
// keeps its room, but its waitlist belonged to the OLD audience — a later
// promotion must never seat an old-team/old-class waiter into it.
const dissolveWaitlist = async (scheduleIds, session) => {
  const ids = Array.isArray(scheduleIds) ? scheduleIds : [scheduleIds];
  if (ids.length === 0) return { waiterUserIds: [] };

  const waiting = await repository.findWaitingEntries(ids, session);

  if (waiting.length > 0) {
    await repository.cancelWaitingEntries(ids, session);
  }

  return { waiterUserIds: waiting.map((w) => w.userId) };
};

const releaseScheduleResources = async (scheduleIds, session) => {
  const ids = Array.isArray(scheduleIds) ? scheduleIds : [scheduleIds];
  if (ids.length === 0) return { waiterUserIds: [] };

  await roomLockPolicy.releaseRoomLock(ids, session);
  return dissolveWaitlist(ids, session);
};

module.exports = { releaseScheduleResources, dissolveWaitlist };
