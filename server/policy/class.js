/**
 * ──────────────────────────────────────────────────────────
 * server/policy/class.js (audit PR M — AUTHZ-004)
 * ──────────────────────────────────────────────────────────
 * Decides whether an actor may read a specific class by id.
 *
 * The list endpoint (GET /api/classes) intentionally remains open to
 * every authenticated user — it powers the dropdowns/search the SPA
 * uses everywhere. The per-id endpoint, however, exposes more detail
 * (totalSessions, courseName, status, optional notes) and previously
 * had no per-user check beyond `protect`. AUTHZ-004 closes that gap.
 *
 * Decision matrix:
 *   Admin       → always allowed
 *   Teacher     → allowed iff the class is in their teacherIds binding
 *                 (or binding is empty — see classBinding.js).
 *   Participant → allowed iff they have an Enrollment in a Team whose
 *                 classId matches this class. Dropped/Completed
 *                 enrollments still count — a participant should be
 *                 able to look up classes they used to be in.
 *
 * The decision is pure: caller fetches docs + does the existence
 * check, then asks this module for the decision. Unit-testable
 * without a live DB layer.
 */

const { isTeacherOfClass } = require('./classBinding');

/**
 * @param {Object} actor       - req.user (with _id + role)
 * @param {Object} classDoc    - the resolved Class document (or lean object)
 * @param {Object} [ctx]
 * @param {boolean} [ctx.participantEnrollmentExists] - precomputed by caller;
 *        true iff actor (a Participant) has any Enrollment whose team belongs
 *        to this class. Ignored for non-Participant roles.
 * @returns {{ allowed: boolean, reason: string }}
 */
const canRead = (actor, classDoc, ctx = {}) => {
  if (!actor) return { allowed: false, reason: 'no-actor' };
  if (!classDoc) return { allowed: false, reason: 'class-not-found' };

  if (actor.role === 'Admin') return { allowed: true, reason: 'admin' };

  if (actor.role === 'Teacher') {
    // Same graceful-migration semantics as evaluation/attendance policies.
    return isTeacherOfClass(actor, classDoc);
  }

  if (actor.role === 'Participant') {
    return ctx.participantEnrollmentExists
      ? { allowed: true, reason: 'participant-enrolled' }
      : { allowed: false, reason: 'participant-not-enrolled' };
  }

  return { allowed: false, reason: 'unknown-role' };
};

module.exports = { canRead };
