# Development Roadmap — TMS v2 → Internal LMS (living tracker)

> **This is the canonical progress tracker.** Update it as milestones move.
> - *Why / strategy / gap analysis* → [`lms-roadmap.md`](lms-roadmap.md)
> - *Architecture / orientation* → [`system-overview.md`](system-overview.md)
> - *Detailed task snapshot* → [`handoff-2026-06-01.md`](handoff-2026-06-01.md)
>
> **Last updated:** 2026-06-03

---

## Current status

~58% through the TMS → L&D migration. **Wave A (Foundation) is complete:** all 4
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
summary, with one-click Excel export (i18n en+vi). Next: more L&D UI (assessment
authoring/taking, feedback) and assessment-engine iteration.

---

## Migration phases (backend re-architecture)

| Phase | Theme | Progress | Status |
|------|-------|---------:|--------|
| 0 | Architecture baseline + safety net | ~92% | 🟢 near done |
| 1 | Backend modular-monolith refactor | ~42% | 🟡 in progress |
| 2 | Learning catalog + generic cohort model | ~95% | 🟢 near done |
| 3 | Multi-program enrollment + session scheduling | ~75% | 🟡 in progress |
| 4 | Frontend L&D workspace (CRUD UI) | ~55% | 🟡 in progress |
| 5 | Reporting, completion, feedback | ~60% | 🟡 in progress |
| 6 | PostgreSQL decision gate | 0% | ⚪ gated |

## LMS waves (forward — see [`lms-roadmap.md`](lms-roadmap.md))

| Wave | Goal | Status | Depends on |
|------|------|--------|-----------|
| A — Foundation | Generic learning core works E2E (scheduling modes, cohort enrollment, CRUD UI, capability authz) | 🟢 done (M1–M4) | — |
| B — Assessment & Certification | Generic assessment engine, completion enforcement, certificates | 🟡 in progress (completion + certificates + feedback + assessment engine v1 + completion reporting done; iteration + learner UI next) | A |
| C — Catalog, Paths & Self-service | Learner catalog, self-enroll, learning paths/prerequisites | 🔴 planned | A |
| D — Platform & Scale | SSO, HRIS sync, advanced analytics, mobile, Postgres gate | 🔴 planned | B, C |

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

---

## Recent progress (changelog)

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
Keep this doc lean — strategy detail stays in `lms-roadmap.md`.
