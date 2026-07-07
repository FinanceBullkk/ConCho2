# Development Roadmap — TMS v2 → Internal LTMS (living tracker)

> **Canonical progress tracker.** Status board first, then milestone tables,
> then the recent changelog. Full history → [`changelog-archive/`](changelog-archive/).
> - *Why / strategy / 6-month direction* → [`lms-roadmap.md`](lms-roadmap.md)
> - *Architecture / orientation* → [`system-overview.md`](system-overview.md)
> - *Detailed task snapshot (archived)* → [`archive/handoff-2026-06-01.md`](archive/handoff-2026-06-01.md)
>
> **Last updated:** 2026-07-07

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
  **Wave B (whole-repository CRUD) IN PROGRESS:** room (#6) + org (#7) + session-type (#8) + skill (#9) + trainer (#10) + vendor (#11) + **learning programs+cohorts (#12)** + **learning/enrollment (#13)** + **learning/completion (#14)** + **learning/feedback (#15)** + **learning/path (#16)** + **branding (#17)** + **access (#18)** + **custom-field (#19)** + **finance (#20)** + **automation (#21)** + **compliance (#22)** + **notification (#23)** + **mobile (#24)** + **org/office (#25)** + **assessment/question-bank (#26)** + **report-presets (#27)** + **executive-dashboard (#28)** + **dashboard (#29)** + **learning/assignment (#30)** done. **Port-now set** (sequencing report `plans/reports/plan-260623-0720-*`): office ✓ · question-bank ✓ · report-presets ✓ · executive-dashboard ✓ · dashboard ✓ · learning/assignment ✓ (mig 023) · attendance ✓ (mig 025) · learning/reports ✓ (no new mig) · assessment ✓ (mig 026) — **port-now set COMPLETE**. **Transaction tail IN PROGRESS:** schedule chokepoint **repo + orchestration + read-path FULLY dual-backend** — S0 tables + S1 reads + S2 waitlist + S3a 12 txn methods + S3b-1 create/cancel cutover + S4 FIFO promotion + S3b-2 updateSchedule cutover + **S5 read-path completion (the last 6 Mongo-direct re-fetches in `scheduleService` — booking/admin-create response, cancel load + leader-auth + waiter emails — routed through 3 new dual-backend reads `findScheduleForResponse`/`findScheduleForCancellation`/`findTeamLeaderId` + reused `findUsersForEmail`; `scheduleService` now has ZERO direct Mongoose)** ✓ (mig 027) → **the booking chokepoint runs end-to-end on either backend.** **planning ✓ (mig 028 — the TNA `scheduleItem` 4-write transaction cut over to the UoW; finance `createBudget` now tx-aware on both backends)**. The transaction-heavy tail (`groups` · schedule chokepoint · `planning`) is DONE — the dual-backend transaction abstraction (`domains/_shared/unit-of-work`, parity-proven 2026-06-25 on real Neon) carried all of them — and **learning/session ✓ (2026-07-03, no new mig — read-only 9-method port: the list/detail 6-way populate hydration + booking-adapter context reads; writes were already dual-backend via the sealed `scheduleService` chokepoint) → Phase 3 repository ports COMPLETE. **Wave E (auth & audit) COMPLETE 2026-07-04** — E1 audit write path ✓ (mig 029 `audit_log`: hash chain through `services/audit-repository.{mongo,pg}`, 8/8 Neon parity + 48/48 Mongo audit suites) · E2 retention purge job ✓ (nightly PG DELETE mirroring the Mongo TTLs — audit_log 730d / notification_logs 180d / metric_snapshots 400d, 5/5 Neon) · E3 auth login + middleware reads ✓ (mig 030: 13 users security columns, atomic lockout roll ⇄ CASE UPDATE, fixed-projection security readers, 6/6 Neon + 37/37 Mongo auth suites) · E4 auth mutations ✓ (password change/reset + MFA lifecycle + admin overrides through the same seam; atomic single-use reset consume; 6/6 Neon + 54/54 Mongo). **Wave F (legacy tail) PR-1 ✓ 2026-07-04** — 6 Phase-0 seams dual-backend (dashboard-stats 14-query bundle mig 031 · class · metrics · audit-query · evaluation-export · search; 28/28 Neon parity + 79/79 Mongo consumer suites; 3 ports via a parallel agent lane). Ledger for F-PR-2 (attendance-export pipeline refactor · user-mutations auto-release hook) + ops dispositions in `phase-03-repository-ports.md`. **Wave G lane LIVE 2026-07-04** (`server-tests-pg` informational — first inventory: 91/208 suites already green on Postgres; 117 to work down, then promote to required gate #8). **Wave G COMPLETE 2026-07-07 — the full-suite Postgres lane is green and PROMOTED to REQUIRED gate #8.** Batches 1–16 worked the PG lane from 117 → 0 workable failing suites (shared-fixture foundation → app-gap clusters → the GATED schedule roster-sync/waitlist cluster: Slices 0/A/B+C/D/E — `syncSchedulesForTeamUpdate` + User auto-release ported to the dual-backend `domains/schedule/roster-sync`, enrollment-transfer response/note/junction dual-backend, everything else reverse-asserts on already-dual chokepoints). `server-tests-pg` is now REQUIRED (`ci.yml`). **Wave F PR-2 landed the same day** — attendance-export ported to dual-backend semantic methods (`p2-regression` green both lanes) and the gate-#8 exclusion was DROPPED → **the required PG gate runs the whole suite, zero exclusions; Wave F fully closed** (the user-mutations blocker was retired by the Slice-B/C roster-sync port; those write seams follow with `importService` when touched). Two deferred follow-ups tracked as issues: PG-lane transfer atomicity (#255) + `notifyPromotions` Mongo-only (#256). **Next: #255/#256, then Phase-4/5 cutover.**
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
| 6 | PostgreSQL decision gate | ~55% | 🟡 in progress (gate OPENED 2026-06-21; foundation #184 on main; repo ports underway — Wave A read-only DONE 5 ports + Wave B CRUD: room/org/session-type/skill/trainer/vendor/branding/access + learning programs+cohorts/enrollment/completion/feedback/path (13) whole-repo ports done; **Wave-D keystone: dual-backend transaction abstraction built + parity-proven 2026-06-25 on real Neon → unblocks groups/planning/schedule-chokepoint; groups transaction port COMPLETE (lifecycle + team-write/membership-bridge + enrollment-sync, slices 1-3) 2026-06-26; syncSchedules/reads Mongo-only by design**; **attendance repository ported (mig 025) 2026-06-26 — reads/bulk-upsert/lastActive/4 analytics aggregations, 16/16 parity**; **learning/reports repository ported (no new mig) 2026-06-27 — 20-method report read surface, 13/13 parity**; **assessment domain ported (mig 026) 2026-06-27 — definitions/attempts/grading-queue, 13/13 parity — port-now set COMPLETE**; **schedule chokepoint port STARTED (mig 027) 2026-06-27 — S0 tables (waitlist_entries/room_bookings) + S1 the 25 reads, 13/13 parity, merge-selector keeps writes Mongo until S3**; **schedule chokepoint COMPLETE end-to-end (S2–S5) 2026-06-27**; **planning ported (mig 028 — scheduleItem txn on the UoW) 2026-07-02**; **learning/session ported (no new mig, read-only) 2026-07-03 — Phase 3 repository ports COMPLETE**; **Wave E auth & audit COMPLETE 2026-07-04: E1 audit hash chain (mig 029, 8/8) + E2 PG retention purge (5/5) + E3 auth login/middleware (mig 030, 6/6) + E4 auth mutations (6/6 + 54/54)**; **Wave F PR-1 2026-07-04: 6 legacy seams (dashboard-stats mig 031 · class · metrics · audit-query · evaluation-export · search), 28/28 parity — full pg-parity dir 53 suites/326 tests green**; **Wave G lane LIVE 2026-07-04 — server-tests-pg informational, first inventory 91/208 suites green on PG, 117 to work down**; **Wave G batch 1 2026-07-05 — shared-fixture foundation (pg-test-utils per-file reset + fixture mirrors): 117 → 82 failing suites, 0 newly red**; **Wave G COMPLETE 2026-07-07 — PG lane 117 → 0 workable fails (GATED schedule roster-sync/waitlist cluster ported, Slices 0/A/B+C/D/E); `server-tests-pg` PROMOTED to REQUIRED gate #8, excludes only p2-regression pending Wave F PR-2**; `DB_BACKEND=mongo` default) |

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
> inline: **2026-07-02 → 2026-07-07** (06-20→06-27 rolled 2026-07-07;
> 06-14→06-19 rolled 2026-07-04).

- **2026-07-07** — **Phase-05 cutover-blocker slice 1 — A1 RBAC grants seed + A2 recert auto-assignment dual-backend (the 2 CRITICAL split-brain writes).**
  Branch `fix/pg-cutover-critical-a1-a2`, per the phase-05 "zero raw-Mongoose write" gate (owner: proceed CRITICAL-first;
  reconcile=RETIRE at cutover; Counter=gapless). **A1**: `grants-loader.seedSystemRoles` wrote `Role.updateOne` upserts to Mongo
  even in PG mode while authz READ the PG repo → split-brain RBAC. New dual `seedRoleIfMissing` ($setOnInsert ⇔ INSERT…WHERE NOT
  EXISTS live-key). **A2**: the recert scan+create (`recert-assignment-service`) was raw Mongoose → auto-created recert
  assignments vanished on PG (compliance loss). New dual reads `findAutoRecertPrograms`/`findExpiringIssuedCertificates`
  (completion repo) + `findBySourceCertificateId` (assignment repo, deliberately NO deleted/status filter — "one recert EVER per
  cert") + assignment PG `create` maps the `uq_assignments_source_cert` 23505 → 11000 (race loser stays backend-agnostic).
  roleGrants 3/3 + recertAssignment 5/5 both lanes (reverse-asserted via active-backend helpers); access+accessRoles 9/9
  unchanged. Next slice: mig 033 `counters` (gapless `UPDATE…RETURNING`) + `token_blocklist`.
- **2026-07-07** — **#255 + #256 closed — the two deferred PG follow-ups: transfer atomicity + notifyPromotions dual-backend (mig 032).**
  Two PRs. **#255 (transfer atomicity)**: `enrollment-transfer` moved from a raw mongoose `session.withTransaction` to the
  dual-backend `runInTransaction` UoW and passes the whole `tx` to every write; the real gap was `insertActiveEnrollment`'s PG
  impl IGNORING the session handle (the enrollment INSERT escaped the tx as a pool autocommit) — it now execs on `tx.client`; the
  write spine `createActiveEnrollment` accepts `{tx}` (raw session still works). Parity gains the rollback-covers-the-created-
  enrollment case (8/8); enrollmentTransfer+teams+enrollmentRoutes+learningEnrollmentRoutes 66/66 both lanes.
  **#256 (notifyPromotions)**: the post-commit waitlist-promotion notifier was Mongo-only (bell/email NotificationLog wrote to
  Mongo even in PG mode). Ported onto the dual repos — schedule/class-label + user emails via `findScheduleForCancellation`/
  `findUsersForEmail`, the log insert/status via new waitlist-repo twins `insertPromotionLog`/`setPromotionLogStatus`.
  **mig 032** adds the `notification_logs` 7-field unique index (`NULLS NOT DISTINCT` — Mongo treats null as a value) so the
  idempotent duplicate → 23505 → `{code:11000}` matches Mongo E11000. waitlist 18/18 both lanes; waitlist parity 12/12 (incl.
  dup-idempotency + status transitions); notifyPromotions-caller sweep (scheduleUseCases/autoReleaseScope/enrollmentTransfer/
  scheduleReassign) 32/32 both lanes. **All PG-migration deferred debt is now closed — next: Phase 4/5 cutover.**
- **2026-07-07** — **Wave F PR-2 — attendance-export ported to dual-backend: p2-regression green both lanes → the PG lane is at ZERO failing and gate #8 covers the WHOLE suite (exclusion dropped).**
  Branch `feat/pg-wave-f-pr2-attendance-export`. Per the F-PR-2 ledger plan: the raw `aggregate(pipeline)` leak refactored into
  SEMANTIC methods (`findExportRows`/`findPendingIdsInRange`/`countExportablePending` + claim/mark/counts) — Mongo pipelines moved
  verbatim into `attendance-export-repository.mongo.js`, SQL twin in `.pg.js` (INNER schedule+user joins ⇔ `$unwind` drop; LEFT
  class/team ⇔ preserveNull with omitted-key parity; `durationMinutes` ⇔ EXTRACT(EPOCH)/60; claim only flips rows still PENDING so
  the concurrent loser claims 0). p2's 2 fails were the claim/mark writes not reaching the active backend + a genuine post-stream
  ordering (markExported runs AFTER the download stream ends) — test now reads `readActiveRow` with a short poll, assertion strict.
  p2-regression 7/7 + exportRoutes 15/15 both lanes; parity `attendance-export-repository.pg.test.js` 5/5. **ci.yml: the
  `p2-regression` exclusion on gate #8 dropped — `server-tests-pg` now runs the full suite with zero exclusions.** F-PR-2's second
  seam (user-mutations) needs no port: its blocker (the auto-release hook) was retired by Slice B/C; the write seams follow with
  `importService` when touched. **Wave F fully closed.**
- **2026-07-07** — **Wave G batch 16 / GATED Slice D — enrollmentTransfer green both lanes: GATED schedule cluster CLOSED (PG lane ~2 → ~1 failing).**
  Branch `feat/pg-slice-d-enrollment-transfer`. The transfer's enrollment writes already reach Postgres (`syncEnrollments`' dual
  repos fall back to the pool; source-team pull is a dual DELETE), but three Mongoose-only bits broke the PG lane: (1) the HTTP
  response re-fetch (`Enrollment.findOne(...).populate`) read Mongo → null; (2) the transfer note (`findOneAndUpdate`) missed the PG
  enrollment; (3) Step-1 target-team add (`Team.findByIdAndUpdate $addToSet`) mirrored the `teams` row but not the `team_members`
  junction. Fixed with mostly READS (no transfer-transaction rewrite): added dual-backend `findActiveTeamEnrollmentPopulated` +
  `setActiveTeamEnrollmentNote` to `groups/enrollment-sync-repository` (mongo populate ⇔ pg LEFT JOINs); routed Step 1 through
  `team-write-repository.updateTeamDoc` (members-array ⇔ team_members-junction bridge; `toNew` snapshotted pre-tx so a full replace
  ≡ the old `$addToSet`); reverse-asserted the source-enrollment + team-members reads (`readActiveRow` + new
  `readActiveTeamMemberIds`). enrollmentTransfer 11/11 both lanes; teams + enrollmentRoutes + learningEnrollmentRoutes 55/55 Mongo
  (no regression); parity `groups-enrollment-sync-repository` 7/7. **GATED schedule roster-sync/waitlist cluster fully closed
  (Slices 0→A→B+C→D→E).** PG lane now **1 failing = `p2-regression` only** (blocked on Wave F PR-2, out of scope). Deferred: the
  transfer is not atomic on the PG lane (pool writes, not one UoW tx) + `notifyPromotions` stays Mongo-only — both separate
  follow-ups; the Mongo production path stays fully transactional and unchanged.
- **2026-07-07** — **Wave G batch 15 / GATED Slice E — bookingRace green both lanes (PG lane ~3 → ~2 failing).**
  Branch `feat/pg-slice-e-booking-race-count`. Pure reverse-assert — the booking chokepoint (unique-slot 409 + weekly-2-cap 400
  race) is already dual-backend (mig 027), so the concurrency *behaviour* already passed on PG; only the post-race
  `Schedule.countDocuments({bookedTeamId})` assertions read the Mongo memory server (stale — the booking wrote to Postgres).
  Routed the 3 counts → `countActiveRowsWhere('Schedule', …)`. No production change. bookingRace 4/4 both lanes. Remaining 2 =
  enrollmentTransfer (Slice D) + p2-regression (Wave F PR-2).
- **2026-07-07** — **Wave G batch 14 / GATED Slice B+C — dual-backend schedule roster-sync: waitlist + autoReleaseScope green both lanes (PG lane ~5 → ~3 failing).**
  Branch `feat/pg-slice-bc-roster-sync`. Two Mongo-only side-effect paths shared one machinery (find future LIVE schedules →
  roster mutate → FIFO-promote freed seats → sweep still-empty): `models/Team.js syncSchedulesForTeamUpdate` (team member-edit)
  and `models/User.js` post-findOneAndUpdate auto-release hook. On PG both crashed (`tx.client.query is not a function` — a raw
  mongoose session reached the PG-resolved `promoteIfSeatFree`). Ported ONCE, backend-agnostic, into
  `domains/schedule/roster-sync.js` over `runInTransaction` + the already-dual waitlist/schedule repos + **5 new dual-backend repo
  primitives** (`findFutureTeamSchedules`/`findFutureUserSchedules`/`applyRosterDelta`/`findEmptyScheduleIds`/`deleteSchedulesByIds`
  — Mongo `$pull`/`$push` verbatim ⇔ PG `enrolled_users text[]` array SQL, so **Mongo behaviour is 1:1 unchanged**). Team.js +
  User.js became thin delegates; `groups/mutations.js` now passes the whole UoW handle (`tx`), not `tx.session`. waitlist 18/18 +
  autoReleaseScope 1/1 both lanes; parity `schedule-roster-sync-repository.pg.test.js` 6/6 (incl. tx-rollback harness); teams 14/14
  + enrollmentTransfer 11/11 Mongo (no regression); PG blast-radius 7 suites/71 tests green. Deferred: `notifyPromotions`
  (post-commit, fail-soft) stays Mongo-only — writes NotificationLog to Mongo even in PG mode; port with the notification concern.
  Remaining 3 = enrollmentTransfer, bookingRace (Slices D–E) + p2-regression (Wave F PR-2).
- **2026-07-07** — **Wave G batch 13 / GATED Slice A — scheduleReassign green both lanes (PG lane ~6 → ~5 failing).**
  Branch `feat/pg-slice-a-schedule-reassign`. Root cause was NOT a missing port: the reassign path (`PUT /api/schedules/:id`
  → `updateSchedule`) is already fully dual-backend (`findTeamById`/`snapshotActiveMembers`/`updateScheduleById`/`dissolveWaitlist`/
  `promoteIfSeatFree` all mig-027 dual) — but the schedule controller's audit-diff called `schedule.toObject()`, which 500s on PG
  (use-cases returns a plain row, not a Mongoose doc). Guarded it (`typeof toObject === 'function' ? … : …`, same pattern as
  `use-cases.js:375`). Reverse-asserted the 5 stale `Schedule.findById` reads → `readActiveRow` (PG-only writes don't reflect back to
  the Mongo memory server). scheduleReassign 9/9 both lanes; scheduleCancel 10/10 unchanged. **Correction to the Slice 0 note:**
  `syncSchedulesForTeamUpdate` does NOT gate reassign — it gates the waitlist team-member-edit path, so its port moves to Slice B.
  Remaining 5 = waitlist, autoReleaseScope, enrollmentTransfer, bookingRace (Slices B–E) + p2-regression (Wave F PR-2).
- **2026-07-07** — **Wave G batch 12 — GATED Slice 0: 3 schedule suites green both lanes (PG lane ~9 → ~6 failing).**
  First slice of the GATED schedule cluster (branch `feat/pg-lane-wave-g-batch12`, per
  `plans/reports/proposal-260707-1001-gated-schedule-cluster-port.md`). `scheduleCancel` + `scheduleUseCases` + `sessionTrainers`
  were reverse-assert-fixable: the booking/cancel/trainer chokepoint is already dual-backend (mig 027), so only the Mongoose READ
  lagged — routed cancel-flip / freed-slot / trainer-clear reads through `readActiveRow`/`findActiveRowsWhere`. `sessionTrainers`
  normalises `externalTrainer` (top-level field on Mongo, `schedules.meta` jsonb on PG). `buildScalarWhere` now binds Date values
  natively (String(Date) never matches a timestamptz). No production change. Remaining ~6 = 5 GATED (scheduleReassign, waitlist,
  bookingRace, autoReleaseScope, enrollmentTransfer — need the Mongo-only syncSchedulesForTeamUpdate / waitlist-promotion /
  auto-release ported, Slices A-E) + p2-regression (Wave F PR-2).
- **2026-07-07** — **Wave G batch 11 — mfa suite green both lanes (PG lane ~10 → ~9 failing).**
  `mfa.test.js` (9/9 both lanes, branch `feat/pg-lane-wave-g-batch11`). The ported auth mutations write mfaSecret/
  mfaPendingSecret/mfaBackupCodes/mfaLastUsedCounter to the active backend and those are `select:false` — a Mongoose read saw null
  (broke TOTP), and the login-flow `beforeAll`'s read-modify-write (`u.save()`) re-mirrored Mongo's null mfaSecret OVER the PG value
  (login 500 / verify 401). Rewrote all 10 User mfa reads/writes to `readActiveRow`/`updateActiveRow` (raw on Mongo, direct SQL on
  PG — no middleware/mirror/clobber). Test-only. **PG lane remainder = 9: the GATED schedule roster-sync/waitlist cluster (8) +
  p2-regression (blocked on Wave F PR-2 attendance-export refactor). No workable suites left without owner sign-off.**
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
## How to keep this current

After each milestone or significant change: update the phase/wave %, move the
status emoji, refresh the **Status board** (Now / Next), and add one dated line
at the top of *Recent progress*. Strategy detail stays in `lms-roadmap.md`.

**Rolling archive (keeps this file lean):** keep ~the last 2 weeks (~15 entries,
file ≤ ~400 lines) inline; in the SAME commit, cut older entries verbatim
(newest-first — they are an audit trail, do not reword) into
`changelog-archive/<year>-q<quarter>.md` and update its coverage header.
