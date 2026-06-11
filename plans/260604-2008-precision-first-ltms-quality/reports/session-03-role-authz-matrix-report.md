# Session 03 - Role/Authz Matrix Report

**Date:** 2026-06-04

**Status:** completed

**Verdict:** Risk fixed

## Goal

Answer: do server policy/capability rules and client `useRole` permissions
match for Admin, Teacher, and Participant?

## Scope

In: People, Learning, Calendar, Reports, System route access; server middleware;
client nav/buttons; negative access tests.

Out: workflow data correctness unless authz depends on it.

Stop condition: one P1 found in Teacher Calendar authz; fixed before moving on.

## Evidence

Files inspected:

- `docs/route-permission-matrix.md`
- `server/policy/capabilities.js`
- `server/middleware/roleGuard.js`
- `server/middleware/requireCapability.js`
- `server/routes/userRoutes.js`
- `server/routes/scheduleRoutes.js`
- `server/routes/attendanceRoutes.js`
- `server/routes/exportRoutes.js`
- `server/routes/settingRoutes.js`
- `server/routes/auditRoutes.js`
- `server/domains/learning/routes.js`
- `server/domains/learning/*/use-cases.js`
- `server/domains/assessment/routes.js`
- `server/domains/org/routes.js`
- `client/src/hooks/useRole.js`
- `client/src/components/Navbar.jsx`
- `client/src/App.jsx`
- `client/src/pages/LearningPage.jsx`
- `client/src/pages/CalendarPage.jsx`
- `client/src/pages/ReportsPage.jsx`
- `client/src/pages/AttendancePage.jsx`

Matrix truth:

- People and System are Admin-only in both client route guard/nav and server
  route guards.
- Reports page is Admin/Teacher only; tabs hide Admin-only HR export, Sheets
  sync, audit/system surfaces from Teacher.
- Learning admin console is Admin/Teacher only. Participant learning access uses
  self-service `/me/*` pages and self-scoped Learning APIs.
- Calendar is role split: Admin schedules/attendance, Teacher attendance,
  Participant booking.
- Learning Participant reads are self-scoped in use-cases for enrollments,
  completion, certificates, feedback, sessions, paths/assessments.

## Finding

### S03-P1 - Teacher Calendar UI called Admin-only attendance calendar

Client route/nav allowed Teacher into `/calendar`, and `CalendarPage` rendered
`AttendancePage` for Teacher. `AttendancePage` loaded
`GET /api/schedules/attendance-calendar`.

Server route was `roleGuard('Admin')`, so Teacher saw a valid attendance UI but
the first calendar request returned 403.

Impact: Teacher attendance workflow broken from UI. Also a server/client matrix
drift: client said Teacher can use attendance calendar, server denied.

## Action

Fixed now:

- `server/routes/scheduleRoutes.js`: `attendance-calendar` now allows
  `Admin` and `Teacher`.
- `server/controllers/scheduleController.js`: passes `req.user` into schedule
  service.
- `server/services/scheduleService.js`: Teacher attendance calendar is scoped
  by `Class.teacherIds`, with empty `teacherIds` kept permissive for graceful
  migration.
- `server/tests/integration/teacherBinding.test.js`: added regression coverage
  for Teacher A allowed, Teacher B scoped out of another teacher's bound class,
  Participant still denied.
- `docs/route-permission-matrix.md`: updated schedule row to match route truth.

No public API shape change.

Accepted risk:

- Participant is hidden from `/learning` admin console even though some Learning
  APIs are readable by Participant. This is UX separation, not a broken access
  path: Participant entrypoints exist under `/me/catalog`, `/me/paths`,
  `/me/assessments`, and `/me/feedback`.

## Verification

Small tests:

- `cd server && npm test -- --runTestsByPath tests/integration/teacherBinding.test.js tests/unit/capabilities.test.js tests/unit/middleware.test.js tests/integration/scheduleAuthz.test.js`
  - Pass: 4 suites, 36 tests.
- `cd client && npm run test:run -- src/hooks/__tests__/useRole.test.js src/pages/__tests__/ReportsPage.test.jsx src/components/__tests__/ProtectedRoute.test.jsx`
  - Pass: 3 files, 28 tests.
- `node --check server/services/scheduleService.js`
  - Pass.
- `node --check server/controllers/scheduleController.js`
  - Pass.
- `node --check server/routes/scheduleRoutes.js`
  - Pass.
- `node --check server/tests/integration/teacherBinding.test.js`
  - Pass.
- `git diff --check`
  - Pass.

Medium tests:

- `cd server && npm test -- --runTestsByPath tests/integration/userRoutes.test.js tests/integration/orgRoutes.test.js tests/integration/learningRoutes.test.js tests/integration/learningReportsRoutes.test.js tests/integration/learningSessionRoutes.test.js`
  - Pass: 5 suites, 71 tests.
- `cd server && npm test -- --runTestsByPath tests/integration/auditRoutes.test.js tests/integration/exportRoutes.test.js tests/integration/settings.test.js tests/integration/assessmentRoutes.test.js`
  - Pass: 4 suites, 53 tests.

Large tests:

- Playwright permissions smoke not run. Local `localhost:5000` is
  `AirTunes/870.14.1`, not TMS API, and `localhost:3000` was not running.
  Existing backlog `QB-005` covers seeded backend setup for e2e smoke.

Manual smoke:

- Not run for same seeded backend reason.

## Backlog

- No new backlog. Existing `QB-005` remains open for repeatable seeded e2e
  backend setup.

## Unresolved Questions

- None.
