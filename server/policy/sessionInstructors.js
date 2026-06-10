/**
 * ──────────────────────────────────────────────────────────
 * server/policy/sessionInstructors.js (re-center Phase 3, DELTA B)
 * ──────────────────────────────────────────────────────────
 * A session may name per-session INTERNAL trainers
 * (`Schedule.sessionInstructorIds`). They join the attendance/visibility
 * authz as a UNION on top of the cohort-teacher binding:
 *
 *   canMarkSession(actor, classDoc, schedule)
 *     = canMark(actor, classDoc)            (Admin / bound cohort teacher)
 *       OR isSessionInstructor(actor, schedule)  (named internal trainer)
 *
 * The cohort teacher is NEVER revoked — the override only ADDS a named
 * trainer for the single session. EXTERNAL trainers are NOT here: they have
 * no actor, never reach any `canX(actor, …)`, and are structurally incapable
 * of access (calendar invite + display only).
 *
 * Pure + HTTP-independent → unit-testable without a request or DB.
 */

const { canMark } = require('./attendance');

const idOf = (v) => (v && v._id ? v._id : v);

// Is the actor a named internal trainer on this schedule? Works whether
// sessionInstructorIds is raw ObjectIds or populated user docs.
const isSessionInstructor = (actor, schedule) => {
  if (!actor || !schedule) return false;
  const ids = Array.isArray(schedule.sessionInstructorIds) ? schedule.sessionInstructorIds : [];
  const actorId = String(actor._id);
  return ids.some((id) => String(idOf(id)) === actorId);
};

// UNION: the cohort decision OR a named-instructor grant for THIS session.
const canMarkSession = (actor, classDoc, schedule) => {
  const base = canMark(actor, classDoc);
  if (base.allowed) return base;
  if (isSessionInstructor(actor, schedule)) {
    return { allowed: true, reason: 'session-instructor' };
  }
  return base; // preserve the original deny reason (e.g. teacher-not-bound-to-class)
};

// Reading the roster is as sensitive as marking it — same UNION.
const canReadSession = canMarkSession;

module.exports = { isSessionInstructor, canMarkSession, canReadSession };
