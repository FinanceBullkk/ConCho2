# ADR: English Training goes live in-app — one model, dedicated workspace

## Status

Superseded (2026-07-20) by
[`english-domain-authority.md`](english-domain-authority.md). The dedicated
English Operations workspace remains, but the generic Program/Class/PIC-Team
mapping and Archive cutover described below are no longer authoritative.

Originally accepted (2026-07-19). Owner approved the dedicated-workspace direction and
authorized implementation. Extended
[`converge-to-one-training-model.md`](converge-to-one-training-model.md) by
applying its "one training spine" principle to the imported English Training
subsystem. Phased plan:
`plans/260719-2126-english-live-in-app-convergence/`.

## Context

English Training (`eng_*` + `domains/english-training/`) shipped in 2026-07 as a
deliberately separate **Excel import and historical reporting** subsystem.
Migration `038` records the original premise: English employees were business
records and did not need ConCho2 login accounts. That separation was correct for
a read-mostly import: it protected the live booking paths and left
`eng_employees.user_id` intentionally null (0/308 linked).

The operating premise has changed. English classes will be run live in ConCho2:
staff maintain learners and course runs, schedule sessions, mark attendance, and
record final levels. Keeping `eng_*` as a second writable system for sessions,
attendance, enrollment, and assessment would duplicate the generic training
spine, its authorization, audit behavior, reporting, and UI.

Owner choices that scope the change (2026-07-19):

1. **Operating split:** Admin/Coordinator manage English learners, programs,
   course runs, enrollments, and schedules. Assigned Teachers see their schedule,
   mark attendance, and record evaluations. Teachers do not create programs,
   cohorts, or sessions. Learners do not log in for the English workflow.
2. **Historical data:** the imported 984 sessions and 5,962 canonical attendance
   records remain a frozen, read-only archive. At the operating boundary, only
   active Program/course-run structure and linked active rosters are carried
   forward; historical sessions, attendance, and results are not backfilled.
   The Schedule and Attendance tabs may project those archive rows into their
   canonical weekly grids through an explicit Historical source, but this is a
   read-only view over `eng_*`, not a copy into live tables.
3. **Scheduling depth:** live English sessions use the full generic scheduling
   grid, including Office/Room, calendar integration, and conflict guards.
4. **Information architecture:** English work is presented in a dedicated
   **English Operations** workspace beside **Admin Console** and **My Learning**.
   This is a UI/workflow boundary, not a new backend or authorization boundary.
   Schedule, Attendance, and field Mobile Attendance are owned by this workspace;
   Admin Console does not expose duplicate operational entries. Legacy calendar,
   schedule, and attendance URLs redirect to the corresponding English tab. The
   workspace embeds the canonical weekly Schedule and Attendance grids, scoped
   to English course-run Cohorts; it does not replace them with parallel list UIs.

## Decision

**Run live English Training on the generic training domains** (`learning`,
`schedule`, `attendance`, and instructor-scored `evaluation`/`assessment`) while
presenting it through a dedicated **English Operations** workspace.

The workspace is a filtered composition over shared services. It does not own a
second live data model. Server-side capability and resource policies remain the
authorization boundary; switching workspace only changes navigation and views.

### Target grain and mapping

| English concept | Generic live home |
|---|---|
| English course | `LearningProgram`, `category=english`, with typed English policy |
| Stable English class/group | `englishGroupCode` delivery context used to group runs in the workspace; not a generic Cohort or a reusable cross-run Team |
| English course run | `Class` exposed as a Cohort — one delivery of one Program — plus one run-scoped `Team` |
| PIC | `Team.leaderId` when linked to a live User; otherwise explicit unresolved Team metadata |
| Run enrollment | generic team-linked `Enrollment` into that course-run Cohort |
| Live session | `Schedule`/Session under the course-run Cohort |
| Attendance | `domains/attendance` |
| Final level | instructor-scored `Evaluation` for `(cohort, learner)`, surfaced by the unified assessment read |
| Learner | existing `users` row when one exists; otherwise a login-disabled managed `users` row |
| Historical `eng_*` | frozen read-only source shown in Archive and the Schedule/Attendance Historical views |

The grain distinction is load-bearing: an imported `eng_cohort` is a stable
group that may study several courses, whereas a generic Cohort is one delivery
of exactly one Program. Therefore `eng_course_run`, not `eng_cohort`, is the
concept that maps to a generic Cohort. The stable English group code remains
delivery context so the workspace can present the familiar class-centric view.

### Historical presentation

Schedule and Attendance each expose **Live** and **Historical** sources. Live
rows come only from the shared domains and retain their normal create/edit/mark
controls. Historical rows are adapted from Archive session/attendance reads,
carry a visible read-only label, and never expose booking, roster mutation, or
attendance-save controls. When an English course-run Cohort has no live Session,
the view opens on the latest Historical week so existing evidence is visible
instead of showing a misleading empty state.

### Scheduling mode

Live English uses a PIC-owned roster Team operated by staff, with no learner
self-service. Session creation remains the `nomination` cohort mode because the
Office/Room workflow is cohort-scheduled: the Team defines ownership and roster,
but is not the booking target. Admin/Coordinator create sessions through the existing cohort
booking path (`/api/learning/sessions/book-slot` with `cohortId`), which already
provides Office/Room locking, roster snapshots, calendar integration, and
conflict protection. It does not use the team-only `admin_scheduled` path.

### Managed people

Authentication eligibility is orthogonal to employment/training status. Add an
explicit `can_login` state, defaulting to `true` for normal users. A newly
provisioned English-only directory record has `can_login=false`, no password,
and may have no email. Every credential/session path fails closed for such a
record. Linking an English employee to an **existing** user never disables that
user's existing login; the link reuses the account as-is.

### English policy and evaluation

English-specific behavior is typed configuration, not a fork or an arbitrary
custom field. A Program owns the English policy (absence allowance and ordered
level scale), and the Cohort snapshots the policy when a course run is created so
later Program edits cannot rewrite historical eligibility.

A live final level uses the existing instructor-scored Evaluation grain of one
row per `(classId, userId)`. The English result profile records a level without
fabricating four-skill scores or a numeric pass/fail result. The unified
assessment DTO must distinguish this level-award profile from a scored rubric.

### Archive boundary

At cutover, application mutations and production imports into `eng_*` stop. The
workbook importer remains source-controlled for reproducibility and may run only
against disposable/staging databases; it is not a production backfill path after
the archive is frozen. A recorded cutover timestamp separates archive history
from live rows for combined reports.

### Active operating-boundary handoff

Before Archive freeze, Admin runs one explicit, audited handoff for source
`eng_course_runs.status=active`. It creates or reuses generic English Programs,
course-run Cohorts, one PIC-owned Team per run, and team-linked active Enrollments for archive learners already
linked to live Users. Active runs with an empty roster are still carried forward.
Unlinked learners are reported and skipped rather than silently dropped.

The command is retry-safe through stable natural source keys stored in internal
`meta` and protected by unique indexes. A retry may fill a newly linked roster,
but it never recreates an existing Program/Cohort or reverses later live status
changes. A linked PIC becomes Team leader but never a Teacher assignment; a
name-only PIC remains explicitly unresolved rather than being guessed. No source Session, Attendance, or Evaluation row crosses
this boundary.

## Consequences

- **Positive:** operators get a focused English workspace while the product keeps
  one scheduling, attendance, enrollment, evaluation, audit, and reporting spine.
- **Positive:** the correct course-run grain makes generic Evaluation's
  `(cohort, learner)` uniqueness match one English final result per delivery.
- **Positive:** managed learners appear in rosters without receiving credentials,
  while existing login-enabled employees retain their normal account access.
- **Cost:** the work spans managed-user lifecycle, typed English policy snapshots,
  workspace IA, live projections, and a controlled archive cutover.
- **Risk:** workspace filtering must never be mistaken for authorization;
  server-side capability and assignment policies remain mandatory.
- **Out of scope:** learner self-service for English, migration of historical
  Sessions/Attendance/Evaluations into the live spine, a second English
  schedule/attendance backend, and production re-import after archive freeze.

## Guardrails

Modular monolith; reuse domain chokepoints; no destructive `eng_*` renames; CSRF,
rate limits, capability + resource authorization, audit, validation, soft-delete,
and i18n on every applicable path; each phase ships with UI wiring, permission
denial coverage, a core edge case, and a documented smoke flow.

## Related

- Extends: [`converge-to-one-training-model.md`](converge-to-one-training-model.md)
- Aligns with: [`coordinator-scheduled-offline-model.md`](coordinator-scheduled-offline-model.md)
- Bounded by: [`ld-platform-modular-monolith.md`](ld-platform-modular-monolith.md),
  [`ld-domain-vocabulary.md`](ld-domain-vocabulary.md)
- Plan: `plans/260719-2126-english-live-in-app-convergence/`
- Supersedes the "separate by design" rationale in migration `038` only when the
  live paths and archive cutover have shipped.
