# Session 04 - People + Org

## Goal

Answer: does user/org management preserve data integrity and enforce manager
scope?

## Scope

In: user CRUD, soft delete/restore, Department CRUD, manager assignment, cycle
guard, My Team dashboard rollup.

Out: Google Directory sync, due dates, assignment engine.

## Required Evidence

- User, Department models and indexes.
- `server/domains/org/*`
- People/Users/Departments/MyTeam client files.
- org route integration tests and client component tests.
- audit behavior for org mutations.

## Required Scenarios

- Soft-deleted users do not corrupt reports.
- Department archive blocked while assigned users exist.
- Manager cannot be self; cycles are blocked.
- My Team returns only direct reports for current manager.
- Rollup counts match enrollments/certificates/completion signals.

## Verification

- `server/tests/integration/orgRoutes.test.js`
- relevant user route tests
- MyTeam/TeamRoster component tests
- one manual People -> Departments -> My Team smoke when UI is running

## Unresolved Questions

- None.

