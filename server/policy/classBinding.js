/**
 * ──────────────────────────────────────────────────────────
 * server/policy/classBinding.js
 * ──────────────────────────────────────────────────────────
 * Shared helper for evaluation + attendance + (future) schedule policies.
 *
 * Defines a single decision:
 *   isTeacherOfClass(actor, classDoc) → { allowed, reason }
 *
 * Graceful-migration default: when classDoc.teacherIds is empty/missing,
 * the policy is PERMISSIVE (`{allowed: true, reason: 'no-binding-set'}`).
 * Once teacherIds is populated, only listed teachers are allowed.
 *
 * This keeps the rollout zero-downtime: existing classes continue to
 * work; admins enforce per-class binding by editing teacherIds on each
 * class. See docs/audit/findings.md → AUTHZ-001.
 */

const isTeacherOfClass = (actor, classDoc) => {
  if (!actor) return { allowed: false, reason: 'no-actor' };
  if (actor.role === 'Admin') return { allowed: true, reason: 'admin-bypass' };
  if (actor.role !== 'Teacher') return { allowed: false, reason: 'not-teacher' };
  if (!classDoc) return { allowed: false, reason: 'class-not-found' };

  const teacherIds = Array.isArray(classDoc.teacherIds) ? classDoc.teacherIds : [];
  // Graceful migration window: empty list = "binding not yet configured" =
  // permissive. Once admins populate teacherIds on each class, the gate
  // becomes effective.
  if (teacherIds.length === 0) return { allowed: true, reason: 'no-binding-set' };

  const actorId = String(actor._id);
  const found = teacherIds.some((id) => String(id) === actorId);
  if (found) return { allowed: true, reason: 'is-bound-teacher' };
  return { allowed: false, reason: 'teacher-not-bound-to-class' };
};

module.exports = { isTeacherOfClass };
