# System Inventory

Snapshot of TMS v2 as audited on 2026-05-24.

---

## Routes & APIs

| Mount | Source | Auth |
|---|---|---|
| `/health`, `/ready`, `/api/health`, `/api/ready` | `server/routes/healthRoutes.js` | Public |
| `GET /api/auth/csrf` | `server/server.js:196` | Public |
| `POST /api/auth/login`, `mfa/verify`, `forgot-password`, `reset-password` | `server/routes/authRoutes.js` | Public + rate-limited |
| `/api/auth/*` (`me`, `logout`, `change-password`, `mfa/*`, `admin/force-logout/:id`) | `server/routes/authRoutes.js` | Protected; admin actions require `roleGuard('Admin')` |
| `/api/users/*` | `server/routes/userRoutes.js` | Admin (re-auth required on `password`/`role` cross-user) |
| `/api/teams/*` | `server/routes/teamRoutes.js` | Admin (+ Participant `my-teams`) |
| `/api/classes/*` | `server/routes/classRoutes.js` | Protected; mutate Admin-only |
| `/api/schedules/*` | `server/routes/scheduleRoutes.js` | **Mixed; Teacher unrestricted on list/getById/availability** |
| `/api/attendance/*` | `server/routes/attendanceRoutes.js` | Admin/Teacher mark + analytics; Participant via inline scoped check |
| `/api/evaluations/*` | `server/routes/evaluationRoutes.js` | Admin/Teacher write (no class-binding!); Participant own-only |
| `/api/enrollments/*` | `server/routes/enrollmentRoutes.js` | Admin-only |
| `/api/sync/google-sheets` | `server/routes/syncRoutes.js` | Admin |
| `/api/import/*` | `server/routes/importRoutes.js` | Admin + rate-limited |
| `/api/export/*` | `server/routes/exportRoutes.js` | Admin + rate-limited |
| `/api/settings` | `server/routes/settingRoutes.js` | Admin (key whitelist) |
| `/api/dashboard/*` | `server/routes/dashboardRoutes.js` | Admin |
| `/api/admin-db/*` | `server/routes/adminDbRoutes.js` | Admin (forbidden-field list incomplete — see SEC-003) |
| `/api/admin/audit/*` | `server/routes/auditRoutes.js` | Admin |
| `/api/admin/reconcile/*` | `server/routes/reconcileRoutes.js` | Admin |
| `/api/cron/*` | `server/routes/cronRoutes.js` | Cron token (constant-time compare via `middleware/cronAuth.js`) |
| `/api/search` | `server/routes/searchRoutes.js` | Protected + per-role scoping in service |
| `/api/docs` | `server/server.js:181-188` | Dev or `SWAGGER_ENABLED=true` only |

Full permission matrix in [matrices.md](./matrices.md).

---

## Models

| Collection | File | Soft-delete? | Notes |
|---|---|---|---|
| `users` | `server/models/User.js` | Yes (`isDeleted`, `deletedAt`) | `pre('find/findOne/...')` + `pre('aggregate')` hooks |
| `teams` | `server/models/Team.js` | Yes | **`pre('aggregate')` hook missing** (DATA-007) |
| `classes` | `server/models/Class.js` | No | Hard-delete cascades Evaluation + Enrollment (DATA-006) |
| `schedules` | `server/models/Schedule.js` | No | `cancelSlot` deletes attendance unconditionally (DATA-005) |
| `attendances` | `server/models/Attendance.js` | No | Unique `{scheduleId, userId}` |
| `enrollments` | `server/models/Enrollment.js` | No | Partial unique `{userId, teamId}` for `Active` |
| `evaluations` | `server/models/Evaluation.js` | No | Unique `{classId, userId}`, scores 0–10 |
| `auditlogs` | `server/models/AuditLog.js` | No | TTL `RETENTION_DAYS * 86400` (default 730d) |
| `settings` | `server/models/Setting.js` | No | Value is `Schema.Types.Mixed` (no validation) |
| `tokenblocklists` | `server/models/TokenBlocklist.js` | No | TTL on `expiresAt` |
| `reconcilereports` | `server/models/ReconcileReport.js` | No | TTL on `runAt` |
| `counters` | `server/models/Counter.js` | No | Atomic `$inc upsert`; not session-aware |

**Missing collections** for enterprise LMS: `Department`, `Skill`, `LearningPath`, `Module`, `Lesson`, `Quiz`, `QuizAttempt`, `Certificate`, `Notification`, `Webhook`, `ApiKey`, `Tenant`. See [findings.md § PROD](./findings.md#c-prod-enterprise-lms).

---

## Services

| Service | File | Consumed by |
|---|---|---|
| `authService` | `server/services/authService.js` | authController, middleware/auth |
| `mfaService` | `server/services/mfaService.js` | authController, authService |
| `scheduleService` | `server/services/scheduleService.js` (715 lines — refactor candidate) | scheduleController, dashboardController |
| `attendanceService` | `server/services/attendanceService.js` | attendanceController, dashboardController |
| `exportService` | `server/services/exportService.js` (508 lines) | exportController |
| `importService` | `server/services/importService.js` | importController |
| `reminderService` | `server/services/reminderService.js` | cronRoutes |
| `calendarService` | `server/services/calendarService.js` | scheduleService |
| `searchService` | `server/services/searchService.js` | searchController |
| `reconcileService` | `server/services/reconcileService.js` | reconcileController, jobs/reconcileJob |
| `auditService` | `server/services/auditService.js` | every mutating controller (fire-and-forget) |

**Missing service layers**: `userService`, `teamService`, `enrollmentService`, `dashboardService`, `syncService`. Their work currently lives in fat controllers.

**Cross-controller import** (architectural smell):
- `server/controllers/enrollmentController.js:7` imports `syncEnrollments`, `flushPendingEmails` from `./teamController`.

**Orphan controller**: `server/controllers/fixController.js` (175 lines) — no route mounts it. Delete or wire under admin tools.

---

## Middleware (server/middleware/)

| File | Purpose |
|---|---|
| `auth.js` | JWT verify, JTI blocklist check, `passwordChangedAt` check, 30s user cache, MFA-enrollment lockdown, mustChangePassword lockdown |
| `roleGuard.js` | Coarse role gate `roleGuard('Admin', 'Teacher', ...)` |
| `csrfProtection.js` | Double-submit cookie + header |
| `cronAuth.js` | Constant-time bearer/x-cron-token/query token compare; refuses when token unset or < 16 chars |
| `rateLimiters.js` | Global per-IP, per-user-write, login, MFA, forgot-password, import (MemoryStore — single-instance only) |
| `validate.js` | Zod schema runner for `body`/`query`/`params` |
| `requestId.js` | X-Request-Id correlation |
| `analyticsCache.js` | In-memory `node-cache` for dashboard responses (patches `res.json` only — see PERF-001) |

---

## Critical workflows

1. **Login (password)** → JWT cookie *or* MFA pending cookie → MFA verify → full session cookie.
2. **Force-change-password + MFA enrollment lockdown** allows only `/auth/me`, logout, `mfa/setup`, `mfa/verify-setup`, `change-password` (**leak: `change-password` should be removed — SEC-007**).
3. **Booking** (Participant Leader) — `withTransaction`: collision + weekly cap + auto-enroll 8 members → calendar invite fire-and-forget.
4. **Attendance bulk-mark** (Admin/Teacher) — P/A/L for `enrolledUsers` of schedule within 30-day window.
5. **Evaluation upsert** — 4-axis score (0–10) unique per `(classId, userId)`.
6. **Soft-delete user** — pull from `Team.members` + future `Schedule.enrolledUsers` + close active Enrollments + set `isDeleted=true`.
7. **Import users/classes/history** — bulkWrite chunked; `IMPORT_DEFAULT_PASSWORD` required in production.
8. **Export attendance** — claim PENDING via `updateMany` → aggregate join schedules/users/classes/teams → ExcelJS buffer → mark EXPORTED. (PERF-001: OOM at 50–100k rows.)
9. **Reconcile cron** (`server/jobs/reconcileJob.js`) — 5 drift checks → `ReconcileReport`. (Catches 5 of ~20 invariant classes — see [findings.md § DATA](./findings.md#c-data-data-integrity).)
10. **Reminder cron** — 24h before schedule, serial loop, idempotent via `remindersSentAt`.
11. **Audit log fire-and-forget** with redacted diff; TTL 730 days.

---

## Roles & permissions (today)

| Role | High-level access |
|---|---|
| **Admin** | Everything. Re-auth required for cross-user password/role change. |
| **Teacher** | Attendance bulk-mark, evaluation create/read (currently **any class — bug AUTHZ-001**), schedule read. |
| **Participant** | Own profile, own enrollments, own evaluations, own attendance. May see own teams. |
| **Participant Leader** (= `team.leaderId === user._id`) | Book / cancel slots for own team only (enforced in service layer). |
| **Unauthenticated** | `/api/auth/login`, `forgot-password`, `reset-password`, `/api/auth/csrf`, `/health`, `/ready`. |

Detailed actor × resource × action table in [matrices.md](./matrices.md).

---

## External dependencies

| Dependency | Purpose | Where wired |
|---|---|---|
| MongoDB Atlas M0 | Primary DB | `server/config/db.js`; replica-set required (startup check) |
| Render web service | Hosting (free plan: 512 MB, sleeps after 15 min idle) | `render.yaml` |
| Gmail SMTP | Outbound mail (reminders, password reset) | `server/lib/mailer.js` |
| Google Calendar API | Booking invites | `server/lib/googleAuth.js`, `server/services/calendarService.js` |
| Sentry | Server error reporting | `server/lib/sentry.js`; **client init missing — OPS-003** |
| node-cron | In-process scheduling | `server/jobs/reconcileJob.js` |
| External pinger (`cron-job.org`) | Wake Render free instance + fire cron endpoints | `docs/cron-pinger-setup.md` |

---

## Background jobs

| Job | Trigger | File |
|---|---|---|
| Reconcile drift checks | `node-cron` daily (in-process) + external pinger via `/api/cron/reconcile` | `server/jobs/reconcileJob.js`, `server/services/reconcileService.js` |
| Attendance reminders | External pinger hourly via `/api/cron/attendance-reminders` | `server/services/reminderService.js` |
| Token blocklist purge | Mongo TTL index | `server/models/TokenBlocklist.js:56` |
| AuditLog purge | Mongo TTL index | `server/models/AuditLog.js:88-91` |
| ReconcileReport purge | Mongo TTL index | `server/models/ReconcileReport.js:82` |

---

## Existing tests

| Suite | Files | Runs in CI? |
|---|---|---|
| Server Jest integration | 17 files in `server/tests/integration/` | **YES** (`cd server && npm test`) |
| Server Jest unit | 4 files in `server/tests/unit/` | YES (same job) |
| Server load (Artillery) | 4 YAMLs in `server/tests/load/` | NO (local) — passwords are wrong (QA-006) |
| Server stress (k6) | `server/tests/stress_test_booking.js` | NO |
| Server standalone | `server/e2e_test.js`, `server/security_audit.js` | NO |
| Server `.bak` files | 2 files in `server/tests/` | NO (not picked up by `testMatch`) |
| Client Vitest | 7 files | **NO — only `vite build` gates** |
| Client Playwright | 4 specs in `client/e2e/` | **NO** |

Detailed coverage matrix + P0 missing tests in [test-plan.md](./test-plan.md).

---

## Deployment / runtime config

| Item | Source | Notes |
|---|---|---|
| Blueprint | `render.yaml` | Free plan; `JWT_SECRET` + `CRON_TOKEN` generated; `MONGO_URI`, SMTP, Google, Sentry are `sync: false` |
| **`healthCheckPath`** | NOT SET in `render.yaml` | OPS-001 — Render defaults to root; Mongo disconnect not detected |
| Dockerfile | `Dockerfile` | `node:20-alpine`, non-root `tms` user, HEALTHCHECK `/health` |
| Build | `npm run build` | install server + client + vite build |
| Start | `npm start` → `cd server && node server.js` | |
| Graceful shutdown | `server/server.js:293-309` | SIGTERM 10s drain — **does NOT close Mongo / stop cron** (OPS-005) |
| Env required | `JWT_SECRET` (fail-fast at `server.js:29-32`) | Recommend extending: `CRON_TOKEN`, `MONGO_URI`, `IMPORT_DEFAULT_PASSWORD` should also fail-fast |

Full launch checklist in [roadmap.md § H.4](./roadmap.md#h4-production-launch-checklist).
