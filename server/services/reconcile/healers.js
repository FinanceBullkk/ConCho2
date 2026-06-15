const RoomBooking = require('../../models/RoomBooking');
const WaitlistEntry = require('../../models/WaitlistEntry');
const Team = require('../../models/Team');
const Counter = require('../../models/Counter');
const auditService = require('../auditService');
const { checkOrphanRoomBookings } = require('./schedule-checks');
const { checkSoftDeletedInTeamMembers } = require('./team-checks');
const { checkCounterDrift } = require('./counter-checks');
const { checkStaleWaitlistEntries } = require('./waitlist-checks');

// ──────────────────────────────────────────────────────────
// Reconcile auto-heal — SAFE, deterministic, reversible fixers
// (Investment Build Plan #4)
// ──────────────────────────────────────────────────────────
// Only the four checks whose fix is unambiguous appear here. Every other check
// REQUIRES human judgment (duplicate_active_enrollment, multi_team_class,
// missing_attendance, …) and is never auto-healed — the UI links those to the
// record instead.
//
// The server is the source of truth — it never trusts client-supplied row
// state. Heal flow: re-run the affected check to get the CURRENT issues, apply
// the fixer to each (audited, entity:'Reconcile'), then re-run the check to
// report what remains. Each fixer captures enough before-state in its audit
// line to be reversed by hand.
// ──────────────────────────────────────────────────────────

const audit = (req, entityId, diff, note) =>
  auditService.record({ req, action: 'reconciled', entity: 'Reconcile', entityId, diff, note });

const fixers = {
  // Delete the dangling ledger row(s) that brick a room slot.
  orphan_room_booking: async (issue, req) => {
    const { scheduleId } = issue.refs || {};
    if (!scheduleId) return { ok: false, error: 'missing scheduleId' };
    const rows = await RoomBooking.find({ scheduleId }).lean();
    if (!rows.length) return { ok: true, noop: true };
    await RoomBooking.deleteMany({ scheduleId });
    audit(req, scheduleId, { before: { roomBookings: rows }, after: null },
      `auto-heal orphan_room_booking — removed ${rows.length} dangling RoomBooking row(s) for schedule ${scheduleId}`);
    return { ok: true, removed: rows.length };
  },

  // Dissolve a 'waiting' row whose session can never seat it. The model's
  // terminal "queue dissolved" state is 'cancelled' (there is no 'dissolved').
  stale_waitlist_entry: async (issue, req) => {
    const { scheduleId, userId } = issue.refs || {};
    if (!scheduleId || !userId) return { ok: false, error: 'missing scheduleId/userId' };
    const entry = await WaitlistEntry.findOne({ scheduleId, userId, status: 'waiting' }).lean();
    if (!entry) return { ok: true, noop: true };
    await WaitlistEntry.updateOne({ _id: entry._id }, { $set: { status: 'cancelled' } });
    audit(req, entry._id, { before: { status: 'waiting' }, after: { status: 'cancelled' } },
      `auto-heal stale_waitlist_entry — dissolved entry ${entry._id} (${issue.detail?.reason || 'dead session'})`);
    return { ok: true };
  },

  // Pull a soft-deleted user out of a team's members[].
  soft_deleted_in_team_members: async (issue, req) => {
    const { teamId, userId } = issue.refs || {};
    if (!teamId || !userId) return { ok: false, error: 'missing teamId/userId' };
    const res = await Team.updateOne({ _id: teamId }, { $pull: { members: userId } });
    if (!res.modifiedCount) return { ok: true, noop: true };
    audit(req, teamId, { before: { removedMember: String(userId) }, after: null },
      `auto-heal soft_deleted_in_team_members — pulled soft-deleted user ${userId} from team ${teamId}`);
    return { ok: true };
  },

  // Bump a drifted Counter.seq up to the max code already in use, so the next
  // create can't mint a duplicate code. Identified by detail.counter (refs is
  // empty for this check).
  counter_drift: async (issue, req) => {
    const counter = issue.detail?.counter;
    const maxInUse = issue.detail?.maxInUse;
    if (!counter || typeof maxInUse !== 'number') return { ok: false, error: 'missing counter/maxInUse' };
    const before = await Counter.findById(counter).lean();
    if (!before || before.seq >= maxInUse) return { ok: true, noop: true };
    await Counter.updateOne({ _id: counter }, { $set: { seq: maxInUse } });
    audit(req, null, { before: { counter, seq: before.seq }, after: { counter, seq: maxInUse } },
      `auto-heal counter_drift — bumped Counter '${counter}' seq ${before.seq} → ${maxInUse}`);
    return { ok: true };
  },
};

// Re-derivation: every safe check is a ctx-free read.
const checkRunners = {
  orphan_room_booking: checkOrphanRoomBookings,
  stale_waitlist_entry: checkStaleWaitlistEntries,
  soft_deleted_in_team_members: checkSoftDeletedInTeamMembers,
  counter_drift: checkCounterDrift,
};

const SAFE_CHECKS = Object.keys(fixers);

// Does `issue` match one of the client-supplied ref filters? Shallow equality on
// the keys the client provided. counter_drift carries no refs, so it is always
// healed in full when that check is requested.
const matchesAnyRef = (issue, refs) => refs.some((r) =>
  Object.keys(r).every((k) => String(issue.refs?.[k] ?? '') === String(r[k] ?? '')));

/**
 * Heal a single safe check: re-derive the current issues, apply the fixer to
 * each (optionally filtered by client `refs`), then re-derive to report what
 * remains.
 *
 * @param {{ check: string, refs?: object[], req?: object }} args
 * @returns {Promise<{ check, attempted, healed, failed, remaining, results }>}
 * @throws {Error & { statusCode: 422 }} when `check` is not auto-healable
 */
async function healCheck({ check, refs, req }) {
  if (!SAFE_CHECKS.includes(check)) {
    const err = new Error(`Check '${check}' is not auto-healable. Resolve it from the record.`);
    err.statusCode = 422;
    throw err;
  }

  const runCheck = checkRunners[check];
  let issues = await runCheck();

  if (check !== 'counter_drift' && Array.isArray(refs) && refs.length) {
    issues = issues.filter((i) => matchesAnyRef(i, refs));
  }

  const results = [];
  let healed = 0;
  let failed = 0;
  for (const issue of issues) {
    try {
      const r = await fixers[check](issue, req);
      if (r.ok) healed += 1; else failed += 1;
      results.push({ refs: issue.refs, detail: issue.detail, ...r });
    } catch (e) {
      failed += 1;
      results.push({ refs: issue.refs, ok: false, error: e.message });
    }
  }

  const remaining = (await runCheck()).length;
  return { check, attempted: issues.length, healed, failed, remaining, results };
}

module.exports = { SAFE_CHECKS, healCheck, fixers };
