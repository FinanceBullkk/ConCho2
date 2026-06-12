# Development Roadmap — TMS v2 → Internal LTMS (living tracker)

> **This is the canonical progress tracker.** Update it as milestones move.
> - *Why / strategy / 6-month direction* → [`lms-roadmap.md`](lms-roadmap.md)
> - *Architecture / orientation* → [`system-overview.md`](system-overview.md)
> - *Detailed task snapshot* → [`handoff-2026-06-01.md`](handoff-2026-06-01.md)
>
> **Last updated:** 2026-06-11

---

## Current status

~64% through the TMS → L&D migration. **Wave A (Foundation) is complete:** all 4
`schedulingMode`s enforced (no 501 stubs); cohort-based enrollment live
(`/api/learning/enrollments`, incl. self-enroll); the Learning page is
write-capable (Admins create/edit Programs, create Cohorts, enroll learners);
and a **capability-based authz scaffold** (`program.manage`/`session.book` …) now
gates the learning routes behind `policy/capabilities.js` + `requireCapability`.
**Wave B is progressing:** `completionPolicy` is now fully enforced — attendance %,
required assessment, **and required feedback**. Certificates are issued on
completion (`/api/learning/completion`, `/api/learning/certificates` + a public
verification endpoint), and a **Feedback** foundation (`/api/learning/feedback`)
unblocks `requiresFeedback`. The **generic assessment engine (v1)** is now live
(build-vs-buy → **build in-house**): a new `domains/assessment` (`/api/assessment`)
authors item-based, auto-graded quizzes; a passing attempt satisfies
`requiresAssessment` alongside the legacy `Evaluation`. **Completion reporting**
is live (`GET /api/learning/reports/completion` + `.xlsx` export) and now
**surfaced in the UI**: a gated **Reports tab** on the Learning page lets
Admins/Teachers pick a cohort and view the per-learner completion table +
summary, with one-click Excel export (i18n en+vi). Assessment UI is now usable
end to end for v1: Admins/Teachers create/list/archive cohort quizzes in the Learning
workspace, and learners take published quizzes from `/me/assessments`. Feedback
UI is also live: Admins/Teachers review cohort submissions from `/learning`, and
Participants submit/re-submit feedback from `/me/feedback`. First assessment
iteration is now done too: managers can update assessment metadata, publication
state, and item definitions after creation. A backend question-bank foundation is
now live: managers create/list/update/archive reusable questions and import them
into assessments as immutable item snapshots. The Learning Assessments tab now
surfaces this bank for managers and can import selected bank questions into
assessment create/update. Manual grading v1 is also live: Admins/Teachers can
review submitted short-text answers, override per-answer scores, and completion
uses the updated pass state. Completion report rollups are now live too:
`GET /api/learning/reports/completion/rollup` aggregates completion by program
and department, and the Learning **Reports** tab shows those rollups above the
cohort detail report. Wave C has started with a learner-facing catalog:
Participants can open `/me/catalog`, browse/search active self-enroll programs,
and enroll in available cohorts through the existing cohort-enrollment API.
**Prerequisite gating v1** is now live: a `LearningProgram` can declare
`prerequisitePrograms`, and self-enrollment (incl. `/me/catalog`) is blocked
(422) until the learner has completed each prerequisite — a passing completion
or an Issued certificate counts; Admins may override. A **prerequisite-selector
UI** now lets Admins set `prerequisitePrograms` on a Program from the Learning
workspace (multi-select of other active programs; persists on create + edit).
**Sequenced learning paths v1** now exist as a backend foundation: a new
`LearningPath` (`/api/learning/paths`) is an ordered curriculum of programs with
Admin CRUD and a per-learner `…/progress` endpoint that derives step state
(`completed`/`current`/`locked`) from program completion (reusing the
prerequisite engine). An **admin Paths tab** on `/learning` now lets Admins
create/edit/archive paths with an ordered program picker. A **learner
path-progress view** (`/me/paths`) now closes the loop: learners see each path's
ordered steps marked `completed`/`current`/`locked` with a progress bar (from the
`…/progress` endpoint), linked from the Participant dashboard. **Wave C core is
complete.** The UI is now **English-only** (single `en` locale; `vi.json` removed).
**Wave D1 has started (codeable slice):** scheduled jobs now **self-monitor** — a
durable `CronRun` heartbeat (last run / status / duration / error, upserted per
run) plus Sentry **cron check-ins** (in-progress→ok/error, fail-soft) wrap the
nightly reconcile + attendance-reminders via `lib/cronMonitor.runMonitored`, and a
gated **`GET /api/admin/cron/health`** + a **Scheduled jobs** panel on the
Reconcile page answer "did cron actually fire?" on the sleeping free-tier. The
remaining D1 work (paid always-on hosting, Sentry account/dashboard cron-monitor
setup) is owner ops. **Wave D3 v1 (org model) is now live** (built ahead of D2,
whose user OIDC login is blocked on the owner's Google OAuth app + allowed
Workspace domain): a `Department` entity + `User.managerId`/`departmentId` (added
non-destructively alongside the legacy `department` string), an Admin
`domains/org` module (`/api/org`) for department CRUD + manager/department
assignment (cycle-guarded, audited), and a self-scoped **manager dashboard**
(`GET /api/org/my-team`) that reuses certificates/enrollments for a per-report
training rollup. UI: People → **Departments** tab, an org-assignment action on
Users, and a conditional **My Team** nav entry → `/my-team` page. **Wave D4 v1 is
now live too:** Admins can assign active Programs or Learning Paths to explicit
users and/or Departments with a due date; `/api/learning/assignments` derives
learner status (`not_started`/`in_progress`/`complete`/`overdue`) from completion
and enrollment signals; the Learning workspace has an **Assignments** tab for
Admin/Teacher read and Admin create/archive. **Wave D5 v1 is now live:**
assignment reminders send due-soon and overdue emails from D4 due dates, persist
idempotent `NotificationLog` records, and send weekly manager overdue digests
through a monitored cron endpoint. **Wave D6 v1.1 backend report slice is now
live:** Admin-only `GET /api/learning/reports/compliance` + `.xlsx` export joins
D4 assignment status, D3 department/manager scope, and certificate state
(`issued`/`missing`/`revoked`) with audit-backed export and formula-injection
guarded workbook cells. **D6 certificate expiry policy is also live:** Programs
can set `certificateValidityDays`; issued certificates snapshot `validFrom`,
`validUntil`, and `validityDays`; completion + compliance reports expose
`issued`/`expiring`/`expired`/`revoked` state without changing prerequisite
completion semantics. **D6 frontend compliance report UI is now live too:**
Admins can open Learning -> Reports -> Compliance, set assignment/program/org/
status/certificate/due-window filters, load the report on demand, scan summary
tiles + learner rows, and download the compliance xlsx; Teachers keep the
completion-only Reports view and Participants remain gated out. **D6 v1.1 is now
verified and closed** with focused backend/client gates, lint, production bundle,
syntax check, and a browser export smoke recorded in
`plans/reports/context-260605-1954-wave-d6-compliance.md`. D2 Google OIDC/
Directory sync still needs owner inputs. **Re-center Phase 1 (Office +
Training-coordinator role) is now live:** a first-class `Office` entity
(`/api/org/offices`, Admin/Coordinator CRUD, archive guard), nullable
`User.officeId` settable from the org-assignment action, and a new
**`Coordinator` role** — an explicit training-ops capability allow-list
(programs/cohorts/sessions/enrollment/certificates/reports/assignments/paths +
office manage, department read) that can NOT touch user accounts, security
surfaces, or org placement. UI: People → **Offices** tab (per-tab perm gating),
Office picker on org assignment, Coordinator-aware nav/routes. The AuditLog
entity enum was also backfilled — Department/Certificate/Assessment*/Feedback/
Assignment/LearningPath audits had been failing silently. **Re-center Phase 2
(coordinator-scheduled session flow) is now live:** a **scheduler** (Admin or
Coordinator) opens a team-less offline session against a cohort
(`self_enroll`/`nomination`) at a physical **Office** + a configured time slot
via a new **Create-session** action on the Learning → Cohorts tab; the roster
comes from self-enrol + coordinator-assign (no Team). `Schedule.officeId` is
required for this flow (nullable for legacy rows); cohort-session creation was
widened from Admin-only to the scheduler set. **Re-center Phase 3 (Office-scoped
Rooms + internal/external Trainers) is now live:** a first-class **`Room`** entity
(`/api/rooms`, Admin/Coordinator CRUD via `room.read`/`room.manage`) scoped to
exactly one **Office**; assigning a room to a session is guarded by a `RoomBooking`
ledger whose unique `{roomId,startTime}` index is the DB-final per-room
double-book lock (cross-class race → 409), written atomically with
`Schedule.roomId` and released on every Schedule-removal path (cancel/delete/
auto-release/team-sync) + a reconcile orphan-sweep check; a room in a different
Office than the session → **422**. **Trainers** are per-session: internal trainers
(`Schedule.sessionInstructorIds`, User refs) join the attendance/visibility authz
**UNION** (a named trainer can mark/read their session even when not the cohort
teacher; the cohort teacher is never revoked), and an **external** trainer
(`externalTrainer` subdoc — name/email/phone/org, no User, no login) gets a
calendar invite + display only (email/phone hidden from learner DTOs). One
mutation `PUT /api/schedules/:id/trainers` (`session.assign-trainer`,
Admin/Coordinator) sets both; `cancelSlot` was widened so a Coordinator can cancel
a team-less cohort session. UI: People → **Rooms** tab (Office-scoped CRUD) + an
Office-scoped **Room picker** in the coordinator Create-session modal. The
**trainer-assignment UI is now live** (2026-06-10): Learning → Cohorts gains a
per-cohort **Sessions** panel (`assign:trainer`, cohort-mode cohorts only —
same gate as Create-session) listing each session's time /
office·room / current trainer chips, with a **Trainers** action opening a modal
that assigns internal Teachers (Admin picker; a Coordinator keeps the current
internal trainers read-only) and/or an external trainer
(`{name,email?,phone?,org?}`) in one `PUT /api/schedules/:id/trainers`.
**Durable cancellation is now live (2026-06-11, Wave E3 phase-04 slice A):**
cancelling/deleting a session flips it to `status:'cancelled'` (who/when/why
kept; attendance + roster preserved; room released + `roomId` nulled in-tx)
instead of hard-deleting; the `{classId,startTime}` unique index became
**partial (`status:'scheduled'`)** so the freed slot re-books (idempotent
migration script for existing deployments); cancelled rows are excluded from
every operational query (collision, weekly cap, availability, calendars, lists,
reminders, reconcile, numbering, dashboards, reports, completion, sync) with a
staff history view (`?status=cancelled|all` + a Cancelled chip in the cohort
Sessions panel). **Waitlists + FIFO auto-promotion are now live too
(2026-06-11, phase-04 slice B):** a learner self-joins the queue of a FULL
session they belong to (free seats → 409 by owner decision); a freed seat
(capacity raise / team-member removal / Dropped auto-release) promotes the
oldest waiter inside the freeing transaction (roster never exceeds the
effective cap) with idempotent `waitlist_promoted` notifications + email +
calendar refresh; cancelling a session dissolves its queue and emails the
waiters; a unified `releaseScheduleResources` cleans room locks + waitlists on
every removal path. Learner UI: **`/me/sessions`** (upcoming sessions across
their cohorts — Enrolled / Waiting #N / Join-waitlist states), powered by a
Participant visibility widening on the learning session list. **Wave E is now
functionally COMPLETE** except: admin waitlist panel (staff API exists),
session-list visibility for trainer-only teachers.

---

## Migration phases (backend re-architecture)

| Phase | Theme | Progress | Status |
|------|-------|---------:|--------|
| 0 | Architecture baseline + safety net | ~93% | 🟢 near done |
| 1 | Backend modular-monolith refactor | ~98% | 🟢 near done (2026-06-10: domains/attendance+groups+schedule routes extracted; repository ADR; schedule use-case tests; frontend `features/` migration complete) |
| 2 | Learning catalog + generic cohort model | ~95% | 🟢 near done |
| 3 | Multi-program enrollment + session scheduling | ~78% | 🟡 in progress |
| 4 | Frontend L&D workspace (CRUD UI) | ~78% | 🟡 in progress |
| 5 | Reporting, completion, feedback | ~72% | 🟡 in progress |
| 6 | PostgreSQL decision gate | 0% | ⚪ gated |

## LTMS waves (forward — see [`lms-roadmap.md`](lms-roadmap.md))

| Wave | Goal | Status | Depends on |
|------|------|--------|-----------|
| A — Foundation | Generic learning core works E2E (scheduling modes, cohort enrollment, CRUD UI, capability authz) | 🟢 done (M1–M4) | — |
| B — Assessment & Certification | Generic assessment engine, completion enforcement, certificates | 🟡 in progress (completion + certificates + feedback + assessment engine v1 + completion reporting + rollups + assessment UI + feedback UI + assessment edit + question-bank backend/UI + manual grading v1 done) | A |
| C — Catalog, Paths & Self-service | Learner catalog, self-enroll, learning paths/prerequisites | 🟢 core done (learner catalog + self-enroll UI + prerequisite gating v1 + prereq selector UI + sequenced learning paths v1 + admin paths UI + learner path-progress view) | A |
| D — Platform & Scale | Production readiness → Google OIDC + Directory sync → manager hierarchy (org model) → mandatory assignment + due dates → notifications/escalation → compliance reporting + recertification. Order locked 2026-06-04 (after C closes). | 🟡 in progress (D1 cron self-monitoring done; **D3 v1 org model done**; **D4 assignment+due-dates v1 done**; **D5 assignment reminders + manager escalation v1 done**; **D6 v1.1 compliance report/export + certificate expiry signal + frontend UI verified/closed**; paid hosting + Sentry-account setup + D2 Google OAuth app = owner ops/inputs) | B, C |
| E — Generic scheduling | Generalize booking beyond fixed English slots (session types, rooms, capacity, waitlists, instructors); keep leader-booking as one mode. Committed parallel track; large, own plan. | 🟢 functionally complete (**E1 done** — backend `ALLOWED_TIME_SLOTS` authoritative + exact-slot grid client (2026-06-09); **E2 capacity done**; **rooms done** via re-center Phase 3; **trainer-assignment UI done** (2026-06-10); **durable cancellation done** (2026-06-11, phase-04 A); **waitlists + FIFO auto-promotion + `/me/sessions` learner UI done** (2026-06-11, phase-04 B); residual polish: admin waitlist panel (staff API live), session-list visibility for trainer-only teachers) | A |

> **Direction locked 2026-06-04** — full rationale + gap analysis in
> [`ltms-gap-analysis.md`](ltms-gap-analysis.md). Six-month order:
> `C1 → D1 → D2 → D3(manager) → D4(assignment) → D5(notifications) → D6(compliance)` + Wave E parallel.

## Quality gate — done means wired

No feature factory. After each milestone, review wiring before starting new
capability:

- backend route/use-case works with real authz/capability rules;
- frontend entrypoint exists when user value depends on UI;
- i18n en updated for user-facing strings;
- audit log and soft-delete behavior correct for mutations;
- reports/completion/certificates/notifications consume the new data when relevant;
- tests cover happy path, permission denial, and one core edge case;
- broken links/routes/buttons and stale docs/roadmap checked.

Bug fixing and integration review rank above net-new feature rollout.

---

## Near-term milestones (Wave A)

| ID | Milestone | Acceptance | Status |
|----|-----------|-----------|--------|
| M1 | Enforce all 4 scheduling modes | leader/admin/self-enroll/nomination each have a real flow + tests; no 501 stubs | 🟢 done 4/4 (leader/admin team-booking; self_enroll/nomination Admin-schedule cohort sessions over M2 enrollments) |
| M2 | Cohort-based enrollment | `/api/learning/enrollments` (cohort-based, multi-program) + self-enroll path | 🟢 done (enroll/self-enroll/withdraw/list; bulk + session-roster wiring deferred) |
| M3 | Learning CRUD UI | Create/edit Program, create Cohort, enroll learners (not read-only) | 🟢 done (Programs create/edit/archive; Cohort create; per-cohort enroll/withdraw; Admin-gated; i18n en+vi) |
| M4 | Capability-based authz scaffold | `program.manage`/`session.book` style checks behind `policy/` | 🟢 done (`policy/capabilities.js` + `requireCapability`; learning routes wired; Admin superuser, behavior-preserving) |
| → | **Wave B kickoff** | Completion enforcement + certificates (issue/revoke/verify) | 🟢 done — `completionPolicy` enforced; `Certificate` model + public verification. Assessment engine (build-vs-buy) still open |
| → | **Wave B — feedback foundation** | `Feedback` model + submit/list; unblock `requiresFeedback` | 🟢 done — `/api/learning/feedback` (learner self-submit / Admin on-behalf); completion now honours `requiresFeedback`; `feedback.submit`/`feedback.read` capabilities |
| → | **Wave B — assessment engine v1** | Generic item-based quizzes + auto-graded attempts; satisfy `requiresAssessment` | 🟢 done — new `domains/assessment` (`/api/assessment`): author/list/get/archive + attempt with pure auto-grading (single/multi-choice, short-text). Passing attempt OR legacy `Evaluation` meets completion. `assessment.manage/read/attempt` capabilities. Iteration (banks, item edit, UI) deferred |
| → | **Wave B — completion reporting** | Cohort completion report (per-learner + summary) + `.xlsx` export | 🟢 done — `domains/learning/reports/`: `GET /api/learning/reports/completion` reuses the completion engine across the cohort roster ∪ enrollments, attaches certificate status, rolls up a summary; `/export` streams xlsx (exceljs). `report.read` capability (Admin/Teacher) |
| → | **Phase 4 — completion report UI** | Surface the completion report in the Learning workspace | 🟢 done — gated **Reports tab** on `/learning` (Admin/Teacher via `read:reports`): cohort selector → per-learner completion table + summary tiles + one-click `.xlsx` export. i18n en+vi; React Query hooks; 3 component tests |
| → | **Phase 4 — assessment authoring UI** | Surface generic assessment authoring in the Learning workspace | 🟢 done — **Assessments tab** on `/learning`: Admin/Teacher create/list/archive cohort quizzes (`single_choice`, `multiple_choice`, `short_text`). i18n en+vi; React Query hooks; 3 component tests |
| → | **Phase 4 — learner assessment-taking UI** | Let learners take published assessments | 🟢 done — `/me/assessments` self-service page lists assessments for enrolled/scheduled cohorts, shows latest attempt status, and submits auto-graded answers; linked from Participant dashboard. 2 component tests |
| → | **Phase 4/5 — feedback UI** | Let learners submit feedback and managers review it | 🟢 done — **Feedback tab** on `/learning` (Admin/Teacher via `read:feedback`) lists cohort submissions; `/me/feedback` lets Participants submit/re-submit ratings and comments for enrolled/scheduled cohorts. 2 component test files |
| → | **Wave B — assessment edit support** | Let managers update existing assessments | 🟢 done — manager-only `PUT /api/assessment/assessments/:id` replaces assessment metadata/items atomically; Learning Assessments tab now opens existing quizzes in the authoring modal and saves edits. |
| → | **Wave B — question bank foundation** | Reusable assessment questions | 🟢 done — manager-only `/api/assessment/question-bank` create/list/update/archive; assessment create/update imports bank items via `questionBankItemIds` as immutable snapshots. |
| → | **Phase 4 — question bank UI** | Surface reusable questions in Learning | 🟢 done — manager-only Question Bank panel on Assessments tab; create/archive bank questions; assessment modal imports selected bank questions. |
| → | **Wave B — manual grading v1** | Review short-text answers | 🟢 done — manager-only `PUT /api/assessment/attempts/:id/manual-grade`; Learning Assessments tab review modal updates short-text scores/notes and recomputes pass state. |
| → | **Wave B — completion report rollups** | Aggregate completion by program and department | 🟢 done — `GET /api/learning/reports/completion/rollup` reuses cohort completion rows, returns program/department summaries, and Learning Reports shows rollup tables above cohort detail. |
| → | **Wave C — learner catalog self-enroll v1** | Learners browse and enroll themselves | 🟢 done — Participant route `/me/catalog` lists active `self_enroll` programs with ongoing cohorts, search/category filters, existing-enrollment state, and enrollment action via `/api/learning/enrollments`. |
| → | **Wave C — prerequisite gating v1** | Block enrollment until prerequisite programs are completed | 🟢 done — `LearningProgram.prerequisitePrograms`; enrollment chokepoint enforces direct prerequisites for self-enroll (422, names the unmet program) via `enrollment/prerequisites.js` (Issued certificate OR completion-engine signal); Admins override. DTO exposes the field. 5 integration tests. Sequenced paths + prereq selector UI deferred. |
| → | **Phase 4 — prerequisite-selector UI** | Let Admins set program prerequisites from the UI | 🟢 done — `ProgramFormModal` now has a multi-select **Prerequisites** picker (other active programs, self excluded) wired to `prerequisitePrograms`; create + edit persist it. New presentational `PrerequisiteSelector`; i18n en+vi; 4 component tests. Closes the deferred prereq UI from gating v1. |
| → | **Wave C — sequenced learning paths v1** | Ordered curriculum of programs + per-learner progress | 🟢 done — new `LearningPath` model + `domains/learning/path/` (`/api/learning/paths`): Admin CRUD (`path.manage`) of an ordered, de-duplicated program list; any learner reads (`path.read`). `GET /paths/:id/progress` derives `completed`/`current`/`locked` per step from the shared `hasCompletedProgram` engine (DRY) + a summary. Soft-delete + audit. 9 integration tests. Backend-only; paths UI + auto-enroll-next deferred. |
| → | **Phase 4 — learning paths admin UI** | Manage learning paths from the Learning workspace | 🟢 done — gated **Paths tab** on `/learning` (`manage:path`): Admin list + create/edit/archive via `PathFormModal`; presentational `PathProgramsEditor` gives an ordered program picker (add/reorder/remove). `learningAPI` path methods + React Query hooks/keys + `manage:path`/`read:path` perms; 9 component tests. |
| → | **Wave C1 — learner path-progress view** | Let learners see their path progress (closes the paths loop) | 🟢 done — Participant `/me/paths`: lists active paths, each showing ordered steps marked `completed`/`current`/`locked` + a progress bar, from `GET /paths/:id/progress` via new `usePathProgress`. Presentational `PathProgressView` + `MyLearningPathsPage`; dashboard CTA; 4 component tests. English-only (no i18n keys, matches `/me/*` siblings). |
| → | **Wave D1 — cron self-monitoring** | Confirm scheduled jobs actually run on the sleeping free-tier | 🟢 done (codeable slice) — `lib/cronMonitor.runMonitored` wraps the nightly reconcile + attendance-reminders (in-process job **and** pinger endpoints) with a durable `CronRun` heartbeat (last run/status/duration/error/counters, upserted per run) + Sentry **cron check-ins** (in-progress→ok/error) + `captureException`, all **fail-soft**. Gated `GET /api/admin/cron/health` derives an `ok`/`stale`/`error`/`never` verdict per job; a **Scheduled jobs** panel on `/reconcile` surfaces it. 10 tests (6 unit `deriveHealth`/config + 4 integration authz/heartbeat). Remaining D1 (paid hosting, Sentry-dashboard monitor setup) = owner ops. |
| → | **Wave D3 v1 — org model (manager hierarchy + departments)** | Real org tree + manager-scoped training visibility | 🟢 done — `Department` model + `User.managerId`/`departmentId` (non-destructive, alongside legacy `department` string). New `domains/org` (`/api/org`): Admin department CRUD (`department.manage`/`read`), manager/department assignment (`org.manage`, self-/cycle-guarded, audited), and self-scoped `GET /api/org/my-team` (`team.read`, any role) with a batched per-report training rollup (active enrollments + certificates + completed programs, reusing the completion/cert data). UI: People → **Departments** tab, an org-assignment action on Users (`OrgAssignmentModal`), a conditional **My Team** nav entry → `/my-team` (`MyTeamPage` + `TeamRosterTable`). Built ahead of D2 (its OIDC login is blocked on owner Google setup). 15 server integration tests + 6 client component tests. Directory-sync population deferred to D2; transitive-cycle is bounded-guarded. |
| → | **Wave D4 v1 — assignment + due dates** | Assign required training and track overdue status | 🟢 done — new `Assignment` model + `domains/learning/assignment` (`/api/learning/assignments`): Admin creates/archives Program or Learning Path assignments to explicit users and/or Departments with `dueDate`; Admin/Teacher read via `assignment.read`; create/archive audit + soft-delete. Status resolver expands departments to assignable users, excludes soft-deleted/inactive/dropped/transferred users, and derives `not_started`/`in_progress`/`complete`/`overdue` from certificates/completion + active cohort enrollments. UI: Learning → **Assignments** tab with summary chips and create modal. 6 server integration tests + 2 client component test files. Compliance export/recertification signal shipped in D6; cohort-specific assignment remains later. |
| → | **Wave D5 v1 — assignment reminders + manager escalation** | Email reminders for assignment due dates with persisted idempotency logs | 🟢 done — new `NotificationLog` model (email channel, assignment/learner/recipient references, cadence key, status/error/metadata, 180-day TTL, unique idempotency tuple) + `assignment/reminder-service`: active D4 assignments send learner due-soon emails at 7 days and 1 day, learner overdue emails every 3 overdue days, and weekly manager overdue digests for direct reports with manager email. `POST /api/cron/assignment-reminders` is cron-token protected and wrapped with `runMonitored`/`CronRun` health. Existing attendance reminders unchanged. 4 focused server suites / 36 tests passed. In-app notifications, admin log UI, assessment reminders, and certificate expiry emails deferred. |
| → | **Wave D6 v1.1 — backend compliance report/export** | HR/L&D compliance report over assignments, org, and certificates | 🟢 backend slice done — Admin-only `GET /api/learning/reports/compliance` plus `/export`: active D4 assignments expand into learner rows with derived status, D3 department/manager fields, certificate state, summary, and program/department/manager rollups. Export is capped, formula-guarded, and audit logged via `Report` audit entity. Teacher/Participant denied for org-wide compliance in v1.1. |
| → | **Wave D6 v1.1 — certificate expiry policy** | Certificate validity windows and recertification signal | 🟢 backend slice done — `LearningProgram.certificateValidityDays` drives certificate `validFrom`/`validUntil`/`validityDays` snapshots at issue time; legacy certs remain valid with `validUntil: null`; completion and compliance reports now expose `issued`/`expiring`/`expired`/`revoked` state and xlsx expiry columns. Expired certificates do not change prerequisite/completion semantics in v1.1. Expiry emails remain deferred. |
| → | **Wave D6 v1.1 — frontend compliance report UI** | Admin Learning Reports compliance view | 🟢 done — Learning -> Reports now has an Admin-only **Compliance** sub-tab beside Completion. Filters cover assignment, program, department, manager, assignment status, certificate state, and due date range; report fetch is on-demand; summary tiles show total/overdue/complete/certified/expiring/expired; rows show learner/org/assignment/due/status/certificate state; export uses the compliance xlsx endpoint and stays disabled until rows exist. Teacher keeps completion-only Reports; Participant remains blocked by `read:reports`. |
| → | **Wave D6 v1.1 — verification docs and rollout** | Close D6 with tests, smoke, and rollout note | 🟢 done — focused backend compliance/completion/expiry/export tests, client report/useRole tests, root syntax, client production bundle, lint, and browser export smoke all passed. Rollout note: `plans/reports/context-260605-1954-wave-d6-compliance.md`. D6 v1.1 is closed; expiry emails, auto-recertification assignment, saved presets, and notification UI remain deferred. |
| → | **2-tier dashboard — Phase 1 (operational backend)** | One read-only KPI bundle endpoint over existing data | 🟢 done — new `domains/learning/dashboard` (`GET /api/learning/dashboard/operational`, `report.read`): composes the completion rollup, D4 overdue resolver, D6 certificate expiry, and new batched aggregations (attendance rate, session split, assessment pass rate, feedback averages, coverage) with per-metric fail-soft (`errors[]`, never 500). Teacher class-scoped; Participant denied. 7 integration tests. Plan: `plans/260610-0830-ltms-2tier-dashboard/`. |
| → | **2-tier dashboard — Phase 2 (operational frontend)** | Dashboard tab on `/learning` surfacing the KPI bundle | 🟢 done — new **Dashboard** tab (first tab, `read:reports`-gated) renders the operational bundle dependency-free (StatTile grid + CSS metric bars + top-overdue/expiring lists + 30\|60\|90-day window select); Admin sees an Operational \| Executive toggle (Executive = Phase 4 placeholder), Teacher sees the panel only, failed metrics render "unavailable" without breaking the page. 6 component tests; client suite 202/44 green; lint at cap 81; build clean. |
| → | **2-tier dashboard — Phase 3 (executive backend + cost config)** | Admin-only ROI bundle + `LND_COST_CONFIG` | 🟢 done — `GET /api/learning/dashboard/executive` (coarse `report.read` + Admin-assert inside, mirroring compliance): coverage org+department, 6-month event trend (enrollments/certificates issued), honest Kirkpatrick rollup (L1+L2 measured; L3–L5 `measured:false`), certificate-based path-completion proxy, org-wide certificate validity rollup, and financials computed **only when** `GET/PUT /dashboard/cost-config` (audited Setting upsert, integer minor units) is configured — never fabricated. Shared `compose-fail-soft` extracted (operational refactored onto it). 6 integration tests. |
| → | **2-tier dashboard — Phase 4 (executive frontend)** | Fill the Executive toggle with the ROI view | 🟢 done — the Dashboard tab's Executive view (Admin-only) now renders the Phase 3 bundle dependency-free: financial tiles **or** a set-budget CTA + inline cost-config form (lazy-init, key-remount — no setState-in-effect), 6-month two-series SVG `Sparkline`, honest `DashboardKirkpatrick` (L1/L2 values; L3–L5 "Not yet measured" chips), certificate-validity SVG `DonutStat`, mobility tiles, coverage-by-department bars. 6 new component tests (CTA→save payload, integer validation, configured tiles, fail-soft, skeleton/retry); client 208/45 green; lint ≤ cap; build clean. **2-tier dashboard plan COMPLETE (P1–P4).** |
| → | **Re-center Phase 1 — Office + Training-coordinator role** | First-class Office entity + a Coordinator role that runs training ops without full Admin | 🟢 done — `Office` model (soft-delete, live-unique code, address/timezone) + `domains/org` office CRUD (`/api/org/offices`, `office.read`/`office.manage`) with a users-referencing archive guard; nullable `User.officeId` (+index) settable via the org-assignment leg (unknown office 422); **`Coordinator` role** in the User enum + `ROLE_CAPABILITIES` as an explicit allow-list (program/cohort/session/enrollment/completion/certificate/report/assignment/path + department read + office manage) — no user/security caps, no `org.manage`; AuditLog `actorRole`/entity enums extended (backfills 8 silently-failing audit entities). UI: People → Offices tab (per-tab perm gating), Office picker in `OrgAssignmentModal`, Coordinator-aware nav/routes/`useRole`. Seed: 2 offices + `000010`/coordinator123. Tests: 13 integration + 6 capability unit + 10 client. Phase 2 (coordinator-scheduled flow) next. |
| → | **Re-center Phase 2 — coordinator-scheduled session flow** | Coordinator opens an offline session (cohort + Office + time); roster = self-enrol + assign (no Team) | 🟢 done — `Schedule.officeId` (nullable ref Office + index); `bookCohortSlot`/`bookCohortSession` thread + require `officeId` (missing → 400, unknown → 422) and were widened from Admin-only to the **scheduler** set (Admin/Coordinator) via a new `isScheduler`/`SCHEDULER_ROLES` in `scheduling-mode-policy` (also relaxes the `admin_scheduled` team gate to schedulers); session DTO exposes `office {name,code}`. UI: **Create-session** modal on Learning → Cohorts (cohort-mode cohorts only; Office + exact-slot via `useSchedulingConfig` + `slotToUtcRange`), `book:session` perm, `learningAPI.bookSession`/`useBookSession`. Roster reuses self-enrol catalog + assignment (decision: cohort/team-less per owner). Tests: 3 new session integration (coordinator create + office-required 400 + unknown-office 422) + updated cohort tests (officeId) + `isScheduler` unit + Coordinator team-mode unit + CreateSessionModal client (exact UTC range + office-required). server 738/75, client 220/47, lint cap 81, build clean. Deferred (open Qs): enrol-granularity toggle, offline attendance-without-quiz; leader grid kept (already mode-gated). Phase 3 (Office-scoped Rooms + Trainers) next. |
| → | **Re-center Phase 3 — Office-scoped Rooms + internal/external Trainers** | Rooms belong to an Office (per-room double-book lock); Trainer = internal User (authz UNION) OR external record (invite only) | 🟢 done — new **`Room`** model (Office-scoped, soft-delete, live-unique code, optional seats) + `domains/room` CRUD (`/api/rooms`, `room.read`/`room.manage`, Admin+Coordinator) with a future-session archive guard; new **`RoomBooking`** hard-delete lock ledger (unique `{roomId,startTime}`) acquired in-tx after `Schedule.create` (cross-class race → **409**), `Schedule.roomId` written atomically (B3), released on cancel/delete/auto-release/team-sync + an 11th reconcile orphan-sweep check; cross-Office room → **422** (`room-lock-policy.assertSameOffice`, hard-fail when session has no Office). **Trainers:** `Schedule.sessionInstructorIds` (internal, UNION authz via new `policy/sessionInstructors` — named trainer marks/reads their session; cohort teacher never revoked; restrictive session-read kept, no B1 flip) + `externalTrainer` subdoc (no User/login; calendar invite via extended `effectiveAttendeesForSchedule`; email/phone hidden from learner DTOs). `PUT /api/schedules/:id/trainers` (`session.assign-trainer`, Admin/Coordinator, roleGuard belt, dedupe+identity-validate internal, one audit diff). `cancelSlot` widened so a Coordinator can cancel a team-less cohort session. AuditLog entity enum + `roomId` to schedule create/cohort-book bodies + session DTO (`room`, `sessionInstructors`, `externalTrainer`). UI: People → **Rooms** tab (Office-scoped CRUD) + Office-scoped **Room picker** in the Create-session modal; `roomsAPI`/`useRooms`/`qk.rooms`/`read:room`/`manage:room` perms. Tests: room-lock-policy + sessionInstructors unit, `roomOfficeScope` (13) + `sessionTrainers` (12) integration, RoomsPage (5) + CreateSessionModal room-picker client. server suites green, client 226/48, lint 0/81 (at cap), build clean. Deferred items since shipped: waitlists + durable cancellation (Wave E3 phase-04, 2026-06-11), session-list visibility for trainer-only teachers + staff waitlist panel (Wave E polish, 2026-06-11 — see changelog); trainer-assignment UI shipped 2026-06-10. |

---

## Recent progress (changelog)

- **2026-06-12** — **QA-018b closed: the 4 remaining persona-critical e2e
  specs shipped** (`client/e2e/`): (1) **attendance marking** — teacher marks
  a past Team-B session all-present via the calendar drawer (past-session
  fixture created through the real Admin API; past sessions refuse deletion,
  so each run claims the next free past slot); (2) **HR export** — serial
  with (1), downloads the pending records as `.xlsx` and asserts the
  download; (3) **MFA login** — enrolls TOTP via the API, then completes the
  UI two-factor challenge with a locally generated RFC-6238 code
  (`totp-helper.js`, no new dependency; wrong-code rejection asserted;
  admin-disable cleanup is idempotent for re-runs); (4) **waitlist** — an
  inactive-at-booking team member is re-activated and joins/leaves a full
  session's waitlist on `/me/sessions` (Waiting #1 badge). New shared
  `api-helpers.js` (CSRF + API login + fixture builders) + `teacherPage`
  fixture. Full Playwright suite 28/28 locally against live dev
  (DISABLE_RATE_LIMITS, same as the CI gate). Every P1 flow named in the
  audit now has an e2e gate.
- **2026-06-12** — **Post-audit backlog sweep: 6 P2/P3 code findings fixed in
  one round** (`fix/backlog-sweep-code-round`). **BUG-005** Users default sort
  `lastActive` was silently falling back to `empCode` — whitelisted + mapped
  to denormalised `lastActiveAt`; **UX-09** home dashboard no longer mounts
  queries (which 403) behind the forced-password modal; **OPS-014**
  forgot-password background DB failures now log at `error` (email-send fail
  stays `warn`); **PERF-015** programs/cohorts/classes lists get an opt-in
  `?page/?limit` window with a 500 hard cap (envelope unchanged — closes the
  unbounded cohort-growth path); **PERF-016** session LIST hydrates
  `enrolledUsers` as `_id`-only stubs (detail keeps the full roster);
  **UX-08** `LearningField` labels are programmatically associated
  (`useId` + `htmlFor` + `cloneElement` — WCAG 1.3.1/4.1.2) across all 16
  Learning CRUD/feedback modals. Every fix shipped with a regression test
  (server 884/884, client 254/254, lint at cap, build clean). Audit backlog
  table updated — remaining open items are owner-ops or deliberate deferrals
  (QA-018b e2e chain, CODE-017, DEPS majors, DOCS-006b, QA-017/019/020/022,
  OPS-010/011/012, DATA-016).
- **2026-06-12** — **Audit Phase 8 (Docs & spec truth) round complete — FULL
  SYSTEM AUDIT FINISHED (8/8 rounds).** Deep doc-truth pass over 28 capability
  specs (3+ requirements sampled each), `.claude/rules/*`, runbooks, README,
  route matrix, system map. 12 findings (5 P2, 7 P3), ALL fixed in-round per
  owner triage. Highlights: **DOCS-001** users-and-roles spec described a
  nonexistent auto-generated-empCode flow (truth: admin-entered required
  empCode + email) — rewritten; **DOCS-003** prod session TTL was silently 7d
  vs documented 24h → **code fixed** (`JWT_EXPIRE` default `'1d'` +
  render.yaml + 3 regression tests); **DOCS-004** agent rules corrected (4
  roles incl. Coordinator, capability layer live, capacityPolicy +
  completionPolicy ARE enforced, configurable `ALLOWED_TIME_SLOTS`, 7 domains,
  schedule owns its routes); **DOCS-005** cron-pinger runbook never armed the
  attendance/assignment reminder pings (no internal fallback — reminders dead
  in prod if followed) → 2 ping definitions added. Two reusable audit scripts
  committed: `audit-route-permission-diff.js` (live route introspection vs
  matrix — caught `/api/ready`) and `audit-env-doc-diff.js` (44 runtime env
  reads vs README §6.4 — caught boot-required `IMPORT_DEFAULT_PASSWORD`
  undocumented). Swagger glob extended to `domains/**` + coverage claims
  demoted (annotation backlog DOCS-006b). DATA-017? closed-obsolete (User
  aggregate hook exists). Report: `plans/reports/audit-docs-260612-0939-findings.md`.
- **2026-06-12** — **Audit Phase 7 (Code architecture & debt) round complete —
  migration debt verified small; 2 cheap fixes shipped.** Read-and-measure pass
  confirmed the modular-monolith migration has landed: every major legacy
  controller/service is a 10–35-line facade, `pages/` holds exactly the 4
  sanctioned shells, deep-import count 0, **zero unused server deps**, no
  legacy file silently growing. Shipped per owner triage: **CODE-014** — the
  "googleapis lockfile drift" workaround is obsolete (`npm ci --dry-run`
  passes), so CI server installs (×2 jobs) AND the root Render build scripts
  now use **`npm ci`** (reproducible installs; the PR's own CI proves the
  lockfile before main deploys), plus Node alignment (engines `>=20`, all CI
  jobs Node 22); **CODE-015** — 10 dead client deps removed (8 stray
  `@radix-ui/react-*` superseded by the `radix-ui` umbrella, `react-hot-toast`
  → sonner-only, `i18next-browser-languagedetector` from the English-only
  migration) — client 247/247, build + lint 63/63 green after. **Decisions
  locked into rules docs:** vocabulary table CLOSED (Team→LearningGroup rename
  DROPPED as permanent exception; Evaluation→Assessment DEFERRED
  converge-when-touched; dual enrollment KEPT — two real modes);
  `scheduleService` re-sanctioned ~585 + `domains/schedule/use-cases.js` ~400
  with a hard extract-on-growth rule (CODE-016). CODE-017 (stale lazy
  requires) + dependency majors (express 5, mongoose 9, eslint 10) → backlog
  as own post-audit tasks. Report:
  `plans/reports/audit-code-260612-0859-findings.md`. Phase 8 (Docs & spec
  truth) is the last audit round.
- **2026-06-11** — **Audit Phase 6 (Tests & CI health) round complete — 4 P2
  resolved in-round.** Suite core verified healthy: 854/854 server tests ×3
  consecutive runs (no flakes, no open handles), client 247/247, CI 8m vs 15m
  budget. Shipped per owner triage: **QA-011** rate-limit layer had ZERO tests
  (every limiter `skip`s in test env) → new `rateLimiterWiring.test.js` (21
  tests) asserts 18 security-critical routes still mount the expected
  `{windowMs,max}` budgets + keyGenerator units (BUG #16 class); **QA-012**
  GitHub Free + private repo = branch protection unavailable, the "7 required
  gates" are convention-only → merge discipline codified in
  `testing-and-ci.md` (never merge unless `gh pr checks` all green);
  **QA-013** `react-hooks/exhaustive-deps` was silently `warn` (docs claimed
  hard error) → 8 sites fixed — incl. a REAL stale-closure bug where the
  attendance drawer's unsaved-changes confirm guard never fired on
  toggle-close — rule promoted to `error`, eslint ratchet **72 → 63**;
  **QA-018** zero e2e on persona-critical P1 flows → `booking.spec.js` ships
  the leader book→Mine→cancel loop (2/2 vs live dev server); rest backlogged
  (attendance > export > MFA > waitlist). P3s fixed: QA-014 post-teardown
  audit-save noise root-caused (unit tests now mock auditService; SIGKILL
  line = Windows-local only, CI clean); QA-015 stale eslint-disable; QA-016
  coverage/ linted; QA-021 actions v4→v5 (Node-20 forced-Node-24 deadline
  2026-06-16). Coverage truth recorded: server 83.5% lines (`domains/*`
  healthy; legacy holes syncController 11% → class-mutations 17% → auth-mfa
  52% = QA-022), client 70% (api.js interceptors 23%). QA-017/019/020/022 +
  QA-018b → audit backlog. Report:
  `plans/reports/audit-qa-260611-2330-findings.md`.
- **2026-06-11** — **Audit Phase 5 (Reliability & operations) round complete —
  1 P1 fixed, first backup drill ever executed.** Ops layer verified clean:
  graceful shutdown (drain→cron-stop→Mongo-close), timing-safe `cronAuth` +
  CronRun heartbeat/staleness, SMTP + Google Calendar fail-soft on every path,
  all 22 transaction sites on driver-retried `withTransaction`, Sentry 5xx-only
  + PII strip + release tags, request-id logging end-to-end, substantive
  runbooks (5xx-spike, cron-failure, backup-dr). **OPS-009 (P1) fixed:**
  `server/scripts/verify-backup.js` loaded repo-root `.env` (doesn't exist —
  env lives in `server/.env`), so the monthly backup-verification drill
  documented in README §7.2 / `backup-dr.md` §6.1 failed as written and had
  NEVER run (all drill logs empty). Now loads `server/.env` with a
  `VERIFY_BACKUP_ENV_PATH` override for staging drills; +3 spawn-based
  regression tests (`verifyBackupEnvLoading.test.js`); first real drill run
  recorded in `backup-dr.md` (9/10 vs dev cluster; prod-URI run owed by owner).
  **OPS-010** (Sentry missed-run not armed for pinger-driven crons),
  **OPS-011** (envValidator misses `CORS_ORIGINS`/`CLIENT_ORIGIN`; README §6.4
  misses boot-required `IMPORT_DEFAULT_PASSWORD`), **OPS-013** (backup-dr DR
  env table lists phantom vars, omits a required one) — P2 → backlog;
  **OPS-012** (cron `?token=` leaks into logs/audit notes, P3) → backlog
  (redact approach approved). Owner-verify items: Render/Atlas/cron-job.org
  dashboards, quarterly restore drill. Report:
  `plans/reports/audit-ops-260611-1722-findings.md`.
- **2026-06-11** — **Audit Phase 4 (Performance & scale) round complete — 1 P2
  fixed.** Static hot-path analysis (index↔query, N+1, populate, pagination,
  aggregations, runtime, bundle). Verified well-built: schedule/user/enrollment
  indexes cover the hot filters; dashboard runs 14 aggregations in one parallel
  batch composed in-process (no N+1); reconcile + user-list batch their queries;
  pool 20 (PERF-009 resolved); cron off the request loop; route-lazy bundle.
  **PERF-014 (P2) fixed:** the learning-session READ paths
  (`domains/learning/session/repository.js` `findSessions`/`findSessionById`)
  invalidated the session-order cache on every read — guaranteeing a cache miss
  + an extra `Schedule.find({classId:$in,status})` per list/detail, and wiping
  entries other paths warmed. Removed the read-path invalidation (all WRITE
  paths already invalidate), so reads read-through and recompute only on a miss.
  +2 regression tests (`auditPerfRound4.test.js`) + a test-infra cache flush.
  **PERF-015** (unpaginated programs/cohorts/classes lists) + **PERF-016**
  (session-list populates full enrolledUsers, only the count is needed) →
  backlog. **DATA-017?** (dashboard `User.aggregate` skips `isDeleted` → trashed
  participants counted in stats) → flagged for a DATA round. Dynamic load
  baselines (artillery, 10× explain) deferred: shared-Atlas load-test is
  unsafe/unrepresentative. Server suites 851/851. Report:
  `plans/reports/audit-perf-260611-1637-findings.md`.
- **2026-06-11** — **SEC-018 (P1) fixed — MFA TOTP one-time-login lockout.**
  The MFA replay guard persisted/compared the *relative* `speakeasy.verifyDelta`
  offset (always `0` for a current code), so after the first login stored
  `mfaLastUsedCounter=0` every later current code hit `0 <= 0` and was falsely
  rejected as a replay → TOTP login worked exactly once, then locked the user
  out (P0 if `MFA_REQUIRED_ROLES` is set). Now compares/persists the ABSOLUTE
  TOTP step counter (`floor(now/30) + delta`): an already-consumed step → replay
  rejected; a later step → fresh login accepted. `verifyTokenWithReplay` returns
  `{ valid, counter }` (+ optional `nowSeconds` for deterministic tests). +6 unit
  tests (incl. the next-step regression); auth/MFA/password suites 53/53. No data
  migration (a stale relative `0/1` reads as a long-past absolute step). Found
  incidentally during the Phase 3 auth walkthrough; shipped as its own security
  PR. Report: `plans/reports/audit-sec-260611-1430-mfa-replay-findings.md`.
- **2026-06-11** — **Audit Phase 3 (Business flows & UX) round complete — 1 P1
  + 2 P2 fixed; 1 incidental P1 security finding escalated.** Live persona
  walkthroughs (Admin/Teacher/leader/member on seeded dev) verified clean
  end-to-end: auth (login, forced-pw-change, MFA enroll/verify/backup, forgot),
  admin org/people CRUD, learning (programs/cohorts/enroll/completion report),
  leader booking (weekly-limit, book, cancel; member restriction), learner
  /me/* (catalog/paths/assessments/feedback-submit/sessions), English-only i18n.
  **FLOW-001 (P1):** Teacher could never add an evaluation — the Add-evaluation
  learner picker used the Admin-only `/api/users` search (Teacher → 403, empty
  picker) while `POST /api/evaluations` allows Teacher. Fixed with a new
  class-scoped `GET /api/evaluations/roster?classId=` (`roleGuard('Admin',
  'Teacher')` + per-class binding policy) returning Active-enrolment learners;
  the modal picker is rewired to it for both roles (org-wide search + debounce
  removed). **BUG-003 (P2):** `.lean({ virtuals:true })` is a silent no-op
  (mongoose-lean-virtuals not installed) → the `enrolledCount` virtual was
  dropped, so the admin Schedule grid rendered "/9" + a 0% bar, and the
  completion compliance report read `undefined` for `averageScore`. Fixed
  locally: `listSchedules` attaches `enrolledCount` from the populated array;
  completion computes `averageScore` from the 4 score fields; both touched
  queries demoted to honest `.lean()` with a tombstone comment. **BUG-004
  (P2):** booking page header always showed "0 students" (read a non-existent
  `Team.enrolledCount`) — now `members.length`. **UX-08** (a11y: `LearningField`
  labels unassociated) + **UX-09** (first-login dashboard error boundary behind
  the pw modal) → backlog. **SEC-018 (P1, incidental):** the MFA replay guard
  compares the *relative* `verifyDelta` (always 0 for a current code) against a
  stored counter → TOTP login works once, then false-replay lockout (P0 if
  `MFA_REQUIRED_ROLES` set) — escalated to a separate security PR. Tests: +11
  (7 roster RBAC/validation + e2e upsert, schedule enrolledCount, completion
  averageScore, booking members.length). Gates: server 843, client 247, lint
  0-err (72 cap), build ✓. Spec `evaluations` MODIFIED (roster read + teacher
  grading scenario). Report: `plans/reports/audit-flows-260611-1357-findings.md`.
- **2026-06-11** — **Audit Phase 2 (Data integrity & audit trail) round
  complete — 1 P1 + 2 P2 fixed.** Verified clean: audit-log completeness (55
  record sites / 18 domain controllers; all 28 entity values in the enum),
  transactions at every multi-doc path, race-guard indexes, 11 reconcile
  checks, hook-less domain repositories' explicit isDeleted discipline.
  **Fixed DATA-014 (P1, golden-rule):** evaluation delete was a HARD
  `findByIdAndDelete` — now soft (`isDeleted`/`deletedAt` + find/distinct/
  aggregate hooks on the model, export aggregate covered); re-upserting the
  same `{classId,userId}` REVIVES the trashed row (full unique index kept — no
  prod index migration; `$in:[true,false,null]` matches legacy rows missing
  the field). **DATA-012 (P2):** `'distinct'` added to SOFT_DELETE_HOOKS on
  all 6 hook-ed models (User/Team/Class/Department/Office/Room) — dashboard
  filter-options stop leaking trashed users' values; explicit-isDeleted escape
  hatch preserved. **DATA-013 (P2):** bulk import now REFUSES rows matching
  soft-deleted users (`empCode`) / archived cohorts (`{classCode,courseName}`)
  with a "restore from trash first" 400 — the hook-bypassing bulkWrite upsert
  could silently overwrite trash. **DATA-015 (P3):** dead hard-delete repo fns
  (`deleteScheduleById`, `deleteAttendanceByScheduleId`) removed. DATA-016
  (stale waitlist rows reconcile check) → backlog. Tests: +6 (soft-delete
  lifecycle/revive, distinct hook, import guards ×2). Spec `evaluations`
  MODIFIED (delete-is-soft + revive scenario). Report:
  `plans/reports/audit-data-260611-1321-findings.md`.
- **2026-06-11** — **Full-system audit: framework + Phase 1 (Security & AuthZ)
  round complete.** New audit structure `plans/260611-1230-full-system-audit/`
  (8 phases, continues the historical SEC-/DATA-/PERF-/OPS- finding series;
  per-round docs-ride-along rule). Round 1 verdict: **no P0/P1** — mount layer
  (CSP / no-origin prod guard / CSRF / limiters), cookies, session
  invalidation, all 22 routers' gates, self-scoping across 10+ surfaces
  (enrollments/completion/certs/feedback/attempts/paths/evaluations/attendance/
  schedules/dashboards), pino redaction, npm audit high+ = 0, gitleaks + .env
  hygiene — verified clean with evidence. Fixed **SEC-014 (P2)**: malformed
  ObjectId on legacy non-zod routes returned 500 + Sentry noise → CastError→400
  branch in `handleError` + `server.js` mirror + zod params on evaluations
  `:id`×2 / attendance `:scheduleId`/`:userId` + 5 regression tests (36/36).
  SEC-015 (catalog-open program/cohort reads) + SEC-016 (Coordinator omitted
  from client `read:classes`) accepted as designed + annotated (route matrix +
  PERMISSION_MAP); SEC-017 stale security comments fixed. Report:
  `plans/reports/audit-security-260611-1302-findings.md`.
- **2026-06-11** — **Wave E polish: staff waitlist panel + trainer-only teacher
  visibility.** (1) *Staff queue UI:* `GET /api/schedules/:id/waitlist` widened
  to Coordinator (Teacher stays class-scoped); new `SessionWaitlistModal`
  (read-only FIFO queue — positions on waiting rows, resolved rows as history)
  opened from a per-session **Waitlist** action on `CohortSessionsPanel`
  (`read:waitlist` perm; shown on cancelled rows too — the dissolved queue is
  the post-cancel history a scheduler checks). Wiring:
  `schedulesAPI.listWaitlist` + `qk.schedules.waitlist(id)` +
  `useScheduleWaitlist`. (2) *Trainer-only teacher visibility:* the learning
  session list Teacher scope is now a UNION — my cohorts' sessions ∪ sessions
  naming me in `sessionInstructorIds` (foreign-cohort `cohortId` query → only
  my instructor sessions); the attendance calendar adds the same
  named-instructor arm on top of its class scope — a trainer-only teacher can
  now FIND the session `policy/sessionInstructors` already lets them mark.
  Tests: +4 server (Coordinator staff list; list UNION + foreign-cohort
  scoping; calendar trainer-only) +4 client (modal empty/rows; panel
  open/hide). Server suites green, client 246/53, lint 0/72 (= cap), build
  clean. Spec + route-matrix updated. **Closes the last two Wave E deferred
  polish items** (Phase 3 row note now historical).
- **2026-06-11** — **Waitlist review round (quality gate after slice B) — 4
  seam fixes.** (1) *Queue-head clog:* `promoteIfSeatFree` now scans the WHOLE
  waiting queue FIFO; a stale head (user already seated by a manual admin add)
  is resolved to `promoted` in place — no seat consumed, no email — instead of
  being re-fetched and permanently blocking everyone behind it. (2) *Reassign
  strands waiters:* `updateSchedule` `bookedTeamId`/`classId` change now
  dissolves the session's live queue in the same tx via a new
  `dissolveWaitlist` (split out of `releaseScheduleResources`) — an
  old-audience waiter can no longer be promoted into the new team's session;
  silent by design. (3) `bookingLimiter` added to `DELETE /:id/waitlist`
  (parity with join, per phase-04 security plan). (4) *Team-mode visibility
  gap:* the learner session list `$or` gains a `bookedTeamId ∈ my-teams` arm
  (`findTeamIdsForMember`, soft-delete-safe) — a team member whose roster add
  was capacity-blocked now sees the full session on `/me/sessions` and can
  reach the join the policy already allowed. 3 regression tests (stale head +
  no double-notify; reassign dissolve + no later cross-team promotion;
  team-member visibility + join). Spec updated (2 new scenarios). Waitlist
  suite 17/17.
- **2026-06-11** — **Waitlists + FIFO auto-promotion + learner `/me/sessions`
  (Wave E3 phase-04, slice B — Wave E functionally complete).** New
  `WaitlistEntry` model (status lifecycle `waiting`/`promoted`/`withdrawn`/
  `cancelled`, never hard-deleted; partial-unique `{scheduleId,userId} where
  waiting` = concurrent double-join guard; FIFO index) + `domains/schedule/
  waitlist/` (policy/repository/promotion/use-cases/controller). **Join is
  self-service and full-only** (owner decisions 2026-06-11: free seats → 409,
  never instant-seat; waiters ARE emailed on session cancel; backend + learner
  UI in one PR): audience = session's team member OR active cohort-based
  enrollee; started/cancelled/already-enrolled/double-join → 409/403 as
  appropriate. **Promotion runs INSIDE the seat-freeing transaction** at three
  freers — admin capacity raise (`updateSchedule`), Team-sync member removal
  (returns promotions; all 3 callers notify post-commit), Dropped auto-release
  — via guarded `$push` (`$ne` + roster-size `$expr` < effective cap) + a
  post-loop cap assert; a promotion can RESCUE a session that just emptied
  (promote-before-sweep ordering). Post-commit: idempotent `NotificationLog`
  (`waitlist_promoted`, cadenceKey `scheduleId:userId`), promotion email
  (`tplWaitlistPromoted`), one calendar refresh. **Unified
  `releaseScheduleResources`** (room ledger + waitlist dissolution) swapped
  into all 4 removal paths (cancelSlot, admin delete, Team-sync empties,
  auto-release empties); cancel paths email dissolved waiters. Routes:
  `POST/DELETE /api/schedules/:id/waitlist`, `GET /waitlist/mine`,
  `GET /:id/waitlist` (staff; Teacher class-scoped, Participant 403 — no
  roster leak); join/leave audited (`WaitlistEntry` added to AuditLog enum).
  **Learner visibility widening:** learning session list now shows a
  Participant the sessions of cohorts they're actively cohort-enrolled in (not
  just rostered) + an honest per-row `effectiveCapacity` (program override >
  field > 9). UI: **`/me/sessions`** (`MySessionsPage` + feature-local
  `useWaitlist`; Enrolled / Waiting #N + Leave / Join-waitlist / open states;
  dashboard CTA; English literals per `/me/*` convention). Tests: **+14 server
  integration** (`waitlist.test.js`: join policy ×6 incl. concurrent race,
  leave/mine/staff-list ×3, dissolve-on-cancel, FIFO capacity-raise promote +
  NotificationLog, Dropped-release promote incl. empty-rescue, Team-sync
  promote via PUT /api/teams, visibility widening + effectiveCapacity) + **+4
  client** (MySessionsPage states). Server **819/82 green**, client **242/52
  green**, lint at cap 72, build clean. Specs: `scheduling-and-booking` ADDED
  Waitlist requirement (+ cancel-dissolution delta), route-permission-matrix.
  Deferred: admin waitlist panel UI, waitlist for enrollment-status/user-delete
  pull paths (seats free silently — next freer/joiner picks up).

- **2026-06-11** — **Durable cancellation (Wave E3 phase-04, slice A) — closes the
  hard-delete golden-rule violation for sessions.** Cancelling (leader
  `DELETE /api/schedules/:id/cancel`, learning
  `DELETE /api/learning/sessions/:id/cancel`) and admin-deleting
  (`DELETE /api/schedules/:id`) a session now **flip the doc to
  `status:'cancelled'`** (`cancelledAt`/`cancelledBy`/`cancelReason` ≤500
  zod-validated, optional DELETE body) instead of deleting it. The flip is an
  **atomic conditional update** (concurrent cancels → one 200 / one 409
  `already cancelled`); attendance rows are preserved; the roster snapshot is
  frozen (Team-sync, Dropped auto-release, and enrollment-status pulls all skip
  cancelled rows); the RoomBooking ledger row is released in the same tx with
  `roomId` nulled (B3 — field and ledger never drift); calendar delete +
  cancellation emails unchanged. The `{classId,startTime}` unique index became
  **partial-unique where `status:'scheduled'`** (model + idempotent
  `scripts/migrate-schedule-partial-unique-index.js`: backfill → drop →
  recreate), so the **freed slot re-books** — collision + weekly-cap checks
  count live rows only (a cancelled session frees the team's 2/week quota).
  **Cancelled rows excluded from every operational query** (~20 call sites
  swept): availability, my-class, attendance calendar + scope, learner/teacher
  session lists, legacy list default, reminder claim, reconcile CHECK 1+4
  (+CHECK 11 now also flags a ledger row pointing at a cancelled session),
  session numbering, admin dashboards (stats/alerts), learning dashboard
  counts/scope, completion engine denominators, completion/compliance report
  roster+schedules, prerequisite participation signal, class/cohort
  bookedSessions, team/user progress, enrollment attendance enrichment, Sheets
  sync. Staff history: `GET /api/schedules?status=cancelled|all` (Participant
  force-live) + cancelled rows in the Admin/Coordinator learning session list
  rendered as a **Cancelled chip** (read-only row, Trainers action hidden) in
  the cohort Sessions panel; editing a cancelled session → 409; delete guards
  (class/cohort) still count cancelled refs to protect history. DTO exposes
  `status`/`cancelledAt`/`cancelReason`. Tests: new
  `scheduleCancel.test.js` (10 — flip/preserve, double-cancel 409, reason >500
  → 400, freed-slot re-book incl. one-live-one-cancelled-share-slot, weekly-cap
  freed, availability/participant/admin-default exclusions + `?status=cancelled`
  history, edit-cancelled 409, reminder-claim skip) + updated
  `scheduleUseCases` (durable delete contract + already-cancelled 409) and
  `dataIntegrity` (DATA-005 future-cancel now asserts the flip); client +1
  CohortSessionsPanel chip test. Client 238/51, lint at cap 72, build clean.
  Spec `scheduling-and-booking` MODIFIED (cancellation requirement rewritten +
  UC-2 + AC + partial index note). Remaining phase-04: slice B (waitlist +
  in-tx FIFO auto-promotion) + slice C (join-waitlist UI), then session-list
  visibility for trainer-only teachers.

- **2026-06-10** — **Trainer-assignment UI (Wave E / re-center Phase 3 — closes the
  deferred frontend).** The `PUT /api/schedules/:id/trainers` backend shipped
  complete+tested with Phase 3 but had no UI; a scheduler could create a session
  yet never see it again to assign trainers. Frontend-only slice (no backend/spec
  behavior change — surfaces the existing mutation): Learning → **Cohorts** gains a
  per-cohort **Sessions** action (`assign:trainer`, Admin/Coordinator; cohort-mode
  cohorts only — same `self_enroll`/`nomination` gate as Schedule-session, owner
  decision) opening a new
  `CohortSessionsPanel` (takes over the tab like `ArchivedCohortsPanel`, no modal
  nesting) that lists the cohort's sessions — time / office·room / current trainer
  chips (internal names + an external `· External` tag) — from
  `GET /api/learning/sessions?cohortId=` via the existing `useLearningSessions`. A
  **Trainers** action per session opens `AssignTrainersModal`: **internal trainers**
  are removable chips + an add-picker over active Teachers (the picker needs
  `read:users` → Admin; a Coordinator keeps the current internal trainers read-only,
  same `/api/users` limit as the enroll modal), capped at 3 (mirrors the server
  `setTrainersBody`); an **external trainer** is an optional `{name, email?, phone?,
  org?}` form (name required when enabled). One save posts both shapes through new
  `schedulesAPI.setTrainers` + `useSetTrainers` (invalidates learning sessions +
  schedule caches). New i18n `learning.sessions.*` + `learning.trainers.*` (en;
  English-only). Tests: **+9 client** (AssignTrainersModal 5 — default submit,
  Admin add-picker, external name-required, external payload, non-admin picker
  hidden; CohortSessionsPanel 4 — chips, open-modal, perm-gated action, empty).
  Verified: client **237/51** green, lint **0 errors / 72 warnings (at cap)**, build
  clean; new files add 0 warnings; server untouched. Spec: `scheduling-and-booking`
  (UI note on the Trainers requirement + client files in `related_code`). Still
  deferred: waitlists + durable-cancellation (Wave E3 phase-04), session-list
  visibility for trainer-only teachers, a coordinator-safe internal-trainer picker.

- **2026-06-10** — **Cohort delete → soft-archive + restore (golden-rule fix).**
  Resolved the open question from the cohort edit/delete restore: cohort delete is
  now a **recoverable soft-archive** instead of a hard cascade-delete, honoring the
  "never hard-delete evaluation/enrollment data" rule and matching Team's pattern.
  `Class` model gained `isDeleted`/`deletedAt` + soft-delete pre-hooks (find/findOne/
  count/findOneAndUpdate/findOneAndDelete + aggregate) — archived cohorts hidden from
  all reads; existing docs unaffected (no backfill). `deleteCohort` now closes active
  Enrollments (`status`→`Dropped`) + marks the cohort deleted in a transaction;
  **Evaluations preserved**. Added `restoreCohort` (`POST /cohorts/:id/restore`) +
  `listDeletedCohorts` (`GET /cohorts/deleted`), both `cohort.manage`. Frontend: new
  `ArchivedCohortsPanel` (trash view + Restore) reachable via an "Archived" toggle in
  the Cohorts tab; delete toast now says "archived (recoverable)". Tests: server
  **794/80** (soft-delete/restore/trash/enrollment-preserve), client **228/49**; build
  clean; lint at cap 72. `learning-catalog` spec updated (open question resolved).

- **2026-06-10** — **Fix: restore cohort edit/delete (was an orphaned regression) +
  retire `ClassesPage`.** The L&D re-vocab migration had moved cohort CREATE to the
  `/learning` Cohorts tab and redirected `/classes`→`/learning?tab=cohorts`, but left
  cohort EDIT/DELETE only in `ClassesPage` — which became unreachable (no route/importer).
  Net effect: admins could not edit/delete a cohort anywhere. Fix (behavior change →
  `learning-catalog` spec updated): **backend** added `PUT/DELETE /api/learning/cohorts/:id`
  in `domains/learning` (use-cases + repository + controller + schemas + routes), gated by
  `cohort.manage`, with the legacy guards/cascade preserved (block while Groups/Sessions
  reference it; else cascade Evaluation+Enrollment in a transaction); audited as `Class`.
  **Frontend** added `learningAPI.updateCohort/deleteCohort` + `useUpdateCohort/useDeleteCohort`
  + a `CohortEditModal` (status + totalSessions + delete) wired into the Cohorts tab (edit
  button gated by `cohort.manage`). Then removed the now-truly-dead `ClassesPage` → lint
  cap ratcheted **75→72**. Tests: +6 backend integration (server **791/80** green), +1
  frontend `CohortEditModal` test (client **228/49** green); build clean; lint at cap 72.
  Open question logged in spec: cohort delete cascade is hard-delete (tension with the
  soft-delete golden rule) — revisit.

- **2026-06-10** — **Frontend `features/` migration — F5 (final): /me + auth + admin;
  migration essentially COMPLETE.** Moved `features/learner/` (MyAssessmentsPage,
  MyFeedbackPage, MyLearningCatalogPage, MyLearningPathsPage + 3 tests),
  `features/auth/` (LoginPage + ForgotPasswordPage + ResetPasswordPage + UserSettingsPage
  + LoginPage.test), `features/admin/` (HRExportPage, DatabaseExplorer). Importers
  repointed: App.jsx (8 routes incl. eager LoginPage), ReportsPage (HRExport) + its test
  mock, SystemPage (DatabaseExplorer). Shared hooks unchanged. Build clean, `test:run`
  226/48, lint at cap 75. **16 feature folders.** **Only composition shells remain in
  `pages/`** — PeoplePage, SystemPage, ReportsPage, CalendarPage (intentional: routing
  glue across domains) — plus the flagged-dead `ClassesPage` (owner decision pending).
  `.claude/rules/frontend-conventions.md` updated (migration essentially complete).

- **2026-06-10** — **Frontend `features/` migration — F4 (learning, the big cluster).**
  Moved the entire `pages/learning/` folder (40 files + 14 test files) **as a unit** to
  `features/learning/` plus `LearningPage.jsx`. Near-zero internal churn: `pages/learning/`
  and `features/learning/` are the same directory depth, so every `../../hooks|components|api`
  reach-out and every `__tests__` `vi.mock` path stayed valid unchanged; only `LearningPage.jsx`
  (tab imports `./learning/X`→`./X`, `../hooks`→`../../hooks`) and 4 external importers changed
  (`App.jsx` lazy route; `/me` pages `MyAssessmentsPage`/`MyFeedbackPage`/`MyLearningPathsPage`
  which import learning modals → repointed to `../features/learning/X`). Shared hooks
  (`useLearning`/`useAssessment`/`useLearningDashboard`) stayed in `hooks/` (used by `/me` too).
  Build clean, `test:run` 226/48, lint at cap 75. **13 feature folders.** Remaining: F5
  (`/me` learner pages + auth + admin leftovers); `PeoplePage`/`SystemPage`/`ReportsPage`/
  `CalendarPage` stay as composition shells in `pages/`.

- **2026-06-10** — **Frontend `features/` migration — F3 (classes).** Migrated
  `ClassDetailPage` → `features/classes/` (App.jsx lazy route repointed); shared hooks
  (`useClasses`/`useTeams`/`useSchedules`/`useEnrollments`/`useAttendance`) stay shared.
  Build clean, `test:run` 226/48, lint at cap 75. **12 feature folders.**
  ⚠️ **`ClassesPage` left in `pages/` and FLAGGED, not migrated:** it has no route and
  no importer (all refs are comments; `/classes`→`/learning?tab=cohorts` redirect), so it
  appears dead/superseded by the learning Cohorts tab — BUT a `CohortFormModal` comment
  says "Cohort edit/delete stays in ClassesPage" (contradiction). Needs owner decision:
  delete as dead, or re-wire if cohort CRUD was meant to live there. Remaining: F4 learning
  (~38 files), F5 /me+auth+admin.

- **2026-06-10** — **Frontend `features/` migration — F2 (people + dashboards).**
  Mapped to backend domains rather than a catch-all `people`: `features/users/`
  (UsersPage), `features/groups/` (TeamsPage + MyTeamPage — mirrors `domains/groups`),
  `features/org/` (DepartmentsPage — joins OfficesPage), `features/dashboard/`
  (DashboardPage + ParticipantDashboard). `PeoplePage` stays a composition shell in
  `pages/` (tabs repointed). Cross-cutting hooks (`useUsers`, `useTeams`, `useDashboard`,
  `useOrg`) stay shared. Importers updated: `PeoplePage` (3 tabs), `App.jsx` (Dashboard
  + MyTeam lazy routes); `DashboardPage`→`ParticipantDashboard` sibling import preserved;
  `MyTeamPage.test` moved. Build clean, `test:run` 226/48, lint at cap 75. **11 feature
  folders now under `features/`.** Remaining: F3 classes, F4 learning (~38 files),
  F5 /me+auth+admin.

- **2026-06-10** — **Frontend `features/` migration — F1 (scheduling) + dead-code
  cleanup.** Removed dead `ProgramsPage` + `CourseManager` (no route/importer;
  `/programs`→`/learning` redirect remains) → lint warnings 81→75, **ratcheted the
  eslint cap 81→75** (`client/package.json` + `testing-and-ci.md`). Then F1 per
  `plans/260610-2109-frontend-features-migration/`: `features/schedule/`
  (SchedulesPage + BookClassPage) + `features/attendance/` (AttendancePage +
  AttendanceDashboardPage); `CalendarPage` stays a composition shell in `pages/`
  (child imports repointed). Cross-cutting hooks (`useSchedules`, `useAttendance`,
  `useSchedulingConfig`) stay shared. Importers updated: `CalendarPage`, `App.jsx`
  (BookClass lazy), `ReportsPage` + its test mock. Build clean, `test:run` 226/48,
  lint at cap 75. **8 domains now under `features/`.** Remaining: F2 people/dashboards,
  F3 classes, F4 learning (~38 files), F5 /me+auth+admin.

- **2026-06-10** — **Frontend `features/` migration — clean leaf batch
  (reconcile, settings, sync, evaluations).** Continued the migration with four
  more self-contained domains (behavior-preserving `git mv` + import-depth fixes
  + importer/test-mock updates): `features/reconcile/` (ReconcilePage +
  `reconcile-check-meta` + test, off `SystemPage`), `features/settings/`
  (SettingsPage + owned `useSettings`, off `SystemPage`), `features/sync/`
  (SyncPage + owned `useSync`; importers `SystemPage`, `ReportsPage`,
  `useExport` re-export, + `ReportsPage.test` mock), `features/evaluations/`
  (EvaluationPage + owned `useEvaluations`; importers `ReportsPage`,
  `ParticipantDashboard`, + test mock). Build clean, `test:run` 226/48,
  lint at cap 81 (no new warnings) after the batch. **6 leaf domains now under
  `features/`** (incl. the earlier rooms+org). Remaining are entangled clusters
  (attendance/schedules/booking/calendar; the `pages/learning/` cluster +
  `useAssessment`; users/teams/people/dashboards) — migrate as focused blocks.

- **2026-06-10** — **Frontend `features/<domain>/` migration — pilot
  (`features/rooms/`).** Established the feature-colocation convention (mirrors
  backend `domains/`). Moved `pages/RoomsPage.jsx` + `hooks/useRooms.js` +
  `__tests__/RoomsPage.test.jsx` into `client/src/features/rooms/` (git mv,
  behavior-preserving); fixed relative-import depth and updated all importers
  (`PeoplePage`, learning `CreateSessionModal` + its test mock). The central API
  client (`api/api.js`) and `queryKeys.js` stay shared — `features/` colocates
  feature code, not the axios client. Convention documented in
  `.claude/rules/frontend-conventions.md`. Verified: client build clean,
  `test:run` 226/48 green, eslint at cap 81 (no new warnings). Remaining domains
  migrate incrementally; `pages/`+`features/` coexist during the migration.
  Second domain migrated same day: `features/org/` (`OfficesPage` + tests) — the
  "page moves, widely-shared hook (`useOrg`) stays in `hooks/`" variant; importer
  `PeoplePage` updated; build + 226 tests + lint(cap) green.

- **2026-06-10** — **Phase 1 (Backend Modular Monolith Refactor) effectively
  complete (~98%).** Closed the last two backend items: (1) **schedule domain
  use-case tests** — new `tests/integration/scheduleUseCases.test.js` (9 tests)
  locks the `domains/schedule/use-cases` contract in isolation (update/delete/
  setTrainers return shapes + `ServiceError.statusCode` 404/409/400). (2)
  **repository-interface scope settled** — ADR
  `docs/decisions/repository-layer-where-separable.md`: `repository.js` applies
  where a query layer is genuinely separable (`learning/`, `schedule/`);
  `attendance/` + `groups/` deliberately keep Mongoose access inline (fused with
  aggregation/transaction logic — KISS, mirrors the "kept large by design"
  precedent). With `domains/attendance` + `domains/groups` extracted and
  `domains/schedule` now full (own routes, legacy adapter removed), the backend
  refactor is done. **Frontend `features/` is a SEPARATE convention item, NOT
  part of Phase 1** (handoff: it sits above the Phase 1 section).

- **2026-06-10** — **Phase 1 refactor — extract `domains/schedule` routes (remove
  the last legacy adapter).** Pure behavior-preserving relocation (no
  route/response/authz change → no spec change). `routes/scheduleRoutes.js` +
  `controllers/scheduleController.js` were removed; the 11 HTTP handlers
  (book/cancel/availability/list/byId/my-class/create/update/delete/setTrainers/
  attendance-calendar) merged into `domains/schedule/controller.js`, collapsing the
  previous `scheduleController → domains/schedule` adapter indirection. Booking
  mutations stay in `services/scheduleService` (kept large by design,
  transaction-heavy); update/delete/setTrainers logic stays in
  `domains/schedule/use-cases`. `/api/schedules` now mounts from the domain;
  `Schedule` model + URL unchanged. 8 schedule/booking suites green (75 tests).
  `current-system-map.md` + handoff updated. Remaining Phase 1: repository
  interfaces (attendance/groups), schedule use-case tests, frontend `features/`.

- **2026-06-10** — **Phase 1 refactor — extract `domains/groups` (Team).** Pure
  behavior-preserving relocation (no route/response/authz change → no spec change).
  Moved `controllers/teamController.js` + `controllers/team/*` + `routes/teamRoutes.js`
  + `schemas/team.js` into `domains/groups/`: `routes` → `controller` (facade) →
  `queries`/`mutations`/`lifecycle`/`enrollment-sync`, plus `schemas`. `/api/teams`
  is now mounted from the domain; the `Team` model and the `/api/teams` URL are
  unchanged (target vocabulary `LearningGroup` migrated via this module, not a
  collection rename). The enrollment-transfer cross-dependency now imports
  `domains/groups/controller`. `teams` + `enrollmentTransfer` suites green (21).
  `current-system-map.md` updated. Remaining Phase 1: schedule domain routes,
  repository interfaces, frontend `features/`.

- **2026-06-10** — **Phase 1 refactor — extract `domains/attendance` (modular-
  monolith, plan `260610-1940-phase1-domains-extraction` slice 1).** Pure
  behavior-preserving relocation (no route/response/authz change → no spec
  change). The attendance area moved into the `domains/<domain>` convention:
  `domains/attendance/` now holds `routes` → `controller` → `use-cases` (facade)
  → `marking` + `analytics` + `scope`, plus `schemas`. `/api/attendance` is
  mounted from the domain; `controllers/attendanceController.js`,
  `routes/attendanceRoutes.js`, `schemas/attendance.js`, and `services/attendance/*`
  were removed; **`services/attendanceService.js` is now a one-line compat facade**
  re-exporting `domains/attendance/use-cases` so the two integration tests that
  import it directly (`analyticsPerf`, `phaseAHardening`) are unchanged. The
  Phase 3 attendance UNION (cohort-teacher OR named session instructor) is
  preserved verbatim. Server suite green; `current-system-map.md` updated (+ the
  missing `/api/rooms` row). Remaining Phase 1: `domains/groups` (Team), schedule
  domain routes, repository interfaces, frontend `features/`.
- **2026-06-10** — **Re-center Phase 3 — Office-scoped Rooms + internal/external
  Trainers (plan `260609-2215-ltms-recenter-coordinator-offline`, Phase 3 — folds
  the unbuilt Wave E3 Room/instructor seams).** Wave E3 had never shipped, so this
  phase built the Room/lock/instructor foundation from scratch plus the two grill
  deltas. **Rooms are Office-scoped (Delta A):** a `Room` references exactly one
  `Office` (replacing Wave E3's free `location` string); `domains/room` CRUD
  (`/api/rooms`, `room.read`/`room.manage`, Admin + Coordinator) refuses to archive
  while a future session uses the room (409). Assigning a room to a session goes
  through a `RoomBooking` hard-delete lock ledger (unique `{roomId,startTime}` —
  per-room == per-Office, no Office field on the ledger): acquired **in-tx after
  `Schedule.create`** (so a duplicate or cross-Office room rolls the whole booking
  back), with `Schedule.roomId` written in the same success path (B3 — never
  drift). The **same-Office guard** (`assertSameOffice`) runs before lock acquire
  and **hard-fails 422** when the room's Office ≠ the session's Office, or when the
  session has no Office at all (never a silent no-op). Every Schedule-removal path
  releases the ledger row — `cancelSlot`, `deleteSchedule`, `User` Dropped
  auto-release, `Team` member-sync — and an 11th read-only **reconcile**
  orphan-sweep check (`orphan_room_booking`) surfaces any ledger row whose Schedule
  is gone. **Trainers are per-session (Delta B):** internal trainers
  (`Schedule.sessionInstructorIds`, User refs) join the attendance/visibility authz
  **UNION** via new `policy/sessionInstructors` — a named internal trainer can
  mark/read **their** session even when not the cohort's class teacher, and the
  cohort teacher is never revoked; the restrictive session-read is preserved (no
  silent B1 permissive flip). An **external** trainer (`externalTrainer` subdoc:
  name/email/phone/org) is never a User, never in `enrolledUsers`, never an actor —
  it only gets a best-effort calendar invite (via the extended
  `effectiveAttendeesForSchedule`, deduped by email, past-skip) and display; its
  email/phone are hidden from learner-facing session DTOs (Admin/Coordinator see the
  full contact). One mutation `PUT /api/schedules/:id/trainers`
  (`session.assign-trainer` + `roleGuard('Admin','Coordinator')`) dedupes +
  identity-validates internal ids (active Teacher/Admin) and records a single
  before/after audit diff. **`cancelSlot` widened** so a Coordinator can cancel a
  team-less cohort session (closing a Phase 2 loop). Frontend: People → **Rooms**
  tab (Office-scoped CRUD), an Office-scoped **Room picker** in the coordinator
  Create-session modal (`roomId` sent only when picked), `roomsAPI`/`useRooms`/
  `qk.rooms`/`read:room`/`manage:room`. Verified: new unit suites (room-lock-policy,
  sessionInstructors) + `roomOfficeScope` (13) + `sessionTrainers` (12) integration;
  related suites (attendance/session/scheduleAuthz/reassign) green; **client 226
  tests / 48 files, lint 0 errors / 81 warnings (at cap), production build clean.**
  Specs: `scheduling-and-booking` (Office-scoped room + per-room lock + trainers),
  `attendance` (UNION note — internal-only), route-permission-matrix
  (`/api/rooms`, `/api/schedules/:id/trainers`, room.* caps). Deferred: the
  trainer-assignment UI (backend complete + tested), waitlists + durable-
  cancellation states (Wave E3 phase-04 — outside the two grill deltas), and
  session-list visibility widening for trainer-only teachers.

- **2026-06-10** — **Re-center Phase 2 — coordinator-scheduled session flow
  (plan `260609-2215-ltms-recenter-coordinator-offline`, Phase 2).** The
  coordinator-scheduled offline model the owner described in the grill: a
  **scheduler** (Admin or Coordinator) opens a **team-less** session against a
  cohort-mode program (`self_enroll`/`nomination`) at a physical **Office** +
  a configured time slot; the roster comes from self-enrolment + coordinator
  assignment (no Team — decision confirmed with the owner). Backend:
  `Schedule.officeId` (nullable ref Office, indexed `{officeId,startTime}`);
  `scheduleService.bookCohortSlot` + the `bookCohortSession` use-case now
  thread + **require** `officeId` (missing → **400**, unknown live office →
  **422**) and were widened from Admin-only to a **scheduler set** via new
  `isScheduler`/`SCHEDULER_ROLES` in `scheduling-mode-policy` (the same relaxes
  the `admin_scheduled` team-mode gate from Admin-only to schedulers, never a
  self-booking leader). Session DTO exposes `officeId` + populated
  `office {_id,name,code}`. Frontend: a **Create-session** modal on Learning →
  Cohorts (shown only for cohort-mode cohorts via `can('book:session')`):
  Office picker + date + exact slot (reuses `useSchedulingConfig` +
  `slotToUtcRange` — no `hour+1`), posting `{cohortId, officeId, start, end}`
  through new `learningAPI.bookSession`/`useBookSession`. New `book:session`
  perm (Admin/Coordinator) + `qk.learning.sessions`. Verified: **3 new session
  integration tests** (coordinator create with Office + office-required 400 +
  unknown-office 422) + updated cohort tests (carry officeId) + `isScheduler`
  unit + Coordinator `admin_scheduled` unit + a `CreateSessionModal` client
  test (asserts the exact UTC range from the picked VN day/slot + office-
  required guard); **server 738 tests / 75 suites, client 220 / 47, lint 0
  errors / 81 warnings (at cap), build clean.** Specs:
  `scheduling-and-booking` (scheduler gate + cohort-Office requirement),
  route-permission-matrix. Deferred (ADR open questions): enrol-granularity
  toggle (per-course), offline attendance/completion without a quiz; the
  leader grid stays (already mode-gated, secondary). Next: Phase 3 —
  Office-scoped Rooms + internal/external Trainers.
- **2026-06-10** — **Re-center Phase 1 — Office + Training-coordinator role
  (plan `260609-2215-ltms-recenter-coordinator-offline`, additive).** New
  `Office` model mirroring `Department` (soft-delete + auto-exclude hooks,
  live-unique uppercase `code`, optional `address`/`timezone` for Phase 2
  scheduling) and office CRUD in `domains/org` (`office-use-cases.js` /
  `office-repository.js`, routes `/api/org/offices` behind new
  `office.read`/`office.manage` capabilities; archive refuses while users
  reference the office, 409). `User.officeId` added nullable + indexed (same
  "open until populated" pattern as `departmentId`) and wired into the
  Admin-only org-assignment endpoint (`null` clears; unknown office 422).
  **`Coordinator` role** (decision B2): added to the User role enum, zod
  `ROLES`, import schema, swagger, and `ROLE_CAPABILITIES` as an **explicit
  allow-list** — program/cohort/session/enrollment/completion/certificate/
  report/assignment/path manage+read, `department.read`,
  `office.read`/`office.manage`; deliberately NO user/security capabilities and
  NO `org.manage`; legacy `roleGuard('Admin', …)` surfaces (users, settings,
  audit, export…) deny it, pinned by tests. **Latent audit bug fixed:** the
  AuditLog `entity` enum lacked `Department`, `Certificate`, `Assessment`,
  `AssessmentAttempt`, `AssessmentQuestion`, `Feedback`, `Assignment`, and
  `LearningPath` — every audit write for those entities had been failing
  SILENTLY (fire-and-forget); enum backfilled (+`Office`,
  `actorRole: Coordinator`) and an integration test now asserts the Office
  audit row actually lands. Client: People → **Offices** tab (PeoplePage tabs
  now perm-gated per tab so a Coordinator sees only org tabs), `OfficesPage`
  (create form + table + archive), Office picker in `OrgAssignmentModal`,
  `orgAPI`/`qk.org.offices`/`useOffices` hooks, Coordinator added to
  `/people`+`/learning` route guards, Navbar access maps (+`bg-info` role
  chip; Calendar stays 'none' until the Phase 2 coordinator scheduling UX),
  and `useRole` rows mirroring the server bundle (+`isCoordinator`). Known
  Phase 1 UI limits (server caps are live; pickers read Admin-only
  `/api/users`): `enroll:learner` UI stays Admin; the assignment modal's
  explicit-user picker is empty for a Coordinator (department targeting
  works) — both resolved by the Phase 2 coordinator-safe picker.
  Seed: HCM+HN offices, coordinator login `000010`/`coordinator123`, sample
  office assignments. Verified: **13 office/Coordinator integration tests + 6
  new capability unit tests; client 218 tests / 46 files green; lint 0 errors /
  81 warnings (at cap); production build clean.** Specs updated:
  `org-and-departments` (Office + assignment + guards), `capability-authz`
  (Coordinator bundle), route-permission-matrix. Next: re-center Phase 2 —
  coordinator-scheduled session flow as the primary UX.
- **2026-06-10** — **2-tier dashboard Phase 4 — executive dashboard frontend
  (closes the 2-tier dashboard plan, P1–P4).** The Admin-only Executive view in
  the Dashboard tab now renders the Phase 3 ROI bundle, dependency-free (plan
  D3): `DashboardExecutivePanel` (financials → tiles or a set-budget CTA;
  trend; Kirkpatrick; certificate donut; mobility; coverage-by-department
  bars), `DashboardCharts` (two-series SVG `Sparkline` + stroke-dasharray
  `DonutStat`, a11y-labelled), `DashboardKirkpatrick` (L1/L2 measured values;
  L3–L5 render "Not yet measured" chips — no fake metrics), and
  `DashboardCostConfigForm` (controlled-state per the learning-form
  convention; integer-minor-unit validation client-side; lazy-init +
  key-remount instead of setState-in-effect). New hooks
  `useExecutiveDashboard`/`useCostConfig`/`useSetCostConfig` (mutation
  invalidates cost-config + executive keys). Two new-code lint findings fixed
  properly (no disables): set-state-in-effect → key-remount; render-time
  reassignment in the donut → pure reduce. Verified: **6 new component tests
  (12 dashboard tests total); client 208 tests / 45 files green; lint ≤ cap
  81; production build clean.** The business case's #1 recommendation — a
  2-tier ROI/ops dashboard on existing data — is now fully shipped.
- **2026-06-10** — **2-tier dashboard Phase 3 — executive dashboard backend +
  cost config.** New Admin-only ROI tier in `domains/learning/dashboard`:
  `GET /api/learning/dashboard/executive` (coarse `report.read` at the route +
  `assertAdmin` inside the use-case — same defence-in-depth as the compliance
  report) returns coverage (org + by legacy `department` grouping, matching the
  completion rollup), a 6-month **event** trend (enrollments created +
  certificates issued — completion is derived, so only recorded events are
  trended), an **honest Kirkpatrick rollup** (L1 feedback average + L2
  attempt-level pass rate `measured:true`; L3/L4/L5 `measured:false` with
  reasons), a certificate-based path-completion (mobility) proxy, an org-wide
  certificate validity rollup, and **financials that are never fabricated** —
  `{configured:false}` until `LND_COST_CONFIG` exists. New
  `GET/PUT /api/learning/dashboard/cost-config` upserts that config over the
  existing `Setting` model (zod: integer minor currency units + 3-letter
  currency; PUT audit-logged with before/after diff). Shared
  `compose-fail-soft.js` extracted and the operational bundle refactored onto
  it (DRY). Verified: **6/6 new integration tests** (trend buckets, Kirkpatrick,
  mobility incl. date-expired-Issued certificates, financial gating + values,
  Setting audit, Teacher/Participant 403, body validation). Spec + route-matrix
  updated. Remaining: Phase 4 (executive frontend fills the existing toggle).
- **2026-06-10** — **2-tier dashboard Phase 2 — operational dashboard frontend.**
  The Learning workspace gains a **Dashboard** tab (first tab, gated by
  `read:reports`) that surfaces the Phase 1 KPI bundle. New
  `useLearningDashboard` hook (own file — `useLearning.js` is at the size cap) +
  `learningAPI.getOperationalDashboard` + `qk.learning.dashboardOperational`.
  UI is **dependency-free by design** (plan D3 — no chart lib): `DashboardWidgets`
  (StatTile + CSS-width MetricBars + MetricUnavailable), `DashboardTopLists`
  (top-overdue assignments, soonest-expiring certificates),
  `DashboardOperationalPanel` (sections: Completion · Attendance/sessions/coverage ·
  Obligations · Quality, with a 30|60|90-day window select reusing `EnumSelect`),
  and `DashboardTab` (Operational | Executive toggle mirroring ReportsTab;
  Executive is an Admin-only Phase 4 placeholder; non-Admins get the panel only).
  Per-metric fail-soft honoured end-to-end: a failed block renders an
  "unavailable" chip + a partial-warning banner, never a blank page. Test-setup
  `mockT` now interpolates `{{vars}}` (no existing test asserted raw
  placeholders). Verified: **6 new component tests; client 202 tests / 44 files
  green; lint 0 errors / 81 warnings (at cap); production build clean.**
  Phases 3–4 (executive ROI tier + `LND_COST_CONFIG`) remain.
- **2026-06-10** — **2-tier dashboard Phase 1 — operational dashboard backend
  (quick-win track from the business case).** New `domains/learning/dashboard`
  module: `GET /api/learning/dashboard/operational` (`report.read`; Admin
  org-wide, Teacher class-scoped via the shared class-scope helper) returns one
  read-only KPI bundle — completion (reuses `buildCompletionRollup`, parity
  pinned by test), attendance rate (completion-engine ATTENDED_STATUSES),
  session counts (upcoming/next-7-days/past), org-wide overdue assignments +
  top-10 (reuses the D4 status resolver), certificate expiry buckets
  (expired/≤30d/≤60d) + top-10 soonest (D6 `validUntil` + frozen
  learner/program snapshots), attempt-level assessment pass rate, feedback
  averages (overall + by-program via denormalised `programId`), and training
  coverage over a 30|60|90-day window. Per-metric fail-soft:
  `Promise.allSettled` → failed metric = `null` + `errors[]`, response stays
  200. **7/7 integration tests green** (admin bundle, rollup parity, teacher
  scoping, participant 403, fail-soft, window validation). Spec folded into
  `reporting-and-rollups`; route-permission-matrix gained the missing
  `/api/learning/reports` row + the new dashboard row. Business case + plan:
  `plans/260610-0811-business-case-ltms-vs-excel.md`,
  `plans/260610-0830-ltms-2tier-dashboard/`. Next: Phase 2 (Dashboard tab UI).
- **2026-06-09** — **Direction re-centered (grill + ADR) — coordinator-scheduled,
  offline, multi-office model.** A grill session with the owner established the real
  operating model (vs the English-class origins): a **Training coordinator/HR**
  schedules Sessions (`admin_scheduled` primary; `leader_booking` legacy); rosters
  come from **self-enrol + coordinator assign** (Team is legacy); **Office** (2–3
  sites) is a first-class concept distinct from Department with **Rooms scoped to an
  Office**; **Trainers** can be **internal or external** (name+contact, no login); a
  **Training-coordinator** capability set is needed, separate from full Admin.
  Recorded in ADR [`coordinator-scheduled-offline-model.md`](decisions/coordinator-scheduled-offline-model.md);
  glossary updated in `server/CONTEXT.md` (Office, Department, Training coordinator,
  Trainer, legacy LearningGroup). Detailed plan:
  `plans/260609-2215-ltms-recenter-coordinator-offline/` (Phase 1 Office+Coordinator
  role → Phase 2 coordinator-scheduling UX → Phase 3 Office-scoped Rooms + int/ext
  Trainers, folding the Wave E3 plan). Track A (Google SSO + org + hosting) stays
  owner-blocked. **Docs/direction only — no code behavior changed yet.**
- **2026-06-09** — **English-only sweep — server user-facing strings (closes the
  English-only golden rule server-side).** Removed every bilingual Vietnamese–English
  and Vietnamese-only user-facing message string on the server (English half kept, VN
  dropped; status codes + logic unchanged): booking/collision/weekly-cap/capacity
  (`scheduleService`, `session-booking-policy`), scheduling-window
  (`scheduling-window-policy`), cohort-full (`enrollment/use-cases`), team-conflict
  (`controllers/team/team-mutations`), attendance future/edit-window
  (`attendance-marking`), and export empty-result (`attendance-export`,
  `evaluation-export`). The **HR Excel exports** now use English column headers /
  status text / report titles (`attendance-workbook`, `evaluation-workbook`). Coupled
  test assertions updated to match the new English across 7 suites (booking / teams /
  scheduleReassign / attendance / learningEnrollment / exportFormulaInjection /
  session-booking-policy unit); `scheduling-and-booking` spec quote synced; lingering
  VN code comments translated. **699 server tests green across 72 suites.** Remaining
  VN in code is intentional: ErrorBoundary negative-assertion guards (assert VN is
  absent) + a unicode-filename test. Review: `plans/reports/review-260609-2005-refactor-sweep-quality-gate.md`.
- **2026-06-09** — **Phase 1 refactor — split `authService` (413) by concern
  (completes the legacy file-modularization sweep).** Pure behaviour-preserving
  (verbatim; no spec change). `services/auth/auth-tokens.js` (JWT minting +
  session/mfa-pending/mfa-enrollment cookies + JTI blocklist revoke/check +
  MFA-required-role policy) + `auth-login.js` (authenticate with durable per-account
  lockout + verifyMfaLogin TOTP/backup-code second leg). Facade keeps
  `controllers/auth/*`, `middleware/auth.js` (isTokenRevoked), and the auth tests
  unchanged. 699 server tests green (72 suites). **Every >300-line backend
  controller/service is now modularized or intentionally whole** (`syncController`
  314 left as one cohesive Google-Sheets handler). Remaining Phase 1 (~22%) is
  *architectural*: `domains/attendance`+`domains/groups`, repository interfaces,
  schedule domain routes (currently a deliberate adapter), frontend `features/`.
- **2026-06-09** — **Phase 1 refactor — split `attendanceService` (396) by concern.**
  Pure behaviour-preserving (verbatim; no spec change). `services/attendance/`:
  `attendance-scope.js` (Teacher visibility helpers, shared), `attendance-marking.js`
  (bulkMark + lastActiveAt write-through + record reads), `attendance-analytics.js`
  (by-employee/team/class/personal rollups). Facade keeps `attendanceController` +
  direct test imports unchanged. 699 server tests green (72 suites). (`syncController`
  314 left whole — one cohesive Google-Sheets sync handler, no clean split boundary.
  Remaining moderate file: `authService` 413.)
- **2026-06-09** — **Phase 1 refactor — split `classController` (323) by concern.**
  Pure behaviour-preserving (verbatim; no spec change). `controllers/class/
  class-queries.js` (list/courses/by-id) + `class-mutations.js`
  (create/update/delete with referential guards + cascade tx); facade keeps
  `classRoutes.js` unchanged. 699 server tests green (72 suites). Remaining moderate
  files: `authService` 413, `attendanceService` 396, `syncController` 314.
- **2026-06-09** — **Phase 1 refactor — split `dashboardController` (369) by
  concern.** Pure behaviour-preserving (verbatim; no spec change). `controllers/
  dashboard/dashboard-stats.js` (filter options + the 14-aggregation analytics
  endpoint) and `dashboard-alerts.js` (cached AlertBand counts + cache buster);
  `dashboardController.js` is now a ~15-line facade so `dashboardRoutes.js` is
  unchanged. 699 server tests green (72 suites). (Follow-on cleanup after the 7
  major files; remaining moderate files: `authService` 413, `attendanceService`
  396, `classController` 323, `syncController` 314.)
- **2026-06-09** — **Phase 1 refactor — split the 704-line `authController` by
  concern (last major monolith file).** Pure behaviour-preserving refactor
  (verbatim handler move; no spec change). The 12 handlers moved into
  `controllers/auth/`: `auth-session.js` (login + two-step/forced-MFA paths,
  mfa-verify-login, logout, me, change-password), `auth-mfa.js` (self-service MFA
  setup/verify-setup/disable), `auth-admin.js` (mfa-admin-disable + force-logout,
  both behind `authPolicy.requireReauth`), `auth-password-reset.js`
  (anti-enumeration forgot-password + single-use reset). `authController.js` is now
  a ~35-line **facade** re-exporting all 12 so `authRoutes.js` is unchanged.
  Security-critical flows (MFA enrollment/verify, CSRF rotation on session
  boundaries, token revoke/blocklist, constant-time forgot-password background work,
  atomic reset double-spend guard) are byte-for-byte preserved. **699 server tests
  green across 72 suites** (`auth`/`authHardening`). **All seven major legacy
  controllers/services are now modularized** (scheduleService, exportService,
  reconcileService, userController, enrollmentController, teamController,
  authController); remaining Phase 1 work is the architectural layer (repository
  interfaces, `domains/attendance` + `domains/groups`, schedule domain routes,
  frontend `features/`).
- **2026-06-09** — **Phase 1 refactor — split the 703-line `teamController` by
  concern.** Pure behaviour-preserving refactor (verbatim handler move; no spec
  change). Moved into `controllers/team/`: `team-enrollment-sync.js`
  (syncEnrollments + flushPendingEmails — shared by mutations AND the enrollment
  transfer flow), `team-queries.js` (list/by-id/my-teams/trash/progress),
  `team-mutations.js` (checkMemberConflicts + createTeam + updateTeam, both
  transactional), `team-lifecycle.js` (soft-delete cascade + restore).
  `teamController.js` is now a ~30-line **facade** re-exporting the 9 route
  handlers PLUS the 2 cross-controller helpers, so `teamRoutes.js` AND
  `controllers/enrollment/enrollment-transfer.js` (which imports
  syncEnrollments/flushPendingEmails) are unchanged — no import cycle. The
  create/update/delete transactions (team write + schedule sync + enrollment sync,
  BUG #7) are byte-for-byte preserved. **699 server tests green across 72 suites**
  (`teams`/`enrollmentTransfer`/`enrollmentRoutes`).
- **2026-06-09** — **Phase 1 refactor — split the 544-line `enrollmentController`
  by concern.** Pure behaviour-preserving refactor (verbatim handler move; no spec
  change). The 8 handlers + 2 internal helpers moved into `controllers/enrollment/`:
  `enrollment-shared.js` (enrichWithAttendance + pull-dropped-from-future-schedules),
  `enrollment-queries.js` (list / by-team / by-user / check-conflicts),
  `enrollment-status.js` (updateEnrollment + bulk status, each tx-wrapped),
  `enrollment-transfer.js` (atomic single transfer + sequential bulk transfer).
  `enrollmentController.js` is now a ~40-line **facade** re-exporting all 8 so
  `enrollmentRoutes.js` is unchanged. The atomic transfer tx (membership swap +
  dual-team schedule sync + enrollment close/create, BUG #1) and the status
  drop→schedule-pull tx (BUG #2) are byte-for-byte preserved; the one-way
  dependency on `teamController` (syncEnrollments/flushPendingEmails) is kept (no
  cycle). **699 server tests green across 72 suites**
  (`enrollmentRoutes`/`enrollmentTransfer`/`teams`).
- **2026-06-09** — **Phase 1 refactor — split the 556-line `userController` by
  concern.** Pure behaviour-preserving refactor (verbatim handler move; no spec
  change). The 8 Admin user handlers moved into `controllers/user/`:
  `user-queries.js` (getUsers/getUserById/getDeletedUsers/getUserProgress),
  `user-mutations.js` (createUser/updateUser incl. the BUG #9 re-auth gate),
  `user-lifecycle.js` (deleteUser soft-delete cascade + restoreUser). `userController.js`
  is now a ~30-line **facade** re-exporting all 8 handlers so `userRoutes.js` is
  unchanged. Security-critical paths (re-auth gate, soft-delete cascade tx,
  empCode/email release+restore) are byte-for-byte preserved. **699 server tests
  green across 72 suites** (`userRoutes`/`softDeleteEmpCodeReuse`/`lastActivePerf`).
- **2026-06-09** — **Phase 1 refactor — split the 548-line `reconcileService` by
  concern.** Pure behaviour-preserving refactor (no spec change — the 10 checks'
  behaviour is unchanged). The 10 read-only data-integrity checks moved into
  `server/services/reconcile/`: `schedule-checks.js` (missing-attendance /
  empty-future-schedule / orphan-schedule-class), `enrollment-checks.js`
  (orphaned-enrollment / ghost-member / unattached-participant /
  duplicate-active-enrollment), `team-checks.js` (multi-team-class /
  soft-deleted-in-members), `counter-checks.js` (counter-drift). `reconcileService.js`
  is now a ~140-line **orchestrator** that pre-fetches active enrollments, runs all
  10 in parallel (fail-soft per check), builds the summary, and persists the
  `ReconcileReport` — `runReconciliation` surface unchanged, so all consumers
  (cron job, cron route, reconcile controller, 3 test suites) are untouched.
  **699 server tests green across 72 suites.** Code-map updated.
- **2026-06-09** — **Phase 1 refactor — split the 618-line `exportService` by
  concern.** Pure behaviour-preserving refactor (no spec change). The legacy file
  mixed attendance + evaluation export and the data/render/flow layers. Now split
  into `server/services/export/`: `export-row-cap.js` (shared per-request cap),
  `attendance-workbook.js`/`evaluation-workbook.js` (Excel rendering),
  `attendance-export.js` (pipeline + P2-08 claim-race flow + stats) and
  `evaluation-export.js` (pipeline + flow). `services/exportService.js` is now a
  ~30-line **facade** re-exporting the same public surface so the export controller
  and the 3 export test suites are unchanged. Dropped dead `markAsExported` (never
  called — `exportAttendance` does its own inline `updateMany`). No behaviour, route,
  or response change; the formula-injection guard + row-cap + concurrent-claim logic
  are byte-for-byte preserved. **699 server tests green across 72 suites** (export
  suites: `exportRoutes`/`exportFormulaInjection`/`exportRowCap`/`phaseAHardening`).
- **2026-06-09** — **Phase 1 refactor — extract the schedule read/query layer out
  of the 737-line `scheduleService`.** Pure behaviour-preserving refactor (no spec
  change). The transaction-heavy booking paths (`bookSlot`/`bookCohortSlot`/
  `adminCreate`/`cancelSlot`) stay in `services/scheduleService.js`, which is now a
  thin **facade** re-exporting the moved reads + cache so every caller
  (`scheduleController`, `domains/learning/session`, `domains/schedule`) is
  unchanged. New `domains/schedule/queries.js` owns the 5 read use-cases
  (`getAvailability`/`listSchedules`/`getById`/`getMyClassSchedules`/
  `getAttendanceCalendar`) over `repository.js` (8 new read queries) + new
  `domains/schedule/session-order.js` (single per-class session-order cache +
  `attachSessionNumbers`/`invalidateSessionOrderCache`). `domains/schedule/use-cases`
  and `learning/session/repository` repointed off the legacy service onto
  `session-order` (legacy back-deps removed; one shared cache singleton).
  `scheduleService` 737→512 lines; dead `sendMail`/`NodeCache`/`Class`/`todayVN`
  imports dropped. New `scheduleQueries.test.js` pins `sessionNumber` + the calendar
  status mapping through the routes. **699 server tests green across 72 suites**
  (693+6). Code-map updated (`current-system-map.md` Booking Logic).
- **2026-06-09** — **Wave E2 — capacity enforcement (`capacityPolicy` flips
  persisted→enforced).** Decisions in `plans/260606-1356-wave-e-generic-scheduling/
  reports/capacity-audit-260609-1111.md` (6-agent audit; adversarial review caught
  a 4th overflow path). **Per-session occupancy** is now enforced as a hard **422**
  at the shared `assertBookable` chokepoint (in-tx, before create) across all 3
  create paths — effective cap = program `capacityPolicy.maxParticipantsPerSession`
  ?? `Schedule.capacity` (default 9). Three more guards keep the invariant true
  everywhere: the Admin **capacity edit** (final-roster, reassign+shrink-safe), the
  **team-member-add** path (`Team.syncSchedulesForTeamUpdate`, circular-import-safe
  lazy requires), and **cohort total** via program `capacityPolicy.maxParticipants`
  at enrollment (all roles). Order preserved: weekly (400) → collision (409) →
  capacity (422). Existing over-capacity sessions grandfathered (never auto-trimmed).
  **693 server tests green across 71 suites** (new unit precedence + per-path 422 +
  rollback + edit/team-add/cohort cases). Spec folded into `scheduling-and-booking`
  (per-session) + `enrollment` (cohort) + `learning-catalog` note. Deferred: rooms /
  instructors / waitlists / partial-fit; strict cohort-cap concurrency (tx lock).
- **2026-06-09** — **Booking-UI loop (Phase 3) — exact-slot booking grid (Wave E1
  client slice, completes Wave E1).** Migrated the booking / schedule /
  attendance grids off the hardcoded integer-hour list onto the server's exact
  slot config. New `useSchedulingConfig` hook (over `GET /api/learning/sessions/
  config`) + pure `client/src/lib/scheduling-slots.js` (tz-safe VN↔UTC via fixed
  offset; `slotToUtcRange`, `scheduleSlotId`, `buildSlotRows`). `CalendarGrid`
  now takes exact slot **descriptors** (`rows` + `renderCell(day, slot)`, row key
  = exact `HH:mm-HH:mm`) instead of integer hours — supports non-60-min /
  minute-offset windows and kills same-hour collisions. Booking submits the exact
  configured start/end (**removed `hour + 1`**); availability is scoped to the
  selected team's Class (per-class collision — no cross-class false blocks);
  sessions matching no configured slot render as read-only **off-policy** rows
  (visible, not bookable); empty/malformed config → no bookable rows (fail-closed,
  history still renders). Phase 2 mode-gating preserved through the refactor.
  `useTimeSlots` deleted (all 3 callers migrated). Client 190 tests (+10 slot-helper
  unit), lint at cap 81, build clean. Spec folded into `scheduling-and-booking`
  (new "Booking grid renders exact configured slots" requirement; the pending
  client-slice note marked shipped). **Wave E1 is now fully done (backend + client);
  Wave E E2 (capacity) is unblocked.** The booking-UI loop plan (P1+P2+P3) is
  complete. **Follow-up hardening:** added regression tests — a `CalendarGrid`
  descriptor-contract test (locks the shared grid migration) + Book/Schedules/
  Attendance RTL smokes (mode banner, "+ Book"/"+ Create" affordances, descriptor
  rows from config). Client suite now 196 tests / 43 files.
- **2026-06-09** — **Booking-UI loop (Phase 2) — mode-aware booking grid.** The
  leader booking grid (`BookClassPage`) now gates by the selected team's
  effective `schedulingMode`: only `leader_booking` shows bookable "+ Book"
  cells; `admin_scheduled` and cohort modes (`self_enroll`/`nomination`) render
  read-only **locked** cells + a mode-specific banner — so a leader never hits
  the post-submit 403/400 (the model default `admin_scheduled` made this a live
  wall). The bug-prone gate is a pure, unit-tested `bookingCellState()` helper
  (signature-independent so it survives the Phase 3 descriptor refactor); banner
  copy via a tested `lockedReason(mode)` + a new `booking.*` i18n namespace.
  Existing-session visibility (own + other-team cells) is never gated. Client
  180/180 (+3), lint at cap 81, build clean. Spec folded into
  `scheduling-and-booking` (new "Booking UI surfaces scheduling mode pre-submit"
  requirement; the deferred client-mode-awareness note marked shipped).
  **Pending:** Phase 3 (exact-slot grid — Wave E1 client slice).
- **2026-06-09** — **Booking-UI loop (Phase 1) — expose `schedulingMode` to the
  booking client.** Plan `plans/260609-0146-booking-ui-loop` closes the client
  loop on Pass C + Wave E1 (3 phases). **Phase 1 done:** widened
  `teamController.getMyTeams` to nested-populate
  `classId.programId.schedulingMode`, and added a client resolver
  (`client/src/lib/scheduling-mode.js` — `effectiveSchedulingMode` /
  `isLeaderBookable` with a `leader_booking` fallback matching server
  enforcement) so the grid (Phase 2) can gate cells *before* the server
  403/400s. Read-only, additive payload field; no authz/audit change. Server
  11/11 (2 new `my-teams` cases), client 5/5 (resolver unit), lint at cap 81.
  **Pending:** Phase 2 (mode-aware grid — banner + locked cells) and Phase 3
  (exact-slot grid — absorbs the Wave E phase-01 client slice; `blocks` Wave E
  E2). No capability-spec change yet — user-facing behavior lands in Phase 2.
- **2026-06-09** — **`schedulingMode` enforced on the legacy booking paths
  (Pass C — closes a real authz gap).** ck-predict review found the client books
  via the LEGACY ungated `/api/schedules/book-slot` (the mode-gated learning
  adapter route had no client callers), so a team leader could self-book an
  `admin_scheduled` program and an Admin could team-book a cohort program. New
  shared `server/domains/schedule/scheduling-mode-policy.js` (mode sets +
  `assertTeamMode`/`assertTeamModeStructural`/`assertCohortMode` + a
  `leader_booking`-fallback resolver) is now the single gate, consulted by the
  `bookSlot` chokepoint (covers the legacy leader route AND the adapter — the
  adapter's duplicate inline gate was removed), `adminCreate`, and the Admin
  reassign path. Leader self-booking `admin_scheduled` → 403; team-booking a
  cohort program → 400; program-less classes still book (fallback). 680 server
  tests green across 71 suites (new mode-policy unit + new legacy-path
  integration). Spec folded into `scheduling-and-booking` + `capability-authz`.
  Deferred: client mode-awareness (pre-submit hint) — UX slice.
- **2026-06-09** — **Booking-rules consolidation — one deep `session-booking-policy`
  module.** Architecture deepening of the Scheduling & Booking core. New
  `server/domains/schedule/session-booking-policy.js` owns the previously-duplicated
  booking invariants (`assertBookable` = weekly cap + same-class collision via the
  schedule repository; `getWeekBounds`; `snapshotActiveMembers`) and the single
  `WEEKLY_TEAM_LIMIT` source. `bookSlot` / `bookCohortSlot` / `adminCreate`
  (scheduleService) and the Admin `updateSchedule` path now delegate, removing the
  hardcoded `>= 2`, the two duplicate `getWeekBounds`, and three inline collision
  queries. **Behavior fix:** reassigning a session to another team now snapshots
  the new team's **Active** members only (Dropped excluded) — parity with booking,
  aligning code to the existing spec. 664 server tests green across 69 suites (new
  policy unit test + new reassign-Active regression). Authz + `schedulingMode` enforcement on legacy
  paths deliberately deferred to a follow-up. Spec folded into `scheduling-and-booking`.
- **2026-06-08** — **Wave E1 (backend slice) — `ALLOWED_TIME_SLOTS` authoritative
  end-to-end on the server.** New shared `scheduling-window-policy`
  (`server/domains/schedule/`) parses/validates/normalizes configured windows
  (exact start+end minutes + duration; fail-closed on empty/malformed). DRY: team
  booking, cohort booking, Admin create, **and the Admin schedule-update path**
  now enforce the same windows (the update path previously checked only
  `end > start`, allowing off-policy moves). Settings PUT now validates the config
  on write (rejects malformed/overlapping; empty allowed). New
  `GET /api/learning/sessions/config` returns a safe scheduling DTO to all
  authenticated roles (general `/api/settings` stays Admin-only). 72 tests green
  across 7 affected suites (policy unit + config auth/DTO + off-policy admin-move +
  settings overlap/malformed). Spec folded into `scheduling-and-booking`.
  **Remaining E1 (client slice):** migrate the booking grid (`CalendarGrid` +
  Book/Schedules/Attendance) to exact slot descriptors via `useSchedulingConfig`
  and remove the participant `hour + 1` submission — see the Wave E phase-01 plan.
- **2026-06-08** — **Spec-driven layer — capability specs + registry
  (OpenSpec-compatible).** Added a behavior source-of-truth layer under
  `docs/specs/`: a spec template + proposal/delta template, a registry
  (`docs/specs/README.md`), and the `spec-driven-development.md` rule. Retrofitted
  **28 capability specs** from current code (BR/UC/FR+Given/When/Then/NFR/AC +
  error matrix) — full coverage of every mounted `/api/*` surface. Core:
  scheduling-and-booking, auth, users, teams, attendance, learning-catalog,
  enrollment, learning-paths, assessments, question-bank, grading, feedback,
  completion-and-certificates, assignments-and-reminders, reporting-and-rollups,
  compliance-and-recertification, audit-log, export-and-integrations,
  reconcile-job, capability-authz (evolving), security-platform; plus evaluations
  (legacy), bulk-import, settings, dashboard-analytics, search, admin-db-explorer,
  org-and-departments. Also refreshed `route-permission-matrix.md` (was missing
  `/api/learning/paths`, `/api/org`, `/api/assessment`, `/api/admin/cron`). Wired
  into the Definition of Done (update affected spec on behavior change) and
  `CLAUDE.md` Key references. Docs/process-only — no code behavior changed.
- **2026-06-05** — **Wave D6 v1.1 — verification docs and rollout.**
  Closed D6 v1.1 after end-to-end verification. Focused backend gate passed
  **7 suites / 34 tests** across compliance report/export, completion report
  regression, certificate expiry state, and formula guards. Client focused gate
  passed **3 files / 29 tests** for Reports tab, Compliance table, and role
  access; root syntax check passed **39 files**; client production bundle passed;
  client lint passed at **0 errors / 81 existing warnings**. Manual smoke on
  local Vite seeded assignment/certificate fixtures, loaded
  `/api/learning/reports/compliance?status=overdue&certificateState=expired`,
  verified `Expired`/`Expiring` rows, then downloaded from
  `/api/learning/reports/compliance/export?status=overdue&certificateState=expired`
  as `compliance-report-2026-06-05.xlsx` with no console errors or page overflow.
  Rollout note recorded in
  `plans/reports/context-260605-1954-wave-d6-compliance.md`.
- **2026-06-05** — **Wave D6 v1.1 — frontend compliance report UI.**
  Surfaced D6 compliance reporting inside the existing Learning **Reports** tab
  instead of adding another app area. Admins now get a compact Completion/
  Compliance switch; the Compliance panel uses existing programs, assignments,
  departments, and users lists for filters, validates due-window range, loads the
  heavy report only after explicit request, renders summary tiles + dense learner
  rows, and downloads through `/api/learning/reports/compliance/export`. Teachers
  keep the completion-only view; Participants remain denied by `read:reports`.
  New client API methods, query keys, hooks, `en.json` strings, modular table/
  filter/panel components, and component tests were added. Verified: Learning
  component tests **43 passed**, focused report/useRole tests **29 passed**, root
  syntax check **39 passed**, and client build clean.
- **2026-06-05** — **Wave D6 v1.1 — certificate expiry policy.**
  Added non-destructive certificate validity windows: `Certificate` now carries
  `validFrom`, `validUntil`, and `validityDays`, and `LearningProgram` can set
  `certificateValidityDays` (null means no expiry). Certificate issue snapshots
  the program validity policy; existing/legacy Issued certificates without
  `validUntil` remain `issued`. Shared expiry state helper now derives
  `issued`/`expiring`/`expired`/`revoked`; completion report rows, compliance
  report rows, authenticated certificate DTOs, public verification, and report
  exports expose validity state/columns. Expired certs are report signals only;
  prerequisite/completion semantics are unchanged in v1.1. Verified: root syntax
  check **39 passed**; focused expiry/completion/report suites **34 passed**.
  Deferred: expiry reminder emails.
- **2026-06-05** — **Wave D6 v1.1 — backend compliance report/export.**
  Added the first compliance reporting slice under `server/domains/learning/reports`:
  `GET /api/learning/reports/compliance` and `/export` are Admin-only beyond the
  coarse `report.read` gate, expand active D4 assignments into per-learner rows,
  attach D3 department/manager fields, derive assignment status through the D4
  resolver, attach certificate state (`issued`, `missing`, `revoked`, expiry-ready
  `expiring`/`expired`), and return summary + program/department/manager rollups.
  Export produces a capped xlsx workbook with `X-TMS-Record-Count`, formula guards
  every user/admin-controlled cell, and now writes a valid `Report` audit entry.
  Verified: root syntax check **39 passed**; compliance/report focused server
  suites **15 passed**; D4/capability regression **23 passed**; report export
  formula unit suites **3 passed**. Follow-up slices closed certificate validity
  schema/policy and Learning Reports UI; expiry reminders remain deferred.
- **2026-06-05** — **Wave D5 v1 — assignment reminders + manager escalation.**
  Built the first notification slice over D4 assignments. New `NotificationLog`
  stores email idempotency/audit trace with assignment/learner/recipient refs,
  cadence key, status/error/metadata, a unique send tuple, and 180-day TTL. New
  `server/domains/learning/assignment/reminder-service.js` scans active
  assignments, reuses D4 derived status, skips completed learners, sends due-soon
  learner emails at 7 days and 1 day, sends overdue learner emails every 3 overdue
  days, and sends weekly manager digests for overdue direct reports when manager
  email exists. Missing learner/manager email is logged as skipped; mail failures
  are fail-soft and logged as failed. Added assignment email templates/senders and
  `POST /api/cron/assignment-reminders` behind cron token auth, wrapped with
  `runMonitored` so Admin cron health can show it through `CronRun`. Verified:
  focused server gate **36 passed** across assignment reminder integration,
  cadence, email templates, and cron monitor tests. Deferred: in-app notification
  center, admin log UI, assessment reminders, certificate expiry emails, D6
  exports/recertification.
- **2026-06-05** — **Wave D4 v1 — assignment + due dates.**
  Added directive training assignment, the missing compliance workflow after the
  org model. New `Assignment` model + `server/domains/learning/assignment/`
  module mounted at `/api/learning/assignments`: Admin creates/archives active
  Program or Learning Path assignments to explicit users and/or Departments with
  a due date; Admin/Teacher read via `assignment.read`; create/archive are
  audited and archived via soft-delete. Status is derived, not stored:
  departments expand to assignable users; soft-deleted/inactive/dropped/
  transferred users are excluded; completion wins over overdue; in-progress comes
  from active/on-hold/completed cohort enrollments for the target program(s).
  UI: Learning → **Assignments** tab with progress chips and Admin-only create/
  archive actions; create modal supports Program/Path target, department targets,
  and searchable explicit users. Verified: server focused assignment +
  capabilities tests **17 passed**; client assignment/useRole tests **28 passed**;
  client lint passes at existing cap (0 errors/81 warnings), new files lint clean,
  build clean. Deferred: reminders/escalation/export/recertification and
  cohort-specific assignment.
- **2026-06-04** — **Wave D3 v1 — org model (manager hierarchy + departments).**
  Built ahead of D2 in the locked order because D2's user OIDC login is blocked on
  owner-only inputs (a Google OAuth app + the allowed Workspace domain), while the
  org model is the #1 missing LTMS capability and fully codeable now. Adds a
  structured org tree: a new `Department` entity + `User.managerId`/`departmentId`
  (added **non-destructively** alongside the legacy free-text `department` string —
  "open until populated", to be fed by D2 Directory sync later). New `domains/org`
  module (`/api/org`): Admin **department CRUD** (`department.manage`/`department.read`;
  archive refuses while users are still assigned), **manager/department assignment**
  (`org.manage`, audited, with self-manager + bounded reporting-**cycle** guards),
  and a self-scoped **manager dashboard** `GET /api/org/my-team` (`team.read`, held
  by every role since any user can have reports) returning each direct report's
  training rollup — active enrollments, certificates, completed programs — via two
  **batched aggregates** (no N+1, reuses the same enrollment/certificate signals as
  the completion engine). UI: a People → **Departments** tab (`DepartmentsPage`), an
  org-assignment action on the Users table (`OrgAssignmentModal`), and a **conditional
  My Team nav entry** (only shown when the caller has reports) → `/my-team`
  (`MyTeamPage` + presentational `TeamRosterTable`). New `useRole` perms
  (`read:department`/`manage:department`/`assign:org`/`read:team`), `orgAPI`,
  `useOrg` hooks, `qk.org` keys, `nav.myTeam` en string. Verified: server **574
  tests** (+15), client **151 tests** (+6), lint 0 errors/81 warnings (at cap),
  build clean. Department Directory-sync population lands with D2; "overdue" status
  awaits D4 due dates.
- **2026-06-04** — **Wave D1 (start) — cron self-monitoring.** Scheduled jobs now
  prove they ran. New `lib/cronMonitor.runMonitored(jobName, opts, fn)` wraps the
  nightly **reconcile** and **attendance-reminders** jobs — at both call sites (the
  in-process `node-cron` scheduler **and** the external-pinger endpoints) so
  whichever path fires updates the same heartbeat. It persists a durable `CronRun`
  doc (one per job: last run/status/duration/error, `lastSuccessAt`, run/fail
  counters, expected cadence) and emits Sentry **cron check-ins**
  (`in_progress`→`ok`/`error`) + `captureException` — every side-channel
  **fail-soft** so monitoring can never break or mask the job. Admin-only
  `GET /api/admin/cron/health` returns a per-job `ok`/`stale`/`error`/`never`
  verdict (pure `deriveHealth`, stale = no success within 2× cadence) + an overall
  flag; a new **Scheduled jobs** panel (`CronHealthPanel`) on the Reconcile page
  answers "did cron fire?" on the sleeping Render free-tier. Verified: server
  **559 tests** (+10), client **145 tests** (+5), lint 0 errors/81 warnings (at
  cap). Remaining D1 (paid always-on hosting, Sentry-dashboard monitor config) is
  owner ops, not code.
- **2026-06-04** — **Wave C1 — learner path-progress view + English-only UI.**
  Closed the learning-paths loop: Participants open `/me/paths` to see each active
  path's ordered steps marked `completed`/`current`/`locked` with a progress bar,
  driven by `GET /api/learning/paths/:id/progress` via a new `usePathProgress`
  hook. New presentational `PathProgressView` + `MyLearningPathsPage`, Participant
  route, and a dashboard CTA. Separately, the **product is now English-only**: i18n
  forced to a single `en` locale, language detector/toggle removed, `vi.json`
  deleted, and all hard-coded Vietnamese UI strings translated to English across
  the dashboard, teams, evaluation, classes, booking, attendance, and DB-explorer
  pages (rule docs + golden rule updated to match). Verified: client **140 tests**
  (+4), lint 0 errors/81 warnings (at cap), build clean. **Wave C core complete.**
- **2026-06-04** — **Direction locked: LTMS gap analysis + priority re-sequence.**
  Added [`ltms-gap-analysis.md`](ltms-gap-analysis.md) (decision doc) and applied
  owner-approved decisions to the roadmap: six-month order is now
  `C1 → D1 → D2 → D3(manager hierarchy) → D4(mandatory assignment + due dates) →
  D5(notifications) → D6(compliance + recertification)`, with **Wave E (generic
  scheduling) promoted from deferred to a committed parallel track**. **Mandatory
  assignment + due dates (G2)** added as a first-class milestone (was unrecorded).
  `lms-roadmap.md` §1/§4/§5 and this waves table updated; `README.md` re-framed
  from "corporate English training" to Internal LTMS. Docs-only; no code change.
- **2026-06-04** — **Wave C — learning paths admin UI.** Surfaced the
  `/api/learning/paths` backend in the Learning workspace: a new **Paths tab**
  on `/learning` (Admin-gated via `manage:path`) lists paths and lets Admins
  create/edit/archive them. `PathFormModal` reuses the program/cohort modal
  pattern; a presentational `PathProgramsEditor` provides an **ordered** program
  picker (add from a dropdown, reorder up/down, remove) so the array order is the
  curriculum sequence. New `learningAPI` path methods + `useLearningPaths`/
  `useCreatePath`/`useUpdatePath`/`useArchivePath` hooks + `qk.learning.paths`
  keys + `manage:path`/`read:path` UI permissions; i18n en+vi (parity 398/398).
  Client **136 tests** (+9), lint 0 errors/81 warnings (at cap), build clean.
  Frontend-only. Learner-facing path-progress view (`…/progress`) deferred.
- **2026-06-04** — **Wave C — sequenced learning paths v1 (backend foundation).**
  New `LearningPath` model (ordered, de-duplicated program list; soft-delete) +
  `domains/learning/path/` mounted at `/api/learning/paths`. Admin CRUD behind a
  new `path.manage` capability; any authenticated learner reads behind `path.read`.
  `GET /paths/:id/progress` walks the ordered programs and derives each step's
  state — `completed` / `current` / `locked` — from the shared
  `hasCompletedProgram` engine (DRY with prerequisite gating), plus a summary
  (`completed`/`total`/`percentComplete`/`complete`). No enrollment side effects
  yet (curriculum + progress view only — YAGNI). Audit on every mutation. 9
  integration tests; full server suite green (exit 0, **549** — 540 + 9). Backend
  only — a learning-paths UI and auto-enroll-into-next-step are deferred.
- **2026-06-04** — **Phase 4 — prerequisite-selector UI.** The Program form
  (`ProgramFormModal`) now exposes a multi-select **Prerequisites** picker listing
  other active programs (self excluded); selections persist to
  `LearningProgram.prerequisitePrograms` on create + edit (the field shipped
  backend-only earlier on 2026-06-04). New presentational `PrerequisiteSelector`
  component (checkbox list, value-as-source-of-truth), i18n en+vi (3 keys). Closes
  the deferred prereq UI from gating v1; sequenced learning paths remain the next
  Wave C step. Verified: client **127 tests** (+4), lint 0 errors/81 warnings (at
  cap), build clean. Frontend-only — server untouched.
- **2026-06-04** — **Wave C — prerequisite gating v1.** A `LearningProgram` can
  now declare `prerequisitePrograms`, and the cohort-enrollment chokepoint
  (`domains/learning/enrollment/`) blocks **self-enrollment** (incl. `/me/catalog`)
  with **422** until the learner has completed each prerequisite — satisfied by an
  Issued certificate or a passing result from the completion engine
  (`enrollment/prerequisites.js`). The error names the unmet program(s). **Admins
  may override** (gate runs on the non-admin path only). Program DTO exposes the
  field; self-reference is stripped on update. Direct prerequisites only —
  sequenced learning paths, transitive/cycle handling, and a prerequisite-selector
  UI are deferred. 5 integration tests; server suite **540 green**.
- **2026-06-03** — **Wave C — learner catalog self-enroll v1.**
  Added Participant self-service catalog at `/me/catalog`. The page lists active
  programs with `schedulingMode: self_enroll`, joins ongoing cohorts, supports
  search/category filters, marks already-enrolled cohorts, and enrolls through
  the existing `/api/learning/enrollments` self-enroll path. Participant
  dashboard now links to the catalog. Verified: focused catalog UI **2 tests**,
  client **122 tests**, lint 0 errors/81 warnings (at cap), production bundle
  clean.
- **2026-06-03** — **Wave B — completion report rollups.**
  Added `GET /api/learning/reports/completion/rollup` behind `report.read`.
  The rollup reuses the existing cohort completion report path, groups active
  cohorts by program and learners by department, and returns summary counts,
  completion rates, and certificate counts. Learning **Reports** now shows
  program and department rollup tables above the cohort report. Verified:
  learning report integration **7 tests**, focused report UI **4 tests**, client
  **120 tests**, lint 0 errors/81 warnings (at cap), production bundle clean.
- **2026-06-03** — **Wave B — manual grading v1.**
  Added manager-only short-text review overrides for assessment attempts.
  `PUT /api/assessment/attempts/:id/manual-grade` accepts per-answer scores,
  stores manual grading metadata, recomputes `scorePercent`/`passed`, and leaves
  choice items immutable. Learning **Assessments** now has a Review Attempts
  modal for Admins/Teachers to score submitted short-text answers with optional
  notes. Completion/certificates use the updated pass state via the existing
  passing-attempt lookup. Verified: assessment integration **20 tests**, client
  **119 tests**, lint 0 errors/81 warnings (at cap), production bundle clean.
- **2026-06-03** — **Phase 4 — assessment question bank UI.**
  Surfaced the backend question bank in the Learning **Assessments** tab for
  Admins/Teachers. Managers can create/archive reusable questions from a compact
  panel, and the assessment authoring modal can import selected bank questions
  through `questionBankItemIds` while preserving manual item authoring. Added
  `assessmentAPI` methods, React Query hooks/keys, en+vi labels, and focused
  tests. Client: **117 tests**, lint 0 errors/81 warnings (at cap), production
  bundle clean.
- **2026-06-03** — **Wave B — assessment question bank foundation.**
  Added reusable question-bank items (`AssessmentQuestion`) and manager-only
  `/api/assessment/question-bank` endpoints for create/list/update/archive.
  Assessment create/update now accepts `questionBankItemIds`, materializes them
  into immutable item snapshots, and returns `questionBankItemId` in item DTOs.
  Focused tests cover manager CRUD, Participant block, import, and archived-item
  rejection. Verified: assessment integration **16 tests**, root syntax check
  **39 files**. Server lint unavailable (no `server` lint script).
- **2026-06-03** — **Wave B — assessment edit support.**
  Added manager-only `PUT /api/assessment/assessments/:id` with audit diff,
  cohort revalidation, and full replacement of title/description/cohort,
  publication state, scoring settings, and item definitions. Existing attempts
  remain immutable score snapshots. The Learning **Assessments** tab now has an
  **Edit Assessment** action that reuses the authoring modal; form payload logic
  moved into `assessment-form-utils.js` to keep the modal under 200 LOC. Added
  `assessmentAPI.updateAssessment`, `useUpdateAssessment`, en+vi labels, and
  focused tests. Verified: assessment integration **13 tests**, client
  **115 tests**, lint 0 errors/81 warnings, build clean, `/learning` route 200.
  Full server suite was attempted but hung silently in this session; cleaned up
  leftover mongodb-memory-server processes.
- **2026-06-03** — **Phase 4/5 — feedback UI.**
  Added feedback surfaces over `/api/learning/feedback`: Admins/Teachers get a
  **Feedback tab** in `/learning` with cohort filter + submitted ratings table;
  Participants get `/me/feedback`, linked from the dashboard, to submit or update
  overall/content/instructor ratings and comments for enrolled/scheduled cohorts.
  Added `learningAPI.getFeedback/submitFeedback`, React Query hooks/keys,
  `read:feedback` UI permission, and focused tests. Client: **114 tests** (+5),
  lint 0 errors/81 warnings (at cap), build clean; `/me/feedback` route smoke
  returned 200 OK.
- **2026-06-03** — **Phase 4 — learner assessment-taking UI.**
  Added a Participant-only `/me/assessments` route and dashboard CTA. The page
  lists published assessments for the learner's cohort enrollments / scheduled
  classes, shows latest attempt status and score, and opens an attempt dialog
  for choice + short-text answers. Submits through
  `/api/assessment/assessments/:id/attempts` and refreshes attempt state. Added
  `getAssessment`, `useAssessmentAttempts`, `useSubmitAssessmentAttempt`, and
  focused tests. Client: **109 tests** (+3), lint 0 errors/81 warnings (at cap),
  build clean.
- **2026-06-03** — **Phase 4 — assessment authoring UI.**
  Replaced the placeholder Assessments tab on `/learning` with a real cohort
  assessment surface over `/api/assessment`: Admins/Teachers can create published/draft
  quizzes with v1 item types (`single_choice`, `multiple_choice`, `short_text`),
  list by cohort/all cohorts, and archive after confirmation. Added `assessmentAPI`, `useAssessment` hooks,
  `qk.assessment`, `manage/read:assessment` UI permissions, and en+vi i18n.
  Client: **106 tests** (+3), lint 0 errors/81 warnings (at cap), build clean.
  Learner attempt-taking UI remains next.
- **2026-06-03** — **Phase 4 — completion report UI (first L&D reporting surface).**
  A gated **Reports tab** on the Learning page (`/learning`, shown to Admin/Teacher
  via a new `read:reports` permission) lets a user pick a cohort and view the
  per-learner completion table (attendance %, assessment/feedback Met·Unmet·N-A,
  complete, certificate) with summary tiles (learners, complete, completion rate,
  certificates) and a one-click **Excel export**. New `learningAPI` methods +
  `useCompletionReport`/`useDownloadCompletionReport` hooks +
  `qk.learning.completionReport` key; presentational `CompletionReportTable`
  split out for testability. Full i18n (en + vi). Client: **103 tests** (+3),
  lint 0 errors/81 warnings (at cap), build clean. Frontend-only (reporting API
  shipped previously).
- **2026-06-03** — **Wave B — completion reporting + xlsx export.** New
  `domains/learning/reports/` sub-domain: `GET /api/learning/reports/completion`
  (`?cohortId=`) enumerates the cohort's learners (session roster ∪ non-dropped
  enrollments), reuses the completion engine (`evaluateCompletion`) per learner,
  attaches certificate status, and rolls up a summary (complete/total, completion
  rate, certificates issued). `GET /reports/completion/export` returns the same
  data as an `.xlsx` attachment (`exceljs`, `exportLimiter`). New `report.read`
  capability (Admin/Teacher; learners excluded — cohort-wide view). Closes the
  Phase 5 "reports" + "program completion export" gaps. 5 integration tests;
  server suite **525 green**.
- **2026-06-03** — **Wave B — generic assessment engine v1 (build-in-house).**
  New `domains/assessment` mounted at `/api/assessment` (own boundary, sibling to
  `learning/`). `Assessment` model = cohort-scoped, item-based quiz (v1 types:
  `single_choice` / `multiple_choice` / `short_text`; choice items keyed by
  option index so an author writes the whole quiz in one request);
  `AssessmentAttempt` = one-shot, auto-graded (pure `grading.js`). Endpoints:
  author / list / get / archive (soft-delete) assessments + submit / list
  attempts; learners see only published quizzes, never the answer keys, and are
  scoped to their own attempts. A **passing attempt now satisfies
  `completionPolicy.requiresAssessment`** alongside the legacy `Evaluation`
  (untouched). New capabilities `assessment.manage` / `assessment.read` /
  `assessment.attempt`. DRY: extracted shared `helpers/cohortMembership.js`
  (feedback + assessment reuse it). 20 tests (8 grading unit + 12 integration);
  server suite **520 green**. Iteration (question banks, item edit, learner UI)
  deferred.
- **2026-06-03** — **Wave B — feedback foundation (unblocks `requiresFeedback`).**
  New `Feedback` model (one per learner per cohort, soft-delete, upsert re-submit)
  + `domains/learning/feedback/` module and `/api/learning/feedback`
  (`GET` list, `POST` submit). A Participant self-submits for a cohort they
  belong to (roster or enrollment); an Admin may submit on a learner's behalf;
  a Teacher can read but not submit. The completion engine now reads feedback:
  `completionPolicy.requiresFeedback` is honestly enforced (`feedback.met` flips
  on submission; old `feedback-not-available` reason → `feedback-not-submitted`).
  New capabilities `feedback.submit` / `feedback.read`. 8 integration tests;
  server suite **500 green**. Backend foundation only — learner-facing feedback
  UI deferred.
- **2026-06-03** — **Wave B kickoff — completion enforcement + certificates.**
  `LearningProgram.completionPolicy` is now enforced: a new
  `domains/learning/completion/` sub-domain computes completion (attendance %
  from `Attendance` P/L vs cohort sessions + `requiresAssessment` via
  `Evaluation`; `requiresFeedback` honestly reported unmet — no Feedback model
  yet). New `Certificate` model (immutable snapshot, soft-delete) + endpoints:
  `GET /api/learning/completion`, `GET/POST/DELETE /api/learning/certificates`
  (issue 422-gated on completion, revoke = soft status), and a **public**
  `GET /api/learning/certificates/verify/:code`. New capabilities
  (`completion.read`, `certificate.read/manage`). 9 integration tests; server
  suite 492 green. Build-vs-buy assessment engine + Feedback model deferred.
- **2026-06-03** — **M4 capability-based authz scaffold — Wave A (Foundation)
  complete.** New `server/policy/capabilities.js` (role→capability map; Admin
  superuser) + `middleware/requireCapability.js` (coarse, any-of gate). Learning
  routes now declare capabilities (`program.manage`, `cohort.manage`,
  `session.book`, `enrollment.read/manage/self`) instead of `roleGuard` — role
  sets unchanged, so behavior-preserving. Resource policies/use-cases untouched
  (still the "this doc?" layer). 10 unit tests + 1 integration test; server suite
  483 green. Legacy routes stay on `roleGuard` (incremental). M1–M4 all done.
- **2026-06-03** — **M3 Learning CRUD UI shipped — Learning page is no longer
  read-only.** Admins can create/edit/archive **Programs**, create **Cohorts**,
  and enroll/withdraw learners per cohort directly from `/learning`. New
  `pages/learning/` modals (`ProgramFormModal`, `CohortFormModal`,
  `EnrollLearnersModal`) + extracted `ProgramsTab`/`CohortsTab`; React Query
  mutation hooks in `useLearning`; cohort-enrollment API methods; Admin-gated via
  `useRole` (`create:program`/`create:cohort`/`enroll:learner`). Full i18n
  `learning` namespace added to **en + vi** (86 keys each). Frontend-only (backend
  CRUD endpoints already existed). Client: lint 0 errors/81 warnings, 100 tests,
  build clean.
- **2026-06-03** — **M1 complete — all 4 scheduling modes enforced (no 501 stubs).**
  `self_enroll`/`nomination` now have a real flow: an Admin schedules a **team-less
  cohort session** (`POST /api/learning/sessions/book-slot` with `cohortId`) that
  snapshots the cohort's active cohort-based enrollments (M2) as the roster.
  `Schedule.bookedTeamId` made optional; new `scheduleService.bookCohortSlot`;
  `bookSession` routes `groupId` (team modes) vs `cohortId` (cohort modes); a
  team-based program booked via group is rejected, cohort-based via group → 400.
  6 new/updated session tests (self_enroll/nomination 201 + roster, non-admin 403,
  wrong-target 400, validation). Server 472 tests green; lint clean.
- **2026-06-02** — **M2 cohort-based enrollment shipped.** `Enrollment.teamId`
  now optional; new `domains/learning/enrollment/` module + `/api/learning/enrollments`
  (list / enroll / withdraw-soft → `Dropped`). Admin enrolls anyone; learners
  self-enroll when the program is `self_enroll`; multi-program allowed. Reconcile
  no longer false-flags team-less cohort enrollments. 6 integration tests;
  team-based enrollment path untouched.
- **2026-06-02** — `admin_scheduled` mode shipped: Admin-only session creation;
  team leaders rejected with 403 (reuses `bookSlot`). **M1 → 2/4 modes.**
  `self_enroll`/`nomination` still 501 — they need cohort-based per-learner
  enrollment (**M2**). Tests added (admin 201 / leader 403 / self_enroll 501).
- **2026-06-02** — Enforce `schedulingMode` foundation (`ee7ba54`): leader_booking
  works, admin/self-enroll/nomination return 501 until built. Committed + pushed
  the full migration backlog (5 commits). Added `system-overview.md`,
  `lms-roadmap.md`, and this tracker. Verified: 459 server + 98 client tests, lint clean.
- **2026-06-01** — Learning domain (programs/cohorts/sessions), `LearningProgram`
  model + `Class.programId` backfill, schedule adapter (thinned `scheduleController`),
  ADRs, current-system-map, route-permission-matrix.

---

## How to keep this current

After each milestone or significant change: update the phase/wave %, move the
status emoji, add one changelog line (dated), and sync `handoff-2026-06-01.md`.
Also record whether the quality gate passed or what wiring bug remains. Keep
this doc lean — strategy detail stays in `lms-roadmap.md`.
