# Development Roadmap — TMS v2 → Internal LTMS (living tracker)

> **This is the canonical progress tracker.** Update it as milestones move.
> - *Why / strategy / 6-month direction* → [`lms-roadmap.md`](lms-roadmap.md)
> - *Architecture / orientation* → [`system-overview.md`](system-overview.md)
> - *Detailed task snapshot* → [`handoff-2026-06-01.md`](handoff-2026-06-01.md)
>
> **Last updated:** 2026-06-09

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
Directory sync still needs owner inputs. Next codeable branch: choose either D2
owner-input setup or the separate Wave E generic scheduling plan.

---

## Migration phases (backend re-architecture)

| Phase | Theme | Progress | Status |
|------|-------|---------:|--------|
| 0 | Architecture baseline + safety net | ~93% | 🟢 near done |
| 1 | Backend modular-monolith refactor | ~56% | 🟡 in progress |
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
| E — Generic scheduling | Generalize booking beyond fixed English slots (session types, rooms, capacity, waitlists, instructors); keep leader-booking as one mode. Committed parallel track; large, own plan. | 🟡 in progress (**E1 backend slice done** — `ALLOWED_TIME_SLOTS` authoritative server-side: shared window policy, all mutation paths validated incl. Admin moves, config-on-write validation, safe `/sessions/config` endpoint; **E1 client slice pending** — exact-slot grid rendering; E2+ capacity/rooms/waitlists gated) | A |

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

---

## Recent progress (changelog)

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
