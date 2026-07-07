# Phase 05 — Cutover & Decommission (the "zero raw-Mongoose write" gate)

**Status:** planned · **Created:** 2026-07-07 (from audit `plans/reports/audit-260707-0921-*` / `audit-260707-0048-*`)
**Owner decision (2026-07-07):** cutover = pure-PG (already in master plan Wave J/K); the "Mongo-only by design" write tail → **port ALL before Wave J** (not left Mongo-only, not deleted).
**Parent:** `master-execution-plan.md` Wave J (cutover weekend) + Wave K (decommission).

## Why this gate exists (cutover mechanics)

Wave J: freeze writes → final ETL (Mongo→PG, one-time) → flip `DB_BACKEND=postgres` → 30-day bake with **Mongo retained READ-ONLY** → Wave K: **drop Mongoose models + cancel Atlas** (PG-only).

Consequence the audit surfaced: the ETL copies data **once** at freeze. Any production code path that **still writes via raw Mongoose** after the flip:
- **during the 30d bake** → writes hit a READ-ONLY Mongo → fail (fail-soft paths lose data silently; others 500);
- **after Wave K** → Mongoose models dropped, Atlas gone → hard crash (no connection).

So every raw-Mongoose write below is a **cutover blocker**, regardless of whether its read is ported. The test-only `pg-auto-mirror` shim hides them on the `server-tests-pg` lane (it mirrors app-origin Mongoose writes into PG) — greenness there does NOT prove these are ported. **This gate is the completeness check the plan was missing.**

Definition of done for this gate: **grep of production `domains/`+`services/`+`controllers/`+`jobs/` for raw-Mongoose writes returns only repo-layer (`*.mongo.js`) hits.** Enforced by the F3 lane counter (below).

> **Status refresh (2026-07-07 evening, post Wave-G/F close):** already CLOSED by
> the gate-#8 push: **A7** (waitlist-promotion NotificationLog — #256/PR #260,
> dual `insertPromotionLog`/`setPromotionLogStatus` + mig 032 unique twin) ·
> **B2-transfer** (`enrollment-transfer.js` — Slice D #254 + #255/PR #259: team-add
> via `updateTeamDoc`, note via `setActiveTeamEnrollmentNote`, whole flow on
> `runInTransaction`; **`enrollment-status.js:48,131` + `enrollment-shared.js:59`
> remain**) · the **F-PR-2 ledger items** (attendance-export #258; the User
> status→Dropped auto-release hook now delegates to the dual
> `domains/schedule/roster-sync` — but **B1 `user-lifecycle.js` (user soft-DELETE
> cascade) is a SEPARATE path and remains raw-Mongoose**). Note: gate #8 was
> promoted 2026-07-07 (owner call) BEFORE the F3 lane counter existed — F3 is
> still worth adding as a hardening follow-up.

## Inventory — every production raw-Mongoose write (as of 2026-07-07)

Disposition = **PORT** for all (owner decision). Priority: A (split-brain: read already on PG) > B (unported controllers/services) > C (ops/reconcile) > D (no PG table yet).

### A. Split-brain hotspots — write raw-Mongoose, but reads ALREADY ported to PG
These lose/desync live data the instant prod flips (write→Mongo, read→PG).

| # | File:line | Write | Risk if unported at cutover |
|---|---|---|---|
| A1 | `domains/access/grants-loader.js:25` | `Role.updateOne` | **CRITICAL** — capability grants persisted to Mongo, read from PG → RBAC/authz breaks |
| A2 | `domains/learning/completion/recert-assignment-service.js:50` | `Assignment.create` | **CRITICAL** — auto-created recert assignments vanish (compliance data loss) |
| A3 | `domains/schedule/calendar-sync.js:74` | `Schedule.updateOne` | **HIGH** — Meet/room link writeback never reaches PG; sessions show no join link |
| A4 | `domains/notification/in-app-writer.js:17` | `NotificationLog.create` | MED — bell feed rows lost (fail-soft, silent) |
| A5 | `domains/learning/completion/expiry-reminder-service.js:34,42` | `NotificationLog.create/updateOne` | MED — expiry reminder logs + dedupe cadence lost |
| A6 | `domains/learning/assignment/reminder-service.js:34,42` | `NotificationLog.create/updateOne` | MED — assignment reminder logs + dedupe cadence lost |
| A7 | `domains/schedule/waitlist/promotion.js:126,147,153` | `NotificationLog.create/updateOne` | MED — waitlist-promotion email logs lost |
| A8 | `domains/automation/seed.js:33` | `AutomationRule.updateOne` | LOW — boot-time idempotent seed (re-seeds each start) |

**Port note:** A4–A7 all write `NotificationLog` → route through the ported `domains/notification/repository` seam (already dual-backend for reads; needs the write methods used by these callers). A2 → `domains/learning/*/repository` create seam. A1 → `domains/access/repository` write seam (reads already ported in batch 6). A3 → the ported `domains/schedule` repo (`updateScheduleById` twin already exists — swap the raw call).

### B. Unported controllers/services (F-PR-2 + ops/cron ledger — known, tracked)

| # | File:line | Write | Ledger tag |
|---|---|---|---|
| B1 | `controllers/user/user-lifecycle.js:61,71,79` | `Team/Schedule/Enrollment.updateMany` (auto-release on Drop) | F-PR-2 (User auto-release hook → must route through schedule domain seams) |
| B2 | `controllers/enrollment/enrollment-transfer.js:106,163` · `enrollment-status.js:48,131` · `enrollment-shared.js:59` | `Enrollment/Team/Schedule` writes | ops/cron ledger (`controllers/enrollment/*` ×4) |
| B3 | `controllers/evaluationController.js:74,247` | `Evaluation.findOneAndUpdate/findByIdAndUpdate` | ops/cron ledger (`evaluationController`) |
| B4 | `controllers/settingController.js:54` | `Setting.bulkWrite` | ops/cron ledger (`settingController`) |
| B5 | `controllers/syncController.js:270` | `Schedule.bulkWrite` (Sheets sync) | ops/cron ledger (`syncController`) |
| B6 | `controllers/importController.js:88,108` · `services/importService.js:180,276` | `Schedule/Attendance/User/Class` bulk import (in a session) | F-PR-2 (pairs with user-mutations write path) |
| B7 | `services/reminderService.js:93,160` | `Schedule.updateMany` (reminder claim/stamp) | ops/cron ledger (`reminderService`) |

### C. Reconcile / ops-consistency checker

| # | File:line | Write | Disposition |
|---|---|---|---|
| C1 | `services/reconcileService.js:139` | `ReconcileReport.create` | port with the reconcile slice, OR retire at cutover (owner call — it's a Mongo-consistency checker) |
| C2 | `services/reconcile/healers.js:37,50,60,76` | `RoomBooking.deleteMany` · `WaitlistEntry.updateOne` · `Team.updateOne` · `Counter.updateOne` | port with reconcile slice (room_bookings/waitlist_entries tables exist; Counter → see D) |

### D. Mongo-only ops models — NO PG table yet (need a PG story, not just a repo seam)

| Model | Used by | Needed before cutover |
|---|---|---|
| `Counter` | sequence gen (certificate numbering, `reconcile/healers.js:76`) | **BLOCKER** — PG SEQUENCE or `counters` table + atomic increment; cert numbering breaks otherwise |
| `TokenBlocklist` | JWT revocation (`auth/auth-tokens.js:127`) | **SECURITY** — PG `token_blocklist` table; without it revoked/rotated tokens stay valid on PG |
| `CronRun` | cron heartbeat/lock | port with a `cron_runs` table, or replace with a PG advisory lock |
| `ReconcileReport` | reconcile output (30d TTL) | table + join E2 purge job, or retire with reconcile (C1) |

## Verification gate (F3 — add before promoting `server-tests-pg` to required gate #8)

`pg-auto-mirror.js` already intercepts every app-origin Mongoose write on the PG lane. Add a **counter**: when `DB_BACKEND=postgres`, tally Mongoose writes to mapped models that originate from **production code** (not test fixtures). A non-zero count = an unported write path still live → fail the gate. This turns "lane is green" into "lane is green AND no production Mongoose write fired" — the real port-complete signal. (Distinguishing test-fixture writes from app writes: fixtures run in `beforeAll/beforeEach`; tag via a module flag toggled around fixture setup, or attribute by stack frame.)

## Order of work (suggested)

1. **A1 (RBAC) + A2 (recert) + D-Counter + D-TokenBlocklist** — highest blast radius (authz, compliance, cert numbering, token security).
2. **A3 calendar-link**, then **A4–A7 NotificationLog** (one shared notification write seam covers all four).
3. **B-tail** (F-PR-2: user auto-release + import; then enrollment/evaluation/setting/sync/reminder controllers).
4. **C reconcile** (owner: port vs retire) + **F3 lane counter** → promote `server-tests-pg` to gate #8.
5. **A8 automation seed** (trivial, last).

## Unresolved questions

1. **C1/C reconcile:** port the consistency checker to PG, or retire it at cutover (its whole job is Mongo-integrity)? Owner call.
2. **Counter under PG:** PG SEQUENCE (fast, gapless-not-guaranteed) vs a `counters` row with `UPDATE … RETURNING` (matches Mongo `findOneAndUpdate $inc` semantics)? Certificate numbering may require gapless — confirm.
3. **F3 attribution:** cheapest reliable way to separate test-fixture Mongoose writes from production ones on the lane (module flag around fixture setup is simplest; confirm no fixture writes leak outside setup hooks).
4. **B6 import in a Mongo session:** the bulk import wraps writes in a Mongoose `session` — the PG twin must move onto the `unit-of-work` (`runInTransaction`), same as the schedule/groups/planning ports.
