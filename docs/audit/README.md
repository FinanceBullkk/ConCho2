# TMS v2 — Enterprise Audit Report

**Date:** 2026-05-24
**Branch / head:** `main` @ `e417212` (audit snapshot)
**Auditors:** Principal Engineer, Staff Backend, Staff Frontend, Security Architect, QA Lead, SRE/DevOps Lead, Product Engineer, Data Integrity Auditor, Enterprise SaaS Architect (consolidated panel review).
**Scope:** full repo `E:\ConCho2` — server (Node/Express/Mongoose), client (React/Vite), tests, CI, docs, deployment config.

---

## Overall verdict

> **NO-GO** to sell to an enterprise today.
> **CONDITIONAL GO** for a 1-customer SME pilot **after merging the first 10 PRs** (5–7 weeks of work).
> True enterprise sale (HR/IT procurement gate) needs **Phase 4** (SSO + multi-tenant + LMS modules + ROI dashboard + hash-chain AuditLog) — estimated 6 months.

The codebase is materially better than typical at this maturity (HttpOnly+Secure+SameSite cookies, JTI blocklist + TTL, double-submit CSRF, helmet CSP, partial unique indexes, MFA TOTP with replay counter, request-id correlation, pino redact, in-memory replica-set test harness, transactions on hot paths, fail-fast on missing JWT_SECRET, graceful SIGTERM). **The problems below are real, fixable, and concentrated.**

---

## How to read this report

| File | What's inside |
|---|---|
| **[README.md](./README.md)** *(this file)* | Verdict, top risks, top quality gaps, **first 10 PRs**. Read first. |
| **[system-inventory.md](./system-inventory.md)** | Routes / models / services / critical workflows / external deps / background jobs / CI / deployment config. |
| **[findings.md](./findings.md)** | Every finding (Critical → Low) with ID, file:line, evidence, exploit, fix, test, owner, effort. Searchable. |
| **[matrices.md](./matrices.md)** | Complete **Permission Matrix** (actor × resource × action) and **Business Invariant Matrix** (30 invariants × enforcement × test). |
| **[test-plan.md](./test-plan.md)** | Existing coverage map, P0 missing tests with exact names + assertions, CI gating plan. |
| **[roadmap.md](./roadmap.md)** | Phased plan (Phase 0–5), staging validation, production launch checklist, rollback. |

> **Convention:** Vietnamese narrative paragraphs, English code / file paths / commit messages / test names. Per `MEMORY.md`.

---

## Top 20 risks (ranked by blast radius)

| # | Risk | Category | Severity | Blast |
|---|---|---|---|---|
| 1 | Mongo URI + JWT_SECRET + SMTP_PASS live in `server/.env` | Sec | Critical | Full DB take-over + token forgery |
| 2 | `protobufjs` RCE via `googleapis` (CVSS 9.8) + 14 other advisories | Dep | Critical | Remote code execution |
| 3 | `adminDbRoutes` can flip `mfaEnabled`/`mfaSecret`/`passwordResetToken` bypassing `userController` re-auth gate | Sec/AuthZ | Critical | Silent admin/teacher takeover by another admin |
| 4 | Excel formula injection in `exportService.generateExcel` / `generateEvaluationExcel` | Sec | High | Lateral movement via HR laptop |
| 5 | Reset-password token in URL query string → leaked via Referer + access logs | Sec | High | Reset hijack within 1h window |
| 6 | Evaluation has no class-binding → any Teacher reads/writes any class's evaluations | AuthZ | Critical | Forged grades, broken reports |
| 7 | Schedule list/getById/availability has no `roleGuard` and Teacher is unrestricted | AuthZ | High | Org-wide email + roster leak to Teachers |
| 8 | MFA-enrollment cookie allows `PUT /api/auth/change-password` | AuthN | High | Phished password → reset → enroll attacker TOTP |
| 9 | Race: same user added to two teams concurrently → 2 Active enrollments | Data | High | Reports & cascade-schedule wrong |
| 10 | Race: two Ongoing classes with same `classCode` | Data | High | Duplicate cohort state |
| 11 | `cancelSlot` deletes attendance of past sessions | Data | High | Compliance history lost |
| 12 | Class hard-delete cascades Evaluation + Enrollment permanently | Data | High | ROI evidence lost |
| 13 | Excel export buffers full workbook → OOM on Render free at ~50–100k rows | Perf | High | Production crash |
| 14 | `analyticsByTeam` `$expr` `$lookup` not index-eligible | Perf | High | Dashboard > 10s at 100k attendance |
| 15 | Reconcile checks 2/3 full-collection scans loaded to Node RAM | Perf | High | GC pauses + missed cron |
| 16 | Reminder cron serial loop hits Render 100s HTTP timeout | Perf | High | Silent reminder failure |
| 17 | `useRole` permission map lies (Teacher schedule CRUD) → 403 UX | FE | Critical | Demo failure |
| 18 | `SearchPalette` Cmd+K targets dead legacy routes, query dropped on redirect | FE | Critical | Search unusable |
| 19 | `AuthContext` does not clear React Query cache or sync logout across tabs | FE | Critical | PII leak on shared workstations |
| 20 | `DatabaseExplorer.STATUS_ENUMS.role` is `['Admin','Leader','Participant']` (wrong) | FE/Data | High | Admin saves user with invalid role |

Full details in **[findings.md](./findings.md)**.

---

## Top 10 launch blockers

1. **Rotate** the 3 secrets in `server/.env`; move outside repo; add CI gitleaks gate; bump JWT_SECRET → force logout all.
2. **`npm audit fix --force`** (protobufjs RCE + 14 advisories); add CI gate `npm audit --omit=dev --audit-level=high`.
3. **Extend** `FORBIDDEN_UPDATE_FIELDS` in `adminDbRoutes.js`; block hard-delete on `Counter/Setting/AuditLog/Attendance/Enrollment/Evaluation`; require `auditService.record` on every mutation.
4. **Escape spreadsheet formulas** in `exportService.js:176, 461` (prepend `'` for cells starting with `= + - @ \t \r`).
5. **Move reset token into path** (`/reset-password/:token`); remove `empCode` from forgot-password logs.
6. **Add `Class.teacherIds[]`** + policy module gating evaluation/attendance reads/writes; remove `enrollment-token` allowance of `change-password`.
7. **Add roleGuard + Teacher scoping** for Schedule list/getById/availability.
8. **Sync `client/src/hooks/useRole.js`** with server permissions (Teacher no schedule create/update).
9. **`AuthContext` fixes**: `queryClient.clear()` on logout + `storage` listener for multi-tab sync + `Sentry.setUser` + drop email from localStorage `tms_user`.
10. **CI gating**: add `cd client && npm run test:run` and `npx playwright test` as required blocking jobs; delete `.bak` test files; unskip `teams.test.js:122`; fix Artillery passwords.

---

## Top 10 engineering quality gaps

1. Client Vitest + Playwright **not** in CI — only `cd server && npm test` + `vite build` gate merges.
2. **Zero tests** for MFA flow, AdminDB tools, import, reconcile-drift detection, audit-log write-side, login rate limiter, evaluation cross-teacher forge.
3. Cross-controller import: `enrollmentController.js:7` imports from `teamController` — no service layer for user/team/dashboard/sync/enrollment.
4. 10 files > 400 lines (ClassDetailPage 907, UsersPage 754, TeamsPage 743, scheduleService 715, teamController 658, authController 640, EvaluationPage 624, enrollmentController 544, userController 511).
5. `client/eslint.config.js:54-60` downgrades 7 a11y rules to `warn` — comment admits "94 violations are real UX debt".
6. Schedule conflict logic duplicated 4 places; weekly-2-session cap duplicated 4 places.
7. Dev scripts live next to `server.js` un-guarded (`_check_schedules.js`, `analyze_*.js`, `cleanup_fake_teachers.js`, `e2e_test.js`, `security_audit.js`, root `import_students.js`, `read_excel.js`) — ship inside Docker image.
8. `fixController.js` is 175 lines of un-mounted, un-routed dead code.
9. i18n migration ~30%; 18 pages still hard-code VN/EN; `document.title` hard-coded on 8 pages.
10. Audit log fire-and-forget without backpressure; 13 sensitive endpoints write no audit row.

---

## First 10 PRs to create (in order)

| # | PR Title | Why ordered here |
|---|---|---|
| 1 | `security: rotate secrets, remove .env from working tree, add CI gitleaks guard` | Rotating after PR 2–10 is wasted work. |
| 2 | `security: npm audit fix; bump googleapis & exceljs majors; add audit-level=high CI gate` | Critical RCE; must not ship vulnerable runtime. |
| 3 | `security: harden adminDb (forbidden fields + delete blocklist + audit logging)` | Highest-blast-radius privilege escalation; tight diff. |
| 4 | `security: escape spreadsheet formulas + move reset token to path + scrub forgot-password logs` | Customer-facing risk (Excel on HR laptops; emailed token in browser history). |
| 5 | `authz: add Class.teacherIds + policy module + scope evaluation/attendance/schedule for Teacher` | Core authorization gap; every later RBAC test depends on it. |
| 6 | `data: partial unique indexes (Enrollment/Team/Class) + cancelSlot past-guard + Class soft-delete` | Data corruption is irreversible; do after authz so tests run with proper actors. |
| 7 | `auth: tighten MFA enrollment lockdown + re-auth on cross-user MFA disable + force-logout` | Closes last major auth-flow gap. |
| 8 | `fe: align useRole with server + fix AuthContext multi-tab + fix SearchPalette + DatabaseExplorer enum` | Demo-facing fixes; cannot sell with these UX bugs. |
| 9 | `ci: add client-tests + e2e-tests as required gates; cleanup .bak / artillery / standalone scripts` | Without CI gating, every later PR risks silent regression of P0 fixes. |
| 10 | `ops: render healthCheckPath=/ready + Sentry cron monitors + client Sentry init + missing alerts` | Production observability — once shipped, you need to be told when it breaks. |

Per-PR detail (goal, files touched, tests, acceptance) lives in **[roadmap.md](./roadmap.md#first-10-prs-to-create)**.

---

## What is actually good (don't break it)

- HttpOnly + Secure + SameSite=Strict cookies (`authService.js:157-163`).
- JTI blocklist + TTL (`models/TokenBlocklist.js:30, 56`).
- `passwordChangedAt` invalidates all tokens.
- TOTP replay counter persisted (`authService.js:333-335`).
- Bcrypt cost 12 on app paths.
- Constant-time cron-token compare (`cronAuth.js:21-27`).
- Forgot-password timing-equivalent response (`authController.js:490`).
- Re-auth gate on cross-user password/role change (`userController.js:210-245`).
- TTL retention on AuditLog & TokenBlocklist.
- Sentry `beforeSend` strips Cookie + Authorization headers (`sentry.js:23-28`).
- Mongo replica-set required check at startup.
- Atomic Counter helper (`helpers/counter.js:33-40`).
- Booking + scheduleReassign wrapped in `withTransaction`.
- Test harness uses `MongoMemoryReplSet` — concurrency-test-ready out of the box.
- Helmet CSP with `frameAncestors 'none'`, `objectSrc 'none'`, COOP, CORP.

---

## Hard NO-GO triggers (any one = do not launch)

- Any secret still in repo / Docker image / `.env` in working tree.
- `npm audit --omit=dev --audit-level=high` still has output.
- AdminDB still allows mutating MFA / passwordReset fields.
- Excel exports unescaped for formula characters.
- `Class.teacherIds[]` not enforced (Teacher still forges eval/attendance).
- `cancelSlot` still deletes past attendance.
- CI not gating client-tests + e2e-tests.
- Client Sentry init missing (zero visibility into FE crashes).
- Render `healthCheckPath` not pointing to `/ready`.

See **[roadmap.md § H.1](./roadmap.md#h1-hard-no-go-triggers)** for full criteria.
