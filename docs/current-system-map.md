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
- API routes: `server/routes/*` (legacy) + `server/domains/<domain>/routes.js`
- Domain logic: `server/services/*` and `server/domains/<domain>/*` (21 domains — full inventory in `.claude/rules/domain-model-and-migration.md`; core: learning, schedule, attendance, groups, assessment, org, room, english-class)
- Data models: `server/models/*`
- Validation schemas: `server/schemas/*`
- Domain vocabulary (glossary): `CONTEXT-MAP.md` (root) → `server/CONTEXT.md`. This map = where code lives; `CONTEXT.md` = what the terms mean.

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

- `/home` -> landing (greeting + AlertBand + TodayHero + role-aware QuickActions; the Admin training analytics moved to `/reports?tab=overview` — IA cleanup 2026-06-13)
- `/people` -> Admin only
- `/learning` -> Admin and Teacher (6 tabs grouped Catalog/Delivery; Dashboard + Reports tabs moved to `/reports`)
- `/calendar` -> all roles
- `/reports` -> Admin, Coordinator, Teacher (consolidated reporting home: Overview · L&D Dashboard · Completion · Attendance · HR Export)
- `/system` -> Admin only (Sync lives here — removed the duplicate Reports▸Sheets Sync tab)
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

IA rework 2026-06-13: top horizontal bar → **left sidebar + slim topbar** (the
enterprise pattern — Docebo/TalentLMS/SAP). The shell is
`client/src/components/Layout.jsx` (Topbar + Sidebar + mobile drawer); nav is
defined once in `client/src/components/nav/nav-config.js`:

- **`nav/Topbar.jsx`** — sticky slim bar: logo · global search (Cmd/Ctrl+K) ·
  NotificationBell · theme toggle · avatar menu (account + sign-out).
- **`nav/Sidebar.jsx`** — role-filtered grouped vertical nav (md+ sticky column);
  items the role can't access are HIDDEN (not disabled) — only what you can act on.
- **`nav/MobileSidebar.jsx`** — `< md` hamburger-opened slide-over drawer.

**Sidebar = collapsible section-groups whose items are the section's tabs**
(Phase 03 — the umbrella pages dropped their in-page tab strips; each tab is now a
sidebar sub-item, a deep link into the page's `?tab=`). Items are filtered by
`access` (role map) AND/OR `perm` (capability via `useRole`). Admin-persona groups:

| Group | Sub-items (→ `?tab=`) |
|---|---|
| (top) | Home |
| Learning | Programs · Cohorts · Paths · Assignments · Assessments · Feedback (`/learning`) |
| Operations | Schedules · Attendance (`/calendar`) |
| English Class | Classes · Teams · Schedules · Attendance · Evaluations (`/english`) |
| Reports | Overview · L&D Dashboard · Completion · Attendance · HR Export (`/reports`) |
| People | Users · Departments · Offices · Rooms (`/people`) |
| System | Settings · Database · Sync · Reconciliation · Audit (`/system`) |
| (manager) | My Team (when the user has direct reports) |

Each sub-item gates on the same perm/role the page's tab used, so a role sees only
its tabs (e.g. Teacher: Learning minus Paths, Reports minus Overview/HR Export,
Operations/English Attendance only; Coordinator: no System, no English).

**Persona modes (Phase 02):** `context/PersonaContext.jsx` swaps the sidebar
group-set between **Admin Console** (the table above) and **My Learning** (the
`/me/*` surfaces: My programs · Catalog · My sessions · Paths · Assessments ·
Feedback · Transcript + English). Participants are locked to learner; staff default
to admin and switch via the avatar menu (choice persisted in `localStorage`). The
`/me/*` routes are open to ALL authenticated users (self-scoped server-side).
Persona is a UI mode only — not an authz boundary.

`ProtectedRoute` enforces page-level roles and redirects MFA-enrollment-required sessions to `/me/settings?force=mfa`. The sidebar only shows/hides — the server is the real authz boundary.

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
| `/api/teams` | `domains/groups/routes.js` | team CRUD, my teams, restore, progress (Phase 1 domain extraction; `controller` facade → `queries`/`mutations`/`lifecycle`/`enrollment-sync`; `Team` model + `/api/teams` URL unchanged) |
| `/api/classes` | `classRoutes.js` | class CRUD, course metadata |
| `/api/learning` | `domains/learning/routes.js` | Learning programs, cohorts, sessions, paths, assignments, dashboards, and reports — incl. **H1 A5** training-hours + evidence-pack (multi-sheet xlsx) + saved presets (`ReportPreset`) under `/reports/*` |
| `/api/schedules` | `domains/schedule/routes.js` | availability, booking, cancel, calendars (Phase 1 domain extraction; `controller` → `use-cases`/`queries`/`repository` + policy modules; booking mutations still in `services/scheduleService` by design; `Schedule` model + `/api/schedules` URL unchanged) |
| `/api/english` | `domains/english-class/routes.js` | English-class separation (2026-06-12): bounded READ-ONLY surface over the team-booking world — `/classes`, `/schedules`, `/attendance-calendar` delegate into learning/schedule use-cases with `mode` forced to `team`; mutations stay on `/api/teams`, `/api/schedules`, `/api/evaluations` |
| `/api/attendance` | `domains/attendance/routes.js` | attendance marking, analytics, personal stats (Phase 1 domain extraction; `controller` → `use-cases` → `marking`/`analytics`/`scope`; `services/attendanceService.js` kept as a compat facade) |
| `/api/rooms` | `domains/room/routes.js` | Office-scoped physical Rooms CRUD (re-center Phase 3) |
| `/api/org` | `domains/org/routes.js` | departments, offices, manager hierarchy + manager dashboard |
| `/api/assessment` | `domains/assessment/routes.js` | assessment engine, question bank, attempts, manual grading |
| `/api/session-types` | `domains/session-type/routes.js` | Build Plan #5 Studio Scheduling: session-type taxonomy (`SessionType`) + room-utilization read |
| `/api/compliance` | `domains/compliance/routes.js` | Modernization H1 A3: required-training rules (`RequiredTraining`) + DERIVED compliance matrix (per-rule compliant/overdue, drill-down); publishes `requirement.changed` |
| `/api/finance` | `domains/finance/routes.js` | Modernization H1 A1: cost entries (`CostEntry`) + budgets (`Budget`) + roll-up + budget-vs-actual variance; `budget.manage` (read==write); tenant currency enforced |
| `/api/vendors` | `domains/vendor/routes.js` | Modernization H2 A2: external-provider catalog (`Vendor`) — contacts/contracts/ratings + per-vendor spend (from `CostEntry.scope.vendorId`); `vendor.manage` (read==write); archive = soft-delete + `status:archived` |
| `/api/trainers` | `domains/trainer/routes.js` | Modernization H2 A6: trainer qualification/availability (`TrainerProfile`) + qualified-and-free listing + per-trainer load + ratings; reuses `session.assign-trainer`. Double-booking 409 enforced at `domains/schedule setTrainers` (overlap on `sessionInstructorIds`) |
| `/api/planning` | `domains/planning/routes.js` | Modernization H2 A4: TNA demand intake (`TrainingRequest`) + demand aggregation + costed annual plan (`TrainingPlan`) + schedule plan item → cohort (`Class` + A1 `Budget` carry); `training.plan` (Admin/Coordinator) |
| `/api/me` | `domains/mobile/routes.js` | Modernization H2 B5: mobile learning surface — Web Push subscribe (`PushSubscription`) + `mobile-feed` (composed due/upcoming/microlearning); self-scoped. Push delivery via `services/pushService` rides along on `domains/notification in-app-writer.recordInApp`, fail-soft without VAPID env |
| `/api/skills` | `domains/skill/routes.js` | competency framework: skills CRUD, role profiles, DERIVED proficiency + role gap; **H1 B2** taxonomy tree (`/taxonomy`) + gap-driven program recommendations (`/learner/:id/recommendations`) |
| `/api/evaluations` | `evaluationRoutes.js` | upsert/list/get/delete evaluations |
| `/api/enrollments` | `enrollmentRoutes.js` | enrollment list, transfer, bulk operations |
| `/api/sync` | `syncRoutes.js` | sync status and Google Sheets sync |
| `/api/import` | `importRoutes.js` | bulk import users/classes/history |
| `/api/export` | `exportRoutes.js` | Excel/export stats |
| `/api/settings` | `settingRoutes.js` | Admin settings |
| `/api/dashboard` | `dashboardRoutes.js` | Admin dashboard stats/filter/alerts/cache |
| `/api/analytics` | `analyticsRoutes.js` | Build Plan #1: daily `MetricSnapshot` time-series + enrollment→completion funnel + per-program analytics (nightly snapshot job + backfill script) |
| `/api/admin-db` | `adminDbRoutes.js` | Admin database explorer |
| `/api/admin/audit` | `auditRoutes.js` | audit log queries + **tamper-evident hash-chain verify** (`POST /verify`, Build Plan #3a) |
| `/api/admin/reconcile` | `reconcileRoutes.js` | manual reconcile, trend, and report history + **safe auto-heal** of detected drift (Build Plan #4) |
| `/api/admin/cron` | `cronHealthRoutes.js` | cron run health/history (CronRun) |
| `/api/cron` | `cronRoutes.js` | cron-triggered reconcile, attendance reminders, assignment reminders |
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
| `LearningPath` | ordered program curriculum and per-learner path progress |
| `Assignment` | required Program/Path assignment with due date and user/department targets |
| `NotificationLog` | email notification idempotency and send trace |
| `Department` | structured org unit for manager/department assignment |
| `Skill` | competency framework: program→skill mapping, per-role targets, taxonomy `parentId` (H1 B2); proficiency is DERIVED, never stored |
| `SessionType` | Build Plan #5 Studio Scheduling: session-type taxonomy |
| `MetricSnapshot` | Build Plan #1: daily metric snapshot for the analytics time-series |
| `RequiredTraining` | Modernization H1 A3: required-training rule (role/dept/office → program/path, cadence); compliance DERIVED from certificates |
| `CostEntry` | Modernization H1 A1: actual training-cost line (scope, type, minor-unit amount, fiscal date) |
| `Budget` | Modernization H1 A1: planned allowance per fiscal year / department / program (minor units) |
| `ReportPreset` | Modernization H1 A5 part 2: saved report config (kind/filters/schedule) for evidence pack + reports |
| `Vendor` | Modernization H2 A2: external training-provider (contacts, delivered programs, contracts, ratings, status); spend rolls up from `CostEntry.scope.vendorId`; `Schedule.vendorId` links a session |
| `TrainerProfile` | Modernization H2 A6: 1:1 qualification/availability record for a Teacher/Admin User (canDeliver programs, availability, ratings, status); load + double-booking read `Schedule.sessionInstructorIds` |
| `TrainingRequest` | Modernization H2 A4: TNA demand-intake line (target program/skill, headcount, priority, quarter, status machine submitted→…→planned/rejected) |
| `TrainingPlan` | Modernization H2 A4: costed annual plan (one per fiscalYear; items: target, quarter, demand, estCostMinor, cohortIds); schedule item → `Class` + A1 `Budget` |
| `PushSubscription` | Modernization H2 B5: one Web Push device registration per user (endpoint unique, keys); disposable (hard-delete on unsubscribe / 404-410 prune) |

### Learning Domain Boundary

`server/domains/learning` is the modular L&D boundary over legacy storage:

- Programs are backed by `LearningProgram`.
- Cohorts are backed by legacy `Class`.
- Sessions are exposed through `server/domains/learning/session/*` and backed by legacy `Schedule`.
- Paths are backed by `LearningPath`.
- Assignments are backed by `Assignment` and derive learner status from existing
  completion/certificate/enrollment signals.
- Assignment reminder sends are backed by `NotificationLog` idempotency records
  and run through the monitored cron route.

Current session API:

- `GET /api/learning/sessions` lists sessions with `cohort`, `group`, and `enrolledLearners` DTO fields.
- `GET /api/learning/sessions/:id` reads one session with participant self-scope and teacher assignment scope.
- `POST /api/learning/sessions/book-slot` books using `groupId` (team) or `cohortId`. Group booking delegates to `scheduleService.bookSlot` — the shared chokepoint that enforces the booking invariants AND the `schedulingMode` gate (same rule set as the legacy `/api/schedules/book-slot` route; the adapter no longer holds its own copy). Cohort booking calls `scheduling-mode-policy.assertCohortMode`.
- `DELETE /api/learning/sessions/:id/cancel` cancels through existing Schedule cancellation logic (durable status flip — phase-04 slice A; never hard-deletes).

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
- `NotificationLog` has a unique assignment/learner/recipient/cadence tuple and
  a 180-day TTL.

### Booking Logic

`server/services/scheduleService.js` holds the transaction-heavy **mutation**
entry points (`bookSlot`, `bookCohortSlot`, `adminCreate`, `cancelSlot`) and acts
as a thin **facade** re-exporting the read use-cases + session-order helpers below,
so existing callers keep using `scheduleService.listSchedules` etc. unchanged. The
booking **invariants**, the **read/query layer**, and the **session-order cache**
all live in `server/domains/schedule/` (which also owns the `/api/schedules`
routes since 2026-06-10 — the legacy `scheduleController` is retired);
`scheduleService` and the `domains/learning/session` adapter delegate into it
(one rule set):

- `queries.js` — pure read use-cases (`getAvailability`, `listSchedules`, `getById`,
  `getMyClassSchedules`, `getAttendanceCalendar`), extracted from the legacy service
  (Phase 1). All Mongoose access goes through `repository.js`; derived
  `attendanceStatus` (none/pending/partial/done) is computed here.
- `session-order.js` — the single per-class session-order cache + `attachSessionNumbers`
  (1-based `sessionNumber` by `startTime`) + `invalidateSessionOrderCache` (called by
  every create/cancel path so numbers stay accurate).
- `session-booking-policy.js` — `assertBookable` (per-team weekly cap + same-class
  collision, via the schedule repository), `getWeekBounds`, `snapshotActiveMembers`,
  single `WEEKLY_TEAM_LIMIT` (= 2).
- `scheduling-window-policy.js` — `ALLOWED_TIME_SLOTS` parsing/validation (VN tz).
- `scheduling-mode-policy.js` — program `schedulingMode` gate (see below).

Main rules:

- `startTime`/`endTime` valid ISO; end after start.
- Slot must match `ALLOWED_TIME_SLOTS` from `Setting`, evaluated in Vietnam timezone.
- Booking runs in a Mongo transaction; the Team doc is touched to serialize
  concurrent same-team writes.
- Team must exist and have `classId`; non-admin caller must be the team leader.
- Active team members are enrolled. **Reassigning** a session to another team
  rebuilds the roster from the new team's **Active** members only (Dropped excluded).
- Each team is limited to 2 sessions per ISO week.
- `{ classId, startTime }` uniqueness is the final double-booking guard.
- **schedulingMode enforcement (Pass C):** the program's `schedulingMode`
  (on `LearningProgram`, reached via `Class.programId`; falls back to
  `leader_booking` when no program is linked) is gated at the `bookSlot`
  chokepoint — which serves BOTH the legacy `POST /api/schedules/book-slot` leader
  route AND the `learning/session` adapter — plus `adminCreate` and `updateSchedule`
  reassign. Leader self-booking an `admin_scheduled` program → 403; team-booking a
  cohort program (`self_enroll`/`nomination`) → 400; unknown mode → 501;
  program-less class still books.
- Google Calendar event creation is fail-soft; booking/cancel emails via mailer/templates.
- Session order cache is invalidated after schedule create/delete.

### Reconciliation

`server/services/reconcileService.js` is the read-only orchestrator: it pre-fetches
active enrollments, runs the 10 checks in parallel (fail-soft per check), and persists
a `ReconcileReport`. The check implementations live in `server/services/reconcile/*`
grouped by concern: `schedule-checks.js` (1/4/7), `enrollment-checks.js` (2/3/5/6),
`team-checks.js` (8/10), `counter-checks.js` (9).

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
