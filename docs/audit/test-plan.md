# Test Plan

Existing coverage map + P0 missing tests + CI gating plan. Anchored to file paths.

---

## F.1 Existing coverage (summary)

| Suite | File count | Type | In CI? |
|---|---|---|---|
| Server Jest integration | 17 | Real Mongo via `MongoMemoryReplSet` | **YES** (`cd server && npm test`) |
| Server Jest unit | 4 | Pure / mocked | YES (same job) |
| Server Artillery | 4 YAMLs | Load (smoke / load / spike / baseline) | NO — local only; **passwords are wrong (QA-006)** |
| Server k6 | 1 | Stress (booking overbook) | NO |
| Server standalone | `e2e_test.js`, `security_audit.js` | Adversarial vs live server | NO |
| Server `.bak` | 2 in `server/tests/` | Dead | NO (not picked up by Jest `testMatch`) |
| Client Vitest | 7 | Unit / hooks | **NO — only `vite build` gates** |
| Client Playwright | 4 specs (`auth`, `permissions`, `navigation`, `theme`) | E2E smoke | **NO** |
| Client MSW handlers | 4 routes | Mock layer | n/a |

### Coverage vs required matrix

| Area | Status | Where covered |
|---|---|---|
| Login success/fail | ✅ | `auth.test.js:27-71` |
| Login lockout (rate-limit) | ❌ | – |
| Password reset (issue / use / expire / replay) | ✅ | `passwordReset.test.js:46-277` |
| Logout invalidates JTI | ⚠️ Partial | only in `security_audit.js` (not in CI) |
| MFA enrollment / verify / backup / replay | ❌ | – |
| MFA admin-disable | ❌ | – |
| RBAC role × endpoint negative | ⚠️ Sampled per suite | not systematic |
| IDOR — Teacher vs Teacher class | ❌ | – |
| IDOR — Participant vs other Participant | ✅ | `scheduleAuthz.test.js:129`, `evaluationRoutes.test.js:273`, `searchRoutes.test.js:121` |
| Booking max-per-week | ✅ | `booking.test.js:90` |
| Booking conflict | ✅ | `booking.test.js:115` |
| Booking race (concurrent) | ❌ Jest | k6 only |
| Attendance — not enrolled rejected | ✅ | `attendance.test.js:131` |
| Attendance — duplicate mark blocked | ❌ | – |
| Attendance — cross-class forge blocked | ❌ | – |
| Attendance — soft-deleted user blocked | ❌ | – |
| Enrollment — duplicate Active blocked | ⚠️ Partial | check-conflicts tested; PUT/POST not asserted |
| Enrollment — deletion cascade | ✅ partial | `autoReleaseScope.test.js:34`, `enrollmentTransfer` |
| Evaluation — write only by assigned teacher | ❌ | – |
| Evaluation — view restricted | ✅ | `evaluationRoutes.test.js:256-285` |
| Evaluation — score bounds | ✅ | `evaluationRoutes.test.js:128` |
| Export — row cap | ❌ | – |
| Export — audit log written | ❌ | only reads tested |
| Export — soft-deleted excluded | ❌ | – |
| Import — invalid file rejected | ❌ | – |
| Import — partial-failure rollback | ❌ | – |
| Import — formula injection sanitized | ❌ | – |
| Cron bearer guard | ✅ | `cronAuth.test.js`, `cronRoutes.test.js` |
| Cron idempotency | ✅ | `cronRoutes.test.js:165-190` |
| Cron missed-run recovery | ❌ | – |
| Admin DB tools RBAC + safety | ❌ | – |
| Reconcile drift detection per invariant | ❌ | only "route reaches service" |
| Audit log write-side (every sensitive write logs) | ❌ | only read tested |
| Error response shape | ✅ | `helpers.test.js:94` |
| CSRF blocked without token | ✅ | `csrfProtection.test.js:106-163` |
| Rate limit enforced | ❌ | – |
| Concurrency tests | ⚠️ One (export race) | `p2-regression.test.js:94-123` only |
| UI smoke login + nav per role | ✅ (Playwright) | not in CI |
| UI CRUD | ❌ | – |
| A11y smoke (axe) | ❌ | – |

---

## F.2 P0 missing tests

Exact filenames + assertions. Each test name maps to a finding ID in [findings.md](./findings.md).

### 1. `server/tests/integration/mfa.test.js` (QA-002 / SEC-007 / SEC-015)
- "valid TOTP transitions login pending → full session, cookie issued"
- "rejects replayed TOTP within same 30s window"
- "5 wrong TOTPs lock the user via mfaVerifyLimiter (429)"
- "backup code consumes after single use — second use 401"
- "Admin force-disable MFA requires currentPassword (403 without, 200 with)" *(SEC-009)*
- "Admin force-disable clears mfaSecret + mfaBackupCodes"
- "MFA enrollment-required cookie blocks PUT /auth/change-password" *(SEC-007)*

### 2. `server/tests/integration/adminDb.test.js` (QA-003 / SEC-003 / SEC-010)
- "PUT /admin-db/User/:id {mfaEnabled:false} returns 200 with warning + DB unchanged" *(SEC-003)*
- "PUT /admin-db/User/:id {passwordResetToken:...} returns 200 with warning + DB unchanged"
- "DELETE /admin-db/Counter/:id returns 403" *(SEC-010)*
- "DELETE /admin-db/Setting/:id returns 403"
- "every mutation writes AuditLog with action=db-admin-updated" *(SEC-013)*

### 3. `server/tests/integration/exportFormulaInjection.test.js` (SEC-004)
- "user.name === '=1+1' → workbook cell value is `'=1+1` (apostrophe prefix)"
- "teacherComment with =HYPERLINK + WEBSERVICE → escaped"
- "all 9 user-controlled string fields escaped: userName, department, teamName, classCode, courseName, remark, teacherComment, empCode, level"

### 4. `server/tests/integration/auth.lockout.test.js` (QA-008)
- "5 wrong-password attempts per (IP, empCode) return 429 on 6th"
- "429 body does NOT leak whether account exists"

### 5. `server/tests/integration/booking.race.test.js` (QA-004)
- "Promise.all([book(slot), book(slot)]) — exactly one 201, one 409, never both 201"
- "two leaders booking 3rd-of-week concurrently — one 201, one 400 weekly-cap"

### 6. `server/tests/integration/enrollment.concurrent.test.js` (DATA-001)
- "Promise.all([PUT teamA add U, PUT teamB add U]) — exactly one Active enrollment exists for U"
- After partial-unique migration: second request fails E11000.

### 7. `server/tests/integration/evaluation.assignedTeacher.test.js` (AUTHZ-001)
- "Teacher A cannot upsert evaluation for Class B → 403"
- "Teacher A GET ?classId=B → 403"
- "Teacher A GET /evaluations/:id where eval.classId=B → 403"

### 8. `server/tests/integration/attendance.canMark.test.js` (AUTHZ-001)
- "Teacher A bulk-mark for Class B schedule → 403"
- "duplicate userId in same payload → 400"
- "soft-deleted user in enrolledUsers → blocked"

### 9. `server/tests/integration/audit.write.test.js` (SEC-013 / QA-007)
- "PUT /users/:id role change writes AuditLog action=ROLE_CHANGE"
- "DELETE /users/:id writes SOFT_DELETE"
- "POST /evaluations writes CREATE"
- "PUT /settings writes SETTING_UPDATE"
- "GET /export/attendance writes EXPORT"
- "POST /sync/google-sheets writes SYNC"
- "POST /admin/reconcile/run writes RECONCILE"
- "PUT /admin-db/* writes DB_ADMIN_UPDATED" *(SEC-003)*

### 10. `server/tests/integration/import.test.js` (QA gap)
- "POST /import/users malformed payload → 400, no users created"
- "Formula injection input round-trips as escaped value"
- "100k rows → 413 by body size limit"
- "Existing-empCode row cannot promote `role` field" *(DATA-010)*

### 11. `server/tests/integration/reconcile.drift.test.js` (DATA-011)
- "Plant orphan attendance → reconcile reports missing-attendance count = expected"
- "Plant 2 Active enrollments for same user → reconcile reports duplicate-active = 1"
- "Plant 2 Ongoing classes per code → reports 1 (after fix index)"
- "Plant 2 teams sharing classId → reports 1"

### 12. `server/tests/integration/cancelSlot.test.js` (DATA-005)
- "Admin cancelSlot on past schedule → 400/409 with attendance row preserved"
- "Admin cancelSlot on future schedule → 200 with attendance deleted (existing behaviour)"

### 13. `server/tests/integration/teams.cascade.test.js` (QA-005)
- Un-skip `teams.test.js:122`.
- "DELETE /teams/:id closes active enrollments + clears future schedule.enrolledUsers"
- "DELETE /teams/:id soft-deletes; isDeleted=true; future schedules' team populate becomes null but not removed"

### 14. `client/src/context/__tests__/AuthContext.test.jsx` (FE-003)
- "logout calls queryClient.clear()"
- "storage event 'tms_user' removal triggers logout in second tab"
- "login calls Sentry.setUser; logout calls Sentry.setUser(null)"
- "tms_user localStorage payload does NOT contain email"

### 15. `client/e2e/crud-users.spec.js` (Playwright)
- Admin opens "New User" → fills empCode + email + password → submit → row appears
- Edits user → re-auth prompt fires on password change
- Soft-delete + restore round-trip

### 16. `client/e2e/mfa-enroll.spec.js` (Playwright)
- Admin enables MFA → QR shows → verify → backup codes
- Re-login asks MFA
- Force-disable from admin tools requires currentPassword

### 17. `client/e2e/a11y-smoke.spec.js` (Playwright)
- `@axe-core/playwright` on `/login`, `/dashboard`, `/users`, `/classes`, `/schedules`, `/reports`
- Fail on serious violation

### 18. `server/tests/integration/cors.test.js` (SEC-006)
- "GET /api/auth/me without Origin header returns 403 in production NODE_ENV"
- "Same request with Origin in allowlist returns 200"

### 19. `server/tests/integration/passwordReset.tokenInPath.test.js` (SEC-005)
- "Forgot-password email body URL contains /reset-password/:token (path), not ?token=..."
- "POST /api/auth/reset-password accepts token from URL param"

### 20. `server/tests/integration/passwordReset.noLog.test.js` (SEC-008)
- "logger calls during forgot-password contain neither raw empCode nor a hash that varies between found and unknown users"

### Also: tests to delete or rewrite

- Delete `server/tests/booking.test.js.bak` (superseded).
- Delete `server/tests/e2e-attendance-flow.test.js.bak`.
- Move `server/tests/test_cascade_delete.js` (not a Jest test) to `server/scripts/`.
- Move `server/e2e_test.js`, `server/security_audit.js`, `server/tests/load/extreme-test.js`, `server/tests/stress_test_booking.js` to `server/scripts/` (or `server/tools/`).
- Fix Artillery passwords (`admin12345!` → `admin12345`) in 4 YAML files.
- Un-skip `teams.test.js:122` (`MongoMemoryReplSet` IS available).
- Rewrite `exportRoutes.test.js:71, 131` — seed real data; assert 200 deterministically (currently tolerates `[200, 404]`).
- Disable / loosen timing assertion in `passwordReset.test.js:122-150` (75 ms slack is flake-prone on CI).

---

## F.3 New test suite plan

| Suite | Count of new files | Location | Time budget |
|---|---|---|---|
| MFA integration | 1 | `server/tests/integration/mfa.test.js` | 1d |
| AdminDB integration | 1 | `server/tests/integration/adminDb.test.js` | 0.5d |
| Export injection | 1 | `server/tests/integration/exportFormulaInjection.test.js` | 0.5d |
| Auth lockout | 1 | `server/tests/integration/auth.lockout.test.js` | 0.5d |
| Booking race | 1 | `server/tests/integration/booking.race.test.js` | 0.5d |
| Enrollment race | 1 | `server/tests/integration/enrollment.concurrent.test.js` | 0.5d |
| Eval teacher binding | 1 | `server/tests/integration/evaluation.assignedTeacher.test.js` | 1d |
| Attendance binding | 1 | `server/tests/integration/attendance.canMark.test.js` | 0.5d |
| Audit-log write-side | 1 | `server/tests/integration/audit.write.test.js` | 1d |
| Import | 1 | `server/tests/integration/import.test.js` | 1d |
| Reconcile drift | 1 | `server/tests/integration/reconcile.drift.test.js` | 1d |
| cancelSlot guard | 1 | `server/tests/integration/cancelSlot.test.js` | 0.25d |
| Teams cascade | 1 (un-skip + extend) | `server/tests/integration/teams.test.js` | 0.5d |
| CORS | 1 | `server/tests/integration/cors.test.js` | 0.25d |
| Password reset (token-in-path) | 1 | `server/tests/integration/passwordReset.tokenInPath.test.js` | 0.5d |
| Password reset (no-log enum) | 1 | `server/tests/integration/passwordReset.noLog.test.js` | 0.25d |
| **Client AuthContext** | 1 | `client/src/context/__tests__/AuthContext.test.jsx` | 0.5d |
| **Client useRole sync** | 1 | `client/src/hooks/__tests__/useRole.test.js` (update existing) | 0.25d |
| **E2E CRUD users** | 1 | `client/e2e/crud-users.spec.js` | 1d |
| **E2E MFA enroll** | 1 | `client/e2e/mfa-enroll.spec.js` | 1d |
| **E2E a11y smoke** | 1 | `client/e2e/a11y-smoke.spec.js` | 0.5d |

Total ≈ 13 engineer-days for full P0 test buildout (paralleled across team can land in 2–3 calendar weeks).

---

## F.4 CI gating plan

Current `.github/workflows/ci.yml`:

```yaml
jobs:
  server-tests:   REQUIRED  (existing, keep)
  client-build:   REQUIRED  (existing, keep)
  client-lint:    INFO      (continue-on-error)
  audit:          INFO      (continue-on-error)
```

Target:

```yaml
jobs:
  server-tests:   REQUIRED
  client-tests:   REQUIRED   ← NEW: cd client && npm run test:run -- --coverage
  client-build:   REQUIRED
  e2e-tests:      REQUIRED   ← NEW: spin up server+client, npx playwright test
  client-lint:    INFO
  audit:          REQUIRED   ← UPGRADE: npm audit --omit=dev --audit-level=high
  secrets-scan:   REQUIRED   ← NEW: gitleaks
```

Estimated added wall time: ~8 minutes (client tests 2 min, e2e 5 min, audit 1 min).

### `e2e-tests` job recipe

```yaml
e2e-tests:
  runs-on: ubuntu-latest
  needs: [server-tests, client-build]
  services:
    mongo:
      image: mongo:7
      ports: ['27017:27017']
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with: { node-version: '20', cache: 'npm' }
    - run: cd server && npm ci
    - run: cd server && node seed.js
      env: { MONGO_URI: mongodb://localhost:27017/tms2_e2e }
    - run: cd server && npm start &
      env: { JWT_SECRET: 'ci-test-secret', CRON_TOKEN: 'x'.repeat(32), ... }
    - run: cd client && npm ci && npx playwright install --with-deps
    - run: cd client && npm run build && npm run preview &
    - run: cd client && npx playwright test
    - uses: actions/upload-artifact@v4
      if: failure()
      with: { name: playwright-report, path: client/playwright-report }
```

---

## F.5 Test priority order (next 10 PRs)

1. CI gating (`client-tests`, `e2e-tests`, `audit` blocking, `secrets-scan`) — see PR 9 in [roadmap.md](./roadmap.md#first-10-prs-to-create).
2. Test 14 (`AuthContext.test.jsx`) — protects FE-003 fix in PR 8.
3. Test 2 (`adminDb.test.js`) — protects SEC-003 fix in PR 3.
4. Test 3 (`exportFormulaInjection.test.js`) — protects SEC-004 fix in PR 4.
5. Test 7 + 8 (`evaluation.assignedTeacher`, `attendance.canMark`) — protect AUTHZ-001 fix in PR 5.
6. Test 6 (`enrollment.concurrent`) — protects DATA-001 fix in PR 6.
7. Test 12 (`cancelSlot`) — protects DATA-005 fix in PR 6.
8. Test 1 (`mfa.test.js`) — protects SEC-007 + SEC-009 fixes in PR 7.
9. Test 9 (`audit.write`) — protects SEC-013 ongoing.
10. Test 17 (a11y smoke) — supports Phase 5 cleanup.

Top 10 missing by blast radius are listed in [README.md § "Top 10 engineering quality gaps"](./README.md#top-10-engineering-quality-gaps).
