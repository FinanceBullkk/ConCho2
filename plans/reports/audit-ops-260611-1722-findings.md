# Audit Phase 05 — Reliability & Operations — Findings

**Date:** 2026-06-11 · **Auditor:** inline session · **Scope:** `plans/260611-1230-full-system-audit/phase-05-reliability-and-operations.md`
**ID series:** OPS- (continues past OPS-008)

## Verdict
Ops layer is well-built — graceful shutdown, cron heartbeat+staleness, timing-safe cron auth,
fail-soft SMTP/Google everywhere, driver-retried transactions, clean logging discipline.
The gaps are in the *verification loop*: the monthly backup drill command is broken as
documented (and has never been run), missed-run alerting isn't actually armed for
pinger-driven crons, and boot validation misses two README-required envs.

## Findings

### OPS-009 · P1 · Monthly backup-verification drill broken as documented; never evidenced
- **Evidence:** `server/scripts/verify-backup.js:25` loads `path.resolve(__dirname, '../../.env')`
  = repo ROOT `.env` — does not exist (`Test-Path .env` → False; real env lives in `server/.env`).
  Every other path-explicit script uses `'..', '.env'` (e.g. `migrate-teacherIds.js:42`).
  Ran the exact command from README §7.2 / `docs/backup-dr.md` §6.1:
  `node server/scripts/verify-backup.js` → `✗ MONGO_URI (or MONGODB_URI) is not set`, exit 1.
  `backup-dr.md` monthly + quarterly drill logs and "Last reviewed" are all empty → control never exercised.
- **Impact:** Backup-health control is inert. Atlas snapshot failures / empty-collection regressions
  would go unnoticed; RPO 24h promise unverified. Compliance-first product.
- **Fix:** point dotenv at `server/.env` (precedent: sibling scripts), run the drill for real,
  fill first drill-log row, keep docs' command unchanged (it then works from repo root).
- **Note:** with env fixed, MONGO_URI loads (masked URI printed) but THIS network can't resolve
  Atlas SRV (`querySrv ECONNREFUSED`) — connectivity leg of the drill needs a network that
  reaches Atlas (owner/CI).

### OPS-010 · P2 · Missed-run detection not armed for pinger-driven cron runs
- **Evidence:** `routes/cronRoutes.js:54-58,113-117,142-147` call `runMonitored(name, CRON_JOBS.x, fn)`;
  `lib/cronMonitor.js:29-45` CRON_JOBS entries carry NO `schedule` → `sentryCheckIn` passes no
  monitorConfig → Sentry monitor auto-creates WITHOUT a schedule → cannot fire "missed" alerts.
  Only `jobs/reconcileJob.js:48` passes `schedule` — but on Render free tier the dyno sleeps at
  02:00 UTC (acknowledged `reconcileJob.js:12-19`, README §7.3), so in-process cron may never run
  and never upsert the schedule. `docs/runbook-cron-failure.md` trigger #2 assumes the Sentry
  missed-check exists.
- **Impact:** If cron-job.org silently stops (account lapse, job disabled), nightly reconcile +
  reminders stop and nobody is paged. Admin heartbeat page (`/api/admin/cron/health`) is pull-only.
- **Fix:** add crontab `schedule` to each CRON_JOBS entry (`reconcile '0 2 * * *'`,
  `attendance-reminders '0 * * * *'`, `assignment-reminders '0 8 * * *'`) and pass it through in
  cronRoutes — Sentry monitor then knows cadence regardless of trigger path.

### OPS-011 · P2 · Boot env validation vs README §6.4 — three-way diff failures
- **Evidence:** `lib/envValidator.js:15-16` requires JWT_SECRET (always) + MONGO_URI, CRON_TOKEN,
  IMPORT_DEFAULT_PASSWORD (prod). README §6.4 marks required: NODE_ENV, MONGO_URI, JWT_SECRET,
  CORS_ORIGINS, CRON_TOKEN, CLIENT_ORIGIN. Diff:
  - `CORS_ORIGINS` — README-required, NOT boot-validated. Missing in prod → allowlist falls back
    to localhost (`server.js:133`) → every browser write (Origin header always present on POST)
    is rejected by the cors callback → app-wide 500s. Boot succeeds, runtime outage.
  - `CLIENT_ORIGIN` — README-required, NOT validated. Missing → reset-password emails link to
    `http://localhost:5173/...` (`controllers/auth/auth-password-reset.js:94`). Silent.
  - `IMPORT_DEFAULT_PASSWORD` — boot-REQUIRED in prod, absent from README §6.4 table
    (render.yaml:41 has it) → operator provisioning per README boot-loops the deploy.
- **Fix:** add CORS_ORIGINS + CLIENT_ORIGIN to REQUIRED_IN_PRODUCTION (+ unit tests);
  add IMPORT_DEFAULT_PASSWORD row to README §6.4.

### OPS-012 · P3 · cron `?token=` leaks into pino logs + 730-day audit notes
- **Evidence:** `middleware/cronAuth.js:47-49` accepts `?token=`; pino-http logs `url: req.url`
  (`server.js:55`) and cronAuth logs `path: req.originalUrl` (`cronAuth.js:53,71`); on auth FAILURE
  the full `req.originalUrl` (incl. token) is written to the audit log (`cronAuth.js:60-65`,
  730-day retention, admin-visible). pino `redact` is key-based (`lib/logger.js:15-46`) — cannot
  mask substrings inside URL strings.
- **Mitigation today:** docs mark query token "last resort"; runbook configures header auth.
- **Fix sketch:** strip/replace `token=...` when logging/auditing in cronAuth (one small helper),
  or drop query-param support entirely.

### OPS-013 · P2 · backup-dr.md DR env table drifted — rebuild-from-runbook would boot-loop
- **Evidence:** `docs/backup-dr.md` §4.1 lists `REFRESH_SECRET` and `MFA_ENCRYPTION_KEY` — neither
  exists anywhere in server code (full `process.env.*` grep). Table OMITS `IMPORT_DEFAULT_PASSWORD`
  (boot-required in prod, `envValidator.js:16`).
- **Impact:** During a P1 DR rebuild the operator documents/sets two phantom vars and misses the
  required one → boot loop mid-incident → blows the 4h RTO.
- **Fix:** correct §4.1 table (remove phantoms, add IMPORT_DEFAULT_PASSWORD + note). Doc-only.

## Verified clean (evidence-backed PASS)
- `/health` liveness vs `/ready` readiness (2s ping ceiling) correct; `render.yaml:16`
  `healthCheckPath: /ready` (Mongo-aware) ✓
- Graceful shutdown: SIGTERM/SIGINT → stop cron → drain ≤10s → close Mongo → exit; re-entrancy
  guard; force-kill timer unref'd (`server.js:356-392`) ✓. unhandledRejection/uncaughtException
  last-resort handlers + Sentry capture ✓
- cronAuth: `crypto.timingSafeEqual`, ≥16-char token enforced, 503 when unset (fail-closed),
  failures audited, rotation runbook in `cron-pinger-setup.md` ✓
- CronRun heartbeat (durable, fail-soft writes) + `deriveHealth` staleness (2× interval) +
  admin endpoint `/api/admin/cron/health` ✓
- Reminder idempotency: atomic bulk-claim (`updateMany` on null `remindersSentAt`), bounded
  concurrency (8), 5s per-send timeout, rollback only on total failure
  (`services/reminderService.js:81-164`) ✓; assignment reminders idempotent via NotificationLog keys ✓
- SMTP down = fail-soft everywhere: `emailTemplates.safeSend` never throws; the single raw
  `sendMail` call (password reset) has try/catch + token rollback
  (`auth-password-reset.js:102-121`); honestly dropped + logged, reminder claims rolled back for retry ✓
- Google Calendar: every path fail-soft, returns null on error, delete tolerates 404/410;
  update/delete wired in BOTH legacy (`scheduleService.js:150,476`) and domain
  (`domains/schedule/use-cases.js:278,353`) paths ✓. Sheets sync failure surfaces honestly to the
  requesting Admin via handleError (explicit action, not a hiccup-500) — accepted ✓
- Mongo transient errors: all 22 transaction sites use `session.withTransaction` (driver
  auto-retries TransientTransactionError / UnknownTransactionCommitResult) ✓
- Sentry: DSN-gated, env per NODE_ENV, release = RENDER_GIT_COMMIT, `sendDefaultPii:false`,
  cookie/authorization stripped in beforeSend (`lib/sentry.js`), 5xx-only forwarding
  (`server.js:287-292`) ✓
- Observability: request-id end-to-end (requestId middleware → genReqId → req.log);
  `console.*` clean outside scripts (1 eslint-disabled last-resort: `auth-password-reset.js:127`);
  pino redact covers nested paths + globs (OPS-007) ✓
- War-room docs exist and are substantive: `runbook-5xx-spike.md`, `runbook-cron-failure.md`
  (SLOs, first-2-min checklists, cross-linked) + `backup-dr.md` §7 incident playbook ✓
  (minor: not linked from README §7 — fold into doc fix)

## Owner-verification items (need prod/dashboard access — cannot check from repo)
1. Render dashboard env vars vs render.yaml/README (complete the three-way diff).
2. cron-job.org: pinger jobs exist for reconcile (+ reminders?), "notify on failure" ON;
   last reconcile run + duration (CronRun doc / ReconcileReport) — Atlas unreachable from this
   network (`querySrv ECONNREFUSED`).
3. Atlas backup settings match doc (M0 daily snapshot, 2-day retention, no PIT).
4. Quarterly restore drill (§6.2) has never run — schedule the first one (staging cluster).
5. Render free 512MB vs observed memory (no NODE_OPTIONS set — Node cgroup-aware default heap).
6. SENTRY_DSN actually set in prod (code warns if absent).

## Proposed fix scope (this round)
One branch `fix/audit-ops-round-5`:
1. OPS-009: verify-backup.js env path → `server/.env` (+ fallback to CWD .env), run drill,
   fill backup-dr.md drill-log row + "Last reviewed".
2. OPS-010: add `schedule` to CRON_JOBS entries; pass through cronRoutes runMonitored calls.
3. OPS-011: envValidator += CORS_ORIGINS, CLIENT_ORIGIN (prod) + unit tests;
   README §6.4 += IMPORT_DEFAULT_PASSWORD row.
4. OPS-013: backup-dr.md §4.1 table corrected (remove REFRESH_SECRET/MFA_ENCRYPTION_KEY phantoms,
   add IMPORT_DEFAULT_PASSWORD).
5. OPS-012 (if approved): redact token query param in cronAuth log/audit lines + test.
6. Docs ride-along: README §7 links the two runbooks.

## Unresolved questions
- OPS-011 envValidator hardening: any non-browser deployment mode where CORS_ORIGINS/CLIENT_ORIGIN
  legitimately absent in prod? (ALLOW_MISSING_PROD_ENV bypass remains for emergencies.)
- OPS-012: drop `?token=` support entirely vs redact-only?
- Assignment-reminders crontab for OPS-010: confirm intended daily hour (docs say daily; suggest 08:00 ICT = '0 1 * * *' UTC).
