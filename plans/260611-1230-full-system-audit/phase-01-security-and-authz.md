# Phase 01 — Security & AuthZ (+ PII)

**Area prefix:** SEC- (continue past SEC-013; 3-digit) · PII findings may use SEC- too.
**Sources of truth:** `docs/route-permission-matrix.md`, `server/policy/README.md`,
`.claude/rules/security-and-auth.md`, `client/src/hooks/useRole.js` PERMISSION_MAP.

## A. Authorization — the highest-value sweep
- [ ] **3-way drift matrix:** for EVERY route — server `roleGuard` vs `policy/*`
      call vs client `PERMISSION_MAP`. Build the table from code (not the doc),
      then diff against `route-permission-matrix.md`. Drift = finding.
- [ ] **IDOR probes:** every `/:id` route where roleGuard alone passes — does a
      policy/ownership check fetch the doc and verify THIS actor may touch THIS
      doc? Known-good pattern: controller fetch → policy fn → `policyDeny`.
      Suspects: legacy controllers (`routes/` 19 files) predating `policy/`.
- [ ] **"Open until populated" inventory:** list every graceful-migration policy
      (empty `teacherIds`, etc.). For each: is open-ness still intended, or is
      data now populated enough to close it?
- [ ] **Coordinator capability audit:** `ROLE_CAPABILITIES` allow-list vs what
      Coordinator can actually reach (incl. indirect: exports, dashboards).
- [ ] Participant scoping: self-only reads truly self-only (`/me/*`, stats,
      evaluations, attendance, waitlist mine).

## B. Authentication
- [ ] Cookie flags (HttpOnly/SameSite/Secure in prod), 24h expiry, logout kills.
- [ ] `passwordChangedAt` invalidation; ~30s user cache poisoning window OK?
- [ ] MFA: pending-token 5min, backup codes single-use, `mfaVerifyLimiter` keying.
- [ ] Lockout 5 fails/15min — per empCode+IP (`loginLimiter`) + DB lock both work.
- [ ] Forgot-password: token entropy/expiry/single-use; user enumeration safe.

## C. Request hardening
- [ ] **Limiter coverage map:** route → limiter (booking/import/attendance/sync/
      login/mfa/export/reconcile/global+globalWrite). State-changing routes with
      NO specific limiter → is globalWrite enough?
- [ ] **CSRF:** every state-changing route behind csrfProtection; exemptions
      (cron) justified; client axios wiring intact.
- [ ] **zod coverage:** routes WITHOUT `validate()` middleware — list and close.
- [ ] mongo-sanitize active; no `$where`/raw operator injection paths.
- [ ] Helmet/CSP: review directives; no `unsafe-*` creep.

## D. Secrets & dependencies
- [ ] `.env` gitignored; `.gitleaks.toml` rules current; grep history for leaks.
- [ ] `npm audit` high+ clean (both packages); review overrides.
- [ ] `CRON_TOKEN` timing-safe compare (`cronAuth` — SEC-013 history); rotation doc.
- [ ] Google service-account key handling (env, never logged).

## E. Data exposure & PII
- [ ] `select:false` fields (`password`, `mfaSecret`, `mfaBackupCodes`) never leak
      via populate/lean/aggregate/DTO. Grep every populate of User.
- [ ] PII inventory: User fields stored vs needed; who sees what per role
      (esp. exports/Excel, Google Sheets sync, email bodies, logs).
- [ ] Error responses never echo internals/stack (handleError discipline).
- [ ] `adminDbRoutes` (SEC-003/010 history): still least-privilege, still needed?
- [ ] AuditLog redaction (passwords/secrets auto-redacted in diffs) still holds.

## Method
Checklist top-down; evidence per finding (`file:line`, curl/supertest repro).
Tools: grep matrices, `npm audit`, gitleaks local run, manual probes with seeded
roles (admin/coordinator/teacher/leader/member tokens).

## Output
`plans/reports/audit-security-{yymmdd-hhmm}-findings.md` + fix PRs per master plan.
