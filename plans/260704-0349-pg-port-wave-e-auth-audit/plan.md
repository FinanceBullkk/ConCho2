# PG port — Wave E: auth & audit (security)

Phase 3 tail per `plans/260612-2042-postgresql-migration/master-execution-plan.md`
§2 wave E ("highest — port last"). Domain repos are done (2026-07-03, PR #231);
this wave ports the security-critical service surfaces.

## Context links
- Master plan: `../260612-2042-postgresql-migration/master-execution-plan.md`
- Running log: `../260612-2042-postgresql-migration/phase-03-repository-ports.md`
- Audit write path: `server/services/auditService.js` + `services/audit-chain.js`
  + `models/AuditLog.js` (hash chain seq/prevHash/hash, TTL 730d, fire-and-forget queue)
- Auth surface: `services/auth/auth-login.js` (login lookup, lockout counters,
  MFA-pending verify, lastLogin/backup-code saves), `middleware/auth.js`
  (per-request findById + ~30s cache, passwordChangedAt session-kill),
  `controllers/auth/{auth-session,auth-password-reset,auth-mfa,auth-admin}.js`
  (14 direct Mongoose touch points), `controllers/user/user-mutations-repository.js`
  (Phase-0 seam, admin CRUD — Wave F).
- PG users table today: only emp_code/email/name/department/role real columns;
  ALL security fields live in `meta` jsonb → E3 migration extracts columns.

## Slices (one PR each, base = main, ONE at a time)

| # | Slice | Scope | Mig |
|---|-------|-------|-----|
| E1 | audit_log dual-backend | repo seam `services/audit-repository.{mongo,pg}.js` under `auditService` (loadHead/append) + `audit-chain.verifyChain` window reads; entity/actorRole enum parity via schema enumValues; parity: chain append, head reload, dup-seq 23505⇄11000, verify ok/tamper | 029 |
| E2 | PG retention purge job | nightly cron DELETE (PG has no TTL — debt noted in migs 002/019): audit_log 730d, notification_logs 180d, metric_snapshots ~400d; env-tunable, keeps Mongo TTL untouched | — |
| E3 | users security columns + login/middleware | mig: password, password_changed_at, failed_login_attempts, lock_until, mfa_enabled, mfa_secret, mfa_backup_codes, must_change_password, last_login_at, reset token pair; port auth-login + middleware/auth reads/writes behind `services/auth/auth-repository.{mongo,pg}.js` | 030 |
| E4 | auth mutations | password change (session-kill), forgot/reset, MFA enable/verify/disable + backup-code consume, admin force-logout/unlock — same seam as E3 | — |

Out of scope (Wave F): admin user CRUD (`user-mutations-repository`),
`user-queries`/`user-lifecycle`, audit-query read API, exports, reconcile port
(reconcile_report table ships with that port, TTL 30d joins the E2 job then).

## Invariants (never weaken)
- Hash-chain stays write-ordered (single in-process queue); seq partial-unique
  is the DB-level fork guard on BOTH backends.
- `select:false` semantics: password/mfaSecret/mfaBackupCodes never appear in
  row shapes unless the method is the explicit `+password`/`+mfa*` reader.
- `passwordChangedAt` iat comparison kills stale JWTs identically.
- Lockout: 10 fails/15 min (`LOGIN_MAX_FAILED`/`LOGIN_LOCK_MINUTES`) — counter
  increments must be atomic on both backends.
- Audit is fire-and-forget: a failing backend write NEVER breaks the request.
- DB_BACKEND default `mongo` — running app unchanged until cutover.

## Status
- [x] E1 audit_log port — shipped 2026-07-04 (mig 029; 8/8 Neon parity + 48/48 Mongo audit suites)
- [x] E2 retention purge job — shipped 2026-07-04 (jobs/retentionPurgeJob.js; 5/5 Neon; reconcile_report/token_blocklist windows deferred to their ports)
- [x] E3 users security columns + login/middleware port — shipped 2026-07-04 (mig 030; 6/6 Neon parity + 37/37 Mongo auth/MFA suites; Mongo security readers tightened to explicit inclusion projections)
- [ ] E4 auth mutations port

## Risks
- Hash over `diff`: Mongo stores Mixed (Date objects) vs PG jsonb (ISO strings)
  — `stableStringify` normalizes Dates to ISO at write AND verify → identical
  hashes; parity test pins a Date-bearing diff.
- Neon parity DB is shared: tests TRUNCATE audit_log — safe (throwaway DB).
- E3 touches the hot per-request auth path — cache behavior must be identical;
  port reads first, mutations in E4, smallest possible diffs.
