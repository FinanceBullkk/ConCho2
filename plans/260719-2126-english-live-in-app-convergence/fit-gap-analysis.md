# Fit / Gap — English Operations vs the generic training model

This analysis maps the **live** English workflow onto current generic domains and
keeps the imported `eng_*` subsystem as historical evidence. Grounded in code and
specs as of 2026-07-19.

Legend — **Fit:** already supported · **Gap:** work required · **Decision:**
resolution locked by this plan.

## 1. Learner identity

- **English today:** `eng_employees` (308), keyed by normalized `emp_code`;
  `user_id` exists but 0/308 rows are linked.
- **Generic home:** `users`; generic enrollment, roster, attendance, and
  evaluation all reference a user.
- **Fit:** users already carry employee code, org/profile fields, status,
  soft-delete, and audit behavior. PostgreSQL already permits nullable password
  and email even though the current Admin create-user contract requires both.
- **Gap:** missing English people need roster identity but no credentials. The
  current user UI/API cannot create that record type. Some English people may
  already have valid ConCho2 accounts which must not be disabled.
- **Decision:** link by normalized `emp_code`. Preserve an existing user's auth
  state. Create only missing people as managed Participant-directory records with
  `can_login=false`, no password, and optional email. Add first-class managed-user
  create/update/soft-delete UI and API; the import-link job is not the only
  onboarding path.

## 2. Login-disabled state

- **Fit:** login and middleware already reject non-Active/deleted users and auth
  repositories have narrow projections.
- **Gap:** training `status` cannot represent authentication eligibility: managed
  learners must remain Active to appear in rosters. Login is not the only
  credential path; forgot/reset password, MFA enrollment, password change, and an
  already-issued token must all fail closed.
- **Decision:** add orthogonal `users.can_login BOOLEAN NOT NULL DEFAULT true`.
  Every auth projection reads it. Login checks it before password comparison;
  middleware checks it on every token; credential reset/change/MFA endpoints
  refuse it. Changing it invalidates auth cache and existing sessions. Do not
  overload `status` or create placeholder passwords.

## 3. English Operations workspace

- **Fit:** `PersonaContext`, `PersonaSwitch`, sidebar group sets, workspace
  breadcrumbs, persistence, and mobile switcher already support Admin Console ↔
  My Learning. Persona/workspace is explicitly UI-only.
- **Gap:** current context and navigation assume only `admin|learner`; English
  pages are scattered across generic surfaces or the imported-data section.
- **Decision:** add staff workspace `english` with Overview, Learners, Classes,
  Schedule, Attendance, Evaluation, and Archive. Participant remains locked to My
  Learning. Workspace filters never grant access; routes and use-cases enforce
  capabilities and resource scope.

## 4. English course → LearningProgram

- **English today:** `eng_courses` carries code/name, expected units, and maximum
  absences; each delivery is a separate `eng_course_runs` row.
- **Generic home:** `LearningProgram`.
- **Fit:** Program already models a reusable catalog item with category,
  scheduling mode, session count, and policy objects.
- **Gap:** current policy schemas do not express an absence-count exam gate or an
  ordered English level scale. Free-form Custom Fields are unsuitable for
  load-bearing policy.
- **Decision:** `category=english`, `schedulingMode=nomination`, plus a validated
  typed English policy containing `maxAbsencesAllowed` and an ordered level scale.
  A course-run Cohort snapshots this policy at creation so later Program edits do
  not change past eligibility or valid levels.

## 5. Stable English group is not a generic Cohort

- **English today:** `eng_cohorts` is a stable class/group. Its members may study
  several courses over time; `eng_cohort_pic` belongs to that operating context.
- **Generic truth:** a Cohort (`Class`) is one delivery of one Program. The
  learning-catalog spec calls it “one delivery of a Program.”
- **Gap:** mapping `eng_cohort → generic Cohort` would attach several Programs to
  an entity that can hold only one, and would give sessions/evaluations the wrong
  grain. Legacy Team cannot solve this: it is tied to one Class and is not a
  reusable cross-run roster template.
- **Decision:** no new stable-group aggregate in the generic spine. Store a typed
  `englishGroupCode` delivery-context field on each English course-run Cohort and
  let the English workspace group runs by it. When a new run is created, staff
  select/copy managed learners into direct Enrollments. This preserves the
  familiar class-centric UI without reviving Team as a second enrollment model.

## 6. English course run → generic Cohort

- **English today:** `eng_course_runs` is one delivery of one course to one stable
  group; it snapshots policy and owns run enrollments, sessions, and final result.
- **Generic home:** Cohort (`Class`) under one LearningProgram.
- **Fit:** exact semantic grain. Generic Evaluation is unique per
  `(classId,userId)`, which becomes one final result per course run and learner.
- **Gap:** the live Cohort needs `englishGroupCode`, a policy snapshot, and
  optional PIC presentation metadata.
- **Decision:** create one generic Cohort per live English course run. Its code is
  unique per run; `englishGroupCode` supplies the stable class label used by the
  workspace. PIC is informational metadata and never a teacher or authz binding.
  If PIC later gains permissions, introduce a generic owner binding explicitly.

## 7. Enrollment

- **English today:** `eng_run_enrollments` records a learner in a course run,
  including status and optional `start_session_number`.
- **Generic home:** direct cohort `Enrollment` (`teamId=null`).
- **Fit:** direct enrollment and bulk staff assignment already exist; the active
  cohort uniqueness guard prevents duplicates.
- **Gap:** current generic enrollment writes/DTOs do not expose metadata such as
  a mid-run starting session.
- **Decision:** direct Enrollment into the course-run Cohort. Add validated
  `startSessionNumber` metadata only when a learner joins after the run begins;
  preserve it in DTO/reporting and use it when interpreting missing attendance.

## 8. Live session → generic Schedule

- **English today:** `eng_session_units` is a numbered occurrence under a course
  run and is import-only.
- **Generic home:** Schedule/Session under the course-run Cohort.
- **Fit:** cohort booking already supports Office, Room lock, class/room conflict,
  roster snapshot, calendar integration, cancellation, and audit side effects.
  Session number is already derived by `domains/schedule/session-order` from
  chronological position within a Class.
- **Gap:** current code accepts cohort booking only for `self_enroll|nomination`;
  `admin_scheduled` is a Team mode. Teachers are not schedulers.
- **Decision:** English Programs use `nomination`. Admin/Coordinator create the
  session through the cohort path with `cohortId`; assigned Teachers receive
  read-only schedule access. Reuse derived `sessionNumber`; do not add duplicate
  session-sequence metadata.

## 9. Attendance and eligibility

- **English today:** `eng_attendance_records` contains canonical historical
  present/absent marks; archive eligibility is a shared SQL fragment over
  `eng_*`.
- **Generic home:** `domains/attendance` with its roster, marking, audit,
  soft-delete, and assignment policy.
- **Fit:** same session × learner grain. Generic statuses can retain P/A/L/EL;
  the English absence rule counts only the configured absence statuses.
- **Gap:** archive SQL is table-specific and cannot be shared literally with the
  generic attendance repositories.
- **Decision:** define one domain-level eligibility contract/pure policy
  (`unknown|within_limit|eligible|not_eligible`, counts, allowance). Archive SQL
  and live generic queries are separate adapters tested against the same contract
  fixtures. Assigned Teacher/Admin/Coordinator marking follows capability plus
  session/cohort assignment policy.

## 10. Final level → instructor-scored Evaluation

- **English today:** one active `eng_exam_results` level per run enrollment,
  soft-deleted on clear and blocked when absences exceed the policy.
- **Generic home:** instructor-scored Evaluation, surfaced through
  `GET /api/assessment/results/mine` and the grading workspace.
- **Fit:** Evaluation already has `(classId,userId)` uniqueness, `level`,
  soft-delete/revival, audit, teacher scoping, and unified read integration.
- **Gap:** its current DTO treats every Evaluation as a four-score rubric and
  fabricates a numeric percentage/pass outcome. English final levels have no
  numeric score or fail state. Coordinator English evaluation access also needs
  a scoped policy rather than broad quiz-management permission.
- **Decision:** add an English level-award result profile on Evaluation. Validate
  the level against the Cohort policy snapshot, enforce the live attendance gate
  before write, and return `level`/`outcome=level_awarded` without a fabricated
  score. Admin, assigned Teacher, and authorized English Coordinator may write;
  resource policy prevents cross-cohort access.

## 11. Archive, import, and combined reporting

- **English today:** import, raw staging, DQ issues, corrections, historical
  sessions/attendance, and exam results all write `eng_*`.
- **Gap:** a production archive cannot be read-only while the same importer is
  retained as a production backfill path. Merely tagging report rows by source
  does not define an overlap boundary.
- **Decision:** record `englishLiveCutoverAt`; after P5, block production
  INSERT/UPDATE/DELETE for archive tables and remove/archive all HTTP mutations.
  Keep the CLI importer only for disposable/staging reconstruction. Combined
  reports union archive rows before the cutover with live rows at/after it and
  carry source + natural identity, with explicit anti-double-count tests.

## Summary

Convergence remains the correct direction, but it is not merely a flag plus a few
policy bits. The load-bearing work is: managed-user lifecycle, correct
course-run grain, typed/snapshotted English policy, cohort-mode scheduling,
level-award Evaluation semantics, dedicated workspace IA, and an enforceable
archive boundary. None requires a second live English backend.

## Rejected alternatives

- **Live writes on `eng_*`:** duplicates the generic training spine and security
  controls.
- **Map stable `eng_cohort` directly to generic Cohort:** wrong grain; one stable
  group can study several Programs.
- **Use Team + `admin_scheduled`:** Team is Class-bound and would reintroduce the
  enrollment world being retired.
- **Big-bang history migration:** owner chose a frozen archive and fresh live
  start; avoids carrying historical DQ ambiguity into operations.
- **Give every imported learner credentials:** unnecessary and expands the auth
  surface; existing real accounts remain enabled, missing people become managed.
- **Separate English schedule backend:** the workspace can be specialized while
  Schedule remains shared.
