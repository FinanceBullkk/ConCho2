# P3 — Live attendance via domains/attendance

**Priority:** High · **Status:** 🔴 proposed
**Context:** [plan.md](plan.md) · [fit-gap §6](fit-gap-analysis.md)

## Objective

HR/Teacher mark English attendance live through `domains/attendance` (audit,
soft-delete, facilitator gate) instead of importing `eng_attendance_records`. The
≤2-absence eligibility stays a read projection over generic attendance.

## Key changes

- English session attendance = generic attendance records (roster × session,
  present/absent), marked via `domains/attendance` (`bulkMark`).
- Eligibility = read projection over generic attendance against the program's
  absence allowance (reuse the shared `ELIGIBILITY_STATUS_SQL` pattern from the
  archive so live + archive read the same way).
- Facilitator-assignment gate applies if the English program sets
  `facilitatorPolicy.assignmentRequired`.

## Files

- `domains/attendance/*` (English rides existing marking), a live eligibility read
  (mirror the archive's projection), client attendance UI reuse.
- Tests: mark English attendance → eligibility recomputes; >2 absences flips
  status; facilitator gate blocks marking when required.

## Dependencies

P1 (enrollment), P2 (sessions).

## Risks

- Two eligibility code paths (archive `eng_*` vs live) drifting — keep one shared
  projection shape.

## Success / DoD

- Live English attendance marked + audited; eligibility correct. Tests + lint
  green. Spec: `english-training` MODIFIED (attendance now live), `attendance` if
  surface changes.
