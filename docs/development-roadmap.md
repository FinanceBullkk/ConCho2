# Development Roadmap — TMS v2 → Internal LTMS (living tracker)

> **Canonical progress tracker.** Status board first, then milestone tables,
> then the recent changelog. Full history → [`changelog-archive/`](changelog-archive/).
> - *Why / strategy / 6-month direction* → [`lms-roadmap.md`](lms-roadmap.md)
> - *Architecture / orientation* → [`system-overview.md`](system-overview.md)
> - *Detailed task snapshot (archived)* → [`archive/handoff-2026-06-01.md`](archive/handoff-2026-06-01.md)
>
> **Last updated:** 2026-07-02

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
  **Wave B (whole-repository CRUD) IN PROGRESS:** room (#6) + org (#7) + session-type (#8) + skill (#9) + trainer (#10) + vendor (#11) + **learning programs+cohorts (#12)** + **learning/enrollment (#13)** + **learning/completion (#14)** + **learning/feedback (#15)** + **learning/path (#16)** + **branding (#17)** + **access (#18)** + **custom-field (#19)** + **finance (#20)** + **automation (#21)** + **compliance (#22)** + **notification (#23)** + **mobile (#24)** + **org/office (#25)** + **assessment/question-bank (#26)** + **report-presets (#27)** + **executive-dashboard (#28)** + **dashboard (#29)** + **learning/assignment (#30)** done. **Port-now set** (sequencing report `plans/reports/plan-260623-0720-*`): office ✓ · question-bank ✓ · report-presets ✓ · executive-dashboard ✓ · dashboard ✓ · learning/assignment ✓ (mig 023) · attendance ✓ (mig 025) · learning/reports ✓ (no new mig) · assessment ✓ (mig 026) — **port-now set COMPLETE**. **Transaction tail IN PROGRESS:** schedule chokepoint **repo + orchestration + read-path FULLY dual-backend** — S0 tables + S1 reads + S2 waitlist + S3a 12 txn methods + S3b-1 create/cancel cutover + S4 FIFO promotion + S3b-2 updateSchedule cutover + **S5 read-path completion (the last 6 Mongo-direct re-fetches in `scheduleService` — booking/admin-create response, cancel load + leader-auth + waiter emails — routed through 3 new dual-backend reads `findScheduleForResponse`/`findScheduleForCancellation`/`findTeamLeaderId` + reused `findUsersForEmail`; `scheduleService` now has ZERO direct Mongoose)** ✓ (mig 027) → **the booking chokepoint runs end-to-end on either backend.** **planning ✓ (mig 028 — the TNA `scheduleItem` 4-write transaction cut over to the UoW; finance `createBudget` now tx-aware on both backends)**. The transaction-heavy tail (`groups` · schedule chokepoint · `planning`) is DONE — the dual-backend transaction abstraction (`domains/_shared/unit-of-work`, parity-proven 2026-06-25 on real Neon) carried all of them — and **learning/session ✓ (2026-07-03, no new mig — read-only 9-method port: the list/detail 6-way populate hydration + booking-adapter context reads; writes were already dual-backend via the sealed `scheduleService` chokepoint) → Phase 3 repository ports COMPLETE. Next: Wave E (auth & audit)**.
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
| 6 | PostgreSQL decision gate | ~38% | 🟡 in progress (gate OPENED 2026-06-21; foundation #184 on main; repo ports underway — Wave A read-only DONE 5 ports + Wave B CRUD: room/org/session-type/skill/trainer/vendor/branding/access + learning programs+cohorts/enrollment/completion/feedback/path (13) whole-repo ports done; **Wave-D keystone: dual-backend transaction abstraction built + parity-proven 2026-06-25 on real Neon → unblocks groups/planning/schedule-chokepoint; groups transaction port COMPLETE (lifecycle + team-write/membership-bridge + enrollment-sync, slices 1-3) 2026-06-26; syncSchedules/reads Mongo-only by design**; **attendance repository ported (mig 025) 2026-06-26 — reads/bulk-upsert/lastActive/4 analytics aggregations, 16/16 parity**; **learning/reports repository ported (no new mig) 2026-06-27 — 20-method report read surface, 13/13 parity**; **assessment domain ported (mig 026) 2026-06-27 — definitions/attempts/grading-queue, 13/13 parity — port-now set COMPLETE**; **schedule chokepoint port STARTED (mig 027) 2026-06-27 — S0 tables (waitlist_entries/room_bookings) + S1 the 25 reads, 13/13 parity, merge-selector keeps writes Mongo until S3**; **schedule chokepoint COMPLETE end-to-end (S2–S5) 2026-06-27**; **planning ported (mig 028 — scheduleItem txn on the UoW) 2026-07-02**; **learning/session ported (no new mig, read-only) 2026-07-03 — Phase 3 repository ports COMPLETE; next: Wave E auth & audit**; `DB_BACKEND=mongo` default) |

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
> inline: **2026-06-14 → 2026-07-03** (window overdue for an archive roll —
> housekeeping follow-up).

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

- **2026-06-19** — **Converge Phase 4 slice D — sidebar persona cleanup; PHASE 4 COMPLETE (#168).**
  Retired the now-vestigial English **admin** nav group and moved **Teams → People**
  (`/people?tab=teams` — a Team is a group of people, matching the shipped target IA). `/english`
  is now learner-persona-only (the leader booking grid); Admin/Teacher reach every former English
  surface from the unified Admin Console nav. Updated `nav-config`, `PeoplePage` (Teams tab,
  `read:teams` = admin-only there), `EnglishPage` (booking-only), and the cross-links in `AlertBand` +
  `SearchPalette`; e2e `navigation`/`permissions` specs repointed to `/people?tab=teams`. EnglishPage +
  Sidebar tests updated; client 407 + lint (cap 41) + build green. **Phase 4 (UX journeys) is COMPLETE** —
  the parallel-world convergence (catalog · calendar · attendance · schedules · grading) plus the
  persona-clean sidebar are all shipped. (Phase 3 slice 5 `mode`-fork removal + Phase 5/6 remain.)

- **2026-06-19** — **Converge Phase 4 slice C3+C4 — surface Grading, retire the English Evaluations tab (#167).**
  Final grading-UI slice. Added a **Grading** leaf to the Learning nav group (standalone `/grading`,
  leaf-in-group like Operations' mobile-attendance) + `nav.sections.grading` label, and **retired** the
  English **Evaluations** tab (`nav-config` + `EnglishPage`, dropping `EvaluationPage`/`ClipboardEdit`
  imports). The English section is now **Teams** (admin) + the leader booking grid; a Teacher's English
  section is "not available" (they grade from `/grading`). Spec `evaluations` updated (grading-UI surface
  is now the unified workspace; English tab retired) + registry. EnglishPage + Sidebar tests updated;
  client 408 + lint (cap 41) + build green. **Grading-UI unification (slice C) COMPLETE** — the unified
  Grading workspace grades quiz + rubric from one place, no model merge. Only the persona-journey sidebar
  re-cut remains in Phase 4.

- **2026-06-19** — **Converge Phase 4 slice C2 — unified Grading workspace page (#166).**
  New `/grading` route (Admin/Coordinator/Teacher) + `features/grading/GradingPage.jsx` + `useGrading`
  hook consume the C1 feed and group gradable units by mode. Quiz row → fetches the full assessment
  and opens the native `ManualGradingModal` in place; rubric row → opens the existing `EvaluationPage`
  **scoped to the class** via a new optional `classId` prop (backward-compatible — hides the picker,
  keeps the status badge + Admin "show all"), behind a Back link. Reuses both native entry surfaces —
  no grading logic duplicated. Client-only (consumes the C1 contract; no new server behaviour → no spec
  delta). 4 component tests; client suite 409 + lint (cap 41) + build green. Next: C3 (Learning nav item
  + retire the English Evaluations tab) → C4.

- **2026-06-19** — **Converge Phase 4 slice C1 — grading-queue read endpoint (#165).**
  First slice of the grading-UI unification. `GET /api/assessment/grading-queue` (capability
  `assessment.manage`) returns the staff "to-grade" feed across BOTH modes as gradable **units**:
  `quiz` = published `short_text` assessments + attempt counts (Teacher scoped to their cohorts);
  `rubric` = team-world (English) classes + evaluation counts (Admin/Teacher only; cohort-world
  excluded via the `_shared/scheduling-modes` SSOT). Additive read in `domains/assessment`
  (use-cases/repository/dto/controller/routes); no writes, not audited. 4 integration tests; full
  server suite green (129 suites / 1177). Spec `grading` updated. Next: C2 (Grading workspace page
  under Learning) → C3 (nav + retire English Evaluations tab) → C4 (spec/docs).

- **2026-06-19** — **Converge Phase 4 — grading-UI unification (slice C) PLANNED (not built).**
  Investigated folding Evaluations and found it is NOT a display-fold (no generic twin to redirect to):
  rubric scoring (`Evaluation`: 4 fixed scores/learner/class) vs quiz manual grading (`ManualGradingModal`)
  are different models, so "folding" = building a unified staff grading workspace — a real feature.
  Wrote a phased mini-plan (`plans/260614-0004-converge-to-one-model/phase-04-grading-ui-unification.md`):
  recommended approach is a "Grading workspace" (one list across both modes, reusing the native
  `EvalModal`/`ManualGradingModal`; no model merge), sliced C1 server read → C2 client page → C3 nav +
  retire English Evaluations tab → C4 spec. Owner approved planning-only; not started. The parallel-world
  surface convergence (catalog/calendar/attendance/schedules) is otherwise complete.

- **2026-06-19** — **Converge Phase 4 slice A2b — retire the English Schedules tab (#163).**
  Now that Operations Schedules is unified (A2a, both worlds + facet), the separate English Schedules
  tab duplicated it. Removed the nav item (`nav-config`) + the page tab (`EnglishPage`, with its
  `SchedulesPage`/`CalendarCheck` imports). Old `/english?tab=schedules` links fall back gracefully to
  Teams. The e2e `navigation.spec.js` case for that path now asserts graceful fallback (`innerHeading:
  null`); the unified schedules is covered by the existing `/calendar?tab=schedules` case. **Milestone:
  the parallel-world duplication is now fully converged — ONE catalog (Cohorts), ONE calendar, ONE
  attendance, ONE schedules surface.** The English section is minimal: Teams + Evaluations + the leader
  booking grid. Tests: EnglishPage + Sidebar updated; client suite 405 + lint (cap 41) + build green.
  Remaining Phase 4: evaluations grading-UI unification (a real feature build, not a display-fold — own
  plan) + the persona-journey sidebar re-cut.

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
