// ──────────────────────────────────────────────────────────
// scheduling-mode — resolve a team's effective schedulingMode
// ──────────────────────────────────────────────────────────
// The booking grid gates cells by the program's schedulingMode so a team
// leader never submits a booking the server will reject. Pass C enforces this
// server-side at the `bookSlot` chokepoint (assertTeamMode); this resolver is a
// UX-only pre-check, never the security boundary.
//
// schedulingMode lives on LearningProgram, reached via Class.programId
// (nullable). A program-less class falls back to 'leader_booking' — this MUST
// match the server fallback in
// server/domains/schedule/repository.js → findClassSchedulingMode, or the UI
// will disagree with enforcement.
// ──────────────────────────────────────────────────────────

/** The only mode in which a team leader may self-book on the /book grid. */
export const TEAM_BOOKABLE_MODE = 'leader_booking';

/**
 * Resolve a populated team object → its effective schedulingMode string.
 *
 * Falls back to 'leader_booking' when no program is linked (matches server).
 * Unknown / future mode strings pass through verbatim so callers (Phase 2) can
 * branch on them.
 *
 * @param {object} [team] - team doc with `classId.programId` populated
 * @returns {string} schedulingMode, e.g. 'leader_booking' | 'admin_scheduled'
 */
export function effectiveSchedulingMode(team) {
  return team?.classId?.programId?.schedulingMode || TEAM_BOOKABLE_MODE;
}

/**
 * True when a team leader may self-book sessions for this team (i.e. the
 * effective mode is `leader_booking`). All other modes are non-bookable on the
 * leader grid: `admin_scheduled` (Admin-only), `self_enroll`/`nomination`
 * (cohort-based), or any unknown mode.
 *
 * @param {object} [team] - team doc with `classId.programId` populated
 * @returns {boolean}
 */
export function isLeaderBookable(team) {
  return effectiveSchedulingMode(team) === TEAM_BOOKABLE_MODE;
}

/**
 * Map a non-bookable mode to a stable reason key for the booking banner copy.
 * The caller resolves it to text via `t('booking.modeLocked.<reason>')`.
 *
 *   'adminScheduled' — admin_scheduled (Admin-only)
 *   'cohort'         — self_enroll / nomination (cohort-based, not per-group)
 *   'generic'        — any other/unknown non-bookable mode
 *
 * @param {string} mode - an effective schedulingMode string
 * @returns {'adminScheduled'|'cohort'|'generic'}
 */
export function lockedReason(mode) {
  if (mode === 'admin_scheduled') return 'adminScheduled';
  if (mode === 'self_enroll' || mode === 'nomination') return 'cohort';
  return 'generic';
}
