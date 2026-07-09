# Development Roadmap — TMS v2 → Internal LTMS (living tracker)

> **Canonical progress tracker.** Status board first, then milestone tables,
> then the recent changelog. Full history → [`changelog-archive/`](changelog-archive/).
> - *Why / strategy / 6-month direction* → [`lms-roadmap.md`](lms-roadmap.md)
> - *Architecture / orientation* → [`system-overview.md`](system-overview.md)
> - *Detailed task snapshot (archived)* → [`archive/handoff-2026-06-01.md`](archive/handoff-2026-06-01.md)
>
> **Last updated:** 2026-07-09

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
  **Wave B (whole-repository CRUD) IN PROGRESS:** room (#6) + org (#7) + session-type (#8) + skill (#9) + trainer (#10) + vendor (#11) + **learning programs+cohorts (#12)** + **learning/enrollment (#13)** + **learning/completion (#14)** + **learning/feedback (#15)** + **learning/path (#16)** + **branding (#17)** + **access (#18)** + **custom-field (#19)** + **finance (#20)** + **automation (#21)** + **compliance (#22)** + **notification (#23)** + **mobile (#24)** + **org/office (#25)** + **assessment/question-bank (#26)** + **report-presets (#27)** + **executive-dashboard (#28)** + **dashboard (#29)** + **learning/assignment (#30)** done. **Port-now set** (sequencing report `plans/reports/plan-260623-0720-*`): office ✓ · question-bank ✓ · report-presets ✓ · executive-dashboard ✓ · dashboard ✓ · learning/assignment ✓ (mig 023) · attendance ✓ (mig 025) · learning/reports ✓ (no new mig) · assessment ✓ (mig 026) — **port-now set COMPLETE**. **Transaction tail IN PROGRESS:** schedule chokepoint **repo + orchestration + read-path FULLY dual-backend** — S0 tables + S1 reads + S2 waitlist + S3a 12 txn methods + S3b-1 create/cancel cutover + S4 FIFO promotion + S3b-2 updateSchedule cutover + **S5 read-path completion (the last 6 Mongo-direct re-fetches in `scheduleService` — booking/admin-create response, cancel load + leader-auth + waiter emails — routed through 3 new dual-backend reads `findScheduleForResponse`/`findScheduleForCancellation`/`findTeamLeaderId` + reused `findUsersForEmail`; `scheduleService` now has ZERO direct Mongoose)** ✓ (mig 027) → **the booking chokepoint runs end-to-end on either backend.** **planning ✓ (mig 028 — the TNA `scheduleItem` 4-write transaction cut over to the UoW; finance `createBudget` now tx-aware on both backends)**. The transaction-heavy tail (`groups` · schedule chokepoint · `planning`) is DONE — the dual-backend transaction abstraction (`domains/_shared/unit-of-work`, parity-proven 2026-06-25 on real Neon) carried all of them — and **learning/session ✓ (2026-07-03, no new mig — read-only 9-method port: the list/detail 6-way populate hydration + booking-adapter context reads; writes were already dual-backend via the sealed `scheduleService` chokepoint) → Phase 3 repository ports COMPLETE. **Wave E (auth & audit) COMPLETE 2026-07-04** — E1 audit write path ✓ (mig 029 `audit_log`: hash chain through `services/audit-repository.{mongo,pg}`, 8/8 Neon parity + 48/48 Mongo audit suites) · E2 retention purge job ✓ (nightly PG DELETE mirroring the Mongo TTLs — audit_log 730d / notification_logs 180d / metric_snapshots 400d, 5/5 Neon) · E3 auth login + middleware reads ✓ (mig 030: 13 users security columns, atomic lockout roll ⇄ CASE UPDATE, fixed-projection security readers, 6/6 Neon + 37/37 Mongo auth suites) · E4 auth mutations ✓ (password change/reset + MFA lifecycle + admin overrides through the same seam; atomic single-use reset consume; 6/6 Neon + 54/54 Mongo). **Wave F (legacy tail) PR-1 ✓ 2026-07-04** — 6 Phase-0 seams dual-backend (dashboard-stats 14-query bundle mig 031 · class · metrics · audit-query · evaluation-export · search; 28/28 Neon parity + 79/79 Mongo consumer suites; 3 ports via a parallel agent lane). Ledger for F-PR-2 (attendance-export pipeline refactor · user-mutations auto-release hook) + ops dispositions in `phase-03-repository-ports.md`. **Wave G lane LIVE 2026-07-04** (`server-tests-pg` informational — first inventory: 91/208 suites already green on Postgres; 117 to work down, then promote to required gate #8). **Wave G COMPLETE 2026-07-07 — the full-suite Postgres lane is green and PROMOTED to REQUIRED gate #8.** Batches 1–16 worked the PG lane from 117 → 0 workable failing suites (shared-fixture foundation → app-gap clusters → the GATED schedule roster-sync/waitlist cluster: Slices 0/A/B+C/D/E — `syncSchedulesForTeamUpdate` + User auto-release ported to the dual-backend `domains/schedule/roster-sync`, enrollment-transfer response/note/junction dual-backend, everything else reverse-asserts on already-dual chokepoints). `server-tests-pg` is now REQUIRED (`ci.yml`). **Wave F PR-2 landed the same day** — attendance-export ported to dual-backend semantic methods (`p2-regression` green both lanes) and the gate-#8 exclusion was DROPPED → **the required PG gate runs the whole suite, zero exclusions; Wave F fully closed** (the user-mutations blocker was retired by the Slice-B/C roster-sync port; those write seams follow with `importService` when touched). Two deferred follow-ups tracked as issues: PG-lane transfer atomicity (#255) + `notifyPromotions` Mongo-only (#256) — **both closed 2026-07-07/08.** **Phase-05 "zero raw-Mongoose write" gate COMPLETE 2026-07-08** (PRs #261–#267): every inventoried write ported (sections A/B/D; reconcile + adminDb explorer RETIRE at cutover/Wave-K), the **F3 write-gate machine-enforces the invariant on CI gate #8**, ETL + FK-hardening + private-repo pg_dump backup are merged and **rehearsed end-to-end** (dry-run: counts matched, 0 dangling refs, 10MB ≪ Neon-free gate). **Wave J CUTOVER EXECUTED 2026-07-08 — prod is LIVE on PostgreSQL / Neon** (PG 17.10, ap-southeast-1). Fresh-start path (owner: no real users/data yet → seed → ETL to Neon → mig 036 (30 FK/323 CHECK) → local smoke → owner flipped Render `DB_BACKEND=postgres` → flip confirmed on prod via a write-probe landing in Neon). Daily encrypted `pg_dump` backup enabled. **Now → 1-week bake** (Atlas `tms2` untouched as fallback, fix-forward); **Next → Wave K decommission** (owner-scheduled after bake: drop Mongoose models + memory test harness + `DB_BACKEND` switch, cancel Atlas). Follow-ups: `/ready` PG probe; cron-pinger resume. Checklist: `plans/260612-2042-postgresql-migration/cutover-checklist.md`.
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
| 6 | PostgreSQL migration / Wave K decommission | ~90% | 🟡 prod cutover + Mongo-less activation complete (Wave J 2026-07-08: Render `DB_BACKEND=postgres`, writes verified in Neon PG 17.10, mig 036 FK/CHECK applied, daily encrypted `pg_dump` enabled; Wave K activation 2026-07-09: owner removed `MONGO_URI`, prod redeployed, `/ready` 200 `backend=postgres`, `/api/admin-db` 410). Remaining: cancel Atlas after final comfort check, then remove retired Mongo-only code/test harness. |

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
> inline: **2026-07-04 (E4+) → 2026-07-09** (07-04 E1–E3 rolled 2026-07-08,
> 07-02→07-03 rolled 2026-07-07 →
> [`2026-q3.md`](changelog-archive/2026-q3.md); 06-20→06-27 rolled 2026-07-07;
> 06-14→06-19 rolled 2026-07-04 → [`2026-q2.md`](changelog-archive/2026-q2.md)).

- **2026-07-09** — **Sidebar trimmed to the core LTMS loop (scope de-clutter).**
  Owner call: the app was over-built (13 speculative "capability" domains from
  Horizon 1/2 / TMS.update) and the Admin sidebar showed ~38 items → "nhìn vô
  không biết xài sao". Hid every module NOT on the operating loop
  (schedule→attendance→assessment→completion→certificate→report) behind the
  existing feature-flag layer: **Configure group 12→1 item (only Compliance),
  Admin nav ~38→~22.** Hide is **UX-only + reversible** — routes/APIs untouched;
  flip a key back to `true` in `client/src/config/features.js` (now
  self-documenting — every optional module listed on/off) to restore instantly.
  Re-SHOWN core modules that were wrongly hidden: assessments, grading,
  assignments, rooms. HIDDEN (14): paths, offices, skills, trainers, vendors,
  planning, budget, cost-roi, automation, custom-fields, access, branding,
  scheduling-studio, sync. Also gated the one dashboard quick-link
  (`ParticipantDashboard` → `/me/paths`) on the same flag; the rest of the
  dashboard/umbrella surfaces were already link-clean. **No code deleted** — a
  "phase 2" real-delete of modules that stay dark/unrequested through real HR
  usage is deferred by design (owner picked hide-first over delete-now). Files:
  `config/features.js`, `nav-config.js`, `dashboard/ParticipantDashboard.jsx`.

- **2026-07-09** — **Wave K safe-subset cleanup — 34 dead Atlas-era scripts removed.**
  Rollback-neutral pre-work during the bake (Mongo runtime, the 58 dual-backend
  repos, and the fast `DB_BACKEND=mongo`→Atlas rollback path are all UNTOUCHED).
  Deleted the migration-done one-offs: ETL (`etl-mongo-to-pg*`), all
  `backfill-*`/`import_*`/`reimport_*`/`cleanup_*`/`migrate-*` + data-audit/fix/debug
  scripts. Kept `verify-backup.js` (owner's Atlas pre-cancellation check) + the ops
  tools (`create-admin`, `reset_admin_pw`, `seed`, `verify-pg-backup`). Live doc
  refs to the deleted scripts folded (commands.md + audit-log/dashboard-analytics/
  vendor-management/scheduling-and-booking specs + policy/README). The full Wave K
  decommission (Mongo runtime/repos/models/test-harness) stays gated on Atlas
  cancellation — plan: [`plans/260709-1808-wave-k-mongo-decommission-cleanup/`](../plans/260709-1808-wave-k-mongo-decommission-cleanup/plan.md).

- **2026-07-09** — **Wave K activation verified — prod now runs Mongo-less.**
  Owner removed `MONGO_URI` from Render and redeployed. Verification from a fresh prod process:
  `/health`→200, `/ready`→200 with `backend=postgres`, and `/api/admin-db`→410
  `"This endpoint is retired under the PostgreSQL backend."` This proves the app boots without Mongo,
  active readiness probes Neon/Postgres, and Mongo-only admin surfaces are closed. Remaining irreversible
  ops step: cancel Atlas after final comfort check; code cleanup follows.

- **2026-07-09** — **K1b (run Mongo-less) — read-straggler ports + Mongo-off boot enablement, all merged.**
  Closes the gap found post-cutover: the F3 write-gate proved zero raw-Mongoose *writes*, but 7 read paths still hit Mongo
  directly (would read empty Atlas, not Neon). Ported all 7 to `DB_BACKEND`-selected repos across 5 PRs — **#272** room/utilization ·
  **#273** dashboard-alerts · **#274** enrollment queries/transfer/shared (list*Enrollments/findActiveConflicts + attendance
  findAttendanceStatusRows; Mongo `$ne` ⇔ PG `IS DISTINCT FROM`) · **#277** getUserProgress + getUserById (+2 groups reads;
  getUserById→userMutationsRepo.findByIdLean) · **#276** pushService (mobile repo find/prune). Then **#278** Mongo-off **boot
  enablement**: server.js verifies the PG pool fail-fast + connects Mongo only if `MONGO_URI` is set & non-fatally (unset → boots
  Mongo-less); envValidator requires the *active* backend's conn string (`PG_URL` under pg, `MONGO_URI` optional); `/ready` probes
  PG; reconcile job skipped under pg; new `mongoOnlyGone` middleware 410s the Mongo-only admin-db/reconcile routes **only when
  Mongo is physically off** (readyState-gated → bake window + test lanes untouched). **Behaviour-neutral while `MONGO_URI` is
  set**; every slice PG-parity + green on both lanes; the boot path proven by a real Mongo-less boot smoke (`/ready`→200
  `backend=postgres`, admin-db→410). Files `services/reconcile*` + `adminDbRoutes` are guarded/skipped, not yet deleted.

- **2026-07-08** — **Wave J CUTOVER EXECUTED — prod is live on PostgreSQL / Neon.**
  Owner confirmed **no real users / no real data yet** → took the **fresh-start** path (not the Atlas-ETL-with-freeze the
  checklist assumed): **no freeze, no Atlas prod ETL.** What ran: (1) seeded a throwaway local `mongod` (full sample, 33 docs /
  11 collections); (2) **ETL that seed → prod Neon** — 11 tables, counts matched, **0 dangling**, **10 MB** (≪ 0.5 GB Neon-FREE
  gate); (3) **applied mig 036** (copy-then-migrate) — **30 FK + 323 CHECK**, `knex_migrations` = 36, copy removed (uncommitted);
  (4) **local smoke** on `DB_BACKEND=postgres`→Neon — boot + `/health` + `/ready`, login (bcrypt vs PG) + capability gates,
  reads `schedules`=3 / `cohorts`=3, **live write round-trip** (bad→good login moved `failed_login_attempts` 0→1→0 in Neon);
  (5) **owner flipped Render** — `DB_BACKEND=postgres` + `PG_URL`, **kept `MONGO_URI`** (boot still calls `connectDB()`; Atlas =
  then-bake fallback; superseded by Wave K activation on 2026-07-09); (6) **flip CONFIRMED on prod** `concho2.onrender.com` — teacher login + `/api/schedules`=3 + a **prod** write-probe
  drove `failed_login_attempts` **0→1 in Neon** (proves prod writes land in Neon, not Atlas `tms2`). Neon = **PG 17.10**, ap-southeast-1.
  **Backup:** `pg-backup` (private `ConCho2-backups`) daily `schedule:` **enabled**; dump green after fixing a client-version bug
  (runner shipped `pg_dump` 16 vs Neon 17 → pinned `/usr/lib/postgresql/17/bin` on PATH); `verify-pg-backup.js` fixed to not
  hard-fail on legitimately-empty tables in manifest mode (attendances/evaluations = 0 on a fresh DB) — verify goes green once this
  lands on main. **Bake:** Atlas `tms2` left **untouched** (nothing to freeze), fix-forward 1 week. **Follow-ups:** `/ready` still
  probes Mongo only (patch to probe PG under postgres); cron-pinger ≤4-min resume = owner (cron-job.org); **Wave K decommission**
  owner-scheduled after bake. Checklist annotated: `plans/260612-2042-postgresql-migration/cutover-checklist.md`.
- **2026-07-08** — **Wave H + I + backup — cutover tooling: ETL script (dry-run rehearsed), FK/CHECK hardening migration (written, gated), daily encrypted pg_dump pipeline. OWNER REVIEW requested on the PR (outside standing approval).**
  Branch `fix/pg-etl-fk-backup`. **H** `scripts/etl-mongo-to-pg.js` + `-transforms.js`: raw-driver stream copy (soft-deleted
  rows too — trash survives), reflective column mapping (fail-loud) + per-model flatteners (SessionType/CustomFieldDefinition
  `order→display_order`, CostEntry/RequiredTraining/TrainingRequest nested→flat) + curated meta packing (users/schedules),
  idempotent ON CONFLICT (id), team_members resync, `--collection=X`; end-of-run row-count reconciliation + dangling-FK report +
  Neon-FREE 0.5GB size gate. **Dry-run rehearsed end-to-end** (seeded throwaway mongod → docker `tms_etl_dry`): 11 collections,
  counts matched, 0 dangling, 10MB; then **mig 036 applied clean on the ETL'd data + rollback/re-apply verified** — the exact
  Wave-J order. **I** mig 036 (30 FK + 35 CHECK from the model enums; `waitlist_entries.schedule_id` CASCADE for the
  promoteAndSweep placeholder hard-delete; audit/notification refs deliberately un-FK'd) — NOT applied to CI docker; applies at
  Wave-J step 5 post-ETL-verify. **Backup** `.github/workflows/pg-backup.yml`: daily `pg_dump -Fc` → AES-256 artifact (30d) +
  counts manifest + same-run restore-verify via NEW `scripts/verify-pg-backup.js` (--counts exact-match); `docs/backup-dr.md`
  rewritten dual-state (two-tier RPO ≤6h/≤24h, PG restore paths, Neon autosuspend + pinger-cadence caveats, passphrase custody).
  Owner sign-offs pending on the PR: passphrase custody · backup destination · waitlist CASCADE · secrets setup.
- **2026-07-08** — **Phase-05 B5-reads — syncController's 3 bulk pre-loads onto the dual seams; Sheets sync survives cutover; the DEAD capacity guard comes alive.**
  Branch `fix/pg-b5-sync-bulk-reads`. Teams via `groups/read-repository.findAllTeams` (PG twin rebuilds members from the
  `team_members` junction, drops soft-deleted users like the populate hook — order-insensitive, sync treats members as a set) ·
  classes via NEW `class-repository.findAllClassCodesLean` ({_id,classCode} — the full-doc read was over-fetch) · live schedules
  via NEW `schedule repository.findLiveSchedulesForSync`. **Bug fix (spec delta folded into export-and-integrations):** the
  capacity guard compared `schedule.enrolledCount` — a VIRTUAL that `.lean()` never materialized → always false → over-capacity
  sheet rows enrolled silently. Now computed from `enrolledUsers.length` (queries.js precedent) → over-capacity rows land in
  `errors`. First real `/api/sync` coverage: 4-case integration suite (authz 403 / 400 no-Google-call / happy path with
  googleapis+googleAuth mocked + write reverse-assert / capacity-live) + 2-case parity for the new seams. `syncController` now
  has ZERO direct Mongoose end-to-end.
- **2026-07-08** — **Phase-05 slice 5 — F3 write-gate + D-CronRun: the "zero raw-Mongoose write" gate is now MACHINE-ENFORCED on the PG lane.**
  Branch `fix/pg-cutover-slice5-f3-cronrun`. **D-CronRun**: mig 035 `cron_runs` + dual heartbeat seam
  `lib/cron-run-repository.{js,mongo,pg}` (upsert-by-job_name; COALESCE preserves `lastSuccessAt` across error runs ⇔ the
  conditional-$set; bigint cadence → Number on read); `cronMonitor.recordStart/End` + `cronHealthController` swapped (fail-soft
  stays in the monitor so impls throw for parity); advisory-lock alternative REJECTED — CronRun is durable queryable state, never
  a lock. Parity +5 cases; 3 CronRun-touching integration suites reverse-asserted (`deleteActiveRowsWhere`/`findActiveRowWhere`).
  **F3 write-gate** (`tests/pg-write-gate.js`): every Mongoose write entry (Model statics + `Document#save` + raw driver
  collection ops) records its causal stack frame on the PG lane; fixture writes (`/server/tests/`), repo-layer `*.mongo.js`
  (parity-driven), and the RETIRED reconcile paths are sanctioned — any OTHER production frame appends to a run-scoped JSONL
  (env-published by `global-setup`) and `global-teardown` THROWS → the lane (and CI gate #8) goes red. Flag-around-setup-hooks
  was rejected on evidence: 63/126 integration files write fixtures inside test bodies. Classifier unit-tested (7 cases).
  The auto-mirror keeps fixtures green; the gate keeps unported app writes from hiding behind it — "lane green" now MEANS
  "no production Mongoose write fired". **The gate paid for itself on its FIRST full run**: it flagged
  `routes/adminDbRoutes.js:236` (`User.findByIdAndUpdate`) — the admin DB explorer, raw-Mongo by design end-to-end, which the
  original phase-05 inventory grep MISSED (it never covered `routes/`). Sanctioned+tracked pending owner disposition
  (recommend: retire at cutover — Neon console/psql replaces it). Also in-flight this session: p2-regression P2-03R
  reverse-assert (the one REAL fail in slice-4's full-PG run — its post-mutation assert still read Mongo while the B2-tail seam
  writes PG-only; 3 other fails = known getApp-boot load-flakes, 32/32 isolated both lanes).
- **2026-07-08** — **Phase-05 cutover-blocker slice 4 — B-tail (B1–B7) dual-backend: the ENTIRE section-B inventory is ported; only F3 + D-CronRun remain before the "zero raw-Mongoose write" gate closes.**
  Branch `fix/pg-cutover-slice4-b-tail`. **B4** settings repo (`domains/settings/`, upsert-by-key) · **B3** evaluation repo
  (`domains/evaluation/`: revive-in-place upsert ON CONFLICT (class_id,user_id), averageScore mapper ⇔ the Mongo virtual,
  Mongo-shaped CastError on garbage filter ids (SEC-014 400 contract), policy class reads via `class-repository` — whose PG
  `classRow` was MISSING `teacherIds`, silently unbinding every class on PG) · **B5** sheets-sync roster write via
  `updateScheduleById`+`applyRosterDelta` (bulk READS stay Mongo — tracked follow-up) · **B7** mig 034 `schedules.
  reminders_sent_at` + atomic claim/refetch/rollback seams (reminderService swap) · **B2-tail** enrollment-status re-homed on
  `runInTransaction` (by-id/bulk status writes + populated re-fetch; the shared future-roster pull is a dual seam returning
  modifiedCount) · **B6** import re-homed on the UoW (booking-write `insertSession` + `insertAttendanceMany` + user/class bulk
  upserts — counts pinned to Mongo bulkWrite truth: modified==matched since Mongoose timestamps bump every matched doc) ·
  **B1** user soft-delete cascade + restore on ONE UoW (team_members junction pull, empCode/email parking via users.meta) —
  which cascaded reads-follow-writes into porting **user-mutations** (create/update: PG twin replicates the pre-save bcrypt hash
  AND the status→Dropped auto-release hook incl. post-commit waiter notify) and the **trash-list read** (`listTrashedUsers`).
  Also: parking/restore moved off raw `collection.updateOne` (driver-level string id matched NOTHING — caught by parity).
  Parity +4 suites/12 cases (settings · evaluation · reminder-claim · user-import-lifecycle); 8 integration suites
  reverse-asserted onto the active backend. Targeted: PG 16 suites 174/174 · Mongo same set (pre-merge). Owner decisions:
  prod PG = **Neon FREE** (~100 users thực tế; đo size lúc ETL dry-run; pg_dump backup job vào checklist J) · bake sau cutover
  rút ngắn còn 1–2 tuần. Next: slice 5 (F3 lane counter) → H ETL → I FK → J cutover.
- **2026-07-07** — **Phase-05 cutover-blocker slice 3 — A3–A6 + A8 dual-backend: the ENTIRE section-A split-brain inventory is now ported.**
  Branch `fix/pg-cutover-slice3-calendar-notification-seed`. **A3 (calendar)**: `calendar-sync.js` rode raw populate + `Schedule.updateOne`
  for the event-id/Meet-link writeback → now `repository.findScheduleForCalendarSync` (the dual read already existed) +
  `updateScheduleById`; the PG repo's `UPDATE_COLS` gained **`meetLink → meet_link`** — without it the writeback landed in `meta`
  jsonb while `baseSchedule` reads the COLUMN, silently dropping the Meet link on every PG read (parity-pinned). **A4–A6
  (NotificationLog writers)**: ONE shared write seam on `domains/notification/repository` — `insertLog` (PG maps the mig-032
  dedupe-unique 23505→`{code:11000}`; every caller's "already notified" branch stays backend-agnostic) + `updateLogById` — carried
  by in-app-writer (bell), expiry-reminder + assignment-reminder crons. **A8 (automation seed)**: `upsertSystemRuleByName`
  ($setOnInsert upsert ⇔ `INSERT…WHERE NOT EXISTS` keyed (name, system) with NO deleted filter → an admin-hidden system rule is
  NOT resurrected on reboot; benign divergence documented: Mongoose minimize strips empty `params:{}`). Tests: 11 integration
  suites reverse-asserted onto the active backend (~30 sites); parity +5 cases. **Also de-flaked the fire-and-forget audit
  asserts suite-wide** (rode with #262): shared `pollUntil` in pg-test-utils replaces fixed sleeps (trainer/planning/adminDb/
  reportsEvidencePack — trainer's 30ms sleep failed gate #8 on CI). pg lane targeted 172+19 + mongo lane 192/192; full suites
  green both lanes pre-merge. Next: slice 4 (B-tail — B1–B7) + slice 5 (F3 lane counter).
- **2026-07-07** — **Phase-05 cutover-blocker slice 2 — mig 033 `counters` + `token_blocklist`: the two Mongo-only ops models blocking cutover (D-Counter gapless numbering + D-TokenBlocklist JWT revocation).**
  Branch `fix/pg-cutover-counters-token-blocklist`, per the phase-05 gate (owner: Counter=GAPLESS, not a PG SEQUENCE).
  **Counter**: `helpers/counter.getNextSequence` (empCode/classCode/certificateNumber) was Mongo-only → cert numbering breaks at
  cutover. Now dual (unit-of-work style, impls inline): Mongo `findOneAndUpdate $inc upsert` ⇔ PG `INSERT…ON CONFLICT DO UPDATE
  seq=seq+1 RETURNING` — row-lock atomic AND the increment rolls back with a failed tx (gapless-per-commit, parity-pinned incl.
  the rollback-reissues-the-number case + N-concurrent-distinct). `counters.id` = the counter NAME (not a `key` column): every
  migrated table keys on `id`, so the test auto-mirror reflects fixture writes/deletes (reconcileDrift's counter reset) correctly.
  **TokenBlocklist (SECURITY)**: `auth-tokens.revokeToken/isTokenRevoked` wrote/read Mongo-only → revoked JWTs stay valid on PG.
  New `services/auth/token-blocklist-repository.{js,mongo,pg}` seam (upsert-$setOnInsert ⇔ `ON CONFLICT (jti) DO NOTHING` —
  double-logout keeps the ORIGINAL row); auth middleware consults it on every authed request. Mongo's TTL index becomes a
  retention window: `token_blocklist.expires_at < now()` (days 0) added to `retentionPurgeJob` (E2 pattern; the reconcile_report
  window note removed for good — reconcile RETIRES at cutover). Parity: counter 4/4 + token-blocklist 4/4 + retention-purge 5/5;
  auth/authHardening/mfa/adminDb/reconcileDrift/reconcileAutoHeal/learningCompletionRoutes 88/88 PG lane; full suite green both
  lanes. Next slice: A3 calendar-link writeback + A4–A6 NotificationLog writers (one shared seam) + A8 automation seed.
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

## How to keep this current

After each milestone or significant change: update the phase/wave %, move the
status emoji, refresh the **Status board** (Now / Next), and add one dated line
at the top of *Recent progress*. Strategy detail stays in `lms-roadmap.md`.

**Rolling archive (keeps this file lean):** keep ~the last 2 weeks (~15 entries,
file ≤ ~400 lines) inline; in the SAME commit, cut older entries verbatim
(newest-first — they are an audit trail, do not reword) into
`changelog-archive/<year>-q<quarter>.md` and update its coverage header.
