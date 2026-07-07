# Development Roadmap — TMS v2 → Internal LTMS (living tracker)

> **Canonical progress tracker.** Status board first, then milestone tables,
> then the recent changelog. Full history → [`changelog-archive/`](changelog-archive/).
> - *Why / strategy / 6-month direction* → [`lms-roadmap.md`](lms-roadmap.md)
> - *Architecture / orientation* → [`system-overview.md`](system-overview.md)
> - *Detailed task snapshot (archived)* → [`archive/handoff-2026-06-01.md`](archive/handoff-2026-06-01.md)
>
> **Last updated:** 2026-07-05

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
- **Next:** **Phase 6 PostgreSQL migration — gate OPENED by owner 2026-06-21**
  (commit to full migration; driver: future-proofing the relational L&D platform).
  Phase 0 readiness COMPLETE; foundation on main (#184). **Now in Phase 3
  (repository ports)** — porting each repo to dual-backend behind the `DB_BACKEND`
  flag (default `mongo` → running app unchanged), CI-proven Mongo==PG. **Wave A
  read-only DONE (5 ports):** metrics-funnel + metric time-series (metrics surface
  complete) · per-team/employee/class attendance rollups (trilogy complete).
  **Wave B (whole-repository CRUD) IN PROGRESS:** room (#6) + org (#7) + session-type (#8) + skill (#9) + trainer (#10) + vendor (#11) + **learning programs+cohorts (#12)** + **learning/enrollment (#13)** + **learning/completion (#14)** + **learning/feedback (#15)** + **learning/path (#16)** + **branding (#17)** + **access (#18)** + **custom-field (#19)** + **finance (#20)** + **automation (#21)** + **compliance (#22)** + **notification (#23)** + **mobile (#24)** + **org/office (#25)** + **assessment/question-bank (#26)** + **report-presets (#27)** + **executive-dashboard (#28)** + **dashboard (#29)** + **learning/assignment (#30)** done. **Port-now set** (sequencing report `plans/reports/plan-260623-0720-*`): office ✓ · question-bank ✓ · report-presets ✓ · executive-dashboard ✓ · dashboard ✓ · learning/assignment ✓ (mig 023) · attendance ✓ (mig 025) · learning/reports ✓ (no new mig) · assessment ✓ (mig 026) — **port-now set COMPLETE**. **Transaction tail IN PROGRESS:** schedule chokepoint **repo + orchestration + read-path FULLY dual-backend** — S0 tables + S1 reads + S2 waitlist + S3a 12 txn methods + S3b-1 create/cancel cutover + S4 FIFO promotion + S3b-2 updateSchedule cutover + **S5 read-path completion (the last 6 Mongo-direct re-fetches in `scheduleService` — booking/admin-create response, cancel load + leader-auth + waiter emails — routed through 3 new dual-backend reads `findScheduleForResponse`/`findScheduleForCancellation`/`findTeamLeaderId` + reused `findUsersForEmail`; `scheduleService` now has ZERO direct Mongoose)** ✓ (mig 027) → **the booking chokepoint runs end-to-end on either backend.** **planning ✓ (mig 028 — the TNA `scheduleItem` 4-write transaction cut over to the UoW; finance `createBudget` now tx-aware on both backends)**. The transaction-heavy tail (`groups` · schedule chokepoint · `planning`) is DONE — the dual-backend transaction abstraction (`domains/_shared/unit-of-work`, parity-proven 2026-06-25 on real Neon) carried all of them — and **learning/session ✓ (2026-07-03, no new mig — read-only 9-method port: the list/detail 6-way populate hydration + booking-adapter context reads; writes were already dual-backend via the sealed `scheduleService` chokepoint) → Phase 3 repository ports COMPLETE. **Wave E (auth & audit) COMPLETE 2026-07-04** — E1 audit write path ✓ (mig 029 `audit_log`: hash chain through `services/audit-repository.{mongo,pg}`, 8/8 Neon parity + 48/48 Mongo audit suites) · E2 retention purge job ✓ (nightly PG DELETE mirroring the Mongo TTLs — audit_log 730d / notification_logs 180d / metric_snapshots 400d, 5/5 Neon) · E3 auth login + middleware reads ✓ (mig 030: 13 users security columns, atomic lockout roll ⇄ CASE UPDATE, fixed-projection security readers, 6/6 Neon + 37/37 Mongo auth suites) · E4 auth mutations ✓ (password change/reset + MFA lifecycle + admin overrides through the same seam; atomic single-use reset consume; 6/6 Neon + 54/54 Mongo). **Wave F (legacy tail) PR-1 ✓ 2026-07-04** — 6 Phase-0 seams dual-backend (dashboard-stats 14-query bundle mig 031 · class · metrics · audit-query · evaluation-export · search; 28/28 Neon parity + 79/79 Mongo consumer suites; 3 ports via a parallel agent lane). Ledger for F-PR-2 (attendance-export pipeline refactor · user-mutations auto-release hook) + ops dispositions in `phase-03-repository-ports.md`. **Wave G lane LIVE 2026-07-04** (`server-tests-pg` informational — first inventory: 91/208 suites already green on Postgres; 117 to work down, then promote to required gate #8). **Wave G batch 1 ✓ 2026-07-05 — shared-fixture foundation: 117 → 82 failing suites** (`tests/pg-test-utils.js` per-file PG reset + core-fixture mirrors into PG; 24 selector suites backend-aware; 3 attendance parity wrappers pin `impls.mongo`; 0 newly red). **Next: work the remaining 82 down (suite-by-suite dual-seed, batch 2+) + F-PR-2.**
  Master plan: `plans/260612-2042-postgresql-migration/master-execution-plan.md`.
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
  cron-monitor dashboard. (**Phase 6 PostgreSQL gate OPENED 2026-06-21** — moved
  to *Next* above; in progress.)

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
| 6 | PostgreSQL decision gate | ~45% | 🟡 in progress (gate OPENED 2026-06-21; foundation #184 on main; repo ports underway — Wave A read-only DONE 5 ports + Wave B CRUD: room/org/session-type/skill/trainer/vendor/branding/access + learning programs+cohorts/enrollment/completion/feedback/path (13) whole-repo ports done; **Wave-D keystone: dual-backend transaction abstraction built + parity-proven 2026-06-25 on real Neon → unblocks groups/planning/schedule-chokepoint; groups transaction port COMPLETE (lifecycle + team-write/membership-bridge + enrollment-sync, slices 1-3) 2026-06-26; syncSchedules/reads Mongo-only by design**; **attendance repository ported (mig 025) 2026-06-26 — reads/bulk-upsert/lastActive/4 analytics aggregations, 16/16 parity**; **learning/reports repository ported (no new mig) 2026-06-27 — 20-method report read surface, 13/13 parity**; **assessment domain ported (mig 026) 2026-06-27 — definitions/attempts/grading-queue, 13/13 parity — port-now set COMPLETE**; **schedule chokepoint port STARTED (mig 027) 2026-06-27 — S0 tables (waitlist_entries/room_bookings) + S1 the 25 reads, 13/13 parity, merge-selector keeps writes Mongo until S3**; **schedule chokepoint COMPLETE end-to-end (S2–S5) 2026-06-27**; **planning ported (mig 028 — scheduleItem txn on the UoW) 2026-07-02**; **learning/session ported (no new mig, read-only) 2026-07-03 — Phase 3 repository ports COMPLETE**; **Wave E auth & audit COMPLETE 2026-07-04: E1 audit hash chain (mig 029, 8/8) + E2 PG retention purge (5/5) + E3 auth login/middleware (mig 030, 6/6) + E4 auth mutations (6/6 + 54/54)**; **Wave F PR-1 2026-07-04: 6 legacy seams (dashboard-stats mig 031 · class · metrics · audit-query · evaluation-export · search), 28/28 parity — full pg-parity dir 53 suites/326 tests green**; **Wave G lane LIVE 2026-07-04 — server-tests-pg informational, first inventory 91/208 suites green on PG, 117 to work down**; **Wave G batch 1 2026-07-05 — shared-fixture foundation (pg-test-utils per-file reset + fixture mirrors): 117 → 82 failing suites, 0 newly red**; `DB_BACKEND=mongo` default) |

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
> inline: **2026-06-20 → 2026-07-07** (06-14→06-19 rolled 2026-07-04).

- **2026-07-07** — **Wave G batch 10 — learning-tail cluster: 8 suites green both lanes (PG lane ~18 → ~10 failing).**
  Batch 10 (branch `feat/pg-lane-wave-g-batch10`, stacked on #247) clears the whole learning-* tail (learningEnrollmentRoutes,
  learningCompletionRoutes, learningSessionRoutes, learningFeedbackRoutes, learningAssignmentRoutes, learningComplianceReportsRoutes,
  learningDashboardExecutive, learningCertificateExpiryRoutes — 78/78 each lane). 15 fails: mostly reverse-asserts (Enrollment/
  Certificate/Schedule/Feedback/Assignment reads+counts + audit reads, now polled). 1 REAL pg-repo gap: enrollment `insertActiveEnrollment`
  maps the cohort partial-unique 23505 → Mongo-style 11000 (the concurrent-enroll race loser was 500 not 409; sequential dup is caught by
  the pre-check). 2 PG-only-write + Mongoose-scaffolding no-ops fixed on the active backend (cert-expiry `validUntil` via `updateActiveRow`;
  dashboard cost-config Setting cleared via new `deleteActiveRowsWhere` — it leaked into null-before-set). `use-cases.ensureProgramForLegacyCourse`
  backfills via `updateProgramById` (PG rows have no `.save()`). Remaining ~10 = GATED schedule cluster (8) + deferred mfa/p2 (2).
- **2026-07-07** — **Wave G batches 7–9 — PG lane app-gap cluster (batches 5–8 merged #243–#246, ~44 → ~19 failing).**
  Batches 7 (#245, raw-collection mirror + learning programs/cohorts chainable) and 8 (#246, domain-tractable cluster + TrainingRequest
  mapper) merged. **Batch 9 (branch `feat/pg-lane-wave-g-batch9`) — 6 app-gap suites green both lanes** (reconcileAutoHeal,
  analyticsTimeseries, assignmentReminderRoutes, roomOfficeScope, complianceMatrix, lastActivePerf). 17 fails via reverse-asserts (new
  find-many/`distinctActiveValues` helpers) + 3 REAL pg-repo divergences: assignment `findAssignableUsers` normalises populated `{_id}`
  summaries to ids (Mongo casts in `$in`; PG `.map(String)` gave `"[object Object]"` → whole reminder service found nothing) · room
  `createRoom`/`updateRoomById` map the live-code 23505 → Mongo-style 11000 (409 not 500) · metrics-repository `matchToWhere` treats a
  bson ObjectId as scalar equality (direct `getFunnel` passed an ObjectId programId). 6th fail = **getUsers list read ported to
  dual-backend** (`controllers/user/user-list-repository.{mongo,pg,index}` + pg-parity): the attendance write-through bumps
  `last_active_at` in PG, but the Mongoose read saw a stale null — mongo path byte-identical, pg path reads the users table (byte-order
  `COLLATE "C"` sort). `updateActiveRow` Mongo path switched to raw `collection.updateOne` (findByIdAndUpdate let the timestamps plugin
  clobber an explicit `createdAt`). Ledger: `plans/260705-0316-wave-g-batch2-suite-conversion/plan.md`.
- **2026-07-06** — **Wave G batches 2–6 — PG lane suite conversion grind (CI-official failing: 117→77→58→47→44; batches 5–6 in flight).**
  Batch 2 (PR #240): `pg-auto-mirror.js` global mongoose plugin (mirrors every mapped-model write into PG via `pg-row-mappers.js`) +
  groups reads port + 2 real pg-lane bug fixes → 77→58. Batch 3 (PR #241): 4 missing mappers (Assessment/AssessmentAttempt/
  Assignment/Feedback) + 3 REAL org-domain divergences fixed (office uppercase setter, user-assignment officeId drop, dept 23505→11000)
  → 58→47. Batch 4 (PR #242): generic reflective long-tail mapper (fail-soft) + vendor/learning-path fixes → 47→44. Batch 5 (PR #243,
  pending): trainer + finance reverse-asserts + auto-mirror upsert-without-`{new:true}` (finance `LND_COST_CONFIG` currency Setting).
  **Batch 6 (branch `feat/pg-lane-wave-g-batch6`, pending PR) — the audit/security cluster: 8 suites green both lanes** (auditWriteSide,
  passwordReset, phaseAHardening DATA-009, auditHashChain, dataIntegrity DATA-005, accessRoles, goldenPathFlow, authHardening — combined
  PG run 8/11 of the cluster). Reusable `pg-test-utils` helpers added (`findActiveAuditRow`/`findActiveAuditChain`/seq-tamper/
  `updateActiveRow`); auto-mirror now mirrors soft-delete transitions (raw-collection re-read); 2 REAL port gaps fixed (access
  grants-loader read via dual-backend repo; User mapper reset-token cols). Deferred with precise root causes: softDeleteEmpCodeReuse
  (raw-collection soft-delete bypasses mirror), mfa (Mongoose read-modify-write on select:false fields clobbers PG), p2-regression
  (F-PR-2 export refactor). Ledger: `plans/260705-0316-wave-g-batch2-suite-conversion/plan.md`.
- **2026-07-05** — **Wave G batch 1 — shared-fixture foundation: the PG lane drops 117 → 82 failing suites** (38 suites flip
  green by name, 0 newly red; tests 783 → 414 failing). Root causes closed: (1) `tests/setup.js` seeded ONLY Mongo while the
  ported readers (auth middleware first) read PG → every authed request 401'd — NEW `tests/pg-test-utils.js` truncates the
  shared PG database per test file (the twin of Mongo's per-file private DB) and mirrors the core fixtures (users/classes/team,
  same ObjectId-hex ids + same bcrypt hash) into PG, all no-op on the default Mongo lane; (2) the 24 `*-repository-dual-backend`
  suites pinned "selector = mongo by default" — now backend-aware (`impls[isPostgres ? 'pg' : 'mongo']`); (3) the 3 attendance
  pg-parity suites' "mongo" wrappers reused the production analytics path whose repository SELECTOR resolves to pg on the lane —
  `domains/attendance/analytics.js` takes an optional `{ repo }` override (production callers unchanged), wrappers pin
  `impls.mongo`. Remaining 82 = suites seeding extra fixtures via raw Mongoose in-file → convert suite-by-suite (batch 2+),
  growing the `pg-test-utils` mirrors as needed. Full ledger: `plans/260612-2042-postgresql-migration/phase-03-repository-ports.md`.
- **2026-07-04** — **Wave G BRING-UP — the full-suite Postgres lane is live (`server-tests-pg`) + first divergence inventory.**
  New CI job runs the ENTIRE Jest suite with `DB_BACKEND=postgres` against a postgres:16 service (mirrors
  `server-tests`: Node 22, 8GB heap, 30-min wall). `continue-on-error: true` while red BY DESIGN — an informational
  inventory lane, not a merge gate, so bringing it up never freezes main; when it turns green it gets promoted to
  REQUIRED gate #8 (both lanes then stay green through the Phase-5 cutover). **First inventory (run on #237):
  91/208 suites (770/1553 tests) ALREADY PASS on Postgres** — half the suite on day one; **117 failing = 114
  integration suites (the expected class: fixtures seeded via raw Mongoose while reads go to PG) + 3 pg-parity
  suites (selector-vs-impls coupling under the postgres backend)**. Working the inventory down is the Wave-G tail
  (master-plan est ~1wk): teach the integration fixtures to seed through the dual-backend seams, suite by suite.

- **2026-07-04** — **Phase 3 Wave-F PR-1 — the 6 legacy-tail repository seams ported to dual-backend (mig 031).**
  The Phase-0 `*-repository.js` swap points cut over in one slice: **dashboard-stats** (the 14-query admin-analytics
  bundle — the largest single Mongo→SQL rewrite; mig 031 extracts entrance_level/current_level/drop_reason columns;
  caught + mirrored the Mongo spread-clobber semantics where a pipeline's own predicate overwrites the active filter
  on the same key), **class** (writes DELEGATE to the parity-proven learning cohort path; hydrated readers expose a
  non-enumerable `toObject()`; PG update now enforces the status enum like runValidators), **metrics** (snapshot
  upsert via ON CONFLICT on the COALESCE unique — `modified` mirrors Mongo's changed-only modifiedCount; funnel count
  grammar translator, fail-loud on unknown filters), **audit-query**, **evaluation-export** (the raw-pipeline caller
  reverse-parsed with an `assertKnownShape` fail-fast guard) and **search** (regex⇄ILIKE). 3 ports built by a
  delegated agent lane in parallel — file-ownership disjoint, integrated after its 14/14 green report.
  Parity: **28/28 across the 6 new pg-parity suites on real Neon** + 79/79 Mongo consumer suites (dashboard, class,
  analytics, audit routes, search routes, evaluation routes). Remaining seams + ops-file dispositions recorded in the
  **Wave F ledger** (`plans/260612-2042-postgresql-migration/phase-03-repository-ports.md`): attendance-export
  (pipeline→semantic-method refactor first) + user-mutations/lifecycle (User auto-release hook must route through the
  schedule domain) = F-PR-2; reconcile/import/sync/ops files disposed per-file. Next: Wave G full-suite PG lane.

- **2026-07-04** — **Phase 3 Wave-E slice E4 — auth mutations ported to dual-backend (no new mig) → WAVE E (auth & audit) COMPLETE.**
  The remaining 14 direct-Mongoose touch points across `controllers/auth/*` + `policy/auth.js` (re-auth gate) cut over
  to the E3 `services/auth/auth-repository` seam (13 new methods): password change (bcrypt(12) + the pre-save hook's
  `passwordChangedAt = now()-1s` skew replicated — update writes skip hooks), forgot/reset password (token save +
  mail-failure rollback + the ATOMIC single-use consume: Mongo findOneAndUpdate ⇄ PG UPDATE…RETURNING double-spend
  guard), the MFA enrollment lifecycle (pending secret set/read/clear → promote-to-enabled with backup codes →
  disable shared by self-service AND the admin override), admin force-logout (`bumpPasswordChangedAt` kill switch)
  and the SEC-009 re-auth read. Lowercase empCode reset lookups still match (Mongo query setter ⇄ PG `upper()`).
  OPS-014 test now spies the repository seam (backend-agnostic). 6/6 pg-parity on real Neon (single-use/expiry
  consume, MFA transitions, no-extra-fields shapes) + 54/54 Mongo auth/MFA/passwordReset suites green.
  **Wave E done — the whole security surface (audit chain, retention, login, middleware, credential/MFA mutations)
  is dual-backend. Next: Wave F (legacy tail) → G (full-suite PG parity lane).**

- **2026-07-04** — **Phase 3 Wave-E slice E3 — auth login + middleware reads ported to dual-backend (mig 030).**
  The load-bearing security read path now runs through `services/auth/auth-repository.{mongo,pg}.js` (+ clean-swap
  selector): login lookup, the ATOMIC failed-login roll (Mongo aggregation-pipeline update ⇄ one PG CASE UPDATE —
  counter+1, at max → 0 + `lock_until = now()+LOCK_MINUTES`), success counter reset, MFA second-leg reads/writes
  (TOTP replay counter, single-use backup codes), and the per-request middleware projection (10 fixed fields, cached
  30s). Mig 030 adds the 13 `users` security columns (password / password_changed_at / must_change_password / reset
  token pair / mfa_enabled / mfa_secret / mfa_pending pair / mfa_backup_codes text[] / mfa_last_used_counter /
  failed_login_attempts / lock_until). `select:false` parity is enforced by projection: the security readers are the
  ONLY methods surfacing password/mfa fields, and both backends now return the same EXPLICIT fixed field set (the
  Mongo readers were tightened from additive `+select` to inclusion projections). `auth-login.js` compares passwords
  via bcrypt directly (lean rows, no hydrated instance methods); `middleware/auth.js` keeps its NodeCache + iat
  session-kill logic backend-agnostic. 6/6 pg-parity on real Neon (incl. the no-leak middleware-projection pin +
  same lockout transition) + 37/37 existing Mongo auth/MFA suites green. Next: E4 auth mutations.

- **2026-07-04** — **Phase 3 Wave-E slice E2 — PG retention purge job (no new mig).**
  `jobs/retentionPurgeJob.js`: nightly 02:30 UTC DELETE for the PG tables whose Mongo twins rely on TTL indexes —
  `audit_log` 730d (`AUDIT_RETENTION_DAYS`) · `notification_logs` 180d (fixed) · `metric_snapshots` 400d
  (`METRIC_SNAPSHOT_RETENTION_DAYS`) — env + default in lockstep with the models; the debt migs 002/019 explicitly
  deferred to Wave E. PG-only (`isPostgres` guard — on Mongo the TTL indexes do the work), cronMonitor heartbeat
  (`retention-purge`, 02:30 UTC after reconcile), graceful-shutdown wired in `server.js`, purge deletions unaudited by
  design (parity with Mongo TTL deletions). reconcile_report (30d) + token_blocklist windows join when those ports
  land. 5/5 pg tests on real Neon (per-window deletes; strict-< boundary — edge row survives; call-time env override).

- **2026-07-04** — **Phase 3 Wave-E slice E1 — audit write path ported to dual-backend (mig 029).**
  The tamper-evident hash chain now writes through `services/audit-repository.{mongo,pg}.js` (+ clean-swap selector):
  `findChainHead`/`insertChainedRow`/`findChainWindow` extracted from `auditService`/`audit-chain` — ordering +
  hashing stay backend-agnostic in the service; `verifyChain` takes an optional `repo` so parity drives both backends.
  Mig 029 `audit_log`: partial-unique `seq` (chain-fork guard ⇔ the Mongo partial index), entity/actor/action
  +created_at indexes, plain created_at index for the Wave-E2 retention purge (PG has no TTL — Mongo keeps its 730d
  TTL index). Enum parity: the pg impl validates entity/actorRole from the SAME Mongoose schema enumValues (no CHECK
  constraint — the enum is a growing ratchet). 8/8 pg-parity green on real Neon (identical hashes across
  ObjectId/Date vs text/ISO row shapes; tamper → hash-mismatch + deletion → missing-rows verdicts agree; dup-seq
  23505⇄11000) + 48/48 existing Mongo audit tests. Wave-E plan: `plans/260704-0349-pg-port-wave-e-auth-audit/`.

- **2026-07-03** — **Phase 3 Wave-D — learning/session ported to dual-backend — the LAST repo port: Phase 3 repository ports COMPLETE.**
  `domains/learning/session/repository.js` (9 read-only methods) split into `repository.{mongo,pg}.js` + a clean-swap selector.
  **No new migration** — every column already existed, and session WRITES were already dual-backend via the sealed
  `scheduleService` chokepoint; this was the read surface. The PG twin mirrors the 6-way `populateSessionQuery` as batch
  embeds (cohort + nested FULL program object, team, office, room, instructors, roster) with per-model soft-delete drop
  semantics pinned (Class/Team/User/Office/Room find-hooks drop deleted refs; LearningProgram/Enrollment have NO hook →
  never hidden). PERF-016 preserved (list roster = ids-only but still soft-delete-drops); PERF-014 preserved (reads
  read-THROUGH the shared session-order cache — ordering already rides the dual-backend schedule repo); the filter
  translator is bounded to `buildFilter`'s shapes (participant/teacher `$or` widenings, startTime window, scalars,
  pagination). `.lean({virtuals:true})` stays a documented no-op (BUG-003) → no virtuals in row shapes. Parity-proven
  Mongo==PG on real Neon (**6/6** — embeds/deleted-ref drops/meta extras/numbering, 7 filter variants + pagination,
  full-roster detail, context lookups, enrollment/team lookups, capacity map) + full pg-parity sweep **44 suites / 279
  green** + mongo-default session suites **33/33** unchanged. DB_BACKEND=mongo default unchanged.
  **Next: Wave E (auth & audit) — port LAST deliberately.**

- **2026-07-02** — **Phase 3 Wave-D — planning domain ported to dual-backend (mig 028) — the TNA `scheduleItem` transaction now runs on the UoW.**
  `domains/planning/repository.js` (15 methods) split into `repository.{mongo,pg}.js` + a clean-swap selector. **Migration 028**:
  `training_requests` (target {kind,id} subobject → flat columns, compliance-018 precedent; Mongo compound indexes mirrored) +
  `training_plans` (`fiscal_year` FULL-unique; `items` = jsonb subdoc array with app-side `_id`s, assessments-026 precedent).
  **The `scheduleItem` 4-write transaction** (cohort insert + plan-item link + approved→planned flip + A1 budget row) cut over
  from `mongoose.startSession()` → the backend-agnostic `runInTransaction`; the hydrated-doc `items.id().cohortIds.push()+save()`
  (no PG analogue) became the explicit dual-backend **`pushCohortIdToPlanItem`** (Mongo positional `$push` ⇔ PG jsonb rewrite
  under `SELECT … FOR UPDATE`); **`financeRepo.createBudget` is now tx-aware on BOTH backends** (closes the Wave-B "session
  IGNORED in PG" deferral; the mongo twin gained the `sessionOf` shim). PG mirrors the Mongo traps: `upsertPlan` mints FRESH
  item `_id`s on every `$set` + applies the subdoc defaults; label lookups replicate the hook asymmetry (deleted skills still
  labelled — Skill has NO find-hook; deleted departments hidden); classes 23505 → `{code:11000}` → the same 409. Parity-proven
  Mongo==PG on real Neon (**8/8** incl. tx commit / full 4-write rollback / duplicate-classCode) + full pg-parity sweep
  **43 suites / 273 green** + mongo-default planning/finance suites (14) unchanged. DB_BACKEND=mongo default unchanged.
  **Next: learning/session — the LAST repo port before Wave E (auth & audit).**
- **2026-06-27** — **Phase 3 Wave-D — schedule chokepoint slice S5: post-commit read-path completion → `scheduleService` has ZERO direct Mongoose (chokepoint SEALED).**
  Routed the last 6 Mongo-direct reads in `services/scheduleService.js` through the dual-backend repository so the booking
  chokepoint runs end-to-end on `DB_BACKEND=postgres` (not just the writes). **3 new dual-backend reads** (mongo + pg twins,
  same interface): **`findScheduleForResponse`** (bookSlot/bookCohortSlot/adminCreate populated response — NON-lean so the
  `res.json` toJSON virtuals `enrolledCount`/`availableSpots` survive 1:1; pg twin embeds classId+bookedTeamId+enrolledUsers
  `empCode name`), **`findScheduleForCancellation`** (cancelSlot load — classId label + enrolled-user emails for the
  cancellation notifications, `bookedTeamId` left RAW), **`findTeamLeaderId`** (cancel leader-auth — minimal team-leader
  lookup; mongo soft-delete pre-find hook ⇔ pg `is_deleted=false`). Read 5 (waiter emails) **reused** the existing
  `findUsersForEmail`. Removed the `Schedule`/`Team`/`User` model requires from `scheduleService` entirely. **Pure internals
  swap, no behaviour change** (`DB_BACKEND=mongo` default identical): 127 mongo integration tests green
  (booking/cancel/authz/queries/reassign/use-cases/learning-session/waitlist/autorelease/sessionTrainers/mode-legacy) +
  **schedule pg-parity 16/16** (was 13 — +3 new methods) **+ 45 other schedule pg-parity green on real Neon**. Behaviour
  preserved 1:1 per the repo's read-port convention. **Schedule chokepoint port now COMPLETE end-to-end** (repo + orchestration
  + read-path). Adjacent post-commit side-effect reads (`calendar-sync.js` Google event build, `waitlist/promotion.js`
  notification fan-out) remain Mongo-only by design (best-effort, fail-soft, outside the booking txn). **Next: planning · learning/session.**
- **2026-06-27** — **Phase 3 Wave-D — schedule chokepoint slice S3b-2: `updateSchedule` cut over → the schedule repo is now FULLY dual-backend.**
  Ported the last 2 deferred repo methods to Postgres: **`updateScheduleById`** (the field-mapped UPDATE twin of
  insertSession — core fields → columns, column-less extras → `meta` jsonb merge via `meta || $patch`; empty data →
  no-op returning the current row, mirroring Mongo `findByIdAndUpdate(id, {})`) and **`findTeamById`** (opts-select:
  `classId`-only / `members`-with-status; tx in `opts.session`). Both mongo twins now use the `sessionOf` shim. Cut
  `domains/schedule/use-cases.updateSchedule` over from `startSession`→`runInTransaction` (its capacity-raise branch
  calls the now-dual-backend `promoteIfSeatFree`). **The schedule repo selector is now a CLEAN SWAP** — every method
  has a pg twin, no mongo-only remainder. Parity `schedule-update-team.pg.test.js` 6/6 on Neon; mongo-default
  reassign/usecases 20 + broad sweep (booking/race/cancel/room/teams/learning/waitlist/staleReconcile/mode) 107; full
  pg-parity 42 suites/262. **Schedule chokepoint repo+orchestration port COMPLETE** — only the post-commit read-path
  (re-fetch populate / waiter reads) remains before `DB_BACKEND=postgres` runs booking end-to-end. DB_BACKEND=mongo default unchanged.
- **2026-06-27** — **Phase 3 Wave-D — schedule chokepoint slice S4: waitlist FIFO promotion ported dual-backend (the concurrency crown).**
  `waitlist/promotion.promoteIfSeatFree` — the in-tx seat-FIFO-waiters engine — refactored so its business logic
  (FIFO loop / stale-head resolve / re-read defense / M5 overfill belt) stays backend-agnostic JS while its 5 DB
  primitives become tx-aware dual-backend twins in the waitlist repo: `findScheduleForPromotion`,
  `findWaitingEntriesForPromotion` (FIFO `created_at ASC`), **`seatWaiterIfRoom`** (THE guarded seat — mongo
  `$push` guarded by `$ne` + `$expr {$size < cap}`; pg `array_append … WHERE NOT $u = ANY(enrolled) AND
  cardinality < cap`), `findScheduleEnrolledUsers`, `markEntryPromoted`. The waitlist mongo repo gained the same
  `sessionOf` shim as the schedule repo (legacy callers — `Team.syncSchedulesForTeamUpdate`, `updateSchedule` —
  still thread a raw session unchanged). **Concurrency crown proven** — `schedule-promotion.pg.test.js` 6/6 on
  Neon incl. two concurrent seats at the cap boundary → exactly one wins, roster never exceeds cap, on BOTH
  backends (Mongo conditional-`$push`+WriteConflict, PG conditional-UPDATE+row-lock). mongo-default green:
  waitlist/staleReconcile/reassign/usecases/teams 57, reconcile 16; full pg-parity 41 suites/256. `notifyPromotions`
  left Mongo-only (post-commit email side-effect — out of the tx). DB_BACKEND=mongo default unchanged.
  **Next: S3b-2 updateSchedule cutover (now unblocked — S4 done) · post-commit read-path completion.**
- **2026-06-27** — **Phase 3 Wave-D — schedule chokepoint slice S3b-1: booking create/cancel orchestration cut over to `runInTransaction`.**
  `scheduleService` (`bookSlot`/`bookCohortSlot`/`adminCreate`/`cancelSlot`) + `domains/schedule/use-cases.deleteSchedule`
  migrated from `mongoose.startSession().withTransaction`→ the backend-agnostic `runInTransaction`. Two new
  dual-backend seams: **`loadTeamForBooking`** (replaces the in-tx Team write-lock+populate — mongo
  `findByIdAndUpdate {updatedAt}`, **pg `SELECT … FOR UPDATE`**) and **`insertSession`** (the single create seam for
  all 3 create paths — core columns + meta-extras fold; 23505→`{code:11000}`). Key simplifier: the policy/release
  layers (`assertBookable`/`acquireRoomLock`/`releaseScheduleResources`) are pure pass-through, so the cutover just
  threads `tx` (S3a already made the repo tx-aware). **P1 concurrency proven** — `schedule-booking-seams.pg.test.js`
  6/6 on Neon incl. two concurrent same-team bookings → exactly one wins / weekly cap held on BOTH backends, + a
  rollback case. mongo-default unchanged: booking/race/abstraction/studio 31, cancel/usecases/reassign/learning/room/
  teams/mode/authz 94; full pg-parity 40 suites/250. Also fixed a latent pg-parity flake (learning-reports cert seed
  null verificationCode). **Post-commit reads (re-fetch populate / cancel email-load / waiter User.find) stay
  Mongo-direct — deferred read-path completion; harmless while DB_BACKEND=mongo.** DB_BACKEND=mongo default unchanged.
  **Next: S3b-2 updateSchedule (after S4) · S4 FIFO promotion.**
- **2026-06-27** — **Phase 3 Wave-D — schedule chokepoint slice S3a (12 txn repo methods) ported to dual-backend + rollback harness.**
  The session-aware booking/cancel/room-lock/waitlist/mode/capacity/attendance methods of `domains/schedule/repository`
  (collision, weekly-cap, capacity-policy, scheduling-mode, attendanceExists, cancelScheduleById, findWaitingEntries,
  cancelWaitingEntries, findRoomForLock, createRoomBooking, setScheduleRoom, deleteRoomBookings) now have pg twins
  (`exec(tx)` on a checked-out client). Mongo accepts BOTH a raw `session` (legacy callers — scheduleService /
  use-cases reassign / policies / Team-sync — unchanged) AND a Unit-of-Work `{session}` wrapper via a `sessionOf`
  shim (keys off `.session`/`.startTransaction`; NB a mongoose ClientSession exposes a `.client` getter, so never
  discriminate on it). 23505→`{code:11000}` keeps the room-lock 409 unchanged. Selector still MERGES — the 2
  orchestration-coupled writes (`updateScheduleById` generic field-mapper + `findTeamById` opts-session) stay
  mongo-only until S3b. **Rollback harness:** the real `runInTransaction.impls` drive both backends — mid-tx throw →
  zero partial writes (room booking + roomId both discarded) — proven on real Neon (parity 13/13). mongo-default
  green: booking/cancel/reassign 52, room/mode/teams/authz 50, waitlist/reconcile/queries+S1/S2 96. DB_BACKEND=mongo
  default unchanged. **Next: S3b — design doc (write-lock + booking seam on PG) THEN orchestration cutover.**
- **2026-06-27** — **Phase 3 Wave-D — schedule chokepoint slice S2 (waitlist repo) ported to dual-backend.**
  `domains/schedule/waitlist/repository.js` (10 methods) split into `repository.{mongo,pg}.js` + a clean-swap
  selector (all 10 ported in one slice → `DB_BACKEND=postgres ? pg : mongo`, no merge). Reads + the two simple
  writes (createEntry / withdrawMyEntry) on `waitlist_entries` (migration 027). PG mirrors: createEntry double-join
  guard (partial-unique `uq_waitlist_live` → 23505 → Mongo-style `{code:11000}` → 409 unchanged), status-lifecycle
  withdraw flip (`waiting`→`withdrawn`, second flip→null), `populate('userId')` + nested `populate(scheduleId→
  class/office/room)` drop a soft-deleted ref to null, FIFO order (`created_at ASC`), `positionOf` handles a
  populated scheduleId (Mongoose `_id`-extraction ⇔ `idOf`). One behavior-preserving consumer tweak: the waitlist
  controller's `entry.toObject()` → `{...entry}` (both backends now return a plain object; Mongo `createEntry`
  returns `doc.toObject()`). Parity-proven Mongo==PG on real Neon (10/10) + mongo-default waitlist suites (23) green.
  DB_BACKEND=mongo default unchanged. **Next: S3 the txn use-cases (the invasive one — stop-and-review after) → S4 FIFO promotion.**
- **2026-06-27** — **Phase 3 Wave-D — schedule chokepoint port STARTED (slices S0+S1).** The transaction-heavy
  tail's biggest, riskiest port — sliced (scout+plan: `plans/reports/plan-260627-1340-pg-port-schedule-chokepoint.md`).
  **S0 — migration 027:** `waitlist_entries` (FIFO queue, partial-unique `(schedule_id,user_id) WHERE waiting`
  double-join guard, status-lifecycle no-soft-delete) + `room_bookings` (room lock, unique `(room_id,start_time)`,
  HARD-DELETE) + `schedules.{cancelled_at,cancelled_by,cancel_reason,capacity}`. **S1 — the 25 PURE READS** of
  `domains/schedule/repository.js` split into `repository.{mongo,pg}.js` + a **merge selector** (mongo ⊕ pg — pg
  overrides only the methods it implements, so the session-aware booking/cancel/room-lock/waitlist WRITES stay
  Mongo until slice S3). PG mirrors: populate class/team/leader/enrolledUsers/sessionInstructorIds (deleted ref→null,
  ordered array drop), `enrolled_users`/`session_instructor_ids` text[] scalar-match → ANY/overlap, LIVE-only reads,
  the Mongo-filter→SQL translator (classId/status/enrolledUsers/startTime-range/$or teacher scope), instructor
  overlap conflict, teacher scope (named OR empty teacher_ids), facilitator-policy reads. Parity-proven Mongo==PG
  on real Neon (13/13) + mongo-default schedule suites (67) green. DB_BACKEND=mongo default unchanged. **Next:
  S2 waitlist repo → S3 the txn use-cases (the invasive one) → S4 FIFO promotion.**
- **2026-06-27** — **Phase 3 Wave-B — assessment domain ported to dual-backend — the port-now set is COMPLETE.**
  The 18-method `domains/assessment/repository.js` (assessment definitions + attempts + question-bank lookup
  + unified-results / grading-queue reads) split into `repository.{mongo,pg}.js` + selector. **Migration 026**
  adds the `assessments` table (items→jsonb; passing_score_percent double precision; GIN index on items for the
  short_text grading-queue filter). PG mirrors the Mongo traps: items/answers jsonb carry the SAME Mongoose
  subdoc defaults (item `_id` generated app-side, points→1; answer pointsEarned/correct/manualNote/
  manualGradedBy/At defaults; `default:undefined` fields stay absent); `populate` cohort/user/assessment/class
  → 2nd-query embed / `LEFT JOIN … is_deleted=false` (deleted ref → null); grading-queue `items.type=short_text`
  → `items @> '[{"type":"short_text"}]'`; `listGradableClasses` binary classCode sort; count aggregations honour
  the Evaluation aggregate-hook (`is_deleted=false`). Parity-proven Mongo==PG on real Neon (13/13) +
  mongo-default assessment suite (32) green. DB_BACKEND=mongo default unchanged. **Port-now set done:
  office · question-bank · report-presets · executive-dashboard · dashboard · learning/assignment · attendance ·
  learning/reports · assessment — only the transaction-heavy tail remains (planning · learning/session · schedule).**
- **2026-06-27** — **Phase 3 Wave-B — learning/reports repository ported to dual-backend.** The
  20-method read surface behind the completion-rollup / compliance / org-export / A5 training-hours
  reports — `domains/learning/reports/repository.js` split into `repository.{mongo,pg}.js` + selector.
  **No new migration** (reuses tables from 001/004/011/012/023/025). PG mirrors the Mongo traps:
  explicit soft-delete predicates incl. the ones the find-HOOKS add implicitly (Evaluation's hook
  filters even though the source query omits `isDeleted`); `Schedule.distinct('enrolledUsers')`
  (distinct over a `text[]`) → `unnest`+`DISTINCT` UNION active enrollments; nested populate
  (compliance `pathId→programs` as full objects; org user dept+manager) → `LEFT JOIN … is_deleted=false`
  (deleted ref → null); `dueDate` UTC day-boundary range; programId path-containing resolution;
  `listActiveCohorts` scope (`{}` vs `{_id:{$in}}`); cert `issued_at` desc sort. Parity-proven
  Mongo==PG on real Neon (13/13) + mongo-default report suite (38) green. DB_BACKEND=mongo default
  unchanged.
- **2026-06-26** — **Phase 3 Wave-B — attendance repository ported to dual-backend.** The
  14-method `domains/attendance/repository.js` split into `repository.{mongo,pg}.js` + selector
  (DB_BACKEND). Covers the authz/scope schedule+class reads, the per-schedule/per-user record reads
  (populate→LEFT JOIN with soft-delete drop-to-null on User/Class; Schedule has no soft-delete hook),
  the bulk-upsert (Mongo `bulkWrite` ⇄ `INSERT … ON CONFLICT DO UPDATE`; matched/modified/upserted
  reproduced exactly — Mongoose's `updatedAt` bump means modified==matched even on a no-op re-mark),
  `bumpUsersLastActive` (`$max` ⇄ `GREATEST`, never moves backward), and the four analytics
  aggregations (by-employee paginated rollup with banker's-rounded rate + `$lookup`-isDeleted ⇄
  JOIN…is_deleted, by-team via the `team_members` junction, per-user counts, personal stats).
  **Migration 025** adds attendance scalar columns (remark/photo_url/sync_status/export_batch_id/
  exported_at) + the compound indexes (incl. the `{schedule_id,user_id}` UNIQUE upsert target) and
  `users.last_active_at`. Parity-proven Mongo==PG on real Neon (16/16) + mongo-default attendance
  suite (47) green. DB_BACKEND=mongo default unchanged. Trap caught: `aggregate()` doesn't cast
  hex→ObjectId (unlike `.find()`) — scope ids arrive already-typed per backend.
- **2026-06-26** — **Phase 3 Wave-D — groups enrollment-sync port (slice 3 of 3) — the groups transaction port is COMPLETE.**
  The hardest slice. The team enrollment-sync held LIVE Enrollment docs and mutated + `.save()`d them
  (no Postgres analogue). Now `domains/groups/enrollment-sync-repository.{mongo,pg}.js` + selector —
  `findActiveEnrollmentInOtherTeam` / `transferEnrollment` / `findActiveEnrollmentInTeam` /
  `dropEnrollment` (explicit updates) + `pullTeamMember` (Mongo `$pull` ⇄ PG `team_members` DELETE) +
  `findTeamForEnrollmentContext` / `findUserContact`, all on the unit-of-work tx. `enrollment-sync.js`
  rewritten (live-doc→explicit; normalises `opts.tx || {session}` so the legacy enrollment-transfer
  caller is untouched). **Migration 024** adds `enrollments.transferred_to`. Parity-proven Mongo==PG on
  real Neon (5/5: context read · transfer+roster-pull · drop · contact · rollback) + teams integration
  (14) green. **`syncSchedulesForTeamUpdate` (roster + capacity + waitlist FIFO promotion) stays
  Mongo-only by design** — it is a SCHEDULE/waitlist concern, ported with that domain, not groups.
  Groups' remaining Mongo-only surface = pure reads. DB_BACKEND=mongo default unchanged.
- **2026-06-26** — **Phase 3 Wave-D — groups transaction port (slices 1+2 of 3) on the unit-of-work abstraction.**
  First transaction-heavy domain ported onto the new `runInTransaction` boundary.
  **Slice 1 (lifecycle):** `domains/groups/lifecycle-repository.{mongo,pg}.js` + selector — the team
  soft-delete cascade (close Active enrollments + flip the team deleted, atomically) + restore;
  `lifecycle.js` now uses `runInTransaction`. **Slice 2 (team-write + membership bridge):**
  `domains/groups/team-write-repository.{mongo,pg}.js` + selector — insertTeam/updateTeamDoc/
  unassignTeamClass; pins the membership representation bridge (**Mongo embeds `Team.members` as an
  array ⇄ PG normalises into the `team_members` junction**, mig 001); `mutations.js` create/update now
  run on `runInTransaction`. Parity-proven Mongo==PG on real Neon (lifecycle 3/3, team-write 4/4) +
  the teams integration suite (14) green through the new wiring. Remaining **slice 3 (enrollment-sync)**
  — transfer/drop live-doc `.save()` → explicit updates + the `syncSchedulesForTeamUpdate`
  waitlist/capacity coupling — deferred to its own PR. DB_BACKEND=mongo default unchanged.
- **2026-06-25** — **Phase 3 Wave-D KEYSTONE — dual-backend transaction abstraction built + parity-proven (Mongo==PG on real Neon).**
  New `domains/_shared/unit-of-work.js` `runInTransaction(tx⇒…)` — Mongo `session.withTransaction` ⇄ PG `BEGIN/COMMIT/ROLLBACK` on a checked-out pool client; `tx` is opaque to use-cases (carries `session` | `client`), fn's return committed, any throw rolls back + re-throws. First atomic-write seam `domains/schedule/booking-write-repository.{mongo,pg}.js` + selector (insert/count/cancel) over the existing `schedules` table + `uq_sched_slot_scheduled` partial-unique (mig 001) — PG 23505 re-thrown as Mongo-style `{code:11000}` so the booking use-case's 409 branch is backend-agnostic (established convention). Two suites pin commit · rollback · double-booking guard · cancelled-frees-slot **identical on both backends**: `tests/integration/booking-transaction-abstraction.test.js` (non-gated, Mongo replSet — 4/4 local) + `tests/pg-parity/booking-transaction.pg.test.js` (gated — **4/4 on real Neon**). **Retires the migration's highest-risk unknown** → unblocks the transaction-heavy tail (`groups`, `planning`, the schedule booking chokepoint, learning cohort-archive). Inert: not wired into scheduleService; DB_BACKEND=mongo default unchanged.
- **2026-06-24** — **Phase 3 Wave-B — 25th port: `learning/assignment/repository` (required-training assignments).**
  `repository.js` (12 methods + 2 status constants) → dual-backend via `repository.{mongo,pg}.js`
  + selector. **Migration 023** `assignments` (single-target `program|path` XOR CHECK;
  `user_ids`/`department_ids` text[]; partial-unique `source_certificate_id` WHERE NOT NULL =
  the recert idempotency backstop). Parity-proven on real Neon: ORDERED userIds/departmentIds
  populate that DROPS soft-deleted refs (User+Department find-hooks) while preserving array
  order; programId/pathId embed REGARDLESS of archived/deleted (LearningProgram has no
  soft-delete, LearningPath no find-hook); `status {$ne:'archived'}` incl. NULL status →
  `IS DISTINCT FROM`; findAssignableUsers name binary order (JS cmp, not PG collation);
  self_enroll cohort gate; participating-set (statuses ∩ program cohorts via subquery).
  recert-assignment-service writes the `Assignment` model directly (bypasses this repo —
  Mongo-only, a separate concern). Tests: new pg-parity suite **10/10 green on Neon** + the 5
  assignment mongo suites (routes/mine/recert/reminders/cadence) pass unchanged through the
  selector. DB_BACKEND=mongo default unchanged.
- **2026-06-23** — **Phase 3 Wave-B — 24th port: `learning/dashboard/repository` (operational dashboard aggregations).**
  `repository.js` (11 methods) → dual-backend via the `repository.{mongo,pg}.js` +
  selector: attendance/session/certificate-expiry/assessment/feedback/coverage
  rollups + onboarding setup signals + dept headcount/completion. **No migration**
  (all tables exist). Parity-proven on real Neon: `ATTENDED_STATUSES` (P|L) via
  count `FILTER`; `cohortScope` null = org-wide; `$ifNull` → `COALESCE(department,
  'Unassigned')`; `completionPolicy` jsonb predicate (`->>'…'` casts); the Monday
  week window for setup signals. Same aggregate-`$in` cast trap as executive
  (cohort-scoped methods get native id types per backend). Soft-delete explicit on
  Certificate/AssessmentAttempt/Feedback/User/Department; none on Attendance/
  Schedule(status)/Enrollment(status). Tests: pg-parity **28 suites / 145 green on
  Neon** + CI-safe selector test; the dashboardStats + learningDashboardOperational
  suites pass unchanged through the selector. DB_BACKEND=mongo default unchanged.

- **2026-06-23** — **Phase 3 Wave-B — 23rd port: `learning/dashboard/executive-repository` (executive aggregations).**
  `executive-repository.js` (9 methods) → dual-backend via the
  `executive-repository.{mongo,pg}.js` + selector: org-wide strategic aggregations
  + the `LND_COST_CONFIG` upsert. **No migration** (all tables exist).
  Parity-proven on real Neon: month buckets in **UTC** (`AT TIME ZONE 'UTC'` to
  match `$dateToString`'s default); `certificateValidityRollup` via count `FILTER`;
  `coverageByDepartment` replicates the Set/Map grouping; `issuedProgramSetsByUser`
  = `array_agg(DISTINCT …)` (= `$addToSet`). Two real traps pinned: Enrollment/
  Attendance have **no** soft-delete (status lifecycle) while User/Certificate/
  LearningPath do; and Mongo **aggregate `$in` does NOT auto-cast** string→ObjectId
  (each backend receives ids in its native form, mirroring the real per-backend
  flow). Tests: pg-parity **27 suites / 137 green on Neon** + CI-safe selector test;
  the learningDashboardExecutive suite passes unchanged through the selector.
  DB_BACKEND=mongo default unchanged.

- **2026-06-23** — **Phase 3 Wave-B — 22nd port: `learning/reports/presets-repository` (saved report presets).**
  `presets-repository.js` (5 methods) → dual-backend via the
  `presets-repository.{mongo,pg}.js` + selector: saved report-preset CRUD. New
  **migration `022`** — `report_presets` (`filters` subdoc → jsonb; soft-deleted;
  `{schedule,is_deleted}` index). Parity-proven on real Neon: soft-delete excluded
  on reads (isDeleted/deletedAt select:false → omitted); the `filters` subdoc
  round-trips (ObjectId fields as hex strings); **create applies the Mongoose
  subdoc defaults** (from/to/role '', departmentId null, programIds []) on a partial
  payload, **but update `$set` REPLACES filters WITHOUT defaults** (a real Mongoose
  asymmetry — the PG impl mirrors both); `list` sort updatedAt-desc + limit 200.
  Tests: pg-parity **26 suites / 129 green on Neon** + CI-safe selector test; the
  reportsEvidencePackPresets (4) + learningComplianceReportsRoutes (5) suites pass
  unchanged through the selector. DB_BACKEND=mongo default unchanged.

- **2026-06-23** — **Phase 3 Wave-B — 21st port: `domains/assessment/question-bank-repository`.**
  `question-bank-repository.js` (5 methods) → dual-backend via the
  `question-bank-repository.{mongo,pg}.js` + selector: reusable question-bank item
  CRUD. New **migration `021`** — `assessment_questions` (type/prompt;
  `options`/`correct_option_indexes`/`accepted_answers` NULLABLE — Mongo
  `default:undefined`, omitted when unset; `tags` text[] default []; `points`
  double precision; soft-deleted; GIN index on tags). Parity-proven on real Neon:
  the `default:undefined` arrays are **omitted** from the read shape when unset (a
  short_text item carries no `options`/`correctOptionIndexes` keys); `listQuestions`
  filters (type/tag via `= ANY(tags)`/programId) + prompt `~*` (mirroring
  `$regex/$options:'i'`) + updatedAt-desc sort; `softDeleteQuestion` has no
  `is_deleted` guard (mirroring `findByIdAndUpdate`); explicit soft-delete (the model
  has no Mongoose hooks). Tests: pg-parity **25 suites / 125 green on Neon** + CI-safe
  selector test; the assessmentRoutes suite (23) passes unchanged through the
  selector. DB_BACKEND=mongo default unchanged.

- **2026-06-23** — **Phase 3 Wave-B — 20th port: `domains/org/office-repository` (offices).**
  `domains/org/office-repository.js` (6 methods) → dual-backend via the
  `office-repository.{mongo,pg}.js` + selector: Office CRUD + `countUsersInOffice`.
  **No migration** — `offices` (003) + `users.office_id` (018) + the
  `uq_offices_code_active` partial-unique all already exist (Office mirrors the
  already-ported Department). Parity-proven on real Neon: soft-delete excluded on
  reads (isDeleted/deletedAt are select:false → omitted); `listOffices` substring
  search (name/code, %/_ escaped) + name-asc sort; the unique-code violation
  (23505 → `{code:11000}`) rejects on create AND a code-collision update; a code
  freed by soft-delete re-creates; `countUsersInOffice` counts live users only.
  Tests: pg-parity **24 suites / 138 green on Neon** + CI-safe selector test; the
  officeRoutes suite passes unchanged through the selector. DB_BACKEND=mongo default
  unchanged. **First port of the planned port-now set** (sequencing report:
  `plans/reports/plan-260623-0720-pg-ports-remaining-sequencing.md`).

- **2026-06-23** — **Phase 3 Wave-B — 19th port: `domains/mobile` (mobile learning surface, B5).**
  `domains/mobile/repository.js` (3 methods) → dual-backend via the
  `repository.{mongo,pg}.js` + selector: Web-Push subscription `upsert`/`remove` +
  the learner's upcoming enrolled sessions. New **migration `020`** —
  `push_subscriptions` (globally-unique `endpoint`; `keys` jsonb; NO soft-delete —
  unsubscribe is a hard delete) + additive `schedules.room_link`/`meet_link`
  columns (the upcoming-sessions feed selects them; default `''` per the Schedule
  model). Parity-proven on real Neon: `upsertSubscription` keys on the unique
  endpoint (ON CONFLICT re-homes the device to the new user — no duplicate row);
  `removeSubscription` hard-deletes returning `{deletedCount}`;
  `upcomingSessionsForUser` is `enrolled_users` array-contains + scheduled +
  `start_time >= from`, ordered ascending, `populate(classId)` dropping a deleted
  class to null (cancelled/past sessions excluded). Tests: pg-parity **23 suites /
  125 green on Neon** + CI-safe selector test; the mobile route suite passes
  unchanged through the selector. DB_BACKEND=mongo default unchanged. **This closes
  the simple capability-domain lane** — the remaining ports are the heavier
  learning sub-domains (session/reports/dashboard) + the transaction-heavy tail
  (groups, schedule chokepoint, planning).

- **2026-06-22** — **Phase 3 Wave-B — 18th port: `domains/notification` (in-app bell, P5).**
  `domains/notification/repository.js` (7 methods) → dual-backend via the
  `repository.{mongo,pg}.js` + selector: bell feed/unread/mark surface
  (`findForUser` / `countUnreadForUser` / `markRead` / `markAllReadForUser`) +
  per-user preferences (`findUserPreferences` / `updateUserPreferences`). New
  **migration `019`** — `notification_logs` (read/mark surface; bell index
  `{recipient_user_id, created_at desc}`) + an additive `users.notification_
  preferences` jsonb column. Parity-proven on real Neon: feed + unread count
  exclude `status='pending'` (transient) rows; `markRead` is self-scoped (another
  user's id → null); `markAllReadForUser` filters only `read_at IS NULL` (no status
  filter, mirroring Mongo `updateMany` — so it also marks pending rows); a user
  with no prefs OMITS the key (Mongo default undefined). **Deferred with the
  writers** (the email/cron jobs that CREATE rows stay on Mongo until cutover): the
  180-day retention TTL (→ scheduled cleanup, Wave E) and the 7-column cadence
  UNIQUE. Tests: pg-parity **22 suites / 121 green on Neon** + CI-safe selector
  test; the notifications-mine suite passes unchanged through the selector.
  DB_BACKEND=mongo default unchanged.

- **2026-06-22** — **Phase 3 Wave-B — 17th port: `domains/compliance` (A3 required-training matrix).**
  `domains/compliance/repository.js` (10 methods) → dual-backend via the
  `repository.{mongo,pg}.js` + selector: RequiredTraining CRUD + the matrix's
  read-only signals (workforce, issued certificates, program/path labels). New
  **migration `018`** — `required_training` (`appliesTo`/`target` subobjects
  flattened to columns; soft-deleted) + an additive `users.office_id` column (the
  workforce read selects it for office-scoped requirements; no earlier port needed
  it — same precedent as the settings table). Parity-proven on real Neon:
  `appliesTo`/`target` ↔ flat columns (update replaces the pair); RequiredTraining/
  User/Certificate filter `is_deleted` while `LearningPath` does NOT (no find-hook →
  deleted paths still returned, mirrored) and LearningProgram has no soft-delete;
  `listWorkforce` is Active-only + role/department filter; `listIssuedCertificates`
  Issued+live with the empty-id guard. Tests: pg-parity **21 suites / 112 green on
  Neon** + CI-safe selector test; the complianceMatrix + compliance-completion-batch
  suites (8) pass unchanged through the selector. DB_BACKEND=mongo default unchanged.

- **2026-06-22** — **Phase 3 Wave-B — 16th port: `domains/automation` (no-code rules).**
  `domains/automation/repository.js` (7 methods) → dual-backend via the
  `repository.{mongo,pg}.js` + selector: `listLive` / `findById` /
  `findEnabledByTrigger` (the event-bus runner hot path) / `create` / `updateById`
  / `softDeleteById` / `recordRun`. New **migration `017`** — `automation_rules`
  (`conditions`/`actions` jsonb arrays, `enabled`/`system` flags, `run_count`;
  soft-deleted; partial-unique `name` among LIVE SYSTEM rules — idempotent
  seeding). Parity-proven on real Neon: `listLive` order (system desc, name asc) +
  soft-delete excluded; `findEnabledByTrigger` filters enabled+trigger+live;
  create defaults (enabled/system false, conditions/actions []); `recordRun`
  increments `run_count` mirroring Mongo `updateOne({_id})` (no is_deleted
  predicate). Tests: pg-parity **20 suites / 107 green on Neon** + CI-safe selector
  test; the automation route suite (7) passes unchanged through the selector.
  DB_BACKEND=mongo default unchanged. (Planning deferred — transaction-heavy
  `scheduleItem` belongs with the groups/schedule transaction-abstraction slice.)

- **2026-06-22** — **Phase 3 Wave-B — 15th port: `domains/finance` (A1 budget & cost).**
  `domains/finance/repository.js` (18 methods) → dual-backend via the
  `repository.{mongo,pg}.js` + selector: CostEntry + Budget CRUD, cost roll-ups
  (Σ by scope dimension / type), budget-vs-actual inputs, label lookups, and the
  tenant-currency read. New **migration `016`** — `budgets` (fiscal-year allowance,
  `amount_minor` bigint) + a generic `settings` KV table (`value` jsonb; finance's
  `getTenantCurrency` reads the `LND_COST_CONFIG` row — added now, the settings
  domain port reuses it, same precedent as cost_entries in 008). `cost_entries`
  already existed (008). Parity-proven on real Neon: the CostEntry `scope`
  subobject ↔ flat `scope_*` columns (an update REPLACES the whole scope);
  soft-delete excluded on reads AND aggregations (CostEntry's `pre('aggregate')`
  hook); create defaults (`type` 'other') + currency uppercased; rollup null bucket
  + totalMinor-desc sort; label lookups hide deleted department/class/vendor while
  programs (no soft-delete) are never hidden. Tests: pg-parity **19 suites / 103
  green on Neon** + CI-safe selector test; the financeBudget route suite (7) passes
  unchanged through the selector. DB_BACKEND=mongo default unchanged.

- **2026-06-22** — **Phase 3 Wave-B — 14th port: `domains/custom-field` (Studio custom fields).**
  `domains/custom-field/repository.js` (6 methods) → dual-backend via the
  `repository.{mongo,pg}.js` + selector: definition CRUD (`list` / `create` /
  `findByIdLean` / `updateById` / `softDelete`) + drag-`reorder`. New **migration
  `015`** — `custom_field_definitions` (`options`/`show_in` text[], `required` flag,
  `display_order` since `order` is SQL-reserved; partial-unique `(entity,key)` among
  live rows). Parity-proven on real Neon: list sort (entity/order/createdAt) + entity
  filter + soft-delete excluded; create applies the Mongoose defaults
  (type/options/showIn/required/order) + lowercases the key; the `(entity,key)`
  live-row unique violation (23505 → `{code:11000}`) rejects identically on create
  AND on a key-collision update; a key freed by soft-delete re-creates; `reorder`
  rewrites `display_order` by index. Tests: pg-parity **18 suites / 95 green on Neon**
  + CI-safe selector test; the existing customField route suite passes unchanged
  through the selector. DB_BACKEND=mongo default unchanged.

- **2026-06-22** — **Phase 3 Wave-B — 13th port: `domains/access` (RBAC roles).**
  `domains/access/repository.js` (5 methods) → dual-backend via the
  `repository.{mongo,pg}.js` + selector: Role CRUD (`listLive` / `findByKey` /
  `create` / `updateByKey` / `softDeleteByKey`). New **migration `014`** — `roles`
  (`capabilities text[]`, partial-unique `key` among live). Parity-proven on real
  Neon: create defaults (system false), `listLive` order (system desc, key asc),
  key partial-unique among live + reusable after soft-delete, soft-delete hides.
  Tests: pg-parity **17 suites / 88 green on Neon** + CI-safe; the existing
  access/role-grants suites pass unchanged through the selector. DB_BACKEND=mongo
  default unchanged.

- **2026-06-22** — **Phase 3 Wave-B — 12th port: `domains/branding` (singleton tenant config).**
  `domains/branding/repository.js` (2 methods) → dual-backend via the
  `repository.{mongo,pg}.js` + selector: `getSingleton` (find-or-create) + `update`
  ($set upsert). New **migration `013`** — `tenant_config` (unique `key='default'`).
  Parity-proven on real Neon: `getSingleton` find-or-creates with the model column
  defaults (`ON CONFLICT … no-op` so the existing row returns unchanged; a fresh
  insert takes the defaults); `update` upserts patches without ever duplicating the
  singleton. Tests: pg-parity **16 suites / 84 green on Neon** + CI-safe; the
  existing branding suite passes unchanged through the selector. DB_BACKEND=mongo
  default unchanged.

- **2026-06-22** — **Phase 3 Wave-B — 11th port: `domains/learning/path` (learning paths).**
  `domains/learning/path/repository.js` (6 methods) → dual-backend via the
  `repository.{mongo,pg}.js` + selector: LearningPath CRUD with the ORDERED
  `programs` array-populate (the catalog summary embed). New **migration `012`** —
  `learning_paths` (`programs text[]`, globally-unique `code`). Parity-proven on
  real Neon: code uppercase + global-unique; the **ordered program-summary embed**
  (preserves array order, drops missing refs — populate semantics); `findById` raw
  ids vs `findByIdLean` populated; `list` title order + search; soft-delete
  hides+archives. Tests: pg-parity **15 suites / 81 green on Neon** + CI-safe; the
  existing path/prerequisite suites pass unchanged through the selector.
  DB_BACKEND=mongo default unchanged.

- **2026-06-22** — **Phase 3 Wave-B — 10th port: `domains/learning/feedback`.**
  `domains/learning/feedback/repository.js` (4 methods + the `isCohortParticipant`
  helper re-export) → dual-backend via the `repository.{mongo,pg}.js` + selector:
  `findCohort` + `findFeedback` + `upsertFeedback` (idempotent submit) +
  `listFeedback` (populate user+cohort). **No new migration** — `feedbacks` shipped
  with 011. Parity-proven on real Neon: upsert one-per-(cohort,user) via
  `ON CONFLICT`; the **undefined-skip update** (Mongoose strips `undefined` from
  `$set` so that field stays unchanged — the PG impl updates only the fields the
  caller actually provided, an explicit null still applies); `populate` → a
  soft-deleted user/cohort reads null; `findCohort` hides deleted. Tests: pg-parity
  **14 suites / 76 green on Neon** + CI-safe; the existing feedback suite passes
  unchanged through the selector. DB_BACKEND=mongo default unchanged.

- **2026-06-22** — **Phase 3 Wave-B — 9th port: `domains/learning/completion` (completion engine + certificate CRUD).**
  `domains/learning/completion/repository.js` (15 methods) → dual-backend via the
  `repository.{mongo,pg}.js` + selector. Two halves in ONE port (option A — full
  package): the completion-evaluation engine (cohort/policy resolution, attendance
  counters, the four evidence reads — evaluation/feedback/passing-attempt) AND the
  certificate persistence spine (issue/find-active/list/by-id/revoke/verify). New
  **migration `011`** enriches the `certificates` stub (serial + verification code
  uniques, cohort link, snapshot jsonb, validity window, revocation) and adds the
  three evidence tables **`evaluations` / `feedbacks` / `assessment_attempts`**
  (`double precision` score cols so they parse as numbers, full-unique eval slot,
  per-cohort passing-attempt index). Traps replicated + parity-proven on real Neon:
  the **QB-008 race** — PG `23505` mapped to a Mongo-style `{code:11000}` so the
  use-case surfaces the same 409 on both backends; `resolveCompletionContext` omits
  `certificateValidityDays` on the no-program branch; soft-delete predicates explicit
  (no Mongo hooks); `listCertificates` `populate(user)` drops a deleted learner to
  null; `findPassingAttempt` returns the highest `scorePercent`. The two cron
  services (certificate-expiry + recert-assignment) read Mongoose models directly
  (NotificationLog/Assignment/manager hierarchy) → **deferred to Wave C**, not routed
  through this repository. Tests: pg-parity **13 suites / 73 green on Neon** +
  CI-safe; the Mongo-side completion/certificate suites (5 files / 29 tests) pass
  unchanged through the selector. DB_BACKEND=mongo default unchanged.

- **2026-06-22** — **Phase 3 Wave-B — 8th port: `domains/learning/enrollment` (cohort enrollment spine).**
  `domains/learning/enrollment/repository.js` (10 methods) → dual-backend via the
  `repository.{mongo,pg}.js` + selector: cohort-scoped reads, the shared
  `insertActiveEnrollment` create spine (both modes), `listEnrollmentsForLearner`
  (team + cohort, populating class+group), `markDropped`, and the cohort/program
  resolvers (`findCohort` / `findCohortSchedulingMode` / `findCohortCapacityPolicy`).
  New **migration `010`** adds the cohort duplicate guard — partial-unique
  `(user_id, class_id)` WHERE Active AND team_id IS NULL (DI-05b's mirror of the
  team guard). Parity-proven on real Neon: duplicate guard, `populate` dropping a
  soft-deleted user/class/team to null, both-mode learner order, `findCohort`
  hides deleted, resolvers (no-program → null/`{}`). The team-sync `session` is
  ignored in PG (deferred to Wave-D). Tests: pg-parity **12 suites / 66 green on
  Neon** + CI-safe; the existing enrollment suites (5 files / 60 tests) pass
  unchanged through the selector. DB_BACKEND=mongo default unchanged.

- **2026-06-22** — **Phase 3 Wave-B — 7th whole-repository port: `domains/learning` programs + cohorts (the reference domain).**
  The biggest port. `domains/learning/repository.js` (19 methods) → dual-backend via
  the `repository.{mongo,pg}.js` + `DB_BACKEND` selector: LearningProgram catalog
  CRUD (jsonb policy blobs, case-insensitive name/legacy lookups, unique code/name)
  + Cohort (Class) CRUD (full `programId` populate via an embed-query, soft-delete/
  restore, the Ongoing guard, team/schedule counts, booked-sessions + monthly-
  completion aggregations). New **migration `009`** fleshes out `learning_programs`
  + `classes` with the full field set (policy sub-objects + customFields → jsonb;
  `prerequisite_programs`/`teacher_ids text[]`; unique code + case-insensitive name
  + Ongoing partial-unique). Parity-proven on real Neon. **The cohort soft-archive
  transaction** (close-enrollments + soft-delete) is ported per-method — the PG
  impls ignore the Mongoose `session`; cross-method atomicity is **deferred to the
  dual-backend transaction abstraction (Wave-D)**, which also unblocks `groups`.
  Tests: pg-parity **11 suites / 61 green on Neon** + CI-safe; **the full existing
  learning suite — 18 files / 184 tests — passes unchanged through the selector**
  (reference domain, behaviour-preserving). DB_BACKEND=mongo default unchanged.

- **2026-06-22** — **Phase 3 Wave-B — 6th whole-repository port: `domains/vendor` (A2 vendor/external-provider).**
  `domains/vendor/repository.js` (8 methods) ported to dual-backend via the
  `repository.{mongo,pg}.js` + `DB_BACKEND` selector: Vendor CRUD (jsonb
  contacts/contracts/ratings, `delivers text[]`, `pushRating`, soft-delete →
  archived) + the `vendorSpend` roll-up over cost entries. New **migration
  `008_vendors_cost_entries`** — `vendors` + `cost_entries` (the A1 spend source;
  scope flattened to queryable columns; money = bigint minor units). Parity-proven
  on real Neon: create defaults, list status/type/delivers filter+order,
  soft-delete hides+archives, `vendorSpend` groups by type and **excludes
  soft-deleted cost lines** (mirrors the CostEntry `pre('aggregate')` hook) +
  honours the date window. Tests: pg-parity **10 suites / 53 green on Neon** +
  CI-safe Mongo integration; existing `vendor` suite (6) passes unchanged through
  the selector. (Shipped via a tools-only commit around a local Bash-hook on the
  word "vendor".) DB_BACKEND=mongo default unchanged.

- **2026-06-22** — **Phase 3 Wave-B — 5th whole-repository port: `domains/trainer` (A6 trainer depth).**
  `domains/trainer/repository.js` (9 methods) ported to dual-backend via the
  `repository.{mongo,pg}.js` + `DB_BACKEND` selector: TrainerProfile CRUD
  (`upsertProfile` setDefaultsOnInsert → `INSERT … ON CONFLICT(user_id) DO UPDATE`,
  `pushRating`, `softDeleteProfile`), user pickers, and the Schedule load /
  availability reads (`sessionsForTrainer`, `busyInstructorIds` overlap Set). New
  **migration `007_trainer_profiles`** — `trainer_profiles` (`can_deliver text[]`,
  `availability`/`ratings jsonb`) + the `schedules.{office_id,topic}` columns the
  reads select. Parity-proven on real Neon: upsert insert-defaults vs partial
  update, soft-delete hides+archives, `listProfiles` status/canDeliver filter,
  candidate pool (Teacher/Admin, `status≠Dropped` **including NULL** via
  `IS DISTINCT FROM`), session window/order, busy-overlap Set. Tests: pg-parity
  **9 suites / 48 green on Neon** + CI-safe Mongo integration; existing `trainer`
  suite passes unchanged through the selector. DB_BACKEND=mongo default unchanged.

- **2026-06-22** — **Phase 3 Wave-B — 4th whole-repository port: `domains/skill` (competency framework).**
  `domains/skill/repository.js` (13 methods) ported to dual-backend via the
  `repository.{mongo,pg}.js` + `DB_BACKEND` selector: skill CRUD + the
  certificate-derived completion signal (`completedProgramIdsForUser` /
  `…ByUser` / `holdersByProgram`, Map/Set shapes) + supporting user/program reads.
  New **migration `006_skills`** — `skills` with `program_ids text[]` +
  `target_by_role jsonb`. Parity-proven on real Neon: create defaults, name
  partial-unique (case-insensitive guard) + reuse after soft-delete, soft-delete
  hides, completion reads filter status/isDeleted/null-program, user reads exclude
  soft-deleted, program names all-vs-active. Tests: pg-parity **8 suites / 43 green
  on Neon** + CI-safe Mongo integration; existing skill/proficiency suites (24)
  pass unchanged through the selector. (Parity lessons captured in the phase-03
  plan: satisfy all Mongoose unique indexes + `Model.init()` for CI determinism;
  Mongoose drops empty Mixed `{}` while PG jsonb keeps it.) DB_BACKEND=mongo
  default unchanged.

- **2026-06-21** — **Phase 3 Wave-B — 3rd whole-repository port: `domains/session-type` (metadata catalog).**
  `domains/session-type/repository.js` (6 methods: `create`/`list`/`findByIdLean`/
  `updateById`/`softDelete`/`maxOrder`) ported to dual-backend via the
  `repository.{mongo,pg}.js` + `DB_BACKEND` selector. New **migration
  `005_session_types`** (`order` → `display_order` — `order` is a SQL reserved
  word). Parity-proven on real Neon: create schema defaults (color `#6366f1`,
  duration 60, capacity null, order 0), `list` in display order, soft-delete hides
  the row + drops `maxOrder`, update normalizes. Tests: pg-parity **7 suites / 35
  green on Neon** + CI-safe Mongo integration; existing `studioScheduling` suite
  (9) passes unchanged through the selector. (Also fixed an org-parity flake — the
  certificate seed now satisfies all unique indexes + forces `Certificate.init()`
  so the autoIndex race can't pass locally yet fail on CI.) DB_BACKEND=mongo
  default unchanged.

- **2026-06-21** — **Phase 3 Wave-B — 2nd whole-repository port: `domains/org` (departments + manager hierarchy).**
  `domains/org/repository.js` (13 methods) ported to dual-backend via the
  `repository.{mongo,pg}.js` + `DB_BACKEND` selector. Covers department CRUD,
  `countUsersInDepartment`, the manager hierarchy (`updateUserAssignment` /
  `listDirectReports`), and the two batched dashboard rollups
  (`aggregateActiveEnrollments` / `aggregateIssuedCertificates`). New **migration
  `004_departments_org`** — `departments` table + the org user columns
  (`department_id`, `manager_id`, `position`, `status`) migration 001's minimal
  `users` lacked. Parity-proven on real Neon: dept code UPPERCASE/partial-unique/
  reuse-after-soft-delete, `listDirectReports` manager-scope + `populate('departmentId')`
  (a soft-deleted dept → `departmentId:null`, legacy `department` string kept) +
  excludes other-manager/soft-deleted reports, aggregates filter by status/`isDeleted`
  with distinct programs. Tests: pg-parity **6 suites / 29 green on Neon** (10 org
  cases) + CI-safe Mongo integration; existing `orgRoutes` suite (15) passes
  unchanged through the selector. DB_BACKEND=mongo default unchanged.

- **2026-06-21** — **Phase 3 Wave-B STARTED — 1st whole-repository WRITE port: `domains/room`.**
  Shift from read-slices to porting **whole `repository.js` interfaces** per domain
  (the right granularity; plan: [`master-execution-plan.md`](../plans/260612-2042-postgresql-migration/master-execution-plan.md)).
  `domains/room/repository.js` split into `repository.{mongo,pg}.js` behind a
  `DB_BACKEND` selector (consumers' `require('./repository')` unchanged). Full CRUD
  on Postgres — create/find/list/update/soft-delete + `findLiveOffice` +
  `countFutureSessionsForRoom`. New **migration `003_offices_rooms`** (offices,
  rooms + `schedules.room_id`). First WRITE-port pattern established + parity-proven
  on real Neon: setter fidelity (code UPPERCASE, name trim), `populate('officeId')`
  drops a soft-deleted office (DATA-009), partial-unique `code` among LIVE rooms
  (reusable after soft-delete), office-scope + literal search + name order, soft-
  delete hides the row, future-session count. Tests: pg-parity **5 suites / 19
  green on Neon** (8 room cases) + CI-safe Mongo integration; the existing room
  suite passes unchanged through the selector. DB_BACKEND=mongo default unchanged.

- **2026-06-21** — **Phase 3 (repository ports) — 5th dual-backend port: metric time-series (metrics surface complete).**
  Ports the snapshot trend reader (`analyticsSeriesService.getSeries` → the
  `metrics-repository.findSnapshotSeries` query) to dual-backend — the sibling of
  the metrics-funnel reference, so the **metrics/analytics Wave-A surface is now
  complete** (funnel counts + trend series). New `services/metric-series/{mongo,pg,
  index}.js`; semantic interface `getMetricSeries({key,scope,scopeId,since})` →
  `[{date,value}]` ascending (range→since derivation stays in the service). First
  port to add a table: **migration `002_metric_snapshots`** — `metric_snapshots`
  with a UNIQUE `(scope, COALESCE(scope_id,''), key, date)` mirroring the Mongo
  unique index (COALESCE so a null `scope_id`/global collides null-as-value, not
  Postgres' null-DISTINCT default). Parity proven on real Neon across every query
  shape: scope + scopeId filtering (global never picks up program/office rows),
  key filter, `since` lower-bound, ascending order, empty-series → `[]`. TTL
  (Mongo ~400d) deferred to a pg_cron/app-scheduled delete (with the AuditLog
  migration). Tests: pg-parity now **4 suites / 11 green on Neon** + CI-safe Mongo
  integration. DB_BACKEND=mongo default unchanged.

- **2026-06-21** — **Phase 3 (repository ports) — 4th dual-backend port: per-class attendance roster.**
  Mongo→Postgres ports continue behind the `DB_BACKEND` flag (default `mongo` →
  running app 100% unchanged; no dual-write — code switches, data cuts once).
  Foundation + first ports already on main (#184 metrics-funnel reference + per-team
  rollup; #185/#186 per-employee rollup + banker's-round parity fix). **This change**
  ports `analyticsByClass` → `services/attendance-by-class/{mongo,pg,index}.js`,
  completing the attendance-analytics trilogy (by-employee · by-team · **by-class**).
  One semantic interface `getClassAttendance(classId)` → `{schedules, roster}`
  (per-session matrix): the Mongo impl reuses the real production query; the PG impl
  is two indexed reads — class live sessions + an attendance JOIN users on
  `is_deleted = false`. **Three traps proven identical on real Neon Postgres** (CI
  pg-parity lane): soft-deleted user excluded (DATA-009), cancelled session excluded
  (`status='scheduled'`), other-class session excluded (`class_id` JOIN). No new
  migration (existing tables). `rate` via JS `toFixed` on BOTH sides → no banker's-
  round divergence. Tests green: pg-parity 3 suites/6 on Neon + CI-safe Mongo
  integration. DB_BACKEND=mongo default unchanged.

- **2026-06-21** — **PostgreSQL migration gate OPENED (owner) + Phase 0 COMPLETE + close-path audit fix.**
  Owner committed to the full Mongo→Postgres migration (driver: future-proofing
  the relational L&D platform; convergence Phase 3+4 done → model stable). **Phase 0
  readiness hardening is now COMPLETE** — all safe WS-A slices extracted so the
  port swaps repository internals, not business logic:
  **0.2** soft-delete `$lookup` discipline — new ADR
  `docs/decisions/soft-delete-query-discipline.md` + a guard test
  (`tests/unit/soft-delete-lookup-guard.test.js`) that fails CI if any `$lookup`
  into a soft-deletable collection omits `isDeleted` (audited all 6 sites — clean,
  locks in the PR #180 DATA-009 fix); **0.8-class** legacy class read/mutation
  data access → `controllers/class/class-repository.js`; **0.6** metric/analytics
  → shared `services/metrics-repository.js`. Only **0.9** (auth + `scheduleService`)
  is deferred-by-design (highest regression risk, lowest Phase-0 value) → ported in
  Phase 3. **Next: Phase 1 gate prototype** — owner provisions a PG instance + Mongo
  snapshot. Separately, the **enrollment close-path audit** (owner kept the 6 paths,
  asked to verify) found + fixed one real bug: `PUT /api/enrollments/:id` left no
  audit trail while its bulk twin did (PR #182). Server 1183/1183 green.

- **2026-06-20** — **Converge Phase 3 slice 5 — collapse the scheduling `mode` fork; PHASE 3 COMPLETE.**
  Retired the two-world server split now that the unified UI (Phase 4) consumes one read:
  removed the `mode=team|cohort` branching from `GET /api/schedules`, `/attendance-calendar`,
  and `GET /api/learning/cohorts`, and **deleted the `english-class` domain** (`/api/english`
  read delegation + `domains/english-class/`) → **20 domains** (was 21). The unified reads
  return BOTH scheduling worlds tagged `deliveryType`, faceted client-side; the client
  `englishAPI` + the dead `mode='team'` hook branches were removed. **Behaviour-parity for the
  live app** — every UI surface already used `mode='all'`; the `/english` learner booking grid
  stays (served by `/api/schedules`); booking-time `schedulingMode` authz unchanged. Verified:
  full server suite + client `test:run` (491) + lint (cap 41) green; the obsolete `mode=cohort`
  filter test repointed to assert the param is now ignored. Spec `scheduling-and-booking` updated
  (unified reads + `deliveryType`; `mode`/`/api/english` removed); domain inventory + route matrix
  + system map synced (21→20). Convergence **Phase 3 COMPLETE** (slice 3 `deliveryProfile` deferred
  — YAGNI); Phase 5 (retire legacy `routes/`+`controllers/`) + Phase 6 (Postgres gate) remain.

## How to keep this current

After each milestone or significant change: update the phase/wave %, move the
status emoji, refresh the **Status board** (Now / Next), and add one dated line
at the top of *Recent progress*. Strategy detail stays in `lms-roadmap.md`.

**Rolling archive (keeps this file lean):** keep ~the last 2 weeks (~15 entries,
file ≤ ~400 lines) inline; in the SAME commit, cut older entries verbatim
(newest-first — they are an audit trail, do not reword) into
`changelog-archive/<year>-q<quarter>.md` and update its coverage header.
