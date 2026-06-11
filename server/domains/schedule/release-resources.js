const roomLockPolicy = require('./room-lock-policy');
const WaitlistEntry = require('../../models/WaitlistEntry');

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

const releaseScheduleResources = async (scheduleIds, session) => {
  const ids = Array.isArray(scheduleIds) ? scheduleIds : [scheduleIds];
  if (ids.length === 0) return { waiterUserIds: [] };

  await roomLockPolicy.releaseRoomLock(ids, session);

  const waiting = await WaitlistEntry.find(
    { scheduleId: { $in: ids }, status: 'waiting' },
    { userId: 1 },
    { session },
  ).lean();

  if (waiting.length > 0) {
    await WaitlistEntry.updateMany(
      { scheduleId: { $in: ids }, status: 'waiting' },
      { $set: { status: 'cancelled' } },
      { session },
    );
  }

  return { waiterUserIds: waiting.map((w) => w.userId) };
};

module.exports = { releaseScheduleResources };
