# Session 09 - Cron + Reconcile + Observability

## Goal

Answer: can operators know scheduled jobs and drift checks actually work?

## Scope

In: reconcile job, attendance reminders, cron pinger routes, CronRun heartbeat,
admin cron health, Sentry check-ins, fail-soft behavior.

Out: paid hosting/Sentry account setup that only owner can do.

## Evidence

Inspected:

- `server/lib/cronMonitor.js` — `runMonitored` (heartbeat + Sentry check-in
  wrapper) and pure `deriveHealth` verdict logic; shared `CRON_JOBS` metadata.
- `server/jobs/reconcileJob.js` — in-process nightly scheduler; SIGTERM-safe
  stop; audits scheduled run + failure.
- `server/routes/cronRoutes.js` — token-authed external-pinger endpoints
  (reconcile / health / attendance-reminders), all monitored via same slug.
- `server/routes/cronHealthRoutes.js` + `controllers/cronHealthController.js`
  — Admin-only heartbeat view; overall verdict = degraded if any job not ok.
- `server/services/reconcileService.js` — 10 read-only drift checks, parallel
  with per-check error-swallow, persisted ReconcileReport.
- `server/middleware/cronAuth.js` — constant-time token compare; 503 if token
  unset/<16 chars; 401 + audit on failure.
- `server/models/CronRun.js` — durable one-row-per-job heartbeat (no TTL).
- `client/src/components/CronHealthPanel.jsx` + `api/api.js` cronAPI.
- Docs: `docs/cron-pinger-setup.md`, `docs/runbook-cron-failure.md`,
  `docs/backup-dr.md`.

Tests reviewed: `cronMonitor.test.js`, `cronAuth.test.js`, `cronRoutes.test.js`,
`cronHealthRoutes.test.js`, `reconcileDrift.test.js`.

Commands run (single jest invocation, shared in-memory replica set):
`npx jest cronMonitorRun cronMonitor cronAuth cronRoutes cronHealthRoutes
reconcileDrift --runInBand --forceExit` → 6 suites / 43 tests green.

## Required Scenario coverage

- never/stale/error/ok health derivation → `cronMonitor.test.js` ✅
- pinger endpoint records same heartbeat as in-process cron → shared
  `CRON_JOBS` const + `cronHealthRoutes.test.js` (pinger reconcile run shows up
  as healthy `reconcile` job via the heartbeat) ✅
- Sentry failures do not break the job → **was uncovered** → added
  `cronMonitorRun.test.js` ✅ (see Action)
- Cron auth failure rejected safely → `cronAuth.test.js` + `cronRoutes.test.js`
  (401 missing/wrong, 503 unset) ✅
- Reconcile flags known high-risk drift → `reconcileDrift.test.js` (checks
  6–10 + all-10 summary-keys regression; checks 1–5 also exercised in
  `analyticsPerf.test.js`) ✅

## Verdict

OK.

Why: implementation is correct and fail-soft by construction. Heartbeat writes
and Sentry check-ins are each try/caught; the job's result/error pass through
untouched. Auth refuses to fail open (503 when unconfigured), uses constant-time
compare, and audits failures. Health derivation and drift detection are
well-tested. One required scenario — "Sentry failures do not break the job", and
more broadly the entire `runMonitored` fail-soft contract — had **zero unit
coverage** (the existing `cronMonitor.test.js` only tested the pure
`deriveHealth`). Behavior was right; the load-bearing path was just untested.

## Action

Fix now (test hardening, no production code change): added
`server/tests/unit/cronMonitorRun.test.js` covering `runMonitored`:

- happy path returns fn result + writes start/end heartbeat + ok check-in.
- Sentry check-in throwing does not break the job.
- heartbeat (CronRun) write failure does not break the job.
- Sentry disabled → no check-ins / no capture, job still runs.
- job error re-thrown AND recorded (error check-in + captureException).
- captureException throwing on the error path is swallowed; original job error
  still surfaces.

Required owner input: none.

## Verification

Small tests: `cronMonitor.test.js` (deriveHealth, 6), `cronMonitorRun.test.js`
(runMonitored fail-soft, 6), `cronAuth.test.js` (8).

Medium tests: `cronRoutes.test.js`, `cronHealthRoutes.test.js`,
`reconcileDrift.test.js`.

Result: 6 suites / 43 tests passed (37 prior + 6 new). No production code
touched, so no other suite is affected.

Manual smoke: none needed (production Render/Sentry wiring is owner-config,
explicitly out of scope; runbooks document manual trigger + token rotation).

## Backlog

- Observation (already documented, out of scope): `attendance-reminders` has no
  in-process scheduler — it runs only when the external pinger calls
  `POST /api/cron/attendance-reminders`. On Render free tier reconcile's
  in-process cron also can't fire reliably, so both jobs depend on the pinger;
  the health panel correctly shows `never` until it is configured. This is an
  owner ops-config matter (`docs/cron-pinger-setup.md`), not a code defect — no
  QB promoted.

## Unresolved Questions

- None.
