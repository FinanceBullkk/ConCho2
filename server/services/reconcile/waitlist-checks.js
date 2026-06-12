const WaitlistEntry = require('../../models/WaitlistEntry');
const Schedule = require('../../models/Schedule');

// ──────────────────────────────────────────────────────────
// Reconcile — waitlist-integrity checks (READ-ONLY)
// ──────────────────────────────────────────────────────────
// 12. stale_waitlist_entry — a 'waiting' queue row on a session that can
//     never seat it (DATA-016)

/**
 * CHECK 12 — Stale waitlist rows (DATA-016).
 * FIFO promotion skips PAST sessions by design and queue dissolution only
 * fires on the cancel path, so a `waiting` row whose session slipped into
 * the past unfilled — or whose session was cancelled/deleted outside the
 * dissolution path — rots forever: the learner's "mine" list keeps showing
 * a live queue position on a finished session. Read-only flag (parity with
 * every other check); admins resolve via the normal routes.
 */
async function checkStaleWaitlistEntries() {
  const issues = [];
  const now = new Date();

  const waiting = await WaitlistEntry.find({ status: 'waiting' })
    .select('_id scheduleId classId userId createdAt')
    .lean();
  if (waiting.length === 0) return issues;

  // Batch-resolve the referenced sessions (no N+1).
  const scheduleIds = [...new Set(waiting.map((w) => String(w.scheduleId)))];
  const schedules = await Schedule.find({ _id: { $in: scheduleIds } })
    .select('_id status startTime endTime')
    .lean();
  const byId = new Map(schedules.map((s) => [String(s._id), s]));

  for (const entry of waiting) {
    const sched = byId.get(String(entry.scheduleId));
    let reason = null;
    if (!sched) reason = 'session deleted';
    else if (sched.status === 'cancelled') reason = 'session cancelled — queue dissolution was bypassed';
    else if (sched.endTime && sched.endTime < now) reason = 'session already ended';
    if (!reason) continue;

    issues.push({
      check: 'stale_waitlist_entry',
      description: `WaitlistEntry ${entry._id} is still 'waiting' but its ${reason}`,
      refs: {
        scheduleId: entry.scheduleId,
        classId: entry.classId,
        userId: entry.userId,
      },
      detail: { joinedAt: entry.createdAt, reason },
    });
  }
  return issues;
}

module.exports = { checkStaleWaitlistEntries };
