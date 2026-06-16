# Phase 02 — Security & Data Integrity

**Priority:** P1 (owner-prioritized) · **Status:** 🔴 todo
**Anchor:** OWASP ASVS L2 · OWASP Top 10 · the repo's load-bearing security layers

## Objective
Prove every security layer is intact and every mutation is authorized, validated,
audited, and (for user/attendance/evaluation data) soft-deleted — at million-
dollar bar. Audit the layers; never weaken them.

## Industry checks (each → evidence; map to a route/field table)
- **Authz coverage (per route).** Every state-changing route = `protect` →
  `requireCapability`/`roleGuard` → (resource-scoped) `policy/` check. Build a
  complete route→guard matrix; flag any unguarded/under-guarded mutation.
  (ASVS V4 access control.)
- **IDOR / resource-level authz.** Routes touching a specific doc by id verify the
  actor may touch THAT doc (ownership/binding), not just the role. Find id-routes
  missing a policy call.
- **Audit completeness.** Every create/update/delete/archive across all domains
  calls `auditService.record` with a valid enum entity. (Enum-lag class found in
  #124 — confirm none remain via the new coverage test; also flag mutations that
  audit nothing.)
- **Soft-delete consistency.** User/Attendance/Evaluation never hard-deleted;
  every read filters `isDeleted`/`deletedAt` (no deleted-row leakage into lists,
  reports, pickers, counts). Grep reads missing the filter.
- **Sensitive-field exposure.** `password`, `mfaSecret`, `mfaBackupCodes` are
  `select:false` and never returned/populated/logged/diffed. Scan responses,
  populates, audit diffs, logs. (ASVS V8.)
- **Input validation.** Every body/query/params validated via zod `validate`;
  mongo-sanitize active; no handler trusting raw `req.body`. (ASVS V5.)
- **CSRF + rate-limit coverage.** Every state-changing route under CSRF; per-route
  limiters on auth/forgot/booking/export + global cap present. No new route drops them.
- **Transactions / atomicity.** Multi-doc mutations (booking, group transfer,
  roster rebuild, schedule edits, plan→cohort) run in a Mongoose session; no
  half-write window. Verify each.
- **Secrets & config.** gitleaks clean; no secret in code/history-of-branch; boot-
  required env enforced; CRON_TOKEN on cron routes; no secret in logs (URL-token redaction).
- **AuthN hardening.** JWT TTL, `passwordChangedAt` session-kill, 10/15-min lockout,
  MFA pending-token expiry, backup-code single-use, force-change gate. Verify intact.
- **Headers / transport.** Helmet CSP not loosened; CORS allowlist + no-origin
  write guard; Permissions-Policy. Confirm.
- **Error hygiene.** No stack/internal leak to client; 5xx→Sentry only; 4xx not noisy.

## Method (multi-agent workflow)
Per-area security agents produce a route→guard→validation→audit matrix +
field-exposure scan; an adversarial pass tries to find a bypass for each
"covered" claim (default-suspicious). Transaction + soft-delete checks run as
dedicated agents (cross-cutting).

## Success criteria
- A complete route→{auth, capability, policy, csrf, limiter, validation, audit}
  matrix with every gap P-rated. Zero P0 (unguarded mutation / secret leak / PII
  exposure) — or each P0 fixed in phase-06.

## Todo
- [ ] route→guard authz matrix (all mutations)
- [ ] IDOR/resource-policy coverage
- [ ] audit-completeness sweep (beyond the enum fix)
- [ ] soft-delete read-filter sweep
- [ ] sensitive-field exposure scan (responses/populate/diff/logs)
- [ ] zod validation coverage
- [ ] CSRF + rate-limit coverage
- [ ] transaction/atomicity verification
- [ ] secrets + env + cron-auth
- [ ] authN hardening intact
- [ ] headers/CORS/CSP intact
- [ ] error-hygiene (no leak)
