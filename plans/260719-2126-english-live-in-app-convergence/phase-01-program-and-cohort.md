# P1 — English program & cohort on the generic model

**Priority:** High (first live domain) · **Status:** 🔴 proposed
**Context:** [plan.md](plan.md) · [fit-gap §3–4, §7](fit-gap-analysis.md)

## Objective

Represent an English course as a `LearningProgram` (`schedulingMode =
admin_scheduled`) and an English class as a generic cohort, with English-specific
rules carried as **program config** — not a schema fork. Finalise the fit/gap
open questions (exam/level model, PIC binding).

## Key changes

- English course → `LearningProgram` + an **English policy block**: absence
  allowance, exam-sit gate (≤2), level scale reference. Config on the program,
  reusing existing policy fields where possible (`completionPolicy`,
  `capacityPolicy`, `facilitatorPolicy`).
- English class → cohort (`Class`) under that program; learners join via generic
  `Enrollment` (carry English `start_session_number` as metadata).
- **PIC** → cohort facilitator/owner binding **or** a custom field (custom-field
  domain). Decide here; do not mislabel PIC as teacher.
- Lock plan open questions 1 (level model: config vs. normalise) and 3 (PIC).

## Files

- `domains/learning/*` (program create with English policy), `domains/groups` /
  cohort enrollment, possibly `domains/custom-field` for PIC.
- Tests: create English program+cohort, enroll managed users, policy persisted +
  enforced; PIC binding resolves.

## Dependencies

P0 (learners must be `users`).

## Risks

- Over-fitting the generic policy fields → keep the English block minimal and
  explicit; extend only what's used (YAGNI).
- Vocabulary drift — reuse existing DTO vocabulary (cohort/session), no new world.

## Success / DoD

- An English program+cohort created in-app, learners enrolled, English policy
  stored + enforced. Tests + lint green. Spec: `english-training` MODIFIED
  (program/cohort now live on generic model) + `learning` if policy surface grows.
