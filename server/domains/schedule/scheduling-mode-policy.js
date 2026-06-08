// ──────────────────────────────────────────────────────────
// Scheduling-Mode Policy (Pass C)
// ──────────────────────────────────────────────────────────
// Single home for "which schedulingMode may create which kind of session", so
// the legacy booking paths and the learning/session adapter enforce ONE rule
// set instead of two. schedulingMode lives on LearningProgram and reaches a
// session via Class.programId.
//
//   Team modes   = leader_booking | admin_scheduled  -> booked against a Team/Group
//   Cohort modes = self_enroll    | nomination       -> booked against a Cohort (no team)
//
// This module owns the mode SETS + the assert mapping (400/403/501) + the
// resolver fallback. It deliberately does NOT live in session-booking-policy
// (whose charter is booking INVARIANTS: weekly cap + collision + roster) — this
// is authorization, a separate concern. DB access goes through the schedule
// repository so there are no ad-hoc model reads scattered in the service layer.
// ──────────────────────────────────────────────────────────

const { ServiceError } = require('../../helpers/ServiceError');
const repository = require('./repository');

const TEAM_SCHEDULING_MODES = new Set(['leader_booking', 'admin_scheduled']);
const COHORT_SCHEDULING_MODES = new Set(['self_enroll', 'nomination']);

// Messages are part of the API contract (asserted by learningSessionRoutes
// tests) — keep wording stable.
const cohortForTeamMessage = (mode) =>
  `This program uses cohort-based enrollment (${mode}) — schedule its sessions against the cohort, not a group`;
const unknownModeMessage = (mode) => `Scheduling mode '${mode}' is not supported yet`;
const ADMIN_SCHEDULED_MESSAGE =
  'This program is admin-scheduled — only an Admin can create its sessions';

/**
 * Structural rule: a team/group session may only be created for a TEAM mode.
 * Cohort modes (self_enroll/nomination) must be scheduled against the cohort
 * (400); an unknown/future mode fails closed (501). Actor-independent — used by
 * the Admin override paths (adminCreate, updateSchedule reassign), which stay
 * permissive for the team modes (BR-6) but must respect the cohort-vs-team
 * structural invariant.
 * @throws {ServiceError} 400 cohort mode, 501 unknown mode
 */
const assertTeamModeStructural = ({ schedulingMode }) => {
  if (COHORT_SCHEDULING_MODES.has(schedulingMode)) {
    throw new ServiceError(cohortForTeamMessage(schedulingMode), 400);
  }
  if (!TEAM_SCHEDULING_MODES.has(schedulingMode)) {
    throw new ServiceError(unknownModeMessage(schedulingMode), 501);
  }
};

/**
 * Full team-booking gate (structural + authorization): on top of the structural
 * rule, an admin_scheduled program may be booked ONLY by an Admin. Used by the
 * shared bookSlot chokepoint (legacy /book-slot leader route + learning adapter).
 * @throws {ServiceError} 400 cohort mode, 501 unknown mode, 403 admin_scheduled by non-Admin
 */
const assertTeamMode = ({ schedulingMode, actor }) => {
  assertTeamModeStructural({ schedulingMode });
  if (schedulingMode === 'admin_scheduled' && actor?.role !== 'Admin') {
    throw new ServiceError(ADMIN_SCHEDULED_MESSAGE, 403);
  }
};

/**
 * Cohort-booking gate: a team-less cohort session may only be created for a
 * COHORT mode. Used by the learning/session adapter's bookCohortSession.
 * @throws {ServiceError} 400 when the program is not a cohort mode
 */
const assertCohortMode = ({ schedulingMode }) => {
  if (!COHORT_SCHEDULING_MODES.has(schedulingMode)) {
    throw new ServiceError(
      `Cohort-based scheduling is only for self_enroll/nomination programs (this cohort is '${schedulingMode}' — book against its group instead)`,
      400,
    );
  }
};

/**
 * Resolve the schedulingMode governing a team or class. Walks
 * team -> class.programId -> program, falling back to 'leader_booking' when the
 * program link is absent. Pass a Mongoose session to read inside a transaction.
 * @param {{ teamId?: any, classId?: any }} target
 * @returns {Promise<string>} schedulingMode
 */
const resolveSchedulingMode = async ({ teamId = null, classId = null }, session = null) => {
  let resolvedClassId = classId;
  if (!resolvedClassId && teamId) {
    const team = await repository.findTeamById(teamId, { select: 'classId', lean: true, session });
    resolvedClassId = team?.classId || null;
  }
  return repository.findClassSchedulingMode(resolvedClassId, session);
};

module.exports = {
  TEAM_SCHEDULING_MODES,
  COHORT_SCHEDULING_MODES,
  assertTeamMode,
  assertTeamModeStructural,
  assertCohortMode,
  resolveSchedulingMode,
};
