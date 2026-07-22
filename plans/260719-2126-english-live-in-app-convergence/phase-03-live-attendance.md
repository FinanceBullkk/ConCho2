# P3 — Live English attendance on the generic domain

**Priority:** High · **Status:** 🟢 implemented

**Context:** [plan.md](plan.md) · [fit-gap §9](fit-gap-analysis.md)

## Objective

Mark English attendance live through `domains/attendance` and compute exam
eligibility from generic attendance plus the course-run Cohort's snapshotted
English policy. Historical attendance remains untouched in `eng_*`.

## Marking behavior

- A live English mark is a generic Attendance row at Session × managed/existing
  learner grain, written through the existing bulk-mark use-case.
- Preserve generic P/A/L/EL statuses. The English policy explicitly defines which
  statuses count toward `absenceCount`; do not silently treat Late/Excused as
  Absent.
- Learners with `startSessionNumber` are not expected before their effective
  starting session. Those cells are `not_applicable`, not `unmarked`.
- All creates/updates/clears keep current audit, validation, soft-delete/revival,
  and roster membership checks.

## Eligibility contract

- Define a repository-independent policy result with at least:
  `status`, `absenceCount`, `allowedAbsences`, `markedCount`, `expectedCount`, and
  `unmarkedCount`.
- Status semantics are shared between archive and live projections, but storage
  adapters remain separate: archive SQL reads `eng_*`; live queries read generic
  Sessions/Attendance. Do not transplant table-specific
  `ELIGIBILITY_STATUS_SQL` into the generic repository.
- Both adapters run against the same contract fixtures so Archive and Live badges
  cannot drift semantically.

## Workspace entrypoint

- Add **Attendance** to English Operations.
- Treat English Operations as the sole staff navigation owner: remove duplicate
  Admin Console Attendance/Mobile Attendance entries and redirect legacy
  attendance URLs to this workspace.
- Admin/Coordinator can find any live English Session; assigned Teacher sees only
  their permitted sessions. The roster shows P/A/L/EL, unmarked/not-applicable,
  absence allowance, and live eligibility.
- The workspace never writes historical Archive attendance.

## Authorization

- Assigned Teacher may mark attendance only for an assigned English
  Cohort/Session according to the generic facilitator/teacher policy.
- Admin/Coordinator marking follows the explicit attendance capability policy.
- Unassigned Teacher, Participant, and managed users are denied server-side.

## Tests

- Bulk mark a live English roster and verify audit plus eligibility projection.
- At the configured boundary, `absenceCount == allowance` stays eligible and
  `allowance + 1` becomes `not_eligible`.
- Late/Excused semantics follow policy; pre-join sessions do not count as
  unmarked/absent.
- Unassigned Teacher denied; assigned Teacher allowed; malformed or cross-Cohort
  roster writes denied.
- Archive and live adapter fixtures produce the same contract statuses.

## Success / DoD

- English Operations supports live, audited attendance and a correct eligibility
  view sourced entirely from generic live data.
- No write reaches `eng_attendance_records`.
- Permission denial, policy edge cases, lint, and manual smoke pass.
- Update `english-training` and `attendance` specs when this phase ships.
