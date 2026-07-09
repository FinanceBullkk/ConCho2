# Phase 1 — Retire dead Mongo-only runtime

**Priority:** first (lowest risk). **Status:** blocked on P0-a/P0-b.
**Precondition:** Atlas cancelled + owner "go" (see [plan.md](plan.md)).

## Overview
These files are already skipped/guarded under `DB_BACKEND=postgres`, so deleting
them is **prod-behavior-neutral**. Removing them first shrinks the surface before
the repo/model collapse.

## Files & disposition
| File(s) | Now | Action |
|---|---|---|
| `services/reconcileService.js` | Mongo-only, skipped under pg | delete |
| `services/reconcile/*` (counter/enrollment/healers/schedule/team/waitlist-checks) | Mongo-only | delete (6) |
| `controllers/reconcileController.js` | Mongo-only reconcile HTTP | delete + unmount route |
| `jobs/reconcileJob.js` | `isPostgres` → skip | delete + unregister in `server.js` |
| `routes/adminDbRoutes.js` | 410'd under pg via mongoOnlyGone | delete + unmount (`server.js:283`) |
| `middleware/mongoOnlyGone.js` | 410s Mongo-only routes when Mongo off | delete after adminDb+reconcile routes gone (its only purpose) |
| `config/db.js` (`connectDB`) | Mongo connection | **KEEP** — `seed.js` + the backend-aware boot still need it (deleted in Phase 5 with the PG seed) |
| `server.js` Mongo boot branch | backend-aware (mongo `else` branch) | **KEEP backend-aware in Phase 1** — the PG-only collapse moved to Phase 4 (see below) |
| `tests/integration/adminDb.test.js`, `tests/unit/mongoOnlyGone.test.js` | test the above | delete with their targets |

> **⚠️ Correction (2026-07-09, learned from PR #280 CI):** an initial Phase-1 pass
> collapsed the `server.js` boot path to an unconditional `pg.ping()` (PG-only). That
> **broke the e2e gate** (it still boots the server on the **Mongo** backend — no PG
> seed exists yet) with `PG connection string missing`, and is only correct once the
> Mongo test lane + e2e are migrated to PG. **So the boot-path PG-only collapse + the
> Mongoose shutdown-close removal + deleting `connectDB`/`config/db.js` all move to
> Phase 4/5.** Phase 1 keeps the boot path backend-aware and only removes reconcile/
> adminDb/mongoOnlyGone. `verify-backup.js` also stays (Atlas pre-cancel tool).

## Steps
1. Unmount `/api/admin-db` and `/api/admin/reconcile` in `server.js`; drop the
   reconcile job registration (require + `startReconcileJob` + `stopReconcileJob`).
   Surgically drop only the `/cron/reconcile` route from `cronRoutes.js` (keep
   reminder/recert/health); drop `CRON_JOBS.reconcile` from `cronMonitor`.
2. Delete the reconcile cluster (service + `services/reconcile/*` + controller +
   job + routes + `schemas/reconcile`), `adminDbRoutes`, `mongoOnlyGone`, and the
   reconcile-only tests. Trim reconcile cases from shared tests (`auditWriteSide`,
   `cronRoutes`, `cronHealthRoutes`, `cronMonitor`, `analyticsPerf`, `learningEnrollmentRoutes`).
3. **Leave the boot path backend-aware** (do NOT touch `connectDB`/`isPostgres`/the
   `if(isPostgres)…else` branch/the Mongoose shutdown-close) — that collapse is Phase 4.
4. Grep for dangling requires of deleted modules → must be empty.
5. Run the affected suites on BOTH lanes; the full both-lane + e2e run is the PR CI gate.

## Watch-outs
- `controllers/cronHealthController.js` references `DB_BACKEND` — the cron
  *health* endpoint stays (it's the pinger target); only the reconcile *cron* goes.
- `retentionPurgeJob` + `snapshotJob` STAY (they run under pg) — do not touch.
- `lib/cronMonitor.js` / `lib/cron-run-repository.*` support cron monitoring
  generally, not just reconcile — verify before touching (likely keep).

## Success criteria
- No reconcile/adminDb/mongoOnlyGone code or routes remain; `server.js` boots with
  no Mongo require. Suite + lint green on PG.

## Open questions
- Does any external monitor still POST `/api/cron/reconcile`? If yes, return a
  clean 410/404 by design (route simply unmounted) — confirm the pinger is off it.
