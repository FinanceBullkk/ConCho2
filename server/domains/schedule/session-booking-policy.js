// ──────────────────────────────────────────────────────────
// Session Booking Policy
// ──────────────────────────────────────────────────────────
// Single home for the booking INVARIANTS that were previously duplicated across
// scheduleService.bookSlot / bookCohortSlot / adminCreate and the admin
// update path:
//   - the per-team weekly session cap (WEEKLY_TEAM_LIMIT),
//   - the same-class collision guard,
//   - the ISO-week bounds the weekly cap counts within,
//   - the "snapshot a team's Active members onto a session" roster rule.
//
// NOT here, on purpose:
//   - Booking WINDOW validation (allowed time slots) lives in
//     scheduling-window-policy and is a precondition each caller runs first. It
//     is already centralized, so it is not re-run here.
//   - Authorization (leader-auth / scheduling-mode gates) stays in the callers:
//     leader-auth has a single call site (bookSlot) and mode-gating lives in the
//     learning/session adapter. Centralizing authz waits until enforcing
//     schedulingMode on the legacy paths creates a second consumer — two
//     adapters justify a seam, one does not.
//
// All DB access goes through domains/schedule/repository so the queries (and the
// {classId,startTime} unique-index semantics behind them) have one home.
// ──────────────────────────────────────────────────────────

const { ServiceError } = require('../../helpers/ServiceError');
const { WEEKLY_TEAM_LIMIT } = require('./scheduling-window-policy');
const repository = require('./repository');

// Canonical user-facing messages for the book/create paths. These English
// strings are part of the API contract (asserted by tests). The admin
// "move"/"reassign" paths intentionally throw their own, more specific strings
// and do not flow through assertBookable.
const COLLISION_MESSAGE = 'This time slot is already taken';
const WEEKLY_CAP_MESSAGE =
  `This team already has the maximum ${WEEKLY_TEAM_LIMIT} sessions this week`;

// Capacity (Wave E2). The effective per-session cap is the program's
// capacityPolicy.maxParticipantsPerSession when set, else the per-session
// Schedule.capacity field, else this default (mirrors the Schedule.capacity
// default so a program-less class still has a cap).
const DEFAULT_SESSION_CAPACITY = 9;

/** User-facing 422 message for a roster that exceeds the effective session cap. */
const capacityMessage = (cap) =>
  `Roster exceeds the session capacity of ${cap}`;

/**
 * The effective per-session occupancy cap. Program policy
 * (`maxParticipantsPerSession`) overrides the per-session field; a program-less
 * class falls back to the Schedule.capacity field, then the default.
 *
 * @param {{ scheduleCapacity?: number|null, maxPerSession?: number|null }} args
 * @returns {number}
 */
const effectiveSessionCapacity = ({ scheduleCapacity = null, maxPerSession = null } = {}) => {
  if (maxPerSession != null) return maxPerSession;
  if (scheduleCapacity != null) return scheduleCapacity;
  return DEFAULT_SESSION_CAPACITY;
};

/**
 * Monday 00:00:00.000 UTC – Sunday 23:59:59.999 UTC of the ISO week containing
 * `date`. Single source of truth (was duplicated in scheduleService and
 * domains/schedule/use-cases).
 */
const getWeekBounds = (date) => {
  const d = new Date(date);
  const dayOfWeek = d.getUTCDay();
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const weekStart = new Date(Date.UTC(
    d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + diffToMonday, 0, 0, 0, 0,
  ));
  const weekEnd = new Date(Date.UTC(
    weekStart.getUTCFullYear(), weekStart.getUTCMonth(), weekStart.getUTCDate() + 6, 23, 59, 59, 999,
  ));
  return { weekStart, weekEnd };
};

/**
 * The member ids to snapshot onto a session's roster: a team's Active members
 * only. Used at booking time AND at reassign time so both agree (a reassigned
 * session must not enroll Dropped/inactive members).
 *
 * @param {{ members?: Array<{ _id: any, status: string }> }} team
 *   team with `members` populated incl. `status`
 * @returns {Array} ids of Active members
 */
const snapshotActiveMembers = (team) =>
  (team?.members || [])
    .filter((m) => m && m.status === 'Active')
    .map((m) => m._id);

/**
 * Assert a slot is bookable for a class within the caller's transaction:
 *   - (optional) the team has not reached the weekly session cap, then
 *   - no existing session for the class overlaps [start, end).
 *
 * Order matches the legacy inline checks (weekly, then collision). The caller
 * MUST validate the booking WINDOW first (scheduling-window-policy) and owns
 * authorization. The {classId,startTime} unique index is the final concurrency
 * guard — callers still translate its duplicate-key error into a 409.
 *
 * Capacity (Wave E2) is checked LAST and only when `incomingCount` is supplied
 * (opt-in): the effective cap is resolved from the class's program policy
 * (`maxParticipantsPerSession`) or the `scheduleCapacity` fallback, and a roster
 * larger than that cap is rejected with 422. Order: weekly (400) → collision
 * (409) → capacity (422) — weekly/collision behaviour is unchanged.
 *
 * @param {Object} target
 * @param {*} target.classId
 * @param {*} [target.teamId]              required for the weekly-cap check
 * @param {Date} target.start
 * @param {Date} target.end
 * @param {*} [target.excludeScheduleId]   ignore this schedule (used on updates)
 * @param {number} [target.incomingCount]  roster size about to be enrolled (enables the cap check)
 * @param {number} [target.scheduleCapacity] the Schedule.capacity that will apply (fallback when no program cap)
 * @param {Object} [opts]
 * @param {*} [opts.session]               Mongoose session for the enclosing tx
 * @param {boolean} [opts.enforceWeeklyCap=false]
 * @throws {ServiceError} 400 on weekly-cap breach, 409 on collision, 422 on capacity overflow
 */
const assertBookable = async (
  { classId, teamId = null, start, end, excludeScheduleId = null, incomingCount = null, scheduleCapacity = null },
  { session = null, enforceWeeklyCap = false } = {},
) => {
  if (enforceWeeklyCap && teamId) {
    const { weekStart, weekEnd } = getWeekBounds(start);
    const weeklyCount = await repository.countSchedulesForTeamInWeek(
      teamId, weekStart, weekEnd, excludeScheduleId, session,
    );
    if (weeklyCount >= WEEKLY_TEAM_LIMIT) {
      throw new ServiceError(WEEKLY_CAP_MESSAGE, 400);
    }
  }

  const collision = await repository.findScheduleForCollision(
    classId, start, end, excludeScheduleId, session,
  );
  if (collision) {
    throw new ServiceError(COLLISION_MESSAGE, 409);
  }

  if (incomingCount != null) {
    const { maxParticipantsPerSession } = await repository.findClassCapacityPolicy(classId, session);
    const cap = effectiveSessionCapacity({ scheduleCapacity, maxPerSession: maxParticipantsPerSession });
    if (incomingCount > cap) {
      throw new ServiceError(capacityMessage(cap), 422);
    }
  }
};

module.exports = {
  WEEKLY_TEAM_LIMIT,
  DEFAULT_SESSION_CAPACITY,
  getWeekBounds,
  snapshotActiveMembers,
  effectiveSessionCapacity,
  capacityMessage,
  assertBookable,
};
