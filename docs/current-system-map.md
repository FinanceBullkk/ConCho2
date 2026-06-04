# Current System Map

## Overview

This map describes the current system from code inspection, not from older docs.
Use it as a working reference when planning implementation.

TMS v2 is a MERN-style internal Training Management System:

- Client: React 19 SPA on Vite, Tailwind CSS, Radix/shadcn-style primitives, React Query, React Router, i18next.
- Server: Express API, Mongoose/MongoDB, cookie auth, CSRF, rate limiting, audit logging, background reconciliation.
- Deploy target: single Node web service serving API and, in production, the built React app.

## Source Of Truth

Verified code paths:

- Client entry: `client/src/main.jsx`
- Client app shell/routes: `client/src/App.jsx`
- Client API wrapper: `client/src/api/api.js`
- Auth state: `client/src/context/AuthContext.jsx`
- Server entry: `server/server.js`
- API routes: `server/routes/*`
- Domain logic: `server/services/*`
- Data models: `server/models/*`
- Validation schemas: `server/schemas/*`

Known caveat: older README/docs may describe previous phases and can be stale.

## Runtime Shape

Request flow:

1. Browser calls `/api/*` through Axios.
2. Axios sends HttpOnly auth cookies via `withCredentials`.
3. Axios mirrors readable `csrf-token` cookie into `X-CSRF-Token` for writes.
4. Express applies request ID, Pino HTTP logging, Helmet, CORS, body parsing, Mongo sanitize, CSRF, global rate limits.
5. Route middleware applies auth, role guard, Zod validation, route-specific limiters.
6. Controller calls service/model.
7. Errors go through global error handler; 5xx are sent to Sentry when configured.

Production also serves `client/dist` from the Express process. Non-API routes fall back to `index.html`.

## Frontend Map

### App Bootstrap

`client/src/main.jsx`:

- Imports `client/src/i18n/index.js` before rendering.
- Initializes Sentry if `VITE_SENTRY_DSN` exists.
- Primes CSRF by calling `/api/auth/csrf`.
- Wraps app in `QueryClientProvider`.

`client/src/queryClient.js`:

- Query stale time: 30 seconds.
- GC time: 5 minutes.
- Queries retry once except `401`, `403`, `404`.
- Mutations never retry.
- Global mutation error toast, except suppressed mutations and `401`.

### Routes

Public:

- `/login`
- `/forgot-password`
- `/reset-password/:token`
- `/reset-password`

Protected shell:

- `/home` -> dashboard
- `/people` -> Admin only
- `/learning` -> Admin and Teacher
- `/calendar` -> all roles
- `/reports` -> Admin and Teacher
- `/system` -> Admin only
- `/classes/:id` -> Admin only
- `/me/settings` -> all authenticated users

Legacy redirects:

- `/dashboard` -> `/home`
- `/academy` -> `/people`
- `/admin` -> `/system`
- `/programs` -> `/learning`
- `/classes` -> `/learning?tab=cohorts`
- `/data` -> `/reports?tab=hr-export`
- `/settings` -> `/system?tab=settings`
- `/schedules` -> `/calendar?tab=schedules`
- `/attendance` -> `/calendar?tab=attendance`
- `/operations` -> `/calendar`
- `/operations/analytics` -> `/reports?tab=analytics`
- `/book` -> `/calendar?tab=book`

### Navigation And Access

`client/src/components/Navbar.jsx` defines top-level nav items:

| Nav | Admin | Teacher | Participant |
|---|---:|---:|---:|
| Home | full | full | full |
| People | full | none | none |
| Programs | full | read | none |
| Calendar | full | full | full |
| Reports | full | full | none |
| System | account dropdown only | none | none |

`ProtectedRoute` enforces page-level roles and redirects MFA-enrollment-required sessions to `/me/settings?force=mfa`.

### Client API Modules

`client/src/api/api.js` exports these API groups:

- `authAPI`
- `usersAPI`
- `teamsAPI`
- `classesAPI`
- `schedulesAPI`
- `attendanceAPI`
- `evaluationsAPI`
- `syncAPI`
- `searchAPI`
- `exportAPI`
- `enrollmentsAPI`
- `learningAPI`
- `dashboardAPI`
- `adminDbAPI`
- `reconcileAPI`

### i18n Current State

The product is **English-only**. `client/src/i18n/index.js` initializes
`i18next` + `react-i18next` with a single `en` resource — no language detection
and no runtime language switching.

- Locale file: `client/src/i18n/locales/en.json` (single locale; `vi.json` removed)
- Language / fallback: `en` (hardcoded `lng: 'en'`, `fallbackLng: 'en'`)
- No `i18next-browser-languagedetector` wired (the package still lingers in
  `client/package.json` but is unused and can be dropped).
- No language toggle in the Navbar (only a theme toggle).

User-facing strings are routed through `t()`; some `/me/*` learner pages use
English literals directly.

## Backend Map

### Mounted API Routes

`server/server.js` mounts:

| Base path | Route file | Purpose |
|---|---|---|
| `/api/auth` | `authRoutes.js` | login, logout, me, password, MFA, reset password |
| `/api/users` | `userRoutes.js` | Admin user CRUD, restore, progress |
| `/api/teams` | `teamRoutes.js` | team CRUD, my teams, restore, progress |
| `/api/classes` | `classRoutes.js` | class CRUD, course metadata |
| `/api/learning` | `domains/learning/routes.js` | Learning programs, cohorts, and session DTOs |
| `/api/schedules` | `scheduleRoutes.js` | availability, booking, cancel, calendars |
| `/api/attendance` | `attendanceRoutes.js` | attendance marking, analytics, personal stats |
| `/api/evaluations` | `evaluationRoutes.js` | upsert/list/get/delete evaluations |
| `/api/enrollments` | `enrollmentRoutes.js` | enrollment list, transfer, bulk operations |
| `/api/sync` | `syncRoutes.js` | sync status and Google Sheets sync |
| `/api/import` | `importRoutes.js` | bulk import users/classes/history |
| `/api/export` | `exportRoutes.js` | Excel/export stats |
| `/api/settings` | `settingRoutes.js` | Admin settings |
| `/api/dashboard` | `dashboardRoutes.js` | Admin dashboard stats/filter/alerts/cache |
| `/api/admin-db` | `adminDbRoutes.js` | Admin database explorer |
| `/api/admin/audit` | `auditRoutes.js` | audit log queries |
| `/api/admin/reconcile` | `reconcileRoutes.js` | manual reconcile and report history |
| `/api/cron` | `cronRoutes.js` | cron-triggered reconcile/reminders |
| `/api/search` | `searchRoutes.js` | global search |
| `/health`, `/ready`, `/api/health`, `/api/ready` | `healthRoutes.js` | liveness/readiness |

### Auth And Security

Current protections:

- JWT in HttpOnly `tms_token` cookie.
- Backward-compatible `Authorization: Bearer` support.
- CSRF double-submit cookie for state-changing `/api` calls.
- MFA/TOTP with backup codes.
- MFA-enrollment-required restricted token state.
- Force password change guard for default-password users.
- Token blocklist for logout/force logout/password events.
- User auth cache with short TTL and explicit invalidation on user updates.
- Helmet security headers and CSP.
- Production no-origin write guard, with cron route exemption.
- CORS allowlist from `CORS_ORIGINS`.
- Global request/write rate limiters plus route-specific limiters.
- Mongo sanitize for `$` and `.` keys.
- Request IDs and structured logs.
- Sentry capture for unexpected 5xx errors.

### Domain Models

| Model | Role |
|---|---|
| `User` | employees, roles, status, auth metadata, MFA, soft delete, dashboard rollups |
| `Team` | group/PIC membership, class assignment, leader |
| `Class` | course cohort, teacher IDs, session counts, status |
| `Enrollment` | user-team-class membership timeline and transfers |
| `Schedule` | booked sessions, enrolled users, Google event/Meet metadata |
| `Attendance` | per-user attendance per schedule |
| `Evaluation` | per-user per-class final evaluation |
| `AuditLog` | actor/action/entity/diff/request metadata, TTL retention |
| `ReconcileReport` | nightly/manual data-integrity reports, 30-day TTL |
| `Setting` | whitelisted system settings such as allowed time slots |
| `TokenBlocklist` | revoked JWT IDs with TTL |
| `Counter` | sequence/counter support |
| `LearningProgram` | L&D training catalog, policy defaults, and legacy course bridge |

### Learning Domain Boundary

`server/domains/learning` is the modular L&D boundary over legacy storage:

- Programs are backed by `LearningProgram`.
- Cohorts are backed by legacy `Class`.
- Sessions are exposed through `server/domains/learning/session/*` and backed by legacy `Schedule`.

Current session API:

- `GET /api/learning/sessions` lists sessions with `cohort`, `group`, and `enrolledLearners` DTO fields.
- `GET /api/learning/sessions/:id` reads one session with participant self-scope and teacher assignment scope.
- `POST /api/learning/sessions/book-slot` books through existing leader-booking logic using `groupId`.
- `DELETE /api/learning/sessions/:id/cancel` cancels through existing Schedule cancellation logic.

This is an adapter boundary only. The physical Mongo collection/model remains `Schedule`, and `/api/schedules` keeps its legacy `classId`, `bookedTeamId`, and `enrolledUsers` response vocabulary for current calendar/booking clients.

Important database constraints:

- `User.empCode` unique.
- `User.email` partial unique for string emails.
- `Class` unique on `{ classCode, courseName }`.
- `Class` partial unique ongoing class index on `{ classCode, status }`.
- `LearningProgram.code` unique.
- `LearningProgram.name` unique case-insensitively.
- `Enrollment` unique active enrollment per `{ userId, teamId }`.
- `Schedule` unique on `{ classId, startTime }`.
- `Attendance` unique on `{ scheduleId, userId }`.
- `Evaluation` unique on `{ classId, userId }`.
- `AuditLog` TTL defaults to 2 years.
- `ReconcileReport` TTL is 30 days.
- `TokenBlocklist` TTL is `expiresAt`.

### Booking Logic

`server/services/scheduleService.js` is the core booking service.

Main rules:

- `startTime` and `endTime` must be valid ISO dates.
- End must be after start.
- Slot must match `ALLOWED_TIME_SLOTS` from `Setting`, evaluated in Vietnam timezone.
- Booking runs in a Mongo transaction.
- Team document is touched to serialize concurrent writes for the same team.
- Team must exist and have `classId`.
- Non-admin caller must be the team leader.
- Active team members are enrolled into the schedule.
- Each team is limited to 2 sessions per ISO week.
- Schedule uniqueness by `{ classId, startTime }` is the final double-booking guard.
- Google Calendar event creation is fail-soft: booking remains valid if calendar creation fails.
- Booking/cancel emails are sent through mailer/templates.
- Session order cache is invalidated after schedule create/delete.

### Reconciliation

`server/services/reconcileService.js` is read-only and persists `ReconcileReport`.

Checks include:

- Past schedule with incomplete attendance.
- Active enrollment where user is not in team members.
- Team member without active enrollment.
- Future schedule with zero enrolled users.
- Active participant without active enrollment.
- Duplicate active enrollments.
- Orphan schedule/class references.
- Multi-team class and counter drift checks.
- Soft-deleted users still present in team membership.

`server/jobs/reconcileJob.js` schedules reconciliation with `RECONCILE_CRON` or `0 2 * * *`, timezone UTC. Render free-tier sleep means external cron/manual trigger may be needed for guaranteed runs.

## External Integrations

- MongoDB via `MONGO_URI`.
- SMTP via `SMTP_*` and `EMAIL_FROM`.
- Google Calendar via service account config and impersonation.
- Google Sheets sync endpoint exists.
- Sentry on client and server when DSNs are configured.
- Render deployment via `render.yaml`.

## Test And Quality Surface

Configured scripts:

- Root: `npm run build`, `npm start`, `npm run dev:server`, `npm run dev:client`, `npm run seed`, `npm run scripts:check`
- Server: `npm test`, load tests through Artillery
- Client: `npm run lint`, `npm run test:run`, `npm run test:coverage`, Playwright e2e scripts

Observed test files:

- Server Jest tests under `server/tests`
- Client Vitest/RTL tests under `client/src/**/__tests__`
- Client Playwright e2e under `client/e2e`

No tests were run while creating this map.

## Current Mismatches To Watch

- README and older phase docs may lag behind code.
- i18n: product is English-only (single `en` locale; no detector, no toggle).
  The unused `i18next-browser-languagedetector` dependency can be dropped.
- Some protected routes/messages still contain English literals outside locale files.
- Some API routes appear intentionally unauthenticated or route-level protected by controller/middleware assumptions; verify before changing security-sensitive endpoints.
- `BookClassPage` is lazy-loaded but no direct active route points to it; `/book` redirects to `/calendar?tab=book`.

## Unresolved Questions

- Which deployment URL and env set are canonical production?
- Should future docs update replace README sections or keep this map as the code-truth companion?
- (Resolved) i18n scope: route user-facing strings through `t()` / `en.json`;
  English literals are acceptable in `/me/*` learner pages. No Vietnamese strings.
