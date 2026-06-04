# Session 03 - Role/Authz Matrix

**Status:** completed

**Report:** [session-03-role-authz-matrix-report.md](../reports/session-03-role-authz-matrix-report.md)

## Goal

Answer: do server policy/capability rules and client `useRole` permissions match
for Admin, Teacher, and Participant?

## Scope

In: People, Learning, Calendar, Reports, System route access; server middleware;
client nav/buttons; negative access tests.

Out: data correctness inside each workflow unless authz depends on it.

## Required Evidence

- `docs/route-permission-matrix.md`
- `server/policy/capabilities.js`
- route middleware for major surfaces
- `client/src/hooks/useRole.js`
- `client/src/components/Navbar.jsx`
- existing role/authz integration and component tests

## Required Scenarios

- Teacher cannot see or mutate Admin-only People/System actions.
- Participant self-scope holds across Learning/Calendar surfaces.
- Client does not show buttons that server rejects for the same role.
- Direct URL/API access denial returns 403, not hidden UI only.

## Verification

- Capability unit tests.
- Focused integration denial tests.
- Focused `useRole` tests.
- Playwright permissions smoke.

## Unresolved Questions

- None.
