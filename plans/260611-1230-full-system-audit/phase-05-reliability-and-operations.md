# Phase 05 — Reliability & Operations

**Area prefix:** OPS- (continue past OPS-007).
**Sources:** `docs/backup-dr.md`, `docs/cron-pinger-setup.md`,
`docs/google-calendar-setup.md`, README §6.4 env table, `server/lib/`, `server/jobs/`.

## A. Health, deploy, lifecycle
- [ ] `/health` (process) vs `/ready` (DB) — semantics correct; Render health
      check points at the right one; cold-start behavior after idle spin-down.
- [ ] Graceful shutdown: in-flight requests + open Mongo sessions on SIGTERM
      (transactions mid-flight roll back cleanly?).
- [ ] Env completeness: code-required envs vs README §6.4 table vs Render
      dashboard — three-way diff. Boot fails loud on missing required envs?
- [ ] Prod `NODE_OPTIONS`/memory ceiling on Render tier vs observed usage.

## B. Scheduled jobs & external triggers
- [ ] Nightly reconcile (02:00 UTC): last-run evidence, duration, failure alerting
      (CronRun heartbeat — who notices a silent stop? cron-pinger setup verified).
- [ ] `cronAuth` token paths (timing-safe, rotation runbook).
- [ ] Reminder service cadence + idempotency (NotificationLog claims).

## C. Backup & disaster recovery — DRILL, not just read
- [ ] `node server/scripts/verify-backup.js` run now; monthly cadence evidenced.
- [ ] **Restore drill:** actually restore latest backup to a scratch DB and boot
      the app against it once. Document RTO/RPO observed vs `backup-dr.md` claims.
- [ ] Atlas backup settings (retention, PIT) match the doc.

## D. Failure modes of external dependencies
- [ ] SMTP down: every mail call fail-soft (booking, reset, waitlist, cancel)?
      Queued/retried or honestly dropped + logged?
- [ ] Google Calendar/Sheets API errors + quota: sync paths degrade gracefully;
      no user-facing 500 from a calendar hiccup; orphan events cleaned.
- [ ] MongoDB transient errors: transaction retry behavior
      (`withTransaction` retries) — confirmed on write conflicts.
- [ ] Sentry: 5xx-only filter works; DSN per env; no PII in events; release tags.

## E. Observability
- [ ] pino: request-id propagation end-to-end (`req.log` discipline — grep for
      stray `console.log`); log levels sane in prod.
- [ ] No secrets/PII in logs (sample real log lines).
- [ ] One "war-room" doc: where to look when X breaks (links runbooks) — exists?

## Method
Runbook walkthroughs executed for real (esp. C); failure injection locally
(kill SMTP env, revoke Google key on dev) — observe, don't assume.

## Output
`plans/reports/audit-ops-{yymmdd-hhmm}-findings.md` + fix PRs / runbook updates.
