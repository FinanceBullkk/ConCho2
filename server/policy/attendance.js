/**
 * ──────────────────────────────────────────────────────────
 * server/policy/attendance.js (audit PR 5 — AUTHZ-001)
 * ──────────────────────────────────────────────────────────
 * Decides whether a Teacher (or Admin) may mark or read attendance
 * for a given Schedule. Maps schedule → class → teacherIds binding.
 *
 *   canMark(actor, classDoc)
 *     → Admin: always allowed
 *     → Teacher: allowed iff bound to the schedule's class
 *     → Other: denied
 *
 *   canReadBySchedule(actor, classDoc)
 *     same as canMark — viewing roster is as sensitive as marking it
 *     (both reveal participant identities + attendance state).
 */

const { isTeacherOfClass } = require('./classBinding');

const canMark = (actor, classDoc) => {
  if (!actor) return { allowed: false, reason: 'no-actor' };
  if (actor.role === 'Admin') return { allowed: true, reason: 'admin' };
  if (actor.role === 'Teacher') return isTeacherOfClass(actor, classDoc);
  return { allowed: false, reason: 'role-not-permitted' };
};

const canReadBySchedule = canMark;

module.exports = { canMark, canReadBySchedule };
