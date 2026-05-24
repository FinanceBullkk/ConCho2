/**
 * ──────────────────────────────────────────────────────────
 * server/policy/evaluation.js (audit PR 5 — AUTHZ-001)
 * ──────────────────────────────────────────────────────────
 * Decides whether a Teacher (or Admin) may read or write an Evaluation
 * for a given Class.
 *
 *   canRead(actor, classDoc, evaluationDoc?)
 *     → Admin: always allowed
 *     → Teacher: allowed iff class is in their teacherIds binding
 *                (or binding is empty — see classBinding.js).
 *     → Participant: allowed only when evaluationDoc.userId === actor._id
 *                    (legacy own-only scope from evaluationController).
 *
 *   canWrite(actor, classDoc)
 *     → Admin: always allowed
 *     → Teacher: allowed iff bound to the class
 *     → Participant / unknown: denied
 *
 * The decisions are pure — they take fetched docs, never req/res — so
 * unit tests can exercise every branch without a live HTTP layer.
 */

const { isTeacherOfClass } = require('./classBinding');

const canRead = (actor, classDoc, evaluationDoc) => {
  if (!actor) return { allowed: false, reason: 'no-actor' };
  if (actor.role === 'Admin') return { allowed: true, reason: 'admin' };

  if (actor.role === 'Participant') {
    // Existing Participant-scope rule: may only read evaluations whose
    // userId is themselves. evaluationDoc is required for this branch.
    if (!evaluationDoc) return { allowed: false, reason: 'participant-needs-eval' };
    return String(evaluationDoc.userId) === String(actor._id)
      ? { allowed: true, reason: 'participant-own' }
      : { allowed: false, reason: 'participant-cross-user' };
  }

  if (actor.role === 'Teacher') {
    return isTeacherOfClass(actor, classDoc);
  }
  return { allowed: false, reason: 'unknown-role' };
};

const canWrite = (actor, classDoc) => {
  if (!actor) return { allowed: false, reason: 'no-actor' };
  if (actor.role === 'Admin') return { allowed: true, reason: 'admin' };
  if (actor.role === 'Teacher') return isTeacherOfClass(actor, classDoc);
  return { allowed: false, reason: 'role-not-permitted' };
};

module.exports = { canRead, canWrite };
