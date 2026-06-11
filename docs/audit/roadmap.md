# Implementation Roadmap

Phased plan (Phase 0–5), Go/No-Go criteria, staging validation, production checklist, rollback. **First 10 PRs** at the end.

---

## G. Phased plan

### Phase 0 — Launch blockers (Week 1–2, ~10 engineer-days)

**Tasks:**

| # | Task | Finding ID | Effort |
|---|---|---|---|
| 0.1 | Rotate 3 secrets, move `.env` outside repo, add CI gitleaks guard | SEC-001 | 0.5d |
| 0.2 | `npm audit fix --force` + smoke test Google integrations | SEC-002 | 1d |
| 0.3 | Extend `adminDb` `FORBIDDEN_UPDATE_FIELDS` + `HARD_DELETE_BLOCKED` + audit-log on every mutation | SEC-003, SEC-010 | 1d |
| 0.4 | Excel formula escape in `exportService.js:176, 461` | SEC-004 | 0.5d |
| 0.5 | Reset token to URL path + scrub empCode from forgot-password logs | SEC-005, SEC-008 | 0.5d |
| 0.6 | Remove `/auth/change-password` from MFA `ENROLLMENT_ALLOWED` | SEC-007 | 0.25d |
| 0.7 | Re-auth for `mfa/admin-disable`, `force-logout` | SEC-009 | 0.5d |
| 0.8 | Add `Class.teacherIds[]` + `server/policy/{evaluation,attendance,schedule}.js` + `requirePolicy` middleware | AUTHZ-001 | 2d |
| 0.9 | Schedule list/getById/availability scoped for Teacher | AUTHZ-002 | 1d |
| 0.10 | Sync `client/src/hooks/useRole.js` with server permissions | AUTHZ-003, FE-002 | 0.25d |
| 0.11 | `AuthContext`: `queryClient.clear()` + storage listener + Sentry user + drop email from localStorage | FE-003 | 0.5d |
| 0.12 | Fix `DatabaseExplorer.STATUS_ENUMS.role` enum | FE-004 | 0.1d |
| 0.13 | Fix `SearchPalette.ROUTE_FOR` + legacy redirect query forwarding | FE-001 | 0.25d |
| 0.14 | `cancelSlot` guard for past schedules | DATA-005 | 0.25d |

**Dependencies:** 0.8 (Class.teacherIds schema) blocks AUTHZ-001 tests.

**Files touched (consolidated):**
- `server/.env`, `.gitignore`, `.dockerignore`
- `server/package.json` + lockfile
- `server/routes/adminDbRoutes.js`, `server/services/auditService.js`
- `server/services/exportService.js`
- `server/controllers/authController.js`, `server/routes/authRoutes.js`, `server/middleware/auth.js`
- `server/models/Class.js`, `server/scripts/migrate-teacherIds.js`
- new `server/policy/{evaluation,attendance,schedule,class,team,enrollment,auth}.js`, `server/middleware/requirePolicy.js`
- `server/routes/scheduleRoutes.js`, `server/services/scheduleService.js`
- `client/src/hooks/useRole.js`
- `client/src/context/AuthContext.jsx`, `client/src/api/api.js`, `client/src/lib/sentry.js`
- `client/src/pages/DatabaseExplorer.jsx`
- `client/src/components/SearchPalette.jsx`, `client/src/App.jsx`

**Acceptance:**
- `npm audit --omit=dev --audit-level=high` returns 0.
- `server/.env` absent in repo + Docker image (verify `docker run --entrypoint sh ... ls server/.env` exits non-zero).
- 14 new tests pass in CI (one per task).

**Risk if skipped:** Legal / PR disaster (data leak), silent account takeover, formula RCE on customer machine.

---

### Phase 1 — Security / RBAC / Data integrity hardening (Week 3–5, ~12d)

| # | Task | Finding ID | Effort |
|---|---|---|---|
| 1.1 | Centralised `policy/` module + `requirePolicy()` for every resource | AUTHZ-001..004 | 3d |
| 1.2 | Partial unique indexes: `Enrollment{userId} active`, `Team{leaderId}`, `Team{classId}`, `Class{classCode,status} Ongoing` + dedup migrations | DATA-001..004 | 2d |
| 1.3 | Soft-delete `Class` (replace cascade-delete) + pre-hooks + reconcile updates | DATA-006 | 2d |
| 1.4 | `Team.pre('aggregate')` soft-delete hook | DATA-007 | 0.25d |
| 1.5 | Inject `$match:{isDeleted:{$ne:true}}` in every `$lookup users` | DATA-009 | 0.5d |
| 1.6 | Convert `User.empCode`/`email` to partial unique excluding soft-deleted + dedup | DATA-008 | 1d |
| 1.7 | Scrub `role` field from `importService.importUsers` on existing-match rows | DATA-010 | 0.25d |
| 1.8 | Audit-log on 13 sensitive paths (import / export / sync / settings / adminDb / reconcile / reset / lockout / mfa-fail / csrf / cron-fail) | SEC-013 | 1d |
| 1.9 | CORS no-origin reject in production | SEC-006 | 0.25d |
| 1.10 | `urlencoded` body limits | SEC-010 | 0.25d |
| 1.11 | `enrollmentRoutes` Zod schemas | SEC-011 | 0.5d |
| 1.12 | `create-admin.js` random password + cost 12 | SEC-012 | 0.25d |
| 1.13 | Reconcile expansion: 4 new high-severity checks | DATA-011 | 1d |

**Dependencies:**
- 1.2 needs dedup script first (some prod data already violates the new uniqueness).
- 1.6 needs dedup or rename of soft-deleted empCode/email first.
- 1.3 affects `reconcileService` (must update simultaneously).

**Acceptance:**
- 4 partial unique indexes deployed without E11000 on existing data.
- All 30 invariants in [matrices.md § E](./matrices.md#e-business-invariant-matrix) either DB-enforced or covered by automated test.
- `auditService.record` is called from 13 sensitive paths (verifiable via grep).

**Risk if skipped:** Race conditions corrupt reports; GDPR audit cannot reconstruct events.

---

### Phase 2 — Test harness & CI hardening (Week 6–7, ~8d)

| # | Task | Finding ID | Effort |
|---|---|---|---|
| 2.1 | Add `client-tests` + `e2e-tests` blocking CI jobs | QA-001 | 1d |
| 2.2 | Upgrade `audit` job to blocking + add `secrets-scan` (gitleaks) | SEC-001, SEC-002 | 0.5d |
| 2.3 | Implement P0 server tests (items 1–13 in [test-plan.md § F.2](./test-plan.md#f2-p0-missing-tests)) | QA-002..008 | 5d |
| 2.4 | Implement client / E2E tests (items 14–17) | QA-001 | 2d |
| 2.5 | Cleanup `.bak`, fix Artillery passwords, un-skip teams.test, move standalone scripts | QA-005, QA-006, QA-009 | 0.5d |

**Acceptance:**
- 5 CI gates green: server-tests, client-tests, client-build, e2e-tests, audit, secrets-scan.
- Test coverage matrix in [test-plan.md § F.1](./test-plan.md#f1-existing-coverage-summary) shows ✅ for every required area.

**Risk if skipped:** First deploy after launch silently breaks MFA, RBAC, audit-log.

---

### Phase 3 — Performance & observability (Week 8–10, ~10d)

| # | Task | Finding ID | Effort |
|---|---|---|---|
| 3.1 | Stream `exportService` workbook (writeStream + cursor + row cap) | PERF-001 | 2d |
| 3.2 | `dashboardController.getAlerts` 30-day window + 30s cache | PERF-002 | 1d |
| 3.3 | Invert `analyticsByTeam` direction OR materialize `team_stats_daily` | PERF-003 | 2d |
| 3.4 | Reconcile rewrite (aggregation for ghost-member + memoise) | PERF-004 | 1d |
| 3.5 | Reminder cron bulk-claim + bounded concurrency | PERF-005 | 1d |
| 3.6 | Bulk-import bcrypt outside tx + lower batch + `maxCommitTimeMS` | PERF-006 | 1d |
| 3.7 | Atlas Search or anchored prefix + 60s cache for `searchService` | PERF-007 | 1.5d |
| 3.8 | Add missing indexes (Team.members, Schedule.remindersSentAt, Schedule.endTime, Attendance.exportBatchId) | PERF-010 | 0.25d |
| 3.9 | `maxPoolSize: 20` in `config/db.js` | PERF-009 | 0.1d |
| 3.10 | Sentry Cron Monitor for reconcile + reminder; alerts for 5xx-rate, Mongo-down, drift | OPS-002, OPS-004 | 1d |
| 3.11 | Client Sentry init + `setUser` + breadcrumb scrub + source-map upload | OPS-003, FE-013 | 1d |
| 3.12 | `render.yaml healthCheckPath: /ready` + SIGTERM Mongo close + cron stop | OPS-001, OPS-005 | 0.5d |
| 3.13 | Pino redact path expansion | OPS-007 | 0.1d |

**Acceptance:**
- Artillery load `attendance-mark-burst` p95 < 500 ms, no 5xx.
- Export of 50k rows uses < 200 MB heap.
- Reconcile of 10k enrollments completes < 5 s, < 200 MB.
- All 5xx surface in Sentry within 60 s + Slack alert fires.

**Risk if skipped:** Production OOM, dashboard timeout, cron silently dies.

---

### Phase 4 — Enterprise LMS / ROI expansion (Q2–Q3, ~60d)

**Q2 — Foundations (Month 4–6):**

| Task | Finding ID | Effort |
|---|---|---|
| Multi-tenant column on all models + scoping middleware | PROD-005 | 15d |
| SSO/SAML via `passport-saml` or OIDC | PROD-001 | 10d |
| GDPR endpoints: `/api/users/:id/export`, `/erase` + audit-of-purge | PROD-004 | 5d |
| Whitelabel: logo/color in Setting per tenant | PROD-007 | 3d |
| API key + signed webhook + retry (HRIS integration) | PROD-009 | 5d |

**Q3 — Org & curriculum (Month 7–9):**

| Task | Finding ID | Effort |
|---|---|---|
| `Department` collection + `User.managerId` | PROD-002 | 8d |
| Manager dashboard scoping by `User.managerId` | PROD-002 | 5d |
| `Module`/`Lesson`/`Quiz`/`QuizAttempt` + in-app quiz UI | PROD-003 | 15d |
| `Certificate` model + PDF cert render | PROD-003 | 5d |

**Acceptance:** Demo to enterprise prospect: SSO login, manager dashboard, learning path, certificate download.

---

### Phase 5 — Maintainability & scale (continuous)

| Task | Finding ID | Effort |
|---|---|---|
| Split mega controllers into service modules | CODE-004, CODE-005, API-003 | 5d |
| Split mega pages (ClassDetailPage, UsersPage, TeamsPage, EvaluationPage) | CODE-005 | 5d |
| Re-enable a11y eslint as `error`; burn down 94 violations | CODE-007 | 5d |
| Replace `window.confirm` with `BulkDeleteConfirm` pattern | CODE-009 | 1d |
| `asyncHandler` wrapper across controllers | CODE-011 | 2d |
| i18n migration to 100% on admin-facing pages | FE-015, FE-016, FE-017 | 5d |
| Switch rate-limit to Redis store (when horizontal scaling) | CODE comment | 2d |
| Hash-chain AuditLog for tamper-evidence | PROD-006 | 3d |

---

## H. Go / No-Go criteria

### H.1 Hard NO-GO triggers

Any one of the following = **do not launch**:

- Any secret still in repo / Docker image / `.env` in working tree.
- `npm audit --omit=dev --audit-level=high` still has output.
- AdminDB still allows mutating MFA / passwordReset fields.
- Excel exports not escaping formula characters.
- `Class.teacherIds[]` not enforced (Teacher still forges eval/attendance).
- `cancelSlot` still deletes past attendance.
- CI not gating `client-tests` and `e2e-tests`.
- Client Sentry init missing.
- Render `healthCheckPath` not pointing to `/ready`.
- Any one of the 10 launch blockers in [README.md § "Top 10 launch blockers"](./README.md#top-10-launch-blockers) unresolved.

### H.2 Accepted-risk list (post-launch)

These are known but accepted for the first pilot:

- Single-tenant (1 customer per deploy).
- In-process node-cron + external pinger duplicate fire (documented; idempotent).
- In-memory rate-limit + analytics cache (acceptable for single instance).
- `Authorization: Bearer` accepted alongside cookie (gate behind `ALLOW_BEARER_AUTH=false` default).
- `style-src 'unsafe-inline'` for Radix (CSP nonce migration is Phase 5).
- Soft-delete only on User/Team (Schedule/Class/Enrollment hard-delete remains — fixed for Class in Phase 1.3 + cancelSlot guard).
- ~80% i18n migration; remaining pages migrate continuously.
- No PDF certificate (Phase 4).
- 5 moderate `uuid` advisories via `exceljs`/`googleapis` (SEC-019) — below `--audit-level=high` CI gate, not exploitable (no `buf` arg passed). Fix deferred: needs breaking `exceljs` major bump or a `uuid` override + export smoke-test.

### H.3 Staging validation plan

Run on a clean Render staging service with freshly rotated env vars:

1. Full auth flow: login → MFA enroll → MFA verify → force-change-password → change-password → forgot/reset → logout.
2. RBAC matrix walk: 4 actors × 30 endpoints (automated harness).
3. Booking race: `Promise.all` × 10 booking same slot — exactly 1 success.
4. Attendance + analytics round-trip on 10 schedules.
5. Excel export 5k rows + open in real Excel; verify no formula execution.
6. Manual reconcile run — `ReconcileReport.summary.total` should be 0 unless seeded drift.
7. Cron pinger triggers reminder + reconcile within their windows.
8. Sentry alerts: deploy a `throw` in a feature branch → verify Slack notification within 60s.
9. Quarterly restore drill (`docs/backup-dr.md:213-216`).

### H.4 Production launch checklist

- [ ] All Phase 0 + Phase 1 PRs merged and released.
- [ ] CI green on `main` for at least 3 consecutive merges.
- [ ] Staging validation 1–9 PASS.
- [ ] Atlas backup verified + restore drill logged.
- [ ] Sentry rules + Atlas webhook + Render restart hook live.
- [ ] `render.yaml` `healthCheckPath: /ready`.
- [ ] `CORS_ORIGINS`, `CLIENT_ORIGIN`, `CRON_TOKEN`, `IMPORT_DEFAULT_PASSWORD` set in production.
- [ ] `MFA_REQUIRED_ROLES=Admin` enforced.
- [ ] First admin created via new `create-admin.js` (random password printed once).
- [ ] Login page demo creds + QuickFill buttons removed/guarded.
- [ ] Default seed admin password `admin12345` rotated.
- [ ] Client Sentry init present and emitting; source maps uploaded.
- [ ] Docker image scan clean.

### H.5 Rollback plan

- **Render rollback:** Deploys → Rollback to last green build (~1 min).
- **DB schema:** Forward-only — no destructive migrations in Phase 0/1; soft-delete Class is additive; partial-index migrations are additive after dedup runs.
- **JWT_SECRET rotation:** documented in runbook; org-wide re-login required.
- **Index rollback:** `db.<coll>.dropIndex(name)` shell command; pre-write the command in deploy ticket.
- **Audit-log expansion:** backward compatible (more rows).

---

## First 10 PRs to create

Ordered by dependency and risk-reduction. Each entry includes goal, files touched, tests, acceptance, ordering rationale.

### PR 1 — `security: rotate secrets, remove .env from working tree, add CI gitleaks guard`

- **Goal:** Eliminate live credentials from repo + prevent re-introduction.
- **Files:** `server/.env` (delete), `server/.env.example` (add), `.github/workflows/ci.yml` (add `secrets-scan` job using `gitleaks-action`), `README.md` (env setup section).
- **Tests:** `tests/unit/secrets.test.js` asserts `!fs.existsSync('server/.env')`.
- **Acceptance:** gitleaks scan passes; CI red if the file reappears.
- **Why first:** Rotating secrets after PRs 2–10 wastes the work; relocate now.

### PR 2 — `security: npm audit fix; bump googleapis & exceljs majors; add audit-level=high CI gate`

- **Goal:** Close `protobufjs` RCE + 14 other advisories.
- **Files:** `server/package.json`, `server/package-lock.json`, `server/lib/googleAuth.js`, `server/services/calendarService.js`, `server/services/exportService.js`, `.github/workflows/ci.yml`.
- **Tests:** Existing Calendar smoke + new `tests/integration/calendar.smoke.test.js`; CI gate `npm audit --omit=dev --audit-level=high`.
- **Acceptance:** `npm audit` returns 0 high+critical.
- **Why second:** Critical CVE; do after secret rotation so a vulnerable runtime can't ship even briefly.

### PR 3 — `security: harden adminDb (forbidden fields + delete blocklist + audit logging)`

- **Goal:** Close SEC-003 + SEC-010.
- **Files:** `server/routes/adminDbRoutes.js`, `server/services/auditService.js` (action enum), `tests/integration/adminDb.test.js` (new).
- **Tests:** 4 new (mfaEnabled lock, passwordResetToken lock, Counter delete block, Setting delete block); AuditLog entry assertion per mutation.
- **Acceptance:** All MFA / auth / reset fields rejected; `Counter / Setting / AuditLog / Attendance / Enrollment / Evaluation` un-deletable; every mutation writes AuditLog `action='db-admin-updated'`.
- **Why third:** Highest-blast-radius privilege escalation; small, tightly scoped diff.

### PR 4 — `security: escape spreadsheet formulas + move reset token to path + scrub forgot-password logs`

- **Goal:** SEC-004 + SEC-005 + SEC-008.
- **Files:** `server/services/exportService.js`, `server/controllers/authController.js`, `server/routes/authRoutes.js`, `server/lib/emailTemplates.js`, `client/src/pages/ResetPasswordPage.jsx`.
- **Tests:** `exportFormulaInjection.test.js`, `passwordReset.tokenInPath.test.js`, `passwordReset.noLog.test.js`.
- **Acceptance:** Cells starting with `= + - @ \t \r` get `'` prefix; reset URL path-style; logs identical for found/not-found.
- **Why fourth:** Customer-facing risk (Excel opens on HR laptops; emailed token in browser history).

### PR 5 — `authz: add Class.teacherIds + policy module + scope evaluation/attendance/schedule for Teacher`

- **Goal:** AUTHZ-001 + AUTHZ-002.
- **Files:** `server/models/Class.js`, new `server/policy/{evaluation,attendance,schedule,class,team,enrollment}.js`, `server/middleware/requirePolicy.js`, `server/controllers/{evaluationController,attendanceController,scheduleController}.js`, `server/routes/scheduleRoutes.js`, migration `server/scripts/migrate-teacherIds.js`.
- **Tests:** `evaluation.canWrite.test.js`, `evaluation.canRead.test.js`, `attendance.canMark.test.js`, `schedule.teacherScope.test.js`.
- **Acceptance:** Teacher A blocked from any cross-class write/read; Participant scoping unchanged.
- **Why fifth:** Core authorization model gap — every later RBAC test depends on a correct teacher boundary.

### PR 6 — `data: partial unique indexes + cancelSlot past-guard + Class soft-delete`

- **Goal:** DATA-001..006.
- **Files:** `server/models/{Enrollment,Team,Class,Schedule}.js`, `server/services/scheduleService.js`, `server/controllers/classController.js`, `server/services/reconcileService.js`, migrations `server/scripts/migrate-dedup-active-enrollments.js`, `migrate-dedup-team-classId.js`, `migrate-dedup-team-leaderId.js`, `migrate-dedup-ongoing-class.js`.
- **Tests:** `concurrent-add-to-two-teams.test`, `concurrent-ongoing-class.test`, `class-team-exclusivity-race.test`, `team-leader-exclusivity.test`, `cancel-past-schedule-blocked.test`.
- **Acceptance:** Race tests pass; `cancelSlot` past returns 409 with attendance untouched; Class soft-delete preserves Evaluation/Enrollment history.
- **Why sixth:** Data corruption is irreversible; do after AUTHZ so tests run with proper Teacher.

### PR 7 — `auth: tighten MFA enrollment lockdown + re-auth on cross-user MFA disable + force-logout`

- **Goal:** SEC-007 + SEC-009.
- **Files:** `server/middleware/auth.js`, `server/controllers/authController.js`, `server/routes/authRoutes.js`, `server/policy/auth.js`.
- **Tests:** `mfaEnrollment.changePasswordBlocked.test`, `mfaAdminDisable.requireReauth.test`, `forceLogout.requireReauth.test`.
- **Acceptance:** 403 without `currentPassword`; 200 with valid.
- **Why seventh:** Closes the last major auth-flow gap; small diff; no other dependency.

### PR 8 — `fe: align useRole with server + fix AuthContext multi-tab + fix SearchPalette + DatabaseExplorer enum`

- **Goal:** FE-001..004 (and partly FE-005, FE-013).
- **Files:** `client/src/hooks/useRole.js`, `client/src/context/AuthContext.jsx`, `client/src/api/api.js`, `client/src/components/SearchPalette.jsx`, `client/src/pages/DatabaseExplorer.jsx`, `client/src/lib/sentry.js`.
- **Tests:** New `client/src/context/__tests__/AuthContext.test.jsx`; new `client/e2e/searchPalette.spec.js`.
- **Acceptance:** Logout in tab A logs out tab B; Cmd+K filters correctly; Teacher UI has no schedule-create button; DatabaseExplorer role dropdown shows `Teacher` not `Leader`; `Sentry.setUser` after login.
- **Why eighth:** Demo-facing fixes; cannot sell with these UX bugs.

### PR 9 — `ci: add client-tests and e2e-tests as required gates; cleanup test debt`

- **Goal:** QA-001 + QA-005..009.
- **Files:** `.github/workflows/ci.yml`, `server/tests/integration/teams.test.js` (un-skip), `server/tests/load/*.yml` (password fix), delete `.bak` + `test_cascade_delete.js`, move `server/e2e_test.js`/`security_audit.js`/`tests/load/extreme-test.js`/`stress_test_booking.js` to `server/scripts/`.
- **Tests:** existing test suites re-enabled; ensure Playwright runs against `npm start` + `npm run preview`.
- **Acceptance:** 5 CI jobs gate merges; full test run < 12 min.
- **Why ninth:** Without CI gating, every later PR risks silent regression of P0 fixes.

### PR 10 — `ops: render healthCheckPath + Sentry cron monitors + client Sentry init + missing alerts`

- **Goal:** OPS-001..004.
- **Files:** `render.yaml`, `server/jobs/reconcileJob.js`, `server/services/reminderService.js`, `server/lib/sentry.js`, `client/src/main.jsx` (init client Sentry), `client/src/lib/sentry.js`, new `docs/runbook-5xx-spike.md`, new `docs/runbook-cron-failure.md`.
- **Tests:** `tests/unit/sentry.config.test.js` asserts `release` + redact paths.
- **Acceptance:** Render rotates instance on `/ready` 503; Sentry shows 5xx within 60 s; reconcile/reminder missed-check fires Slack alert.
- **Why tenth:** Production observability — once you ship the first 9 PRs, you need to be told when it breaks.
