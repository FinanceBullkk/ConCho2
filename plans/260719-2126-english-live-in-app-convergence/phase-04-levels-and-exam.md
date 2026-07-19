# P4 — Final English level on instructor-scored Evaluation

**Priority:** Medium; starts after live attendance · **Status:** 🟢 implemented

**Context:** [plan.md](plan.md) · [fit-gap §10](fit-gap-analysis.md)

## Objective

Record one final English level per learner per live course run using the generic
instructor-scored Evaluation concept. Enforce the snapshotted absence gate before
write and expose a level-award result through the unified assessment read without
inventing numeric scores or pass/fail semantics.

## Result grain and profile

- Because one generic Cohort is one English course run, the existing Evaluation
  uniqueness `(classId,userId)` is the required one-result-per-run-and-learner
  grain. Do not add a competing `enrollmentId`-unique result table.
- Add an explicit English level-award profile/kind to the Evaluation contract.
  It stores the selected level code/display value and optional note/date/actor;
  clear remains soft-delete and re-record revives/updates the same row.
- Four-skill rubric fields are not required for this profile and must not be
  defaulted into a misleading 0% score.
- Unified result DTO returns a typed level result, e.g.
  `source=evaluation`, `resultKind=english_level`, `level`,
  `outcome=level_awarded`, `scorePercent=null`, `passed=null`.

## Write policy

- Resolve Cohort → Program and require `category=english` plus a valid snapshotted
  English policy.
- Validate the level code against the Cohort snapshot, not the current Program
  policy and not the historical `eng_levels` table.
- Count live generic attendance with the P3 eligibility adapter. A participating
  enrollment over the allowance receives 422; unknown level receives 400.
- Admin and authorized English Coordinator may operate the class; an assigned
  Teacher may enter results for their Cohort. Resource policy blocks unrelated
  Teachers/Coordinators without granting broad quiz-authoring rights.

## Workspace entrypoint

- Add **Evaluation** to English Operations with a course-run worklist and a
  roster-first entry flow.
- Eligible learners can receive a level; ineligible/unmarked learners show the
  reason and cannot be submitted.
- Batch “Save all” may reuse the current interaction pattern, but each server
  result keeps atomic validation/audit semantics and reports partial failures
  explicitly.

## Dependency

P3 is mandatory: the live write gate reads generic attendance. The Program policy
and Cohort snapshot schema may be prepared in P1, but the mutation and UI do not
ship before P3.

## Tests

- Eligible learner receives a valid level; re-record updates/revives the same
  `(class,user)` row; clear soft-deletes and audits.
- Allowance + 1 absences returns 422; unknown or policy-stale level returns 400;
  unmarked/incomplete eligibility follows the locked policy.
- Unified DTO exposes no fabricated numeric score/pass state.
- Assigned Teacher/Admin/authorized Coordinator succeed; unrelated actor and
  Participant are denied.
- A later Program level-scale edit does not invalidate a result allowed by the
  Cohort snapshot.

## Success / DoD

- English level entry is live, attendance-gated, audited, soft-deletable, and
  visible in the unified assessment result shape.
- `eng_exam_results` receives no live write.
- Permission denial, policy edge cases, lint, and manual smoke pass.
- Update `english-training`, `evaluations`, `assessments`, `grading`, and
  `capability-authz` specs when this phase ships.
