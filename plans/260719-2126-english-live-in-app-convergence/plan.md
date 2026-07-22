---
change: english-live-in-app-convergence
status: superseded
target_specs: [english-training, capability-authz, users-and-roles, learning-catalog, enrollment, scheduling-and-booking, attendance, evaluations, reporting-and-rollups]
milestone: English Training — live convergence
created: 2026-07-19
revised: 2026-07-20
---

# Proposal: English Operations on the generic training spine

> **Superseded 2026-07-20.** Keep this plan as decision history only. The
> authoritative model and active work are in
> [`docs/decisions/english-domain-authority.md`](../../docs/decisions/english-domain-authority.md)
> and [`docs/specs/english-training/spec.md`](../../docs/specs/english-training/spec.md).
> Do not implement or rerun the generic Program/Class/PIC-Team handoff below.

> **Implementation status (2026-07-19):** P0–P4 are implemented. P5's archive
> guard, read-only UI, combined-history boundary, and audited cutover command are
> implemented; the one-way operational flip remains pending deployment,
> migration, data reconciliation, and the documented production smoke check.
> The disposable PostgreSQL prototype rehearsal passed on 2026-07-20 (migrations
> 040–046, vertical English smoke, Archive guards, and 84/84 integration suites).
> The active-boundary handoff was also exercised there: 5 Programs, 11 active
> course-run Cohorts, 11 PIC-owned Teams, and 56 linked Enrollments were verified with no copied
> historical Sessions or Attendance. This does not mark the production Archive
> as cut over.

> ADR: [`docs/decisions/english-live-converge.md`](../../docs/decisions/english-live-converge.md)
>
> Fit/gap: [`fit-gap-analysis.md`](fit-gap-analysis.md)

## Outcome

English classes are operated live in ConCho2 through a dedicated **English
Operations** workspace. The workspace owns the operator journey, not separate
business storage: live programs, course-run cohorts, sessions, attendance,
enrollments, and evaluations use the generic domains.

Historical `eng_*` data becomes a read-only Archive. Learners do not need
credentials: existing users are linked without changing their login state, and
missing people are created as managed users with `can_login=false`.

## Locked design decisions

1. **Correct grain:** English course → Program; English course run → generic
   Cohort plus one run-scoped Team; run enrollment → generic Team Enrollment. A stable English group/class is
   delivery context (`englishGroupCode`), not the generic Cohort itself.
2. **Scheduling:** live English uses `schedulingMode=nomination`, because current
   code defines the cross-run context. PIC leads the run Team; Admin/Coordinator
   still schedule the Cohort through the Office/Room-aware nomination path.
   Admin/Coordinator schedule through the generic cohort booking path.
3. **Roles:** Admin/Coordinator manage people, structure, enrollment, and
   scheduling. Assigned Teachers read their sessions, mark attendance, and enter
   evaluations. Learners do not access English Operations.
4. **Workspace boundary:** `English Operations` is the third client workspace
   beside `Admin Console` and `My Learning`. It is never an authz boundary.
5. **Policy:** absence allowance and the ordered level scale are typed Program
   policy, snapshotted onto each course-run Cohort.
6. **Archive:** production `eng_*` writes stop at cutover. The importer remains an
   offline/staging reproducibility tool, not a production backfill mechanism.
7. **Operating boundary:** immediately before cutover, carry only active source
   course runs and linked active rosters into generic live storage. Completed
   runs and all historical events remain Archive-only.

## Workspace navigation

| Section | Live source |
|---|---|
| Overview | English-filtered generic operations projections |
| Learners | managed/existing `users` directory records |
| Classes | stable group presentation over course-run Cohorts |
| Schedule | generic Sessions filtered to English Programs |
| Attendance | generic attendance for English Sessions |
| Evaluation | level-award Evaluation for English Cohorts |
| Archive | historical `eng_*`, visibly read-only |

The workspace switch is persisted like the existing persona choice. Participant
accounts remain locked to My Learning; staff see only workspaces allowed by their
server-backed role/capabilities.

## Phases

| # | Phase | Independently shippable outcome | Depends |
|---|---|---|---|
| P0 | [Managed people + workspace shell](phase-00-people-as-managed-users.md) | Managed learner lifecycle plus the English Operations shell and Learners entrypoint | — |
| P1 | [Program and course-run Cohort](phase-01-program-and-cohort.md) | English policy + snapshot, correct run grain, PIC Team rosters, Classes entrypoint | P0 |
| P2 | [English Schedule](phase-02-sessions-booking-grid.md) | Cohort sessions through the full generic grid, rooms/calendar/conflicts | P1 |
| P3 | [Live attendance](phase-03-live-attendance.md) | Generic attendance plus live English eligibility projection | P2 |
| P4 | [Levels and final evaluation](phase-04-levels-and-exam.md) | Level-award Evaluation gated by live attendance | P3 |
| P5 | [Cutover and Archive](phase-05-cutover-and-archive.md) | Production archive freeze, combined reporting, complete workspace journey | P2–P4 |

P4 is not parallel with attendance: its write gate reads live absence data and
therefore starts after P3. Policy/schema preparation may land in P1, but the live
result mutation does not ship before the attendance source of truth.

## Cross-phase gates

- Backend route/use-case uses real capability and resource policies.
- Each phase adds its English Operations entrypoint; no backend-only milestone.
- Every mutation has CSRF, rate limit where applicable, validation, audit, and
  soft-delete/revival semantics.
- Tests cover happy path, permission denial, and one core edge case.
- New strings use `t()` + `client/src/i18n/locales/en.json`.
- The affected behavior specs update in the same shipping phase. Roadmap status
  changes only when the ADR is Accepted and implementation starts.
- No destructive `eng_*` rename and no second live English domain.

## Explicitly deferred

Learner English self-service/login, historical event migration into the generic spine,
placement tests, certificates issued inside ConCho2, re-sit/version history, and
changing the platform-wide scheduling-mode taxonomy beyond what this flow needs.
