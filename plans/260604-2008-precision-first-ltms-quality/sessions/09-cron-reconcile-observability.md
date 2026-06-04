# Session 09 - Cron + Reconcile + Observability

## Goal

Answer: can operators know scheduled jobs and drift checks actually work?

## Scope

In: reconcile job, attendance reminders, cron pinger routes, CronRun heartbeat,
admin cron health, Sentry check-ins, fail-soft behavior.

Out: paid hosting/Sentry account setup that only owner can do.

## Required Evidence

- `server/lib/cronMonitor.js`
- `server/jobs/reconcileJob.js`
- `server/routes/cronRoutes.js`
- `server/routes/cronHealthRoutes.js`
- `server/services/reconcileService.js`
- `client/src/components/CronHealthPanel.jsx`
- runbooks and cron setup docs.

## Required Scenarios

- never/stale/error/ok health derivation.
- pinger endpoint records same heartbeat as in-process cron.
- Sentry failures do not break the job.
- Cron auth failure is rejected safely.
- Reconcile flags known high-risk drift.

## Verification

- cronMonitor unit tests.
- cronRoutes and cronHealthRoutes integration tests.
- reconcileDrift tests.
- CronHealthPanel client tests.

## Unresolved Questions

- None.

