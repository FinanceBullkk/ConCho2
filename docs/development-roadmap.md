# Development Roadmap — TMS v2 → Internal LTMS (living tracker)

> **Canonical progress tracker.** Status board first, then milestone tables,
> then the recent changelog. Full history → [`changelog-archive/`](changelog-archive/).
> - *Why / strategy / 6-month direction* → [`lms-roadmap.md`](lms-roadmap.md)
> - *Architecture / orientation* → [`system-overview.md`](system-overview.md)
> - *Detailed task snapshot (archived)* → [`archive/handoff-2026-06-01.md`](archive/handoff-2026-06-01.md)
>
> **Last updated:** 2026-07-10

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
- **Now:** **Phase 6 PostgreSQL migration — prod cutover + Wave K activation COMPLETE.**
  Owner opened the gate 2026-06-21; production cut over to PostgreSQL/Neon on
  2026-07-08 and K1b Mongo-less boot/read-straggler enablement merged
  2026-07-09. Owner removed `MONGO_URI` on Render and redeployed 2026-07-09;
  verified prod Mongo-less readiness (`/ready` 200 `backend=postgres`) and
  Mongo-only admin DB route 410. **Remaining owner-only irreversible step:**
  cancel Atlas after final comfort check. Historical
  port trail: Phase 0 readiness COMPLETE; foundation on main (#184). **Phase 3
  repository ports** — each repo moved behind the `DB_BACKEND`
  flag, CI-proven Mongo==PG. **Wave A
  read-only DONE (5 ports):** metrics-funnel + metric time-series (metrics surface
  complete) · per-team/employee/class attendance rollups (trilogy complete).
  **Wave B (whole-repository CRUD) IN PROGRESS:** room (#6) + org (#7) + session-type (#8) + skill (#9) + trainer (#10) + vendor (#11) + **learning programs+cohorts (#12)** + **learning/enrollment (#13)** + **learning/completion (#14)** + **learning/feedback (#15)** + **learning/path (#16)** + **branding (#17)** + **access (#18)** + **custom-field (#19)** + **finance (#20)** + **automation (#21)** + **compliance (#22)** + **notification (#23)** + **mobile (#24)** + **org/office (#25)** + **assessment/question-bank (#26)** + **report-presets (#27)** + **executive-dashboard (#28)** + **dashboard (#29)** + **learning/assignment (#30)** done. **Port-now set** (sequencing report `plans/reports/plan-260623-0720-*`): office ✓ · question-bank ✓ · report-presets ✓ · executive-dashboard ✓ · dashboard ✓ · learning/assignment ✓ (mig 023) · attendance ✓ (mig 025) · learning/reports ✓ (no new mig) · assessment ✓ (mig 026) — **port-now set COMPLETE**. **Transaction tail IN PROGRESS:** schedule chokepoint **repo + orchestration + read-path FULLY dual-backend** — S0 tables + S1 reads + S2 waitlist + S3a 12 txn methods + S3b-1 create/cancel cutover + S4 FIFO promotion + S3b-2 updateSchedule cutover + **S5 read-path completion (the last 6 Mongo-direct re-fetches in `scheduleService` — booking/admin-create response, cancel load + leader-auth + waiter emails — routed through 3 new dual-backend reads `findScheduleForResponse`/`findScheduleForCancellation`/`findTeamLeaderId` + reused `findUsersForEmail`; `scheduleService` now has ZERO direct Mongoose)** ✓ (mig 027) → **the booking chokepoint runs end-to-end on either backend.** **planning ✓ (mig 028 — the TNA `scheduleItem` 4-write transaction cut over to the UoW; finance `createBudget` now tx-aware on both backends)**. The transaction-heavy tail (`groups` · schedule chokepoint · `planning`) is DONE — the dual-backend transaction abstraction (`domains/_shared/unit-of-work`, parity-proven 2026-06-25 on real Neon) carried all of them — and **learning/session ✓ (2026-07-03, no new mig — read-only 9-method port: the list/detail 6-way populate hydration + booking-adapter context reads; writes were already dual-backend via the sealed `scheduleService` chokepoint) → Phase 3 repository ports COMPLETE. **Wave E (auth & audit) COMPLETE 2026-07-04** — E1 audit write path ✓ (mig 029 `audit_log`: hash chain through `services/audit-repository.{mongo,pg}`, 8/8 Neon parity + 48/48 Mongo audit suites) · E2 retention purge job ✓ (nightly PG DELETE mirroring the Mongo TTLs — audit_log 730d / notification_logs 180d / metric_snapshots 400d, 5/5 Neon) · E3 auth login + middleware reads ✓ (mig 030: 13 users security columns, atomic lockout roll ⇄ CASE UPDATE, fixed-projection security readers, 6/6 Neon + 37/37 Mongo auth suites) · E4 auth mutations ✓ (password change/reset + MFA lifecycle + admin overrides through the same seam; atomic single-use reset consume; 6/6 Neon + 54/54 Mongo). **Wave F (legacy tail) PR-1 ✓ 2026-07-04** — 6 Phase-0 seams dual-backend (dashboard-stats 14-query bundle mig 031 · class · metrics · audit-query · evaluation-export · search; 28/28 Neon parity + 79/79 Mongo consumer suites; 3 ports via a parallel agent lane). Ledger for F-PR-2 (attendance-export pipeline refactor · user-mutations auto-release hook) + ops dispositions in `phase-03-repository-ports.md`. **Wave G lane LIVE 2026-07-04** (`server-tests-pg` informational — first inventory: 91/208 suites already green on Postgres; 117 to work down, then promote to required gate #8). **Wave G COMPLETE 2026-07-07 — the full-suite Postgres lane is green and PROMOTED to REQUIRED gate #8.** Batches 1–16 worked the PG lane from 117 → 0 workable failing suites (shared-fixture foundation → app-gap clusters → the GATED schedule roster-sync/waitlist cluster: Slices 0/A/B+C/D/E — `syncSchedulesForTeamUpdate` + User auto-release ported to the dual-backend `domains/schedule/roster-sync`, enrollment-transfer response/note/junction dual-backend, everything else reverse-asserts on already-dual chokepoints). `server-tests-pg` is now REQUIRED (`ci.yml`). **Wave F PR-2 landed the same day** — attendance-export ported to dual-backend semantic methods (`p2-regression` green both lanes) and the gate-#8 exclusion was DROPPED → **the required PG gate runs the whole suite, zero exclusions; Wave F fully closed** (the user-mutations blocker was retired by the Slice-B/C roster-sync port; those write seams follow with `importService` when touched). Two deferred follow-ups tracked as issues: PG-lane transfer atomicity (#255) + `notifyPromotions` Mongo-only (#256) — **both closed 2026-07-07/08.** **Phase-05 "zero raw-Mongoose write" gate COMPLETE 2026-07-08** (PRs #261–#267): every inventoried write ported (sections A/B/D; reconcile + adminDb explorer RETIRE at cutover/Wave-K), the **F3 write-gate machine-enforces the invariant on CI gate #8**, ETL + FK-hardening + private-repo pg_dump backup are merged and **rehearsed end-to-end** (dry-run: counts matched, 0 dangling refs, 10MB ≪ Neon-free gate). **Wave J CUTOVER EXECUTED 2026-07-08 — prod is LIVE on PostgreSQL / Neon** (PG 17.10, ap-southeast-1). Fresh-start path (owner: no real users/data yet → seed → ETL to Neon → mig 036 (30 FK/35 CHECK) → local smoke → owner flipped Render `DB_BACKEND=postgres` → flip confirmed on prod via a write-probe landing in Neon). Daily encrypted `pg_dump` backup enabled. **Now → 1-week bake** (Atlas `tms2` untouched as fallback, fix-forward); **Next → Wave K decommission** (owner-scheduled after bake: drop Mongoose models + memory test harness + `DB_BACKEND` switch, cancel Atlas). Follow-ups: `/ready` PG probe; cron-pinger resume. Checklist: `plans/260612-2042-postgresql-migration/cutover-checklist.md`.
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
| 6 | PostgreSQL migration / Wave K decommission | ~95% | 🟡 prod on PG + Atlas cancelled (Wave J 2026-07-08: Render `DB_BACKEND=postgres`, writes verified in Neon PG 17.10, mig 036 FK/CHECK applied, daily encrypted `pg_dump`; Wave K activation 2026-07-09: `MONGO_URI` removed, `/ready` 200 `backend=postgres`, `/api/admin-db` 410; **Atlas cancelled 2026-07-10**). Wave K Phase 2: A PG seed + B e2e-on-PG + **C Mongo CI gate retired (8→7)** + **D1a PG-only boot** + **D1b deleted 44 `.mongo.js` + 129 Mongo test/scaffolding files** + **D2a reconcile/admin-db feature fully retired (client + remnants + docs)** + **D2b runtime (non-model) mongoose removed** + **D2c fixture foundation** + **D2d suite decouple batches 1–24 (ALL mechanical suites — `assessmentRoutes` closed the tail 2026-07-13)** done. Remaining: **D2d re-home tail** (2 model-behaviour suites left — `autoReleaseScope` + `auditDataRound2` re-homed 2026-07-13; still `dataIntegrity`/`phaseAHardening`) → **D2e** — drop `mongoose`/`mongodb-memory-server`, delete the 35 models (re-homes the AuditLog entity-enum + its coverage unit test with them). |

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
> [`changelog-archive/`](changelog-archive/) (per-quarter files). Currently
> inline: **2026-07-12 → 2026-07-13** (07-11 rolled 2026-07-13, 07-10 rolled 2026-07-13,
> 07-04 E4 → 07-09 rolled 2026-07-12,
> 07-04 E1–E3 rolled 2026-07-08, 07-02→07-03 rolled 2026-07-07 →
> [`2026-q3.md`](changelog-archive/2026-q3.md); 06-20→06-27 rolled 2026-07-07;
> 06-14→06-19 rolled 2026-07-04 → [`2026-q2.md`](changelog-archive/2026-q2.md)).

- **2026-07-13** — **Wave K Phase 2 · Batch D2d batch 26 — `auditDataRound2` re-homed off Mongoose (2nd re-home suite).**
  DATA-012 stopped probing the raw `User.distinct(...)` query middleware (that
  abstraction dies with the model at D2e) and now asserts the REAL app contract:
  `GET /api/dashboard/filter-options` → `dashboard-stats-repository.pg.getFilterDistincts`
  (its `WHERE is_deleted = false` is the PG twin of the Mongo distinct hook). The
  cached route is flushed (`invalidateAnalyticsCache`) between the before/after
  reads so the soft-delete is observed; the Mongo-only "explicit `{isDeleted:true}`
  escape hatch" is re-expressed as a direct PG trash read (`distinctActiveValues`,
  `is_deleted = true`) — no data-loss, no middleware needed. DATA-013 already drove
  the HTTP import routes (`/api/import/users|classes`, trash-guard via
  `userRepo.findTrashedUserEmpCodes` / `classRepo.findTrashedClassesByKeyPairs`,
  both PG); only its fixtures move to `fx.createUser`/`fx.createClass` (with
  `isDeleted:true`). No `mongoose`/model require left. Also rolled the four
  **2026-07-11** entries verbatim to [`2026-q3.md`](changelog-archive/2026-q3.md)
  (roadmap 398→319 lines). Verified on the PG lane: 3/3, write-gate clean. Pure
  test-infra, no app/spec change. Remaining re-home tail: `dataIntegrity` +
  `phaseAHardening` → then **D2e**.
- **2026-07-13** — **Wave K Phase 2 · Batch D2d batch 25 — `autoReleaseScope` re-homed to the PG user-drop path (1st of 4 re-home suites).**
  The BUG #1 regression (dropping a user must NOT sweep OTHER teams' empty
  placeholder schedules) stopped firing the drop via the Mongoose
  `User.findOneAndUpdate` `post` hook — which vanishes at D2e — and now drives it
  through the REAL PG path: `PUT /api/users/:id` status→Dropped →
  `controllers/user/user-mutations-repository.pg.updateById` (status change to
  Dropped) → `domains/schedule/roster-sync.releaseUserFromFutureSchedules`
  (awaited inline; releases the user's future schedules, FIFO-promotes, sweeps
  still-empty sessions). Fixtures PG-native (`fx.createClass/createUser/createTeam/
  createSchedule`); assertions unchanged (`readActiveRow` — schedA swept → null,
  placeholder survives). **Zero coverage loss** — same cascade, real runtime trigger
  instead of the Mongoose hook. No `mongoose`/model require left. Verified on the PG
  lane: 1/1, write-gate clean. Pure test-infra, no app/spec change. Remaining
  re-home tail: `dataIntegrity` (Mongo E11000 unique / `pre('validate')` / aggregate
  hook — assert the PG constraint/WHERE equivalents), `phaseAHardening`
  (`User.pre('save')` bump / importService / soft-delete joins), `auditDataRound2`
  (`distinct` middleware / import trash-guard) → then **D2e**.
- **2026-07-13** — **Wave K Phase 2 · Batch D2d batch 24 — `assessmentRoutes` off Mongoose (the LAST mechanical suite).**
  The assessment API integration suite (authoring / attempts / grading / question-bank /
  completion-policy — 23 tests) drops all 6 `../../models/*` requires
  (`Assessment`/`AssessmentAttempt`/`AssessmentQuestion`/`Schedule`/`Class`/`LearningProgram`).
  `afterEach` cleanup → `deleteActiveRowsWhere` (incl. `AssessmentQuestion`, resolved
  reflectively to `assessment_questions` — no explicit mapper needed) + the `Class`
  reset (`updateMany $in` → two `updateActiveRow('Class', …, { programId: null, teacherIds: [] })`).
  `seedRoster` `Schedule.create` → `fx.createSchedule`; the two completion-policy
  program fixtures `LearningProgram.create` → `fx.createLearningProgram`; the
  teacher-scope + program binds (`Class.findByIdAndUpdate`) → `updateActiveRow('Class', …)`.
  **This closes the D2d MECHANICAL tail** — every remaining D2d suite is now a
  model-behaviour re-home. Also rolled the six **2026-07-10** entries
  (D1a/D1b/C/B/A + scope-trim) verbatim to [`2026-q3.md`](changelog-archive/2026-q3.md)
  (roadmap 453→362 lines). Pure test-infra, no app/spec change. Verified on the PG
  lane: 23/23, write-gate clean. Remaining D2d: the 4 model-behaviour re-home suites
  `dataIntegrity`/`phaseAHardening`/`auditDataRound2`/`autoReleaseScope` → then **D2e**
  (drop `mongoose`/`mongodb-memory-server`, delete the 35 models + re-home the
  AuditLog entity-enum + `auditEntityEnumCoverage` unit test with them).
- **2026-07-12** — **Wave K Phase 2 · Batch D2d batch 23 — branding/reports-presets/cert-expiry cluster off Mongoose (3 suites).**
  `branding` (TenantConfig singleton + cert-verify branding surface: `Certificate.create`
  → `fx.createCertificate`, cleanup → `deleteActiveRowsWhere`, incl. the reflective
  `tenant_config` table resolve) + `reportsEvidencePackPresets` (evidence-pack xlsx +
  preset CRUD: `deleteMany` cleanups → `deleteActiveRowsWhere`, `$in` audit-entity
  filter supported) + `certificateExpiryReminders` (D6 expiry cadence/idempotency/
  manager digest: fixtures → `fx.createCertificate`, User email/managerId scaffolding
  → `updateActiveRow` with manager id as STRING, and the Mongo-only
  `NotificationLog.init()`/`Certificate.init()` index builds dropped — cadence
  idempotency is enforced by the `notification_logs` dedupe unique index, mig 032).
  All three files drop every `../../models/*` require. **`auditEntityEnumCoverage`
  (unit) stays on the model require BY DESIGN** — it reads
  `AuditLog.schema.path('entity').enumValues`, the SAME canonical enum source the
  runtime PG repo (`services/audit-repository.pg.js`) validates against (mig 029
  decision: no CHECK, app-side ratchet) — it re-homes with the enum, not with the
  fixture decouple. Also rolled the 07-04 E4 → 07-09 changelog entries to
  [`2026-q3.md`](changelog-archive/2026-q3.md) (762→~450 lines). Pure test-infra,
  no app/spec change. Verified on the PG lane (18/18 across the 3 suites,
  write-gate clean). Remaining D2d mechanical: `assessmentRoutes` (batch 24);
  re-home cluster: `dataIntegrity`/`phaseAHardening`/`auditDataRound2`/`autoReleaseScope`.
- **2026-07-12** — **Wave K Phase 2 · Batch D2d batch 22 — booking + assignment-reminder suites off Mongoose (2 suites).**
  `booking` (leader book-slot: weekly cap, overlap, capacity gate, cancel,
  enrolledCount virtual) + `assignmentReminderRoutes` (due-soon/overdue/manager-digest
  reminder service + cron route) now author fixtures via `fx.create*` and
  mutate/clean/count via active-backend helpers (`addAllowedTimeSlot`,
  `deleteActiveRowsWhere`/`deleteActiveRowsLike`/`updateActiveRow`/`countActiveRowsWhere`).
  `booking` drops its dead `if (!isPostgres)` Mongo-only virtual-shape block (the
  Mongo lane is retired) and the `config/db-backend` import; a nested
  `capacityPolicy.maxParticipantsPerSession` bump sets the whole jsonb object.
  `assignmentReminderRoutes` drops the Mongo-only `NotificationLog.init()` and
  routes `setUser`/factories through fx + `updateActiveRow` (manager id as STRING).
  All model requires gone from both files. Pure test-infra, no app/spec change.
  Verified on the PG lane (22/22 across the 2 suites, write-gate clean). **This
  closes the Setting-dependent cluster.** Remaining D2d: the model-behaviour
  "re-home" set (`dataIntegrity`, `phaseAHardening`, `auditDataRound2`,
  `autoReleaseScope`), the unit `auditEntityEnumCoverage` (schema-enum read, waits
  for D2e), and suites needing new mappers (`branding`/TenantConfig,
  `reportsEvidencePackPresets`/ReportPreset, `assessmentRoutes`/AssessmentQuestion)
  + `certificateExpiryReminders`.
- **2026-07-12** — **Wave K Phase 2 · Batch D2d batch 21 — Setting/booking cluster off Mongoose (3 suites + shared helper).**
  New shared `addAllowedTimeSlot(slot)` helper in `pg-test-utils` — the PG-native
  `$addToSet` for the `ALLOWED_TIME_SLOTS` booking setting (reads the jsonb array,
  appends the `{sh,sm,eh,em}` slot if absent, `updateActiveRow`) — replacing the
  per-suite `Setting.findOneAndUpdate` fixture and unblocking the whole
  booking-slot cluster. `schedulingModeLegacy` (legacy schedulingMode gate) +
  `goldenPathFlow` (core L&D loop smoke) + `sessionTrainers` (trainer assign +
  attendance UNION) now author fixtures via `fx.create*` (incl. `createOffice`/
  `createUser`) and mutate/clean/count via active-backend helpers
  (`deleteActiveRowsWhere`/`updateActiveRow`/`countActiveRowsWhere`, `Team` read via
  `readActiveRow`). Array-id `teacherIds` set as STRING ids. All three files drop
  every `../../models/*` require. Pure test-infra, no app/spec change. Verified on
  the PG lane (15/15 across the 3 suites, write-gate clean). Remaining Setting
  suite: `booking` (batch 22).
- **2026-07-12** — **Wave K Phase 2 · Batch D2d batch 20 — schedule-query/assessment/regression cluster off Mongoose (3 suites).**
  `assessmentResultsMine` (unified results read) + `scheduleQueries`
  (sessionNumber + attendance-calendar + deliveryType + trainer visibility) +
  `p2-regression` (export-range/enrollment-drop/import-guard) now author fixtures
  via `fx.create*` and mutate/clean scaffolding through active-backend helpers
  (`deleteActiveRowsWhere`/`updateActiveRow`, `$in` filters supported) instead of
  `Model.create`/`deleteMany`/`deleteOne`/`updateMany`. Array-id `teacherIds` set
  as STRING ids. All three files drop every `../../models/*` require. **Deferred
  as re-home-not-mechanical** (grouped with `dataIntegrity`/`phaseAHardening`/
  `auditDataRound2`): `autoReleaseScope` — it drives the User `post('findOneAndUpdate')`
  Mongoose hook cascade against Mongo-resident data, which PG-native fixtures
  can't trigger; needs a rewrite against the ported drop path. Pure test-infra, no
  app/spec change. Verified on the PG lane (23/23 across the 3 suites, write-gate
  clean).
- **2026-07-12** — **Wave K Phase 2 · Batch D2d batch 19 — auth/user + cohort-enrollment cluster off Mongoose (4 suites).**
  `auth` (forced password change) + `passwordReset` (forgot/reset flow, 11
  `findByIdAndUpdate`→`updateActiveRow`) + `softDeleteEmpCodeReuse` (dead `User`
  require dropped) + `learningEnrollmentRoutes` (cohort enroll + bulk) now author
  fixtures via `fx.create*` and mutate/clean scaffolding through active-backend
  helpers instead of `Model.create`/`deleteMany`/`updateMany`/`findByIdAndUpdate`.
  Dropped the Mongo-only `Enrollment.init()` index build (PG enforces its own
  partial unique for the concurrent-enroll race test). All four files drop every
  `../../models/*` require. Pure test-infra, no app/spec change. Verified on the
  PG lane (49/49 across the 4 suites, write-gate clean).
- **2026-07-12** — **Wave K Phase 2 · Batch D2d batch 18 — audit-round/enrollment/recert cluster off Mongoose (4 suites).**
  `auditFlowsRound3` (FLOW-001/BUG-003) + `auditPerfRound4` (PERF-014 session
  cache) + `myEnrollments` (unified enrollment read) + `recertAssignment` (D6
  recert auto-assign) now author fixtures via `fx.create*` and read/clean via
  active-backend helpers (`findActiveRowWhere`/`deleteActiveRowsWhere`) instead of
  `Model.create`/`deleteMany` + `Schedule.findOne().lean()`. Dropped the Mongo-only
  `Assignment.init()` index build (PG enforces its own partial unique). All four
  files drop every `../../models/*` require. **Skipped as re-home-not-mechanical**
  (grouped with `dataIntegrity`/`phaseAHardening`): `auditDataRound2` (DATA-012
  tests the Mongoose `distinct` soft-delete hook directly) + the unit
  `auditEntityEnumCoverage` (reads `AuditLog.schema` enum metadata, not a DB op —
  stays until D2e deletes the models). Pure test-infra, no app/spec change.
  Verified on the PG lane (22/22 across the 4 suites, write-gate clean).
- **2026-07-12** — **Wave K Phase 2 · Batch D2d batch 17 — export/sync cluster off Mongoose (4 suites).**
  `exportRoutes` (DATA-009 leak guard) + `exportRowCap` (PERF-001) +
  `exportFormulaInjection` (SEC-004) + `syncGoogleSheets` now author fixtures via
  `fx.create*` and mutate/count/clean scaffolding through active-backend helpers
  (`deleteActiveRowsWhere`/`countActiveRowsWhere`/`updateActiveRow`) instead of
  `Model.create`/`insertMany`/`deleteMany`/`updateMany`/`findByIdAndUpdate` and the
  raw `Class.collection.insertOne`/`updateOne` + `Evaluation.collection.insertOne`
  paths. `seedAttendance` now returns the created rows so the re-export test flips
  `syncStatus` by id via `updateActiveRow`; row-cap PENDING/EXPORTING asserts use
  `countActiveRowsWhere`. All four files drop every `../../models/*` require. Pure
  test-infra, no app/spec change. Verified on the PG lane (37/37 across the 4
  suites, write-gate clean).
- **2026-07-12** — **Wave K Phase 2 · Batch D2d batch 16 — learning-reports cluster off Mongoose (4 suites).**
  `learningReportsRoutes` + `learningComplianceReportsRoutes` +
  `learningCertificateExpiryRoutes` + `learningAssignmentRoutes` now author
  fixtures via `fx.create*` and mutate/clean scaffolding through active-backend
  helpers (`deleteActiveRowsWhere`/`deleteActiveRowsLike`/`updateActiveRow`)
  instead of `Model.create`/`deleteMany`/`updateMany`/`findByIdAndUpdate` and the
  raw `mongoose.connection.db.collection('users')` ghost-user path (QB-009). The
  4 files drop `require('mongoose')` + all model requires. Core-seed User/Class
  resets go through `updateActiveRow` (array-id fields as STRING ids; seed
  ObjectId patch values stringified). Pure test-infra, no app/spec change.
  Verified on the PG lane (25/25 across the 4 suites, write-gate clean). Remaining
  D2d: ~29 model-using suites; only `dataIntegrity` + `phaseAHardening` still
  literally `require('mongoose')` (both test Mongoose model behavior directly →
  re-home, not mechanically convert).

## How to keep this current

After each milestone or significant change: update the phase/wave %, move the
status emoji, refresh the **Status board** (Now / Next), and add one dated line
at the top of *Recent progress*. Strategy detail stays in `lms-roadmap.md`.

**Rolling archive (keeps this file lean):** keep ~the last 2 weeks (~15 entries,
file ≤ ~400 lines) inline; in the SAME commit, cut older entries verbatim
(newest-first — they are an audit trail, do not reword) into
`changelog-archive/<year>-q<quarter>.md` and update its coverage header.
