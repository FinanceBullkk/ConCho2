# Development Roadmap — TMS v2 → Internal LTMS (living tracker)

> **Canonical progress tracker.** Status board first, then milestone tables,
> then the recent changelog. Full history → [`changelog-archive/`](changelog-archive/).
> - *Why / strategy / 6-month direction* → [`lms-roadmap.md`](lms-roadmap.md)
> - *Architecture / orientation* → [`system-overview.md`](system-overview.md)
> - *Detailed task snapshot (archived)* → [`archive/handoff-2026-06-01.md`](archive/handoff-2026-06-01.md)
>
> **Last updated:** 2026-06-18

---

## Status board — Now / Next

**~70% through the TMS → L&D migration.** The generic learning core AND the L&D
compliance loop (assignment → completion → certificate → expiry → recertification)
work end to end. **The genuine non-deferred migration debt is closed** — the
remainder is documented deferred-by-design scope (below), not active debt.

- **Done (waves):** A Foundation · B Assessment & Certification · C Catalog/
  Paths/Self-service (core) · D1/D3/D4/D5/D6 platform slices · **E Generic
  scheduling** — closed 2026-06-12. Full-system audit (8/8 rounds) complete;
  Express 4→5 + light dependency majors done. **Cohesion Wave** (6/6) + in-app
  notification bell (full event coverage) shipped 2026-06-13.
- **Now: Phase 3/4/5 push COMPLETE** (2026-06-13, 7 PRs #80–#86, re-baselined).
  Shipped: bulk cohort enrollment (BE+UI); program-policy enforcement
  (`facilitatorPolicy.assignmentRequired` + `visibility`) + a program-policies
  **editor UI** (completion/capacity/facilitator/cert-validity/recertify); and
  the full **certificate lifecycle** — expiry reminders (learner + weekly
  manager digest) → **recertification auto-assignment**. Phase 3 → ~85%,
  4 → ~82%, 5 → ~80%; all genuine non-deferred work is shipped.
- **Deferred-by-design (NOT debt — owner decision to build):** nomination
  workflow (overlaps Assignment/D4); Evaluation→Assessment convergence (project
  rule: converge-when-touched, no big-bang); compliance report presets (no
  confirmed HR need); recert for already-expired certs + path-based recert.
  `deliveryMode` is metadata-only by design (no enforcement contract).
- **Next:** owner's call — start **Phase 6 PostgreSQL** readiness (Phase 0), the
  gated owner-ops below, or override one of the deferred-by-design items above.
  (TMS.update north-star: **all 7 gaps shipped** (#1–#7); #7 PWA offline
  attendance closed 2026-06-15. **Investment Build Plan deep features — all 4
  shipped** (#3a audit hash-chain PR #108, #4 reconcile auto-heal PR #109, #1
  analytics time-series PR #110, #5 Studio Scheduling PR #111). **Modernization
  Horizon 1 — all buildable slices SHIPPED 2026-06-16**: A5 training-hours
  (PR #112) + **A5 part-2** evidence-pack/presets, **A3 role compliance matrix**
  (`RequiredTraining`, PR #113), **A1 budget & cost** (`CostEntry`/`Budget` +
  `domains/finance`, PR #114), **B2 skills-as-spine** (taxonomy + gap-driven
  recommendations, PR #115). **Only A8 HRIS auto-assign remains — gated** on the
  owner's Google Directory/OAuth setup (D2). PDF/zip evidence + cron-scheduled
  presets deferred (no PDF dep in-repo; presets flagged no-confirmed-HR-need).
  **Modernization Horizon 2 — BUILD-COMPLETE 2026-06-16**: **A2 vendor & external-
  provider management** (`Vendor` + `domains/vendor`, PR #119) — catalog +
  contracts/renewal + ratings + per-vendor spend off the A1 ledger; **A6 trainer-
  management depth** (`TrainerProfile` + `domains/trainer`, PR #120) —
  qualification/availability, qualified-and-free listing, per-trainer load,
  ratings, + a trainer double-booking 409 guard at the assign chokepoint;
  **A4 TNA→annual-plan** (`TrainingRequest`/`TrainingPlan` + `domains/planning`,
  PR #121) — demand intake + status machine, demand aggregation, and a costed
  annual plan that schedules items into cohorts (carrying est cost into the A1
  budget); **B5 mobile learning surface** (`PushSubscription` + `services/pushService`
  + `domains/mobile` at `/api/me`, PR #122) — Web Push (rides along on `recordInApp`,
  fail-soft without VAPID env) + a composed "Today" feed (overdue/due-soon/upcoming/
  microlearning) on the existing offline PWA. **Horizon 2 BUILD-COMPLETE
  (4 of 6 shipped) — the other 2 are not buildable now (owner decision 2026-06-16):**
  **B1 AI layer = PARKED** (owner has no LLM provider/API key yet — build when one
  is supplied), **B8 Slack/Teams = DROPPED** (owner does not use Slack/Teams —
  deferred-by-design, not a gap). GitHub repo made **public 2026-06-16** (unlimited
  free Actions). B5 push DELIVERY activates once the owner sets VAPID env keys.)
- **Gated / owner-ops:** **D2 Google OIDC + Directory sync** (blocked on owner's
  Google OAuth app + Workspace domain); **paid always-on hosting** + Sentry
  cron-monitor dashboard; **Phase 6 PostgreSQL gate** (plan drafted,
  `plans/260612-2042-postgresql-migration/`; Phase 0 readiness can start now).

---

## Migration phases (backend re-architecture)

| Phase | Theme | Progress | Status |
|------|-------|---------:|--------|
| 0 | Architecture baseline + safety net | ~93% | 🟢 near done |
| 1 | Backend modular-monolith refactor | ~99% | 🟢 near done (2026-06-10: domains/attendance+groups+schedule routes extracted; repository ADR; schedule use-case tests; frontend `features/` migration complete · 2026-06-15: model access fully consolidated behind per-domain `repository.js` in schedule/attendance/groups — the 3 last all-files-leak domains) |
| 2 | Learning catalog + generic cohort model | ~95% | 🟢 near done |
| 3 | Multi-program enrollment + session scheduling | ~85% | 🟢 near done (genuine work shipped; only nomination workflow deferred-by-design) |
| 4 | Frontend L&D workspace (CRUD UI) | ~82% | 🟢 near done (CRUD + policy editor complete) |
| 5 | Reporting, completion, feedback | ~80% | 🟢 near done (cert lifecycle + recert closed; Evaluation→Assessment convergence deferred-by-design) |
| 6 | PostgreSQL decision gate | 0% | ⚪ gated |

## LTMS waves (forward — see [`lms-roadmap.md`](lms-roadmap.md))

| Wave | Goal | Status | Depends on |
|------|------|--------|-----------|
| A — Foundation | Generic learning core works E2E (scheduling modes, cohort enrollment, CRUD UI, capability authz) | 🟢 done (M1–M4) | — |
| B — Assessment & Certification | Generic assessment engine, completion enforcement, certificates | 🟡 in progress (completion + certificates + feedback + assessment engine v1 + completion reporting + rollups + assessment UI + feedback UI + assessment edit + question-bank backend/UI + manual grading v1 done) | A |
| C — Catalog, Paths & Self-service | Learner catalog, self-enroll, learning paths/prerequisites | 🟢 core done (learner catalog + self-enroll UI + prerequisite gating v1 + prereq selector UI + sequenced learning paths v1 + admin paths UI + learner path-progress view) | A |
| D — Platform & Scale | Production readiness → Google OIDC + Directory sync → manager hierarchy (org model) → mandatory assignment + due dates → notifications/escalation → compliance reporting + recertification. Order locked 2026-06-04 (after C closes). | 🟡 in progress (D1 cron self-monitoring done; **D3 v1 org model done**; **D4 assignment+due-dates v1 done**; **D5 assignment reminders + manager escalation v1 done**; **D6 v1.1 compliance report/export + certificate expiry signal + frontend UI verified/closed**; paid hosting + Sentry-account setup + D2 Google OAuth app = owner ops/inputs) | B, C |
| E — Generic scheduling | Generalize booking beyond fixed English slots (session types, rooms, capacity, waitlists, instructors); keep leader-booking as one mode. Committed parallel track; large, own plan. | 🟢 functionally complete (**E1 done** — backend `ALLOWED_TIME_SLOTS` authoritative + exact-slot grid client (2026-06-09); **E2 capacity done**; **rooms done** via re-center Phase 3; **trainer-assignment UI done** (2026-06-10); **durable cancellation done** (2026-06-11, phase-04 A); **waitlists + FIFO auto-promotion + `/me/sessions` learner UI done** (2026-06-11, phase-04 B); **polish done** (2026-06-11) — staff waitlist panel + trainer-only teacher session-list/calendar visibility. Wave closed, verified 2026-06-12) | A |

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

## Milestones — Wave A (foundation, all shipped)

| ID | Milestone | Acceptance | Status |
|----|-----------|-----------|--------|
| M1 | Enforce all 4 scheduling modes | leader/admin/self-enroll/nomination each have a real flow + tests; no 501 stubs | 🟢 done 4/4 (leader/admin team-booking; self_enroll/nomination Admin-schedule cohort sessions over M2 enrollments) |
| M2 | Cohort-based enrollment | `/api/learning/enrollments` (cohort-based, multi-program) + self-enroll path | 🟢 done (enroll/self-enroll/withdraw/list; bulk + session-roster wiring deferred) |
| M3 | Learning CRUD UI | Create/edit Program, create Cohort, enroll learners (not read-only) | 🟢 done (Programs create/edit/archive; Cohort create; per-cohort enroll/withdraw; Admin-gated; i18n en+vi) |
| M4 | Capability-based authz scaffold | `program.manage`/`session.book` style checks behind `policy/` | 🟢 done (`policy/capabilities.js` + `requireCapability`; learning routes wired; Admin superuser, behavior-preserving) |

> Wave A→E and the per-phase kickoffs that followed (B/C/D sub-milestones,
> 2-tier dashboard, re-center phases) are recorded in the changelog below
> (recent) and [`changelog-archive/2026-q2.md`](changelog-archive/2026-q2.md)
> (full history, verbatim).

---

## Recent progress (changelog)

> **Rolling window:** ~last 2 weeks / ~15 entries kept inline (file ≤ ~400
> lines); older entries roll verbatim, newest-first, to
> [`changelog-archive/2026-q2.md`](changelog-archive/2026-q2.md). Currently
> inline: **2026-06-14 → 2026-06-19**.

- **2026-06-19** — **Converge Phase 4 slice A2a — unified Schedules calendar + cohort-safe edit drawer (#162).**
  Operations Schedules now shows BOTH scheduling worlds: `CalendarPage` passes `SchedulesPage mode="all"`,
  which fetches the combined list and adds the same client-side **Team/Cohort/All** facet (via session
  `deliveryType`). The `ScheduleDrawer` now handles team-less (cohort) sessions on EDIT — it hides the team
  picker (shows a cohort note), drops the team-required constraint, and OMITS `bookedTeamId` from the save
  payload so an empty string never hits the API and the (absent) binding is untouched (this also fixes a
  latent bug where editing a cohort session 400'd). Per owner decision **A2-α**, cell-click CREATE still
  books a TEAM session (the manual-create API requires a team) — cohort sessions are still created from
  Learning → Cohorts; the create paths are NOT merged (that stays Phase 5). Tests: SchedulesPage facet
  (render + filter) + ScheduleDrawer cohort-edit (no picker, payload omits team) + CalendarPage `mode="all"`;
  client suite 405 + lint (cap 41) + build green. Next: retire the English Schedules tab (A2b).

- **2026-06-19** — **Converge Phase 4 slice A1b — retire the redundant English Attendance tab (#161).**
  Now that Operations Attendance is unified (A1, both worlds + facet), the separate English
  Attendance tab duplicated it. Removed the nav item (`nav-config`) + the page tab (`EnglishPage`);
  the Teacher's English section now defaults to Evaluations (its only remaining tab). The e2e
  attendance-marking flow (`attendance-export.spec.js`) now marks a team-world session through the
  unified `/calendar?tab=attendance` — strengthening coverage (proves a Teacher marks a team session
  on the unified surface). English section now hosts only genuinely team-world-specific surfaces:
  Teams, team schedules, the leader booking grid, English rubric Evaluations. Tests: EnglishPage +
  Sidebar updated; client suite 400 + lint (cap 41) + build green.

- **2026-06-19** — **Converge Phase 4 slice A1 — unified Attendance calendar (#160).**
  Operations Attendance now reads BOTH scheduling worlds in one surface: `CalendarPage` passes
  `AttendancePage mode="all"`, which fetches the combined `/attendance-calendar` and adds a
  client-side **Team/Cohort/All** facet driven by each session's `deliveryType` tag (from slice 4b).
  Attendance marking is world-agnostic (keyed by scheduleId), so no create/edit drawer change was
  needed — low risk. Teacher visibility scoping unchanged (server still applies the teacher $or
  scope). The redundant English Attendance tab is the next slice (A1b); the Schedules fold (A2) is
  separate — it needs a cohort-aware create/edit drawer (the current one is team-centric). Tests:
  AttendancePage facet (render + filter) + CalendarPage `mode="all"`; client suite 400 + lint (cap 41) + build green.

- **2026-06-19** — **Converge Phase 3 slice 4b — session `deliveryType` world tag (#159).**
  Every row of `GET /api/schedules` + `GET /api/schedules/attendance-calendar` now carries
  a derived `deliveryType` ('team'|'cohort') — computed in `domains/schedule/queries.classifyDeliveryType`
  from the cohort-mode class set (program-less → 'team'; same rule as the `mode` split), present
  with or without a `mode` filter. Additive read field, mirrors the cohort DTO's `deliveryType`
  (slice 4a); it gives the calendar/attendance grids a per-session world tag so they can be folded
  into ONE faceted surface (next: Phase 4 unified calendar). 3 integration tests added; full server
  suite green (127 suites / 1168 tests). Spec `scheduling-and-booking` updated.

- **2026-06-19** — **Converge Phase 4 slice 2 — retire the redundant English "Classes"
  tab.** Now that Learning → Cohorts lists both worlds (slice 1), the separate English
  "Classes" tab duplicated it. Removed the nav item (`nav-config`) + the page tab
  (`EnglishPage`); Admin's English section now defaults to Teams. Team-world class CRUD
  lives in the unified catalog (search already deep-links classes there). No data/API
  change; Sidebar + EnglishPage tests updated; client suite 398 + lint (cap) + build
  green. Remaining Phase 4: fold English schedules/attendance/evaluations + persona sidebar.

- **2026-06-18** — **Converge Phase 4 — unified Cohorts catalog (the visible fix).**
  Learning → Cohorts is now ONE catalog (`CohortsTab mode="all"`) that lists BOTH
  scheduling worlds — it fetches with no `mode` filter (server returns all) and
  renders a **deliveryType** column (Team / Cohort) + a world filter (All / Team /
  Cohort). Per-row actions gate by `deliveryType`: cohort-enroll/schedule/sessions
  show only on cohort-world rows; team-world rows (English classes) show read/edit.
  This ends the "admin opens Cohorts and sees nothing" confusion — the English/team
  classes now appear here too, labelled, alongside cohort-world runs. Verified live
  (screenshots) + 3 new `CohortsTab` tests; client suite 398 + lint (cap) + build
  green. The English section stays for now (folding it in / persona-journey sidebar
  = remaining Phase 4 work).

- **2026-06-18** — **Converge Phase 3 continues — client SSOT + cohort `deliveryType`
  (slices 2 + 4a).** Slice 2 (#154): client cohort-mode classification consolidated
  into `lib/scheduling-mode.js` (`isCohortMode` / `COHORT_SCHEDULING_MODES`);
  `CohortsTab` drops its local `COHORT_MODES` copy. Slice 4a: `cohortDto` now exposes a
  server-computed `deliveryType` ('team' | 'cohort'; program-less → team) so ONE
  catalog can list both scheduling worlds + facet by type — the data foundation for the
  Phase 4 single-catalog UI that ends the "Cohorts tab looks empty" confusion. Both
  pure/additive (no behaviour regression); unit tests + full server suite + client
  suite/lint green. Slice 3 (`deliveryProfile`) deferred (YAGNI — no consumer yet).

- **2026-06-18** — **Converge Phase 3 started — scheduling-mode classification SSOT
  (slice 1).** Root-cause work for the "two worlds" UX (admin opens Learning →
  Cohorts, sees nothing because data lives in the English/team world). The
  team/cohort `schedulingMode` split was duplicated in 3 server files
  (`scheduling-mode-policy`, `schedule/repository`, `learning/repository`) — the
  last copied it explicitly to dodge a require cycle, with "keep in sync" comments.
  Extracted to a zero-dependency leaf `domains/_shared/scheduling-modes.js` (one
  source of truth); policy + both repos import it (cycle gone). Pure refactor, no
  behaviour change; new parity unit test + full server suite green. Plan:
  `plans/260614-0004-converge-to-one-model/phase-03-generalise-scheduling.md`.
  Next slices: client SSOT → `deliveryProfile` → unify reads behind a delivery-type
  facet (enables the Phase 4 single-catalog UI).

- **2026-06-18** — **Enrollment convergence: team transfer fires the unified
  event (Phase 2).** Closed a seam in the enrollment write-spine convergence: a
  team **transfer** created the new target-team enrollment through the shared
  spine but dropped the `pendingEvents`, so a transferred learner got the legacy
  transfer email but **no `cohort_enrolled` bell** (and automation never fired) —
  while a plain add-member did. Fix: the transfer flow now flushes
  `flushPendingEnrollmentEvents`, but **only when the learner lands in a different
  cohort** (owner decision — a same-cohort team rebalance stays email-only, no
  redundant bell). Touched `controllers/enrollment/enrollment-transfer.js` +
  `domains/groups/controller.js` (facade export). Spec `enrollment` updated
  (2 scenarios + AC); 2 new `enrollmentTransfer` tests (different-cohort bell /
  same-cohort no-bell); enrollment+teams+learning suites green. Still deferred:
  the member-**drop** close-path (a close, not a create — keeps its team email).

- **2026-06-18** — **Booking grid shows earlier-this-week sessions (bugfix).**
  Leader saw 1 session on `/book` yet a 2nd booking 400'd "max 2 this week": the
  availability read (`domains/schedule/queries.getAvailability`) windowed on
  `today`, hiding an earlier-this-week session that the weekly cap still counts
  (the cap spans the whole Mon–Sun ISO week, past days included). Fix: lower
  bound moved `today` → start of current ISO week (reuses `getWeekBounds`), and
  the grid renders a past own-session **read-only** ("counts this week", no
  cancel) so visible == enforced. Owner chose to keep the cap semantics (count
  past), fix the visibility (P2). Spec `scheduling-and-booking` updated; new
  `scheduleQueries` availability lower-bound test + booking/client suites green;
  lint ≤ cap 63.

- **2026-06-17** — **Phase 0 readiness — slice 0.8-user + Phase 0 PAUSED for a
  quality round.** The admin user create/update handlers' Mongoose calls moved
  behind `controllers/user/user-mutations-repository.js` (security logic — bcrypt
  hashing, the BUG #9 re-auth gate, audit — stays in the controller). 31 userRoutes
  tests green. **Per owner direction, Phase 0 is now paused after the low/med-risk
  slices (0.3–0.7 + 0.8-user)** to run a quality-consolidation round (green test
  suites, stabilise the server harness, cut lint warnings, clean `npm audit`,
  smoke-test the core flow) before resuming 0.8-class / 0.9 and the gated Phases 1+.

- **2026-06-17** — **Quality round — golden-path smoke test + measured baseline.**
  Owner-directed consolidation: added `tests/integration/goldenPathFlow.test.js`, a
  single end-to-end happy path through the **real API** for the core L&D loop
  (create program → enrol → schedule cohort session → mark attendance → completion
  met → issue certificate → public verification valid), so a regression anywhere in
  the chain trips one test. **Measured quality baseline (not impression):** server
  **1148/1148** tests green (124 suites), client **393/393** green (0 timeouts),
  **0** skipped/disabled tests, lint **0 errors / 63 warnings (at cap)**, server
  prod `npm audit` clean at the CI bar (high+) with 13 moderate below it, client
  audit **0 vulns**. Those last two gaps were then closed in #143 (lint ratcheted
  **63 → 44**, server prod moderate **13 → 5**); large-file extraction continues.

- **2026-06-17** — **Phase 0 readiness — slice 0.7 (dashboard analytics, no PG
  footprint).** The admin analytics endpoint's data access moved behind
  `controllers/dashboard/dashboard-stats-repository.js` (distinct dropdowns + the 14
  parallel aggregations/finds); the controller keeps filter-building + PHASE-2
  composition. Dropped a dead `attFilter` local. Added the endpoint's **first
  integration test** (`dashboardStats.test.js` — shape, filter echo, ANALYTICS_READ
  403). Pure refactor, behaviour identical. Remaining direct-Mongoose: class/user
  legacy (0.8, Med) + auth/booking (0.9, High — deferred to gate-open).

- **2026-06-17** — **Phase 0 readiness — slices 0.4 + 0.5 (more Mongo-coupling
  extracted, no PG footprint).** Three more legacy data-access leaks moved behind
  repositories (pure refactors, behaviour identical): `lib/branding.js` now reuses
  `domains/branding/repository`; `routes/auditRoutes.js` reads via a new
  `services/audit/audit-query-repository.js`; the HR exports split their Mongoose
  calls into `services/export/{attendance,evaluation}-export-repository.js` (pipeline
  builders + claim-race orchestration kept in the service). 76 audit/branding/export/
  evaluation integration tests green. Remaining direct-Mongoose surface is now the
  Med/High-risk legacy controllers (dashboard/class/user) + auth/booking (deferred).

- **2026-06-17** — **Phase 6 PostgreSQL — Phase 0 readiness kicked off (no PG
  footprint).** Wrote the missing detail plan
  [`phase-00-readiness-hardening.md`](../plans/260612-2042-postgresql-migration/phase-00-readiness-hardening.md):
  audited current Mongo-coupling (all 8 `domains/*` already behind repositories;
  remaining direct-Mongoose surface is legacy controllers/services) + a
  Mongo-feature→Postgres-equivalent map (TTL→`pg_cron`, partial-unique→partial
  index/exclusion, `pre('aggregate')` soft-delete hooks→explicit predicates,
  pipelines→SQL). First low-risk slice executed: **`searchService` Mongoose access
  extracted into `services/search/search-repository.js`** (service keeps only
  role-policy + cache + assembly; public API unchanged) — pure refactor, 16/16
  search integration tests green. High-risk auth/booking ports stay deferred until
  the ADR gate opens.

- **2026-06-17** — **Custom-fields drag-reorder (closes last TMS.update fidelity
  gap).** Studio ▸ Custom fields can now reorder an entity's fields by drag (grip
  handle) or keyboard (↑/↓). New bulk endpoint `PUT /api/custom-fields/reorder`
  (`settings.manage`-gated) — `bulkWrite` over `domains/custom-field`, entity-scoped,
  rejects any `orderedIds` that isn't an exact permutation of the entity's live
  fields (400), one `reordered` audit row. Client: optimistic cache update
  (`useReorderCustomFields`, rollback on error). Tests: +3 server integration
  (reorder persists / non-permutation 400 / non-admin 403), +2 client. The earlier
  fidelity-audit report (`plans/reports/fidelity-audit-260615-1016-…`) was verified
  STALE (Tier 1 + Tier 2 already shipped); this was its only genuinely-open item.

- **2026-06-16** — **Horizon 2 closed out (owner decision).** With A2/A4/A6/B5
  shipped, the owner confirmed the remaining two slices: **B1 (AI layer) is
  PARKED** — no LLM provider/API key yet; build when one is supplied (hard-depends
  on the B2 skills graph, already shipped). **B8 (Slack/Teams) is DROPPED** — the
  org doesn't use Slack or Teams, so it's deferred-by-design, not a gap. Horizon 2
  is therefore **build-complete**: everything buildable + needed is shipped.

- **2026-06-16** — **Modernization Horizon 2 — B5: mobile learning surface.**
  Turns the offline attendance PWA (gap #7) into a learner surface: Web Push +
  a "due today" feed. New `PushSubscription` model (one device registration per
  user, endpoint-unique, disposable) + `services/pushService.js` (`web-push`
  wrapper — **fail-soft**: no-op when VAPID env keys are unset, prunes dead 404/410
  subscriptions) + `domains/mobile` mounted at `/api/me` (self-scoped, no cap):
  `GET /push/vapid-key` (503 if unconfigured), `POST|DELETE /push/subscribe`,
  `GET /mobile-feed` (overdue + due-soon assignments from assignment `listMine` +
  upcoming enrolled sessions + one microlearning nudge, all **composed** from
  existing data — no new content model). **Push rides along** on the in-app
  notification chokepoint (`domains/notification in-app-writer.recordInApp` →
  `pushService.sendToUser`, fire-and-forget) so every bell event also pushes.
  Client: `client/public/sw.js` push + notificationclick handlers; `features/mobile`
  `usePush` (subscribe with the server VAPID key, on-demand SW registration) +
  `TodayPage` (feed + enable/disable push) + learner nav (My Learning ▸ Today) +
  i18n. New `web-push` dep (no high-severity prod vuln). Server **120/1132** green,
  client **391** green, lint 63 (cap), build clean. New spec `mobile-learning`
  (status evolving) + registry row (36); `.env.example` documents `VAPID_*`.
  **Deferred (documented):** push DELIVERY needs the owner to set VAPID env
  (subscribe + feed work without it); offline-queued quiz completion (reuse the
  attendance IndexedDB queue) + deeper content (video/SCORM) → B3. PR #122.

- **2026-06-16** — **Modernization Horizon 2 — A4: training-needs-analysis →
  annual plan.** A demand-intake pipeline: submit training requests → aggregate
  demand → a costed annual plan → scheduled cohorts. New `TrainingRequest` model
  (target program/skill, headcount, priority, `YYYY-Qn` quarter, status machine
  submitted→in-review→approved→planned / rejected) + `TrainingPlan` (one per
  fiscalYear: items{target,quarter,demand,estCostMinor,cohortIds}); both
  soft-delete. New `domains/planning` at `/api/planning`: request CRUD + status
  transitions, demand aggregation (`/demand?by=program|skill|quarter|department`),
  plan upsert, and **schedule item → cohort** (`/plan/:fy/items/:id/schedule`
  creates a `Class` from the program, links the cohort, marks matching approved
  requests `planned`, and **carries the est cost into an A1 `Budget`** — closing
  the TNA→schedule→budget loop). New `training.plan` capability (Admin +
  Coordinator); `TrainingRequest`/`TrainingPlan` added to the AuditLog enum;
  mutations audited. Client: `features/planning` PlanningPage (demand board +
  requests with status actions + annual-plan editor with schedule-to-cohort) +
  `usePlanning` hooks + nav (Configure ▸ Training plan) + i18n. Server **119/1127**
  green, client **391** green, lint 63 (cap), build clean. New spec
  `training-needs-analysis` + registry row (35). **Deferred (documented):**
  manager self-service intake (gated to `training.plan` for now), the A7 approval
  engine (status machine exists; A7 drives it later), skill→cohort scheduling
  (programs only). PR #121.

- **2026-06-16** — **Modernization Horizon 2 — A6: trainer-management depth.**
  A qualification + availability layer over the Teacher/Admin users who deliver
  sessions, so scheduling offers only qualified, free trainers and a trainer is
  never double-booked. New `TrainerProfile` model (1:1 with a User: `canDeliver`
  programs, weekly `availability`, ratings, status active/archived + soft-delete)
  + `domains/trainer` mounted at `/api/trainers`: qualified-and-free listing
  (`?qualifiedFor=&at=&atEnd=&includeCandidates=`), per-trainer load
  (`/:id/load`, sessions + hours), ratings (`/:id/ratings`, aggregate derived).
  **Reuses the existing `session.assign-trainer` capability** (Admin +
  Coordinator) — no new capability; `TrainerProfile` added to the AuditLog enum.
  **Trainer double-booking 409 guard** added at the assign chokepoint
  (`domains/schedule setTrainers` → new `repository.findInstructorConflict`
  overlap query on `sessionInstructorIds` + time range, `status:'scheduled'`
  only) — mirrors the room-lock guarantee without touching the booking
  transaction. Client: `features/trainer` Trainers page (qualification matrix +
  expandable detail: qualifications/availability editors, load, ratings) +
  `useTrainers` hooks + nav (Configure ▸ Trainers) + i18n. Server **118/1122**
  green (no schedule regression), client **391** green, lint 63 (cap), build
  clean. New spec `trainer-management` + registry row (34). **Deferred
  (documented):** picker hard-enforcement of qualification (filters the *offer*,
  admin override allowed — only double-booking is a hard guarantee) + a
  concurrency ledger (app-level overlap check suffices for the admin-driven assign
  path). Follow-up: wire the qualified-and-free filter into the per-session
  AssignTrainersModal picker. PR #120.

- **2026-06-16** — **Modernization Horizon 2 — A2: vendor & external-provider
  management.** First Horizon-2 slice. A managed catalog of external providers
  replacing the free-text `Schedule.externalTrainer` name: contacts, delivered
  programs, contracts with a derived renewal signal (none/ok/due-soon/expired,
  60-day window), post-engagement ratings (aggregate score derived), and
  per-vendor spend rolled up from the A1 cost ledger (`CostEntry.scope.vendorId`).
  New `Vendor` model (`status` active/archived + soft-delete = two independent
  lifecycle axes) + `domains/vendor` (repository/schemas/use-cases/controller/
  routes/dto) mounted at `/api/vendors`; `vendor.manage` capability (Admin +
  Coordinator, read+write — management-sensitive, not `report.read`); `Vendor`
  added to the AuditLog enum; additive `Schedule.vendorId` link + a backfill
  script (`backfill-vendors-from-external-trainers.js`) migrating legacy
  external-trainer names into individual vendors; the finance `by=vendor` cost
  roll-up now labels real vendor names (was an id-slice placeholder). Client:
  `features/vendor` Vendors catalog page (filters + expandable detail: contracts/
  ratings/spend) + `useVendors` hooks + nav (Configure ▸ Vendors) + `manage:vendor`
  perm + i18n. Server **117/1115** green, client **391** green, lint 63 (cap),
  build clean. New spec `vendor-management` + registry row (33). **Deferred
  (documented):** the booking-picker that SETS `vendorId` (kept off the booking
  transaction chokepoint — backfill links legacy sessions) + a renewal cron/email
  (surfaced on read, no confirmed cadence). Follow-up: A6 consumes `delivers` for
  trainer qualification. PR #119.

- **2026-06-16** — **Modernization Horizon 1 — A5 part 2: evidence pack + report
  presets.** Audit-ready downloadable evidence pack + saved report configs over
  the reporting the system already captures. New `ReportPreset` model (`name`, `kind`
  hours|compliance|evidence, `filters`, `schedule` none|monthly|quarterly,
  soft-delete) + CRUD `GET/POST/PUT/DELETE /api/learning/reports/presets`
  (`report.read`; mutations audited `entity:'ReportPreset'`). `GET
  /api/learning/reports/evidence-pack?from=&to=&departmentId=` streams ONE
  timestamped multi-sheet **.xlsx** (Summary cover + Training Hours + Compliance,
  reusing the existing training-hours + compliance use-cases), audited
  `entity:'Report'`, row-capped (413), `report.read`-gated. Client: **Download
  evidence pack** button + saved-preset apply/save/delete on the Reports ▸ Hours
  tab. Tests +4 (evidence-pack xlsx + audit, preset CRUD + audit, authz read/write,
  empty-name 400). Server **116/1109** green, client **391** green, lint 63 (cap),
  build clean. Spec `reporting-and-rollups` extended (evidence pack + presets);
  `ReportPreset` added to the AuditLog enum. **Deferred (documented):** PDF + zip
  (no PDF dep in-repo — xlsx is audit-ready) and cron auto-run of scheduled presets
  (the `schedule` field persists for a future cron; presets flagged
  no-confirmed-HR-need). This closes all **buildable** Horizon-1 slices; only the
  Directory-sync-gated A8 remains.

- **2026-06-16** — **Modernization Horizon 1 — B2: skills-as-spine.** Promoted the
  derived-skill engine (gap #4) from a badge to a recommendation spine. Added
  `Skill.parentId` (taxonomy hierarchy) + `GET /api/skills/taxonomy` (skills
  grouped by category, nested by parent; orphan parents promoted to roots;
  self-parenting rejected 400), and a **gap-driven recommendations** engine:
  `GET /api/skills/learner/:userId/recommendations` (self-or-manage) ranks the
  **active** programs a learner hasn't completed by how many gapped role-skills
  they advance (deterministic — `gapClosed` desc, ties on remaining gap then name;
  archived/inactive programs never recommended). Pure `recommendPrograms` in
  `domains/skill/proficiency.js`; reuses the existing derived proficiency + role
  gap (no stored proficiency, no parallel `RoleProfile`/`skillsGranted` — the
  existing `targetByRole`/`programIds` already supersede the handoff sketch).
  Client: **Recommended-for-you** card on the Learner 360 Skills tab (hidden when
  no gaps) + a **parent-skill picker** in the Studio skill form. Tests +6 (3 unit
  ranking/exclusion/no-gap, 3 integration taxonomy/recommendations/self-scope).
  Server **115/1105** green, client **391** green, lint 63 (cap), build clean. New
  spec `skills-competency` (the skills capability was previously unspecced) +
  registry row (32). Follow-up: B1 AI layer re-ranks on top of this contract.

- **2026-06-16** — **Modernization Horizon 1 — A1: budget & cost management.**
  Record actual training costs + per-fiscal-year budgets, roll up spend by any
  scope dimension, and see budget-vs-actual variance. New `CostEntry`
  (`scope {programId/cohortId/sessionId/departmentId/vendorId}`, type, minor-unit
  `amountMinor`, `incurredOn`, `poRef`, soft-delete) + `Budget` (fiscalYear,
  dept?/program?, minor-unit allowance) models + `domains/finance`
  (repository/use-cases/schemas/controller/routes): `GET/POST/PUT/DELETE
  /api/finance/costs` + `/budgets`, `GET /api/finance/costs/rollup?by=program|
  department|cohort|vendor|type`, `GET /api/finance/budgets/variance?fiscalYear=`
  (over-budget flagged; cross-year costs excluded). Roll-up/variance/cost-per-
  completion are **derived**, never stored. **Single tenant currency enforced**
  on every write (executive cost-config → env → USD); money is integer minor
  units. New `budget.manage` cap (Admin + Coordinator) gates **both read and
  write** (budget figures are management-sensitive — deliberately not `report.read`);
  mutations audited (`entity:'CostEntry'`/`'Budget'`). Executive ROI financials
  now also carry **trailing-12-month actual spend** + `costPerCompletionActualMinor`
  next to the budgeted estimate. Client: **Budget dashboard** (`/budget`,
  Admin/Coordinator) — FY selector, variance table (over-budget badge), cost
  roll-up (group-by), log-cost + new-budget forms — wired into Configure nav.
  Tests +6 (CRUD+audit, currency enforcement, roll-up by program/type, variance
  over-budget, executive actuals, authz). Server **115/1099** green, client **391**
  green, lint 63 (cap), build clean. New spec `budget-and-cost` + registry row
  (31); `reporting-and-rollups` noted (executive actuals). Follow-up: A2 Vendor
  (Horizon 2) fills `scope.vendorId`.

- **2026-06-16** — **Modernization Horizon 1 — A3: role-based compliance
  matrix.** Define "this role / department / office (or everyone) must complete
  this program within N days, repeating on a cadence" and see a **derived** live
  matrix. New `RequiredTraining` model + `domains/compliance` (repository +
  pure-function `derivation.js` + use-cases): `GET/POST/PUT/DELETE
  /api/compliance/requirements` (read `report.read`, manage `compliance.manage`),
  `GET /api/compliance/matrix` (compliant/total/% + overdue per rule, drill to
  non-compliant), `GET /api/compliance/user/:id`. Compliance is DERIVED, never
  stored: done = Issued `Certificate` for the target program (path = all steps);
  overdue from `dueWithinDays` anchored at `max(user.createdAt, rule.createdAt)`
  (no hire-date field); recurrence (once/annual/biennial) re-opens on cadence. New
  `compliance.manage` cap (Admin + Coordinator); mutations audited
  (`entity:'RequiredTraining'`) + publish `requirement.changed` (for A8). Client:
  **Compliance matrix** page (`/compliance`, Admin/Coordinator) — heat-% rows,
  per-rule drill-down, create/archive rule — wired into the Configure nav. Tests
  +6 (matrix rollup, per-user compliant/pending, overdue, authz read/manage,
  validation). Server **114/1093** green, client **391** green, lint 63 (cap),
  build clean. New spec `required-training-compliance` + registry row. Follow-up:
  A8 auto-assign subscribes to `requirement.changed`.
- **2026-06-16** — **Modernization Horizon 1 — A5 (part 1): training-hours
  report.** First Horizon-1 initiative. Audit-ready training hours per employee /
  department for labour-law minimums, derived (no new model) from attended
  (`P`/`L`) sessions × `Schedule` duration. New
  `domains/learning/reports/training-hours-use-case.js` + repository helpers;
  `GET /api/learning/reports/training-hours?from=&to=&groupBy=user|department&departmentId=`
  (`report.read`; default last 90d; invalid date → 400; 0-hours employees shown so
  gaps surface). Client: **Reports ▸ Training hours** tab (group-by toggle, date
  window, per-user + per-department tables, KPI totals) + nav entry. Tests +5
  (per-user hours, department rollup, report.read allow/deny, invalid-date 400).
  Server **113/1087** green, client **391** green, lint 63 (cap), build clean.
  Spec `reporting-and-rollups` updated (BR-7 + FR + AC). The A5 compliance report
  already existed (D6); follow-up: evidence-pack (PDF+xlsx) + scheduled presets.
- **2026-06-16** — **TMS.update Build Plan #5: Studio ▸ Scheduling (session
  types + room utilization) — new infra.** New `SessionType` model
  (name/colour/defaultDurationMin/defaultCapacity/order, soft-delete) + a
  `domains/session-type` module — `GET /api/session-types` (`session.book`) +
  create/edit/archive (`room.manage`, audited). `Schedule.sessionTypeId` added
  (additive, **metadata only** — no booking/slot/room/conflict path reads it; the
  slot window + `{roomId,startTime}` lock stay the source of truth). Room
  utilization: `GET /api/rooms/utilization?range=&officeId=` (`room.read`) derives
  booked-vs-available hours per room + per office from roomed scheduled sessions
  (available = configured `ALLOWED_TIME_SLOTS` hours/day × range) — no new store.
  Client: **Studio ▸ Scheduling** page (`/scheduling`, Admin) — session-type CRUD
  + utilization table with range filter — wired into the Configure nav. Tests +9
  (CRUD/order/authz read-vs-manage, validation, archive+audit, utilization
  compute, room.read gate). Server **109/1055** green, client **389** green, lint
  63 (cap), build clean. New spec `studio-scheduling` + registry row. Follow-up
  (out of scope, noted): thread `sessionTypeId` prefill through the booking form.
  **All 4 Investment Build Plan deep features now shipped (#1, #3a, #4, #5).**
- **2026-06-15** — **TMS.update Build Plan #1: real analytics time-series
  (`MetricSnapshot`) + funnel (new infra).** No more trends recomputed/faked at
  read time — a durable daily rollup now stores real history. New
  `MetricSnapshot` model (one row per `{scope (global|program), scopeId, key,
  UTC day}`, ~400d TTL), `jobs/snapshotJob.js` nightly cron (registered +
  cron-monitored), `services/metricSnapshotService.js` (compute/write/backfill),
  `services/analyticsSeriesService.js` (series + live enroll→complete→certify
  funnel + per-program), and `routes/analyticsRoutes.js` →
  `GET /api/analytics/{series,funnel,program/:id}` (analytics.read + cached).
  Empty history returns `collecting:true` so the UI shows "collecting data",
  never a fake line. Backfill script seeds derivable global cumulative history.
  Client: `analyticsAPI` + `useProgramAnalytics`; Program **Analytics tab** now
  shows server-computed conversion % + the stored active-enrollments trend (or
  the collecting state). Tests +12 (snapshot rollup/idempotency, series, funnel,
  program, empty-state, authz, + program-detail). Server **109/1057** green,
  client **389** green, lint 63 (cap), build clean. Spec `dashboard-analytics`
  updated (BR-4 + FR + AC). (Op note: ran low on disk mid-run — cleared ~3GB of
  orphaned `mongo-mem-*` temp dirs to let the in-memory Mongo suites pass.)
- **2026-06-15** — **TMS.update Build Plan #4: reconcile auto-heal + integrity
  dashboard.** The 12 read-only checks gain a safe, opt-in repair path. New
  `services/reconcile/healers.js` heals exactly four deterministic, reversible,
  audited checks — `orphan_room_booking` (delete the dangling RoomBooking ledger
  row), `stale_waitlist_entry` (dissolve a `waiting` row to `cancelled`),
  `soft_deleted_in_team_members` (`$pull` the soft-deleted id), `counter_drift`
  (bump `Counter.seq` to max-in-use). The server re-derives the affected check
  (never trusts client row state), heals each current issue, audits it
  (`entity:'Reconcile'`), then re-derives the remaining count. New
  `POST /api/admin/reconcile/heal { check, refs? }` (system.ops + rate-limited;
  non-safe check → 422 with the safe list) + `GET /api/admin/reconcile/trend`
  (drift line, oldest→newest). Reconcile page: by-severity KPI strip,
  "Auto-healable" hints, and a per-check **Auto-heal** action that re-runs
  reconciliation after fixing. Tests +12 (4 healers, no-op, 422, route 422/403,
  trend ordering, + 2 client). Server **109/1055** green, client **391** green,
  lint 63 (cap), build clean. Spec `reconcile-job` updated (BR-5 + FR + AC; the
  read-only sweep stays read-only — only `/heal` mutates).
- **2026-06-15** — **TMS.update Build Plan #3a: tamper-evident audit hash chain
  (new infra).** `AuditLog` gains `seq`/`prevHash`/`hash`; `auditService.record`
  now **serializes** writes through an in-process append queue so each row links
  to the prior by sha256 (genesis-seeded; deterministic key order), with a
  partial-unique `seq` index as the final guard against a forked chain. New
  `services/audit-chain.js` (hashing + `verifyChain`) + `POST /api/admin/audit/verify`
  (AUDIT_READ) re-derives a bounded window → `ok` or `firstBrokenSeq`. Window
  verify reconciles with the TTL — seq = createdAt = expiry order, so only the
  oldest prefix truncates and expired rows never false-positive; a gap after the
  window's first row is a deletion (`missing-rows`), a field edit is
  `hash-mismatch`. System ▸ Audit Log UI gains a **Verify chain** action +
  tamper-evident state (`aria-live`); backfill script
  `backfill-audit-hash-chain.js` chains legacy rows (run at deploy). Makes the
  previously-aspirational "tamper-evident" label **true** (was flagged untruthful
  in the fidelity audit). Tests +7 (chain/verify/tamper/deletion/auth); full
  server suite **109/1053** green, client **389** green, lint 63 (cap), build
  clean. Spec `audit-log` updated (BR-6 + FR + AC; moved out of "deferred").
- **2026-06-15** — **Converge Phase 2: enrollment create-write spine + uniform
  event (behaviour-parity change).** Both enrollment modes now create their Active
  row through ONE write spine (`domains/learning/enrollment/writes.createActiveEnrollment`
  → `repository.insertActiveEnrollment`) — team membership-sync no longer has its
  own `Enrollment.create`. Team enrollment now publishes `ENROLLMENT_CREATED`
  (post-commit, only when the team has a cohort) so the `cohort_enrolled` in-app
  bell + enrollment automation react uniformly for both modes — closing the named
  Phase-2 follow-up (previously only direct cohort enroll emitted). Parity tests
  added (`teams.test.js`: cohort-bound team add → bell; program-less team → none).
  Spec `enrollment` + converge plan phase-02 + domain-model rule updated. Full
  server suite 108/1046 green. Still deferred: folding the team transfer/drop
  close-paths onto the spine.
- **2026-06-15** — **Repository-layer consolidation for the 3 leaky domains
  (Phase 1 architectural; no behaviour change).** `schedule`, `attendance` and
  `groups` each had Mongoose calls scattered across controller / policy / helper
  files (attendance + groups had no `repository.js` at all). Every collection
  touch now lives behind the domain's `repository.js`: **schedule** pulled 18
  model calls out of 8 files into its existing repo; **attendance** gained a repo
  (controller/marking/scope reads+writes + the by-employee/team/class/personal
  analytics pipelines — analytics keeps scope resolution + JS rollups); **groups**
  gained a repo (list/detail reads, 1-team-per-class/member guards,
  create/update/soft-delete/restore writes, in-tx enrollment sync). Behaviour
  preserved 1:1 — same filters/projections/populate/lean, transaction-session
  passthrough, raw `Team.collection` soft-delete writes, and `.save()` hook
  semantics. `mongoose` stays only for `startSession` (orchestration) + in-repo
  ObjectId coercion. Pure refactor → no spec change. Full server suite green
  (108 suites / 1044 tests).
- **2026-06-15** — **Dashboard/Reports re-skin → prototype control-room fidelity
  (in-stack, no behaviour change).** Operational dashboard now leads with a
  4-KPI headline (completion · overdue · attendance · certs-expiring, with
  drill-through on overdue/expiring), a segmented period control (`.seg`)
  replacing the window dropdown, and completion-by-program bars beside the
  overall-completion ring + an On-track/Watch/At-risk legend. Executive trend
  promoted to a filled `AreaTrend` hero (headline value + the prototype's wider
  1.6/1 trend·Kirkpatrick split; certificate validity + mobility get their own
  row). Pure presentational — same bundle data, same window param, same
  drill-through → no spec change. **Detail pages:** cohort Overview tab swapped
  from 3 redundant header-duplicate tiles to a progress donut (complete /
  in-progress / at-risk) + completion-by-department bars (derived from the
  loaded roster, no new fetch); program + executive completion trends unified on
  the new filled `AreaTrend` hero. Cohort roster (multi-select · bulk
  Issue/Nudge · sortable · at-risk/dept filters · 360° drawer) was already
  faithful — left as-is. **Learner 360:** activity tab restyled into the
  prototype's connected timeline (tone-coloured marker per event + vertical
  rail + category badge; same real certs+enrolments feed). Learner catalog
  (category chips + search + enrol cards) was already faithful — left as-is.
  Gates: 389 client tests · lint 63 (cap) · build clean. Commits `d18c042`,
  `5759f94`, `5308372`, `f2c387a`, `f06ac34` (branch `feat/tms-update-automation-engine`).
- **2026-06-15** — **TMS.update fidelity push — full 30-screen audit + Tier 1&2
  to pixel-faithful (13 commits, branch `feat/tms-update-automation-engine`).**
  Audited every prototype screen ([report](plans/reports/fidelity-audit-260615-1016-tms-update-screens.md));
  closed all real deltas honestly (real data only — no fabricated metrics/inert
  UI). **Tier 1 (presentational):** roles Compare + sensitive-cap shield icons ·
  command palette (people/programs/depts) · catalog + audit entity-chips ·
  Programs card-grid w/ real completion health · reconciliation 3-KPI header ·
  session roster Find. **Tier 2 (real backend):** Home onboarding checklist +
  at-a-glance (`GET /dashboard/setup`, 6 real config signals + week counts) ·
  Department-performance table + cards + time-range (new per-dept aggregation:
  headcount/completion/coverage/overdue — serves Overview **and** Departments) ·
  Program completion-trend sparkline (`/programs/:id/completion-trend`,
  certs/month) · **custom fields across all 4 entities** (Program/User/Cohort/
  Session — each value round-trips on its real form, no inert tabs) · **session
  details** (`Schedule.topic/agenda/materials/customFields` metadata + admin
  edit + Agenda/Materials display). Declined as untruthful: audit "hash-chained"
  claim, tri-state roles (binary model), any mock sparkline. Specs folded:
  reporting-and-rollups (setup + dept-perf + completion-trend), attendance
  (PWA offline), scheduling-and-booking (session details), assessments, search.
  Gates per commit: server suites green, client **389 ✓**, lint **63 (cap)**,
  build clean.
- **2026-06-15** — **TMS.update gap #7 — PWA offline attendance (LAST gap; all 7
  now shipped).** Installable PWA for marking attendance with weak/no signal.
  **Client-only** — the server `bulkMark` already upserts per `{scheduleId,
  userId}` (last-write-wins) + audits, so no backend change. New
  `features/attendance/`: `MobileAttendancePage` (today's sessions → big-tap
  present/absent roster + "Mark rest present"), an IndexedDB queue
  (`attendance-offline-db` keyed by (schedule,user) → last-write-wins locally),
  a hand-rolled service worker (`public/sw.js`: app-shell + roster GET caching,
  network-only for other `/api`, **Background Sync** `flush-attendance`) +
  `manifest.webmanifest`, and `useOfflineAttendance` (online/offline tracking,
  queue flush via the CSRF-safe axios client on reconnect / SW message /
  `online` event). SW registered prod-only (main.jsx). New Admin/Teacher route
  `/mobile-attendance` + Operations nav "Mobile (PWA)". Spec: attendance
  (offline-marking requirement). Gates: client **381 ✓** (+8: offline-utils +
  page), lint 63 (cap), build clean (sw.js + manifest emitted).
- **2026-06-15** — **TMS.update fidelity batch (4 vertical slices) — close the
  visible deltas vs the design screenshots (branch
  `feat/tms-update-automation-engine`).** **C · Roles Compare/diff** (screenshot
  14): `RolesAccessPage` gains a Matrix/Compare toggle + a read-only
  `RoleCompareView` (Role A→B selectors, "N differences" badge, →/= per
  capability) over the existing grants — FE-only, no authz change. **E · Command
  palette** (people/programs/departments): `searchService` now also returns
  `LearningProgram` + `Department` matches **for Admin/Teacher** (staff-only;
  Participants unchanged); `SearchPalette` renders the two new groups (programs
  deep-link to `/learning/programs/:id`, departments to People▸Departments).
  **B · Assessment exam-settings** (screenshots 21–22): `Assessment` gains
  `timeLimitMinutes`/`shuffleQuestions`/`showAnswersAfter`; the builder exposes an
  Exam-settings panel + **Preview as learner**; the runner enforces a countdown
  (auto-submit at 0), per-attempt shuffle (display-only — grading stays by
  `itemId`), and post-submit right/wrong reveal (never the answer key).
  **D · Cost/ROI Settings page** (screenshot 27): new Admin `/cost-roi` Configure
  page reusing the existing cost-config form + a server-computed "Computed
  outputs" card (no client math; §10 values). Gates: **server 1035 ✓** (+3 search,
  +2 assessment), **client 373 ✓** (+11), lint 63 (cap), build clean. Specs
  folded: assessments (exam settings) + search (programs/departments). Remaining
  TMS.update gap: **#7 PWA offline attendance**.
- **2026-06-15** — **TMS.update Phase 5 — skills/competency framework (gap #4)
  + branding/template designer (gap #5).** **Skills:** new `Skill` model
  (`programIds[]` program→skill mapping + `targetByRole` + `maxLevel`/
  `coverageTarget`) + `domains/skill/` (CRUD over `/api/skills`, audited +
  soft-delete) gated by `skill.read` (all roles; learner read is self-scoped in
  the controller) / Admin-only `skill.manage`. Proficiency is **DERIVED** from
  issued certificates (level = # of completed contributing programs, capped at
  `maxLevel`) — nothing stored, always re-computable. Endpoints: list + workforce
  holders, `/role-profiles` (per-role required skills + coverage %),
  `/learner/:userId` (proficiency + role gap). The **Learner-360 Skills tab +
  role-readiness card + Skills KPI become real** (were Phase-5 stubs); new Studio
  **Skills page** (`/skills`, Admin, Configure). **Branding:** new singleton
  `TenantConfig` (org name, accent, logo, cert title, email sign-off) +
  `domains/branding/` (`/api/branding`, Admin `branding.manage`, audited) + a
  cached `lib/branding` accessor feeding the **email pipeline** (subjects +
  sign-off now branded; default 'TMS' → byte-identical for an unconfigured
  tenant) and the **certificate verification** response (carries org/title/
  accent/logo). New Studio **Branding page** (`/branding`, Admin) with a live
  certificate preview. *Deferred (v1):* proficiency counts only certified
  completions (uncertified-completion signal) + job-role (vs system-role)
  profiles. Gates: server **1030 ✓** (+10 skill, +5 branding), client **362 ✓**
  (+SkillsPage/BrandingPage/LearnerProfile skills), lint 63 (cap), build clean.
  capability-authz spec + route-matrix updated. Branch
  `feat/tms-update-automation-engine`.
- **2026-06-15** — **TMS.update Phase 4 — automation engine (gap #3).** No-code
  when→if→then rules on the event bus. New `AutomationRule` model + `automation.manage`
  capability + `domains/automation/` (CRUD over `/api/automation/rules`, audited) + a
  **runner** subscribed to the catalogued events: enabled matching rules run their actions
  (`notify` via a new `automation_notice` in-app type / `log`), `runCount++`. **Opt-in**
  (rules default disabled) + fail-soft → zero behaviour change until enabled, no double-firing
  with the existing hardcoded paths. §9 flows seeded **disabled** (the cron-driven ones
  documented, inert until their events publish). Studio **Automation page** (`/automation`,
  Admin, in Configure). Gates: server automation 10 ✓ + full suite green; client 354 ✓; lint
  63; build clean. *Deferred:* publishing the cron-flow events + richer action types.
  Branch `feat/tms-update-automation-engine`.
- **2026-06-15** — **TMS.update Phase 3 — editable roles + custom roles (gap #2).**
  The coarse-authz matrix moves from a static role→capability map to **DB-backed,
  editable grants** without losing the sync `roleHasCapability` (it now reads a live
  in-memory store seeded from the static map + loaded from a new `Role` collection at
  boot — behaviour-preserving until edited). **Admin is lockout-proof** (grants
  immutable). New `role.manage` capability + `domains/access/` (CRUD over
  `/access/roles`, audited, refreshes the live store on every write; legacy read-only
  `routes/accessRoutes.js` retired). `RolesAccessPage` is now **editable** (toggle +
  Save) with **custom roles** (create/delete; Admin column locked). Two-layer authz
  intact. *Deferred:* assigning a user to a custom role (User.role enum). Gates: server
  access suites 32 ✓ + full suite green; client 349 ✓; lint 63; build clean.
  capability-authz spec folded. Branch `feat/tms-update-editable-roles`.
- **2026-06-15** — **TMS.update Phase 2 — custom-field type coverage (gap #6).**
  `CustomFieldDefinition` types `text/select` → **text · number · select · multiselect ·
  date · toggle · user** + a `showIn[]` surface list (form/filter/export). Shared
  `custom-field-input` renderer covers all 7, so the Program builder + cohort forms
  gain them automatically (DRY). Manager UI: 7-type dropdown + showIn toggles. (Program
  Builder UI — gap #1 — already existed as the 5-step `ProgramFormModal`, so Phase 2 =
  gap #6.) Gates: client 347 ✓ · server 995 ✓ · lint 63 · build clean. PR #102 (stacked
  on #101). Branch `feat/tms-update-custom-field-types`.
- **2026-06-15** — **TMS.update value layer — Phase 1 (8 vertical slices).**
  Implemented the north-star redesign's "turn captured data into action + insight"
  layer onto the existing models (branch `feat/tms-update-value-layer`). **S1** drill
  list (`/reports/drill`, Admin) behind the operational KPIs (overdue/expiring/expired
  → filtered learners via the existing compliance report); `StatTile` click-through.
  **S2** executive ROI polish — narrative banner + 4 §10 hero tiles with
  "how it's calculated" tooltips + the **efficiency dividend** (new cost-config
  `coordinatorCount`/`automationHoursReclaimedPerWeek` → `efficiencyDividendMinor =
  hours/wk × coordinators × 52 × hourlyCost`, null until configured). **S3** Program
  detail (`/learning/programs/:id`), **S4** Cohort detail + **roster bulk ops**
  (multi-select · sort · at-risk filter · Issue-cert + **Nudge** + 360 drawer) with a
  new `POST /learning/cohorts/:id/nudge` (`enrollment.manage`, audited, idempotent
  in-app `coordinator_nudge`), **S5** Session detail (one-submit 4-state attendance →
  re-evaluates completion), **S6** admin Learner 360° (`/people/:userId`). **S7**
  Notification center (`/notifications`) + per-category **delivery preferences**
  (`User.notificationPreferences` + `GET/PUT /notifications/preferences`,
  self-scoped, audited). **S8** wired Home alerts → drill + fixed `AlertBand`'s stale
  legacy routes. Composes existing endpoints except the 2 small new write paths
  above (cert-issue already existed → reused). Gates: client 344 ✓, server
  learning/notification suites ✓ (incl. +4 nudge, +3 prefs, +1 efficiency), lint 63
  (cap), build clean. Spec: reporting-and-rollups folded (efficiency dividend +
  cost-config inputs); the nudge + notification-preference write paths are new
  and tracked here (no dedicated notifications capability spec exists yet — same
  as the in-app bell precedent).
- **2026-06-14** — **Studio ▸ Custom fields (Program, complete loop).** The
  design's #1 customization differentiator — admins define extra fields **without
  code**. New `CustomFieldDefinition` model + `domains/custom-field/` CRUD
  (`/api/custom-fields`, Admin-only `settings.manage`, soft-delete, audited;
  text/select types, select-needs-options enforced). **Closes the loop for
  Program:** `LearningProgram.customFields` stores values; the **Program builder**
  renders the org's defined fields (Basics step) and persists them; a defined
  field flows define → builder → save → read. New **Configure ▸ Custom fields**
  page (manage + live preview). Reusable `CustomFieldInput` (no cross-feature
  cycle). Tests: BE (def CRUD · select-400 · teacher-403 · Program value
  round-trip) + FE (page render/loading/error). Route-matrix updated. Gates:
  server learning+custom-field suites 131 ✓, full client 319 ✓, build clean,
  lint ≤ cap. Phase 1 = Program + text/select; more entities/types are the
  extension points.
- **2026-06-14** — **Studio ▸ Roles & access (capability matrix viewer).** First
  enterprise "Configure" surface from the Claude Design hand-off, wired to the
  REAL authz: new **read-only** `GET /api/access/capability-matrix` (Admin-only,
  `settings.manage`) serialises the live `policy/capabilities.js` matrix
  (`roles` · `capabilities` · `grants`). New **Configure** sidebar group +
  `/access` page renders it (roles × capabilities grouped by resource, ✓/— per
  role, Admin = superuser). **Reflects enforcement, does not change it** —
  capabilities stay role-derived (no per-user grants), so it's read-only by
  design (no fake editability). Backend test (admin matrix · teacher 403 · 401);
  page test (matrix render · loading · error). Spec + route-matrix updated. Gates:
  server access suite ✓, full client 316 ✓, build clean, lint ≤ cap.
- **2026-06-14** — **North-star Home, phase 3 (Today's sessions card).** Rebuilt
  the Home `TodayHero` from a compact status band into the prototype's **"Today's
  sessions" list card** — per-session time · class · room · attendance-status
  badge + accent bar, capped at 6 rows with a "+N more", and an "Open calendar"
  link. Real data (attendance calendar, filtered to today); returns null when the
  day is empty. Also restyled the dashboard **Overdue / Expiring** drill lists
  (`DashboardTopLists`) into avatar rows with **"Nd late" / "Nd left"** badges
  (days derived from real due/expiry dates; tone escalates). Presentational;
  `TodayHero` is stubbed in `DashboardPage` tests so none change. Gates: full
  client 313 ✓, build clean, lint 63 ≤ cap.
- **2026-06-14** — **North-star dashboards, phase 2 (Reports ▸ L&D).** Restyled the
  operational + executive dashboards to the prototype's KPI vocabulary by
  upgrading the two **shared** primitives in `DashboardWidgets`: `StatTile` now
  carries a tone-coloured **icon chip** + large tabular value; `MetricBars` fills
  are **threshold-coloured** (success/primary/warning/danger by real %). Wired
  icons/tones through `DashboardOperationalPanel` + `DashboardExecutivePanel`
  (both consume the shared tiles, so both upgrade DRY). Also added the prototype's
  **Overall-completion donut** to the operational dashboard (reuses the existing
  `DonutStat`; segments = real Completed / In-progress / Overdue, zero slices
  dropped). Presentational only — same real-data bundle, props backward-compatible
  (`alert` still reddens). `DashboardTab` test updated (the completion % now shows
  in both the tile and the donut centre). Gates: full client 313 ✓, build clean,
  lint 63 ≤ cap. Next: Home "Today's sessions" card + at-a-glance (phase 3).
- **2026-06-14** — **North-star shell redesign, phase 1 (Claude Design hand-off).**
  Reworked the app shell to the design's topology: **fixed full-height left
  sidebar** (gradient brand mark · **persona-switch card** · role-filtered grouped
  nav with active left-accent bar · signed-in footer) + a **slim sticky topbar**
  that now leads with a **workspace › page breadcrumb** (search · notifications ·
  theme · avatar on the right). Persona switching moved from the avatar dropdown
  into the sidebar card; brand/logo moved topbar → sidebar. **Chrome-only** — nav
  data (`nav-config`), routes, authz and persona semantics unchanged (persona is
  not an authz boundary), so no spec delta. New: `SidebarBrand`/`PersonaSwitch`/
  `SidebarFooter` + `activeItemLabelKey` breadcrumb helper; `Layout`/`Topbar`/
  `Sidebar`/`MobileSidebar` restyled. Topbar test updated (logo → breadcrumb).
  Added a recessed `--background-2` surface token (dark + light) so the sidebar
  reads **darker than content** (the prototype's signature) + a subtle lift on
  Home quick-action tiles. Gates: full client 313 ✓, build clean, lint 63 ≤ cap.
  Next: Home cards + dashboards to north-star fidelity (phase 2/3).
- **2026-06-14** — **Program / Delivery Builder (Claude Design north-star → real
  UI).** Reworked the program create/edit modal (`ProgramFormModal`) into the
  design hand-off's guided **5-step builder** (Basics → Delivery → Completion →
  Certificate → Review) + sticky **live preview**; `schedulingMode` now a
  friendly delivery-profile picker. **Pure UX upgrade** — identical API payload +
  mutations, no model/behavior change (every field already enforced server-side),
  so no spec delta. Modularized under `features/learning/program-builder/`
  (`program-form-config` + `ProgramBuilderControls`/`Steps`/`ProgramLivePreview`).
  Builder test rewritten to drive the wizard (same payload assertions). Gates:
  learning suite 82 ✓, full client 313 ✓, build clean, lint 63 ≤ cap.
- **2026-06-14** — **Converge Phase 2: Enrollment convergence (read layer) — one
  Enrollment, two modes.** Both enrollment shapes already share ONE `Enrollment`
  model (team-based = `teamId` set; cohort-based = `teamId:null`); Phase 2
  converges them at the **read layer** WITHOUT a model merge or data move. New
  unified self read **`GET /api/learning/enrollments/mine`** (`enrollment.self`/
  `enrollment.read`, self-scoped) returns the caller's enrollments across BOTH
  modes in one shape, each tagged `mode: 'group'` (joined via a team) or
  `mode: 'direct'` (enrolled straight in) — `domains/learning/enrollment` gained
  `listEnrollmentsForLearner` + `getMyEnrollments` + `myEnrollmentDto` + the
  controller/route. The learner **"My programs"** list (`MyProgramsPage`) now
  consumes it (was cohort-only), so a **team-booked learner finally sees their
  cohort there** (card falls back to the enrollment's `cohortName` when the cohort
  isn't in the open catalog). Additive — existing flows unchanged. Tests: +6 server
  integration (`myEnrollments`: empty / group / direct / both / self-scope / auth)
  + MyProgramsPage test updated to assert both modes — **server 978/100, client
  313**, lint 63, build clean. Spec `enrollment` + domain-model rule updated. The
  two **write** paths (team membership sync vs cohort enroll) + routing team
  enrollment through the event bus stay a follow-up. ADR
  `converge-to-one-training-model`. Next: Phase 3 — generalise Scheduling.
- **2026-06-14** — **Converge Phase 1: Assessment convergence (Evaluation →
  Assessment) — one concept, two modes.** Cleared the "dual assessment systems"
  deferral WITHOUT a destructive model merge: Assessment is now the single concept
  with two *modes* — learner-attempted **quiz** + instructor-scored **evaluation**
  (the English 4-skill rubric). New unified read **`GET
  /api/assessment/results/mine`** (`assessment.read`, self-scoped) returns the
  caller's results across BOTH modes in one shape (`{source, title, scorePercent,
  passed, date}`, newest-first) — `domains/assessment` gained
  `listEvaluationsForLearner` + `getMyResults` + `attemptResultDto`/
  `evaluationResultDto` + the route. The **learner transcript** (`MyTranscriptPage`)
  now consumes it, so an instructor evaluation appears alongside quiz results
  (tagged "Instructor"). Completion was already unified (`evaluation OR
  passingAttempt`). Additive — existing flows unchanged. Tests: +5 server integration
  (`assessmentResultsMine`: empty / evaluation / quiz / both / self-scope) + transcript
  test updated — **server 972/99, client 313**, lint 63, build clean. Specs
  `assessments` + `evaluations` + domain-model rule updated (deferral cleared). The
  English rubric-grading UI folds into the unified assessment UX in Phase 4. ADR
  `converge-to-one-training-model`. Next: Phase 2 — converge Enrollment.
**Older entries (2026-06-14 and earlier)** →
[`changelog-archive/2026-q2.md`](changelog-archive/2026-q2.md) (121 entries,
2026-06-01 → 2026-06-14).

---

## How to keep this current

After each milestone or significant change: update the phase/wave %, move the
status emoji, refresh the **Status board** (Now / Next), and add one dated line
at the top of *Recent progress*. Strategy detail stays in `lms-roadmap.md`.

**Rolling archive (keeps this file lean):** keep ~the last 2 weeks (~15 entries,
file ≤ ~400 lines) inline; in the SAME commit, cut older entries verbatim
(newest-first — they are an audit trail, do not reword) into
`changelog-archive/<year>-q<quarter>.md` and update its coverage header.
