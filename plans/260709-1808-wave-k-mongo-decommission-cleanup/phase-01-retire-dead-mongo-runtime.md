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
| `config/db.js` (`connectDB`) | Mongo connection | delete after `server.js` boot path de-Mongo'd |
| `server.js` Mongo boot branch (`~L385-407`, `~L479-480`) | optional connect + close | remove; keep PG pool verify only |
| `scripts/verify-backup.js` | Mongo backup verify | delete (PG uses `verify-pg-backup.js`) |
| `tests/integration/adminDb.test.js`, `tests/unit/mongoOnlyGone.test.js` | test the above | delete with their targets |

## Steps
1. Unmount `/api/admin-db` and the reconcile cron route in `server.js`; drop the
   `mongoOnlyGone` mount and the reconcile job registration.
2. Delete the reconcile cluster, adminDbRoutes, mongoOnlyGone, verify-backup, and
   their tests.
3. De-Mongo the `server.js` boot path: drop `connectDB` require + the optional
   Mongo connect/close blocks; keep PG pool fail-fast. Delete `config/db.js`.
4. Grep for now-dangling requires (`reconcileService`, `reconcileController`,
   `adminDbRoutes`, `mongoOnlyGone`, `config/db`, `verify-backup`) → fix/remove.
5. Run server Jest (PG) + client test:run + lint. Green.

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
