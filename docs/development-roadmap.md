# Development Roadmap — TMS v2 → Internal LTMS (living tracker)

> **Canonical progress tracker.** Status board first, then milestone tables,
> then the recent changelog. Full history → [`changelog-archive/`](changelog-archive/).
> - *Why / strategy / 6-month direction* → [`lms-roadmap.md`](lms-roadmap.md)
> - *Architecture / orientation* → [`system-overview.md`](system-overview.md)
> - *Detailed task snapshot (archived)* → [`archive/handoff-2026-06-01.md`](archive/handoff-2026-06-01.md)
>
> **Last updated:** 2026-07-21

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
- **Now / Next — canonical English Operations:** ADR
  [`english-domain-authority`](decisions/english-domain-authority.md) is
  **Accepted** and supersedes the generic English handoff. Migrations 047–050
  are applied on the prototype: 52 stable classes retain 52 current PIC
  assignments; Course Run rosters read directly from `eng_run_enrollments`;
  one-current-PIC and one-active-enrollment invariants are database guarded;
  eligibility uses the Course Run's 80% attendance-ratio snapshot. Operators
  can now start a learner at the confirmed next logical session, create a real
  Meeting + Session Unit on an approved slot, and atomically save one exact P/A
  roster with stale-write protection. The 984 imported sessions were backfilled
  to 984 Meetings without changing their 5,962 attendance facts. Migration 050
  keeps past evidence read-only while handing 14 planned future Meetings to live
  operations with source timestamps retained, audit rows, correct Vietnam
  instants, and the shared calendar + drawer edit/cancel UX. Managed-person
  create now writes the disabled User +
  canonical Employee crosswalk atomically; the current-schema importer stages
  Meetings until correction overlays make active-slot validation safe.
  **Next:** learner transfer/leave and capacity override;
  optional second Session Unit / make-up credit; assigned-Teacher scope.
- **Canonical English baseline:** Phases 1–3 are complete on dev: identity,
  structure, correction overlay, 984 historical sessions, 5,962 attendance
  records, searchable attendance rosters, derived ratio eligibility, and (Phase 3,
  2026-07-19) **exam result & level entry** — HR/Admin records one of 13 ordered
  levels per finished learner, gated server-side by the Course Run attendance threshold, with a
  "needs level" worklist over completed runs. The real workbook reconciles
  losslessly; 182 DQ issues remain visible for later HR review. Evaluation rules
  are now HR-confirmed; **placement test, level promotion, and certificates stay
  out of scope** (certs are HR-external). Plans:
  [`phase-3`](../plans/english-integration-phase-3-evaluation.md) ·
  [`phase-2`](../plans/english-integration-phase-2-attendance.md). **UX redesign in
  progress (owner feedback):** round 1 shipped a task-oriented Overview landing;
  round 2 (2026-07-19) added a **class 360° detail** — the Classes tab drills into
  one class showing every learner's attendance/eligibility/level in one place.
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
- **Now:** **Phase 6 PostgreSQL migration COMPLETE — prod on PG, Atlas cancelled, and Mongoose fully removed from the server (Wave K decommission done 2026-07-14).**
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
| 6 | PostgreSQL migration / Wave K decommission | ~100% | 🟢 **DONE** — prod on PG + Atlas cancelled + **Mongoose fully removed (D2e-2b, 2026-07-14)** (Wave J 2026-07-08: Render `DB_BACKEND=postgres`, writes verified in Neon PG 17.10, mig 036 FK/CHECK applied, daily encrypted `pg_dump`; Wave K activation 2026-07-09: `MONGO_URI` removed, `/ready` 200 `backend=postgres`, `/api/admin-db` 410; **Atlas cancelled 2026-07-10**). Wave K Phase 2: A PG seed + B e2e-on-PG + **C Mongo CI gate retired (8→7)** + **D1a PG-only boot** + **D1b deleted 44 `.mongo.js` + 129 Mongo test/scaffolding files** + **D2a reconcile/admin-db feature fully retired (client + remnants + docs)** + **D2b runtime (non-model) mongoose removed** + **D2c fixture foundation** + **D2d COMPLETE** (batches 1–24 = ALL mechanical suites; batches 25–28 = the 4 model-behaviour re-home suites `autoReleaseScope`/`auditDataRound2`/`phaseAHardening`/`dataIntegrity`, all re-homed to their PG runtime enforcement 2026-07-13) + **D2e-1 runtime model-decouple** (2026-07-14: the 6 runtime files that required a model — only for a schema constant — re-homed to plain modules `services/audit-enums` + `domains/assessment/item-types` + `domains/schedule/roster-sync.syncSchedulesForTeamUpdate`; the AuditLog entity-enum + its coverage unit test re-homed too) + **D2e-2a harness→PG-native** (2026-07-14: `setup.js` seeds the shared core fixtures via `fx.*` straight into PG; `mongoose.connect`/`MongoMemoryReplSet`/auto-mirror/write-gate + `global-setup`/`global-teardown` all removed) + **D2e-2b DONE** (2026-07-14: deleted the 32 models + `config/db.js` + 9 Mongo-era scripts + `pg-write-gate` + `pg-auto-mirror` (→ `tableFor` extracted to `pg-table-resolver`); stripped the Mongo branches from `pg-test-utils`; flipped `db-backend` default to `postgres`; **dropped `mongoose` + `mongodb-memory-server` from `package.json` + lockfile**) done. **→ Wave K decommission COMPLETE; the server is Mongoose-free.** Follow-up (docs-only): sweep the stack docs (`CLAUDE.md`/`tech-stack.md`/`domain-model-and-migration.md`) that still describe Mongoose. |

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
> inline: **2026-07-12 (D2d batches 21-28) → 2026-07-14** (07-12 D2d batches 16-20
> rolled 2026-07-14, 07-11 rolled 2026-07-13, 07-10 rolled 2026-07-13,
> 07-04 E4 → 07-09 rolled 2026-07-12,
> 07-04 E1–E3 rolled 2026-07-08, 07-02→07-03 rolled 2026-07-07 →
> [`2026-q3.md`](changelog-archive/2026-q3.md); 06-20→06-27 rolled 2026-07-07;
> 06-14→06-19 rolled 2026-07-04 → [`2026-q2.md`](changelog-archive/2026-q2.md)).

- **2026-07-21** — **English future Meeting handoff re-sliced — Implemented,
  Gate 3 verification pending.** The oversized mixed worktree is now three
  delivery contracts and commits: migration/source baseline (`8660df7`),
  adopted Meeting commands (`a9136ef`), and responsive calendar/drawer
  composition (`8924eaf`). Targeted regression is green (server 15/15; client
  20/20). Real PostgreSQL HTTP coverage, migration up/down rehearsal, and the
  persistent/responsive Playwright matrix remain required before Verified.

- **2026-07-21** — **English Schedule direct manipulation and delivery notifications.**
  English Operations now creates a Meeting by clicking an empty approved grid
  cell and opens live Meeting cards for reschedule or durable cancellation.
  Imported, started, completed, cancelled, and attendance-bearing Meetings stay
  read-only; move/create share the exact-slot, future-time, and active-slot
  conflict guards; cancellation requires a reason and preserves the Session
  Unit plus both domain/global audit trails. Post-commit delivery mirrors the
  ConCho2 schedule without importing Team semantics: linked learners and the
  current PIC get bell notifications, SMTP recipients get create/move/cancel
  email when configured, and Google Calendar events are created/updated/deleted
  fail-soft. Migration 049 stores optional Calendar/Meet identity and is applied
  to both active and prototype databases. Verified: English schedule backend
  unit suites **48/48**, client interaction suites **12/12**, full client suite
  **563/563**, prototype **10 migrations / 22 columns / 984 Meetings / 5,962
  attendance facts**, lint 0 errors (5 pre-existing warnings), and production
  client build green. Browser smoke is pending only because the updated
  Playwright Chromium binary is unavailable in this sandbox.

- **2026-07-20** — **English Operations authority recheck and ready-to-use UX.**
  Rechecked Schedule/Attendance against pinned ConMeoGauGau commit `4107cd5`.
  A local 231-row attendance inference batch was compensated and removed
  because historical gaps must remain unknown; the compensating action is
  retained in `eng_audit_events`, and canonical source attendance returned to
  **5,962** facts. Historical roster detail now uses Meeting time plus
  event-time Cohort Membership applicability. Overview starts from common HR
  tasks; Schedule uses a full-width calendar with on-demand creation; Attendance
  adds evidence/recorded/upcoming filters and a full-width inline roster; and
  the top breadcrumb follows the active English query tab. English backend unit
  tests pass **73/73**, the full client suite **562/562**, both Playwright smoke
  flows pass, lint has no errors, and the production client build succeeds.

- **2026-07-20** — **Canonical English roster, Meeting, and live P/A attendance slice.**
  Ported the pinned ConMeoGauGau authority semantics into English Operations:
  Classes can start a learner in a PIC-owned class at the confirmed next
  logical session; Schedule creates one real Meeting plus its first normal
  Session Unit on an approved slot; Attendance calculates the event-time
  roster and saves exactly one Present/Absent result per applicable learner in
  one transaction. An opaque token rejects stale rosters; the same transaction
  completes the Meeting and writes domain audit. Migration 048 was applied to
  the disposable PostgreSQL prototype and backfilled **984 Meetings for 984
  imported Session Units**, retaining **5,962 attendance facts**. Verification
  found no bad Meeting links or canonical invariant violations; raw workbook
  evidence remains guarded. English backend unit tests pass **71/71**, the full
  client suite **558/558**, and the production client build succeeds. **Next:** transfer/
  leave, optional second Session Unit + make-up credit, assigned-Teacher scope.

- **2026-07-20** — **English Archive historical sessions reallocated without overlap.**
  Migration 045 adds a stable session-time correction overlay plus append-only
  batch evidence; raw Excel staging remains immutable and re-import reapplies the
  correction. A deterministic guarded CLI previewed then updated all **984**
  Session Units onto the approved five one-hour windows. **421** timestamps
  changed; only the unavoidable **24** sessions on 16 over-capacity dates moved
  to a nearby weekday. Transactional verification returned **0 mismatches, 0
  date/slot overlaps, and 0 duplicate class/dates**; course-run session order was
  preserved and an Admin `EnglishArchive` audit event was recorded. Allocation
  hash: `c0936b57d0e2589fb805d7238741083f65e08586071659e21c039d7a08733a85`.

- **2026-07-20** — **Approved English time-slot baseline corrected.**
  `ALLOWED_TIME_SLOTS` now uses five one-hour Vietnam windows: `09–10`,
  `10–11`, `13–14`, `14–15`, and `15–16`. The canonical seed and PG test
  baseline share one constant, and the local prototype setting was updated
  through the authenticated Settings API with its normal audit entry. This
  replaces the stale three-slot 90-minute test fixture visible in the grid.

- **2026-07-20** — **Schedule and Attendance UI ownership moved to English Operations.**
  Removed the duplicate Admin Console Operations navigation; Schedule,
  Attendance, and Mobile Attendance now enter through the English workspace.
  The English tabs reuse the canonical weekly grids and roster drawer, filtered
  by English course-run Cohort; English attendance exposes P/L/A/EL. Schedule
  and Attendance now separate **Live** from **Historical**: all 984 Archive
  Sessions and 5,962 Archive Attendance records are inspectable in those same
  grids with mutation controls locked, while zero historical events are copied
  into live storage. With no live English Sessions, each tab opens on the latest
  useful historical week instead of an empty current week: Schedule uses the
  latest Archive schedule, while Attendance uses the latest week containing P/A
  evidence. Cards distinguish complete, partial, and missing source marks; no
  missing learner is fabricated as absent. Archive Excel clocks are
  normalized as Vietnam wall time at the presentation boundary, fixing the
  prior duplicate `+07:00` shift (for example, 10:00 no longer renders 17:00).
  Legacy `/calendar`, `/schedules`, `/attendance`, and `/operations` links route
  to the matching English tab. Storage, conflict checks, authz, audit, and
  reporting remain on the shared generic domains.

- **2026-07-20** — **Superseded: active English rosters reconstructed and handed off.**
  The handoff now fills missing active-run rosters from verified evidence in a
  strict order: current active Enrollment, current-run Attendance evidence, then
  the latest prior non-dropped Attendance-evidenced roster for the same stable
  class. The preview exposes inferred counts and live Enrollments retain their
  source strategy/run for audit. Applied to the live app DB: **20 missing
  Enrollments created**, bringing **11 Ongoing English classes to 56/56 linked
  enrollment edges with 0 missing Users** (EL023 +5, EL027 +7, EL040 +3, EL042
  +5). Migration 046 and the corrected handoff then created **11 PIC-owned
  Teams**, attached all 56 Enrollments and 56 Team membership edges, resolved 8
  PIC leaders, and retained 3 name-only PICs as explicit unresolved leaders.
  The operation was transactional, audited, and verified idempotent; no
  historical Session or Attendance event moved.

- **2026-07-20** — **Superseded: English Operations generic prototype rehearsal.**
  Applied migrations 040–043 only to the disposable `PG_PROTOTYPE_URL` after a
  no-secret equality guard confirmed it differs from production `PG_URL`. Added
  a real-HTTP vertical integration smoke covering managed learner → disabled
  login → English Program/Cohort snapshot → PIC Team enrollment → generic
  attendance → eligibility → categorical final level. The full PostgreSQL lane
  passes **84/84 suites, 790/790 tests**. The reusable prototype verifier confirms
  all 4 migrations, 12 new columns, 15 Archive triggers, the immutable control
  trigger, and SQLSTATE `55000` for both prohibited write probes (transactions
  rolled back). Test reset now restores the migration-owned Archive control
  singleton. Production was not migrated or cut over; no Archive freeze occurred.

- **2026-07-20** — **Superseded: active English state projected to generic storage.**
  Added migration 044 and an Admin-only, audited, transactional handoff with an
  Admin/Coordinator preview in English Operations → Archive. It carries only
  active course-run structure and linked active rosters to shared live storage,
  using stable natural keys for retry safety. Prototype result: **5 Programs,
  11 Ongoing Cohorts, 11 PIC Teams, 56/56 Team Enrollments, 0 skipped**. Historical evidence
  stayed put (**984 Archive Sessions, 5,962 Archive Attendance; 0 copied live
  Sessions**), the Archive remains unfrozen, and one audit event was recorded.

- **2026-07-19** — **Superseded: English Operations generic convergence P0–P5.**
  Accepted the dedicated-workspace ADR while preserving one backend training
  spine. Added migrations 040–043, managed learners (`can_login=false`), typed
  English Program/Cohort policy snapshots, PIC Team enrollment late-join context,
  generic booking + attendance, strict assigned-Teacher resource access,
  eligibility-gated categorical final levels, and Archive cutover enforcement.
  The client now exposes Overview/Learners/Classes/Schedule/Attendance/Evaluation/
  Archive as a third workspace. Verification: full server unit suite 334/334,
  full client suite 540/540, client lint (0 errors), production build, and all
  18 operational script syntax checks pass. Production cutover remains an
  explicit post-deploy smoke/reconciliation action.

- **2026-07-19** — **English Training · UX redesign round 2 — class detail 360° (owner proposal #2).**
  The prior slice's named "next": open one class and see everything in one place
  instead of hopping tabs. The **Cohorts tab is now "Classes"** — a clickable list
  that drills into a read-only **class 360°** (in-page master-detail with a Back
  link): per course run, each learner's **attendance summary** (absences used /
  allowed), **exam eligibility**, and **level** in one table. One round-trip read
  `GET /english-training/cohorts/:id/detail` (dto `classDetail`) aggregates the
  cohort header + runs + rosters; the eligibility projection is **extracted to a
  shared `ELIGIBILITY_STATUS_SQL`** so the class view and the Eligibility tab
  can never disagree. Read-only (entry stays on Evaluation/Issues). Client
  536/536 + server english-training unit/route suites green + lint 0 errors.
- **2026-07-19** — **English Training · UX redesign round 1 — task-oriented overview (owner feedback).**
  Owner: the section "felt like a raw database, not usable." First redesign slice
  for the HR/ops user: the section now opens on a **task-oriented Overview** —
  headline counts + two actionable **"needs attention"** cards (349 learners
  awaiting a level → Evaluation · 182 open DQ issues → Issues) backed by a single
  `GET /overview` count query — instead of dropping into a raw cohorts table.
  Status columns across the tables render as **colored badges** (`eng-status-badge`).
  Client 535/535 + server 44 + lint 0 errors + real-PG overview smoke
  (52 cohorts, 308 employees, 91 runs/80 completed, 349 pending, 182 DQ). Next
  slice (proposed): cohort-centric detail page. Client-only + one read endpoint.
- **2026-07-19** — **English Training · Phase 3 evaluation UX polish (owner feedback).**
  Two entry-friction fixes on the just-shipped Evaluation tab: the shared class
  exam date now **defaults to the course run's end date**, and a single **"Save
  all"** button writes the picked level for every eligible learner in one click
  (concurrent writes → one summary toast), instead of saving row by row — matters
  with 349 learners pending across 71 completed runs. Server contract unchanged;
  client-only (`EvaluationView` + `useRecordExamResultsBatch`). Verified: client
  534/534 + lint 0 errors + build clean.
- **2026-07-19** — **Superseded policy: English Training evaluation phase 3.**
  Owner confirmed the rules: completion = sitting a final exam whose result **is a
  level** (13 ordered levels, no score/fail); **>2 absences ⇒ cannot sit**; HR/Admin
  enters levels via an in-app screen; certificates stay HR-external. Migration `039`
  seeds `eng_levels` (13) + `eng_exam_results` (one active per enrollment via
  partial-unique + soft-delete). New use-case `evaluation.js` enforces the
  ≤2-absence + participating-status gate **server-side** (422), rejects unknown
  levels (400), audits every write. Routes: `GET /levels`, `GET /pending-exam-entries`
  (completed-run "needs level" worklist), `POST`/`DELETE /enrollments/:id/exam-result`
  (`enrollment.manage`). Client gains an **Evaluation** tab: a "needs level" worklist
  that opens a run's roster in place (master-detail, no long scroll) with per-learner
  level entry under one shared class exam date; ineligible learners disabled. Verified: 8 server unit suites
  (38 tests) + real-Neon read/write smoke (13 levels, 349 pending across 71 runs,
  insert→update→soft-delete) + client tests + lint (0 errors). Plan:
  [`plans/english-integration-phase-3-evaluation.md`](../plans/english-integration-phase-3-evaluation.md);
  decisions: [`plans/reports/eng-phase3-hr-decisions-260719.md`](../plans/reports/eng-phase3-hr-decisions-260719.md).
- **2026-07-18** — **English Training integration · Phase 2 (historical sessions + attendance) — shipped on dev.**
  Read-only profiling locked `CLASS_SESSIONS` + normalized `ATTENDANCE` as the
  canonical sources and proved one occurrence per numbered unit, avoiding a
  speculative meetings table. Migration `038` adds constrained Session Units and
  Attendance Records. The batched import loaded **984 sessions + 5,962 attendance
  records** in 5.3s; all 5,996 attendance rows reconcile (34 duplicate evidence
  rows), raw staging totals 7,989, and 182 DQ issues remain inspectable. New
  Admin/Coordinator Sessions, roster, and Eligibility reads are wired into the
  existing English Training UI and guarded by `report.read`.
- **2026-07-18** — **English Training integration · Phase 1 (identity + structure) — foundation shipped (dark).**
  Follow-up correction slice now closes the first operational DQ loop: migration
  `037` adds a persistent employee correction overlay, append-only correction
  history, and `open/resolved/accepted` issue state. Admin/Coordinator can correct
  missing BU/job role from the DQ drill-down; the mutation validates input,
  backfills only `unknown` enrollment snapshots, records global + transactional
  correction audit, resolves matching issues, and re-applies corrections after a
  canonical reset/import without changing raw workbook evidence.
  New deep domain `domains/english-training` mounted at `/api/english-training`
  behind `ENGLISH_TRAINING_ENABLED` (ships dark). Migration `036` adds 7 canonical
  `eng_*` tables + raw staging + a data-quality issue log, with inline FK/CHECK/UNIQUE
  (runs in CI + prod via the chain). A lossless import pipeline
  (stage → transform → load → reconcile, `scripts/eng-import.js`) loaded the real
  workbook on the prototype DB: **308 employees, 52 cohorts, 6 courses, 91 course
  runs, 552 enrollments** — `source = loaded` on every sheet, 36 anomalies recorded
  (not dropped). Owner decisions: `Resign`→inactive (16); one-active-enrollment is a
  soft/reporting rule (real concurrent data); `course_code` auto-slug; eligibility =
  `max_absences_allowed` (count, not ratio). Read-only Admin/Coordinator API (7
  endpoints) + 12 pure transform unit tests. Spec: `docs/specs/english-training/`
  (evolving). Out of scope (later phases): attendance, make-up, evaluation, placement,
  completion, login-account creation. Plan: `plans/english-integration-phase-1.md`;
  DQ review: `plans/reports/eng-import-data-quality-review-260718.md`.
- **2026-07-14** — **Wave K Phase 2 · Batch D2e-2b — DROP `mongoose` + `mongodb-memory-server` → Wave K decommission COMPLETE.**
  The final cut: the server is now **Mongoose-free**. Deleted the **32 Mongoose model
  files**, `config/db.js`, **9 Mongo-era scripts** (`create-admin`/`reset_admin_pw` +
  7 `dev-tools/*` diagnostics/parity), `pg-write-gate.js` + its unit test, and
  `pg-auto-mirror.js` — whose sole survivor, the reflective table resolver `tableFor`,
  was extracted to **`tests/pg-table-resolver.js`** (no `mongoose`). Stripped the
  `if (!isPostgres)` Mongoose branches + the dead `mirror*ToPg` helpers from
  `pg-test-utils` (Postgres-only now). Flipped the `config/db-backend` default
  `mongo`→`postgres` (the only thing the flag still distinguishes is a legacy value
  that no longer resolves to anything runnable). Removed both deps from
  `package.json` and regenerated the lockfile with **npm 10** (67 packages pruned).
  `express-mongo-sanitize` KEPT (a runtime input-sanitizer, not a model dep).
  **Verified:** server boots Mongoose-free (`require.resolve('mongoose')` → not
  found); prod high+ `npm audit` clean; **~57 suites / 700+ tests** on the PG lane
  across every rewritten `pg-test-utils` helper (audit chain, `distinct`, `$in`,
  team junction, `addAllowedTimeSlot`) + the core seed + all unit; a mongoose-free
  server+harness load-check. The required full PG gate #8 is the complete check.
  **Wave K (Postgres migration + Mongo decommission) is DONE — Phase 6 closed.**
  Follow-up (docs-only): sweep `CLAUDE.md` / `.claude/rules/tech-stack.md` /
  `domain-model-and-migration.md`, which still describe the retired Mongoose stack.
- **2026-07-14** — **Wave K Phase 2 · Batch D2e-2a — retire the Mongo test harness (the last Mongoose fixture path).**
  `tests/setup.js` seeded the shared core fixtures (admin/teacher/two cohorts/team +
  `ALLOWED_TIME_SLOTS`) with `Model.create` and mirrored them to PG. Now it seeds
  them **straight into Postgres via `fx.*`** (added `fx.createSetting`) — no
  `mongoose.connect`, no `MongoMemoryReplSet`, no auto-mirror/write-gate registration,
  no `mirrorCoreSeedToPg`. `resetPgDatabase()` (per-file truncate) is the isolation;
  `teardown` is just `closePool`. Deleted **`global-setup.js` + `global-teardown.js`**
  (they only booted the shared replica set + ran the F3 write-gate verdict — both
  obsolete once no Mongoose write fires) and dropped `globalSetup`/`globalTeardown`
  from the jest config; a fail-fast guard rejects a non-`postgres` `DB_BACKEND`.
  **`mongoose` + `mongodb-memory-server` stay in `package.json`** (the 35 models are
  still present) — removed in D2e-2b, keeping this PR's blast radius to the harness.
  Verified on the PG lane: **58 suites / 572 tests** (auth/booking/teams/enrollment/
  attendance/assessment/audit/dashboard/schedule/learning/compliance/reminders/
  notifications + ALL unit + p2-regression + softDeleteEmpCodeReuse) + a harness
  load-check; the required full PG gate #8 is the complete check. **Next: D2e-2b** —
  delete the 35 models, strip the Mongo branches from `pg-test-utils`/`pg-auto-mirror`
  (keep `tableFor`), delete `pg-write-gate`, flip the `db-backend` default to
  `postgres`, drop both deps from `package.json` (+ lockfile), remove the Mongo-era scripts.
- **2026-07-14** — **Wave K Phase 2 · Batch D2e-1 — decouple RUNTIME app code from the Mongoose models (prereq for the model delete).**
  Before D2e can delete the 35 models, the 6 runtime (non-test/non-script) files
  that still `require('../models/*')` — all of them only for a schema-derived
  constant — had to be re-homed. Extracted to plain modules: **`services/audit-enums.js`**
  (`AUDIT_ENTITY_VALUES` 42-value ratchet + `AUDIT_ROLE_VALUES`, consumed by
  `audit-repository.pg` + the re-homed `auditEntityEnumCoverage` unit test);
  **`domains/assessment/item-types.js`** (`ITEM_TYPES`, consumed by the two
  assessment zod schema files); Class status inlined in `class-repository.pg`
  (2 values, one consumer). The `syncSchedulesForTeamUpdate` team member-edit
  side-effect (was `models/Team.js`) moved to **`domains/schedule/roster-sync.js`**
  (a thin adapter over its `syncTeamRoster`); `groups/repository` + `enrollment-transfer`
  import it from there now. **Behavior-preserving refactor** — the extracted enums
  match the model definitions EXACTLY (42/42 entity, role, ITEM_TYPES verified by a
  diff check); no observable change, no spec touch. **The 35 models are untouched**
  (still loaded by the test harness + Mongo-era scripts — deleted in D2e-2). Verified
  on the PG lane: 64 tests across 6 suites (audit-enum-coverage/auditWriteSide/
  assessmentRoutes/enrollmentTransfer/classDeleteSoftArchive/teams) + a load-check of
  every redirected module (no circular import). **Also folded in: a flaky-test fix**
  — the batch-27 `phaseAHardening` DATA-014 "old token → 401" add-on was racy (the
  auth-cache ~30s TTL + whole-second `iat` vs the 1s skew guard flipped it 200/401
  and reddened this PR's gate #8 on an unlucky run). Dropped that add-on assertion;
  DATA-014's deterministic invariant (passwordChangedAt bump + skew guard) stays,
  matching the original Mongoose test's scope (it never asserted rejection). 4/4
  reruns green. **Next: D2e-2** — delete the 35
  models, decouple the test harness (`setup.js`/`global-setup.js`) from `mongoose` +
  `mongodb-memory-server`, drop both deps from `package.json`, remove the Mongo-era
  scripts.
- **2026-07-13** — **Wave K Phase 2 · Batch D2d batch 28 — `dataIntegrity` re-homed (LAST re-home suite → D2d COMPLETE, D2e unblocked).**
  Every invariant now asserts its PG runtime enforcement, not the Mongoose model
  layer: **DATA-002** → the partial-unique index `uq_classes_code_ongoing`
  (**migration 009, IN the CI chain** — so a duplicate Ongoing classCode raises PG
  `23505`, the twin of Mongo's E11000); **DATA-005** → the ported
  `DELETE /api/schedules/:id` cancel (past→409+preserved, future→200 durable
  `cancelled` flip); **DATA-007** → the Mongo `Team.aggregate` soft-delete hook
  replaced by the ported team-list — `GET /api/teams` filters `is_deleted = false`
  (hidden) while `GET /api/teams/deleted` still returns it (the trash view = the PG
  twin of the aggregate override); **DATA-013** → the `endTime<=startTime` rejection
  runs through `POST /api/schedules` (→ `scheduling-window-policy.assertValidBookingWindow`,
  which checks ordering BEFORE the slot-window → 400 `endTime must be after
  startTime`). Dropped only the Mongo-model-only "valid endTime is accepted"
  positive case (a bare `Schedule.create`; generic booking coverage, not unique to
  DATA-013 — the create/booking happy path is covered by `booking`/schedule suites).
  Fixtures PG-native (`fx.*`); no `mongoose`/model require left. **This closes the
  D2d re-home tail — ALL of D2d is done.** Verified on the PG lane: 7/7, write-gate
  clean. Pure test-infra, no app/spec change. **Next: D2e** — drop
  `mongoose`/`mongodb-memory-server`, delete the 35 models (+ re-home the AuditLog
  entity-enum + `auditEntityEnumCoverage` unit test).
- **2026-07-13** — **Wave K Phase 2 · Batch D2d batch 27 — `phaseAHardening` re-homed off Mongoose (3rd re-home suite; only `dataIntegrity` left).**
  DATA-014 stopped unit-testing the `User.pre('save')` hook (dies with the model at
  D2e) and now drives the REAL runtime twin: `PUT /api/auth/change-password`
  (`auth-session.js` stamps `passwordChangedAt = now()-1s` via the ported PG auth
  repo `updatePassword`) — asserting the bump, the clock-skew guard (≥900 ms in the
  past), AND the resulting **old-token rejection** (`GET /api/auth/me` → 401 after
  the auth-cache invalidation) — a stronger check than the old timestamp-only unit
  test. The "no bump without a password change" case runs through the admin
  `PUT /api/users/:id` name update (only sets `passwordChangedAt` when a password is
  present). DATA-010 (importService no-role-escalation) + DATA-009 (soft-deleted
  users excluded from `attendanceService.analyticsByEmployee` + `exportService.
  queryExportData` — both PG-ported) keep their service/route drivers; only fixtures
  move to `fx.createUser`/`createSchedule`/`createAttendance` + soft-delete via
  `updateActiveRow`. No `mongoose`/model require left. Verified on the PG lane: 7/7,
  write-gate clean. Pure test-infra, no app/spec change. **Remaining re-home tail:
  just `dataIntegrity`** (Mongo E11000 partial-unique / `pre('validate')` endTime
  guard / `aggregate` soft-delete hook) → then **D2e**.
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

## How to keep this current

After each milestone or significant change: update the phase/wave %, move the
status emoji, refresh the **Status board** (Now / Next), and add one dated line
at the top of *Recent progress*. Strategy detail stays in `lms-roadmap.md`.

**Rolling archive (keeps this file lean):** keep ~the last 2 weeks (~15 entries,
file ≤ ~400 lines) inline; in the SAME commit, cut older entries verbatim
(newest-first — they are an audit trail, do not reword) into
`changelog-archive/<year>-q<quarter>.md` and update its coverage header.
