// ──────────────────────────────────────────────────────────
// Domain-event catalogue (rearchitecture Phase 0).
//
// Names + payload shapes for the in-process event bus (`lib/event-bus`). One
// catalogue so publishers and subscribers agree on the contract. Start small —
// add events as flows migrate off hand-wired side effects.
// ──────────────────────────────────────────────────────────

const EVENTS = {
  // A learner was enrolled into a cohort.
  // payload: { enrollment, cohort, actorIsSelf }
  //   enrollment  — the created Enrollment doc (has .userId, ._id)
  //   cohort      — the cohort (Class) doc (for notification metadata)
  //   actorIsSelf — true when the learner enrolled themselves (no bell needed)
  ENROLLMENT_CREATED: 'enrollment.created',
};

module.exports = EVENTS;
