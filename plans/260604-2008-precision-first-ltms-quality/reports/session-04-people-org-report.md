# Session 04 - People + Org Report

**Date:** 2026-06-04

**Status:** completed

**Verdict:** Risk fixed

## Goal

Answer: does user/org management preserve data integrity and enforce manager
scope?

## Scope

In: user CRUD, soft delete/restore, Department CRUD, manager assignment, cycle
guard, My Team dashboard rollup.

Out: Google Directory sync, due dates, assignment engine.

Stop condition: one P1 found in user soft-delete history preservation; fixed
before moving on.

## Evidence

Files inspected:

- `server/models/User.js`
- `server/models/Department.js`
- `server/models/Schedule.js`
- `server/models/Attendance.js`
- `server/models/Certificate.js`
- `server/controllers/userController.js`
- `server/routes/userRoutes.js`
- `server/domains/org/routes.js`
- `server/domains/org/controller.js`
- `server/domains/org/use-cases.js`
- `server/domains/org/repository.js`
- `server/domains/org/dto.js`
- `server/domains/org/schemas.js`
- `server/services/attendanceService.js`
- `server/tests/integration/userRoutes.test.js`
- `server/tests/integration/orgRoutes.test.js`
- `client/src/hooks/useOrg.js`
- `client/src/pages/MyTeamPage.jsx`
- `client/src/pages/DepartmentsPage.jsx`

Code truth:

- User and Department models have soft-delete auto-filters and partial unique
  indexes for reusable email/department code behavior.
- Department archive blocks when live users are assigned.
- Manager assignment blocks self-manager, unknown manager, unknown department,
  and cycles.
- My Team is self-scoped to the authenticated manager and returns direct reports
  only.
- My Team rollup counts come from live direct reports, enrollment status groups,
  issued non-deleted certificates, and completed program counts.
- Org mutations audit department create/update/archive and assignment changes.

## Finding

### S04-P1 - Soft-delete removed users from historical schedules

`DELETE /api/users/:id` comment said it only releases future schedules, but the
implementation pulled the user from every `Schedule.enrolledUsers` array.

Impact: deleting a user could mutate past schedule rosters. Attendance rows were
preserved, but historical roster truth and downstream reconciliation/report
logic could become inconsistent.

## Action

Fixed now:

- `server/controllers/userController.js`: soft-delete schedule cascade now filters
  `startTime: { $gt: now }`, preserving past/current schedule rosters.
- `server/tests/integration/userRoutes.test.js`: added regression test proving
  past roster and attendance stay, while future roster releases the deleted user.
- Cleaned stale hard-delete comment in the same controller block.

No public API shape change.

Accepted risk:

- My Team currently returns direct reports only. This matches Session 04 scope
  and current `org` use-case behavior; recursive org tree is not implemented.

## Verification

Medium tests:

- `cd server && npm test -- --runTestsByPath tests/integration/userRoutes.test.js tests/integration/orgRoutes.test.js`
  - Pass: 2 suites, 44 tests.
- `cd server && npm test -- --runTestsByPath tests/integration/phaseAHardening.test.js tests/integration/reconcileDrift.test.js`
  - Pass: 2 suites, 15 tests.

Client tests:

- `cd client && npm run test:run -- src/pages/__tests__/MyTeamPage.test.jsx src/components/__tests__/TeamRosterTable.test.jsx src/hooks/__tests__/useUsers.test.jsx`
  - Pass: 3 files, 9 tests.

Static checks:

- `git diff --check -- server/controllers/userController.js server/tests/integration/userRoutes.test.js plans/260604-2008-precision-first-ltms-quality/plan.md plans/260604-2008-precision-first-ltms-quality/sessions/04-people-org.md`
  - Pass.

Large tests:

- Playwright/manual People -> Departments -> My Team smoke not run. Local
  `localhost:5000` is occupied by `ControlCe`, not TMS API, and `localhost:3000`
  was not running. Existing backlog `QB-005` covers repeatable seeded backend
  setup for e2e smoke.

## Backlog

- No new backlog. Existing `QB-005` remains open for seeded e2e backend setup.

## Unresolved Questions

- None.
