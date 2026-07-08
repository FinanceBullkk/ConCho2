# Session 2026-07-08 — K1 (Mongo runtime decommission): scope finding + safe slice shipped

## Outcome
Owner asked to start **Wave K-1** (run Mongo-less so Atlas can be retired). Investigation
showed K1 is **bigger than the earlier "~½ day" estimate** — the app still has **~7 read paths
that hit Mongo directly** (plus the Mongo-only reconcile service). Per owner call: **ship the
safe standalone fix now, defer the heavy Mongo-off decommission to K1b.**

## Shipped now (safe, backend-agnostic)
**`deleteCohort` ported to the Unit-of-Work abstraction** (`domains/learning`): use-case +
`repository.{mongo,pg}.js`. It was minting a raw `mongoose.startSession()` — which (a) needed a
live Mongo connection even under `DB_BACKEND=postgres`, and (b) the PG repo *ignored* the session
so the cohort soft-archive was non-atomic on Postgres. Now `runInTransaction(tx => …)` routes to
the active backend and the PG path gets **real cross-statement atomicity** (`tx.client`). Repo
method signatures take an OPTIONAL `tx` (3rd arg) → backward-compatible with the 2-arg parity
calls. Verified: Mongo lane 24/24 (`learning-repository-dual-backend` + `learningRoutes`), PG lane
8/8 (`learning-repository.pg` parity).

## The finding (deferred to K1b)
The F3 write-gate proved **zero raw-Mongoose WRITES**, but **READS were never fully gated**. Booting
the app truly Mongo-less (`connectDB()` skipped) surfaced read paths that still call Mongo models
directly — they **currently read Atlas `tms2` in prod, NOT Neon** (harmless today: no real users,
Atlas seed is empty). Cutting Mongo (or cancelling Atlas) 500s them until ported.

**Read stragglers (port to dual-backend/PG):**
| File | Endpoint | Notes |
|---|---|---|
| `controllers/user/user-queries.js` | `getUserProgress` | list already seamed; progress reads Enrollment/Team/Schedule/Attendance direct |
| `controllers/enrollment/enrollment-queries.js` | enrollment reads | 4 direct, no seam |
| `controllers/enrollment/enrollment-transfer.js` | transfer | partially seamed (2 seam / 3 direct) |
| `controllers/enrollment/enrollment-shared.js` | shared helpers | partial |
| `controllers/dashboard/dashboard-alerts.js` | dashboard alerts | 4 direct, no seam |
| `domains/room/utilization.js` | room utilization report | 2 direct |
| `services/pushService.js` | push subscription read | 1, fail-soft (minor) |

**Retire (Mongo-only, per cutover plan):** `services/reconcile/*` (~7 files) + `jobs/reconcileJob.js`
(started unconditionally at boot) + `routes/reconcileRoutes.js` + `/api/cron/reconcile` +
`routes/adminDbRoutes.js` (Mongo admin explorer). Guard/disable these under `DB_BACKEND=postgres`.

## K1b plan (Wave-F/G-sized, ~1–2 days, post-bake)
1. Port the 7 read stragglers to dual-backend repos + PG-parity tests.
2. Retire reconcile + adminDb in postgres mode (boot-guard the job; 410 the routes).
3. `server.js`: skip `connectDB()` when postgres + verify PG pool at boot; guard the Mongo shutdown.
4. `envValidator`: require `PG_URL` (not `MONGO_URI`) under postgres.
5. `healthRoutes /ready`: probe PG under postgres (currently probes Mongo → reflects Atlas after flip).
6. Then: deploy Mongo-off to Render → confirm → **owner cancels Atlas** (irreversible; after bake).
(The K1b boot/env/adminDb/ /ready edits were prototyped + verified Mongo-off-boots this session, then
reverted so they land atomically WITH the straggler ports — deploying them alone would 500 the stragglers.)

## Unresolved (owner)
1. Schedule K1b after the 1-week bake? (No urgency — stragglers read empty Atlas; no users.)
2. Atlas cancellation stays owner-driven + post-bake (rollback safety).
