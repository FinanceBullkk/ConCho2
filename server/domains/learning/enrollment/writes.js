const repository = require('./repository');
const { publish } = require('../../../lib/event-bus');
const EVENTS = require('../../_shared/events');

// ──────────────────────────────────────────────────────────
// Enrollment write spine (converge Phase 2 — one write path for both modes)
// ──────────────────────────────────────────────────────────
// The SINGLE place an Active enrollment is created + announced, shared by:
//   - direct cohort enrollment  (domains/learning/enrollment/use-cases)
//   - team membership sync       (domains/groups/enrollment-sync)
// teamId set = group mode, null = direct cohort mode. Before this spine the two
// paths created rows independently and only cohort enroll published the domain
// event — so team-enrolled learners got no in-app bell and automation never
// fired. Routing both through here makes notification/automation uniform.

// Create one Active enrollment. Session-aware so the team-sync transaction can
// roll it back with the team/schedule writes. Returns the created row (plain
// object) — the caller uses it for the event payload + (cohort path) the API
// response.
const createActiveEnrollment = ({ userId, classId = null, teamId = null, joinedAt }, { session = null } = {}) =>
  repository.insertActiveEnrollment({ userId, classId, teamId, joinedAt }, session);

// Announce a freshly-persisted enrollment on the domain-event bus. No-op when
// there is no cohort (program-less team) — the bell + automation are
// cohort-scoped. MUST be called AFTER the row commits: the cohort path (no tx)
// calls it inline; the team path collects events and flushes them post-commit so
// a rolled-back transaction never emits. `cohort` is a Class doc
// ({_id, classCode, courseName}). `actorIsSelf` skips the bell for self-enroll.
const announceEnrollmentCreated = async (enrollment, cohort, { actorIsSelf = false } = {}) => {
  if (!cohort) return;
  await publish(EVENTS.ENROLLMENT_CREATED, { enrollment, cohort, actorIsSelf });
};

module.exports = { createActiveEnrollment, announceEnrollmentCreated };
