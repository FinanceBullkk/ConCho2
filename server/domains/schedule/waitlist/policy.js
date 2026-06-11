// ──────────────────────────────────────────────────────────
// Waitlist policy (Wave E3 phase-04, slice B) — pure decision fns
// ──────────────────────────────────────────────────────────
// Mirrors server/policy/* style: no DB access, callers resolve the inputs.
// Scope rule: a learner may queue for a session only when they BELONG to its
// audience — a member of the session's Team (team modes) or an active
// cohort-based enrollee of its Class (cohort modes). Membership is personal:
// there is no Admin bypass (joining is always self-join).

const idEq = (a, b) => String(a?._id || a) === String(b?._id || b);

/**
 * Is the actor part of the session's audience?
 * @param {Object} actor                      req.user
 * @param {Object} ctx
 * @param {Object|null} ctx.team              session's Team (members populated/ids) or null
 * @param {boolean} ctx.hasCohortEnrollment   active cohort-based Enrollment exists
 */
const isSessionAudience = (actor, { team, hasCohortEnrollment }) => {
  if (team) {
    const members = team.members || [];
    if (members.some((m) => idEq(m, actor._id))) return { allowed: true };
    return { allowed: false, reason: 'Only members of this session\'s team can join its waitlist' };
  }
  if (hasCohortEnrollment) return { allowed: true };
  return { allowed: false, reason: 'Only learners enrolled in this cohort can join its waitlist' };
};

/**
 * Join preconditions on the session itself (after audience passes).
 * Owner decision 2026-06-11: the waitlist is ONLY for full sessions —
 * free seats → 409, never an instant seat.
 */
const canJoinSession = (schedule, { effectiveCapacity, actorId, now = new Date() }) => {
  if (schedule.status === 'cancelled') {
    return { allowed: false, statusCode: 409, reason: 'This session is cancelled' };
  }
  if (new Date(schedule.startTime) <= now) {
    return { allowed: false, statusCode: 409, reason: 'This session has already started' };
  }
  const roster = schedule.enrolledUsers || [];
  if (roster.some((u) => idEq(u, actorId))) {
    return { allowed: false, statusCode: 409, reason: 'You are already enrolled in this session' };
  }
  if (roster.length < effectiveCapacity) {
    return {
      allowed: false,
      statusCode: 409,
      reason: 'This session still has free seats — the waitlist is only for full sessions',
    };
  }
  return { allowed: true };
};

module.exports = { isSessionAudience, canJoinSession };
