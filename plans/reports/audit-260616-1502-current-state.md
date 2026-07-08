# Current State Audit — TMS v2 / Internal LTMS

**Date:** 2026-06-16 15:02 Asia/Ho_Chi_Minh  
**Branch:** `main`  
**Scope:** whole repo scan, feature wiring, docs truth, validation gates.  
**Mode:** read-only audit + report. No code fix.

## Executive Summary

System is broad, real, and mostly wired as an internal LTMS, not a prototype.
Core training ops loop exists end-to-end: auth → people/org → programs/cohorts
→ enrollment → sessions/scheduling → attendance → assessment/evaluation →
completion/certificates → reports/audit/reconcile.

Current risk is not "missing core product". Current risk is **integration
cohesion after fast feature velocity**:

- validation gates are red;
- docs/tooling drifted after 2026-06-15/16 features;
- Coordinator/custom-role access is inconsistent across server, nav, routes,
  and user assignment;
- some new UI is technically wired but not operator-friendly enough.

## Inventory Snapshot

- Relevant files scanned: ~1,080 (`server` 516, `client` 349, `docs` 70, `plans` 127).
- Server JS LOC: ~62k. Client JS/JSX LOC: ~39k.
- Models: 37 (`User`, `Class`, `Schedule`, `Attendance`, `LearningProgram`,
  `Assessment`, `Certificate`, `RequiredTraining`, `CostEntry`, `Budget`, etc.).
- Mounted route declarations found by static scan: 224.
- Specs registry: 31 capability specs.
- Tests present: 115 server test files, 89 client test files, 9 Playwright e2e specs.

## Feature State

### Strong / Mostly Stable

- Auth/session: HttpOnly JWT cookie, CSRF, MFA/TOTP, backup codes, token blocklist,
  forced password change, lockout, rate limits.
- Authz: role guard + capability layer + resource policies. DB-backed role grants
  exist.
- Audit/reconcile: audit hash-chain, soft-delete hooks, reconcile checks and safe
  auto-heal paths.
- Training ops: users, teams/groups, classes/cohorts, booking, schedule conflict
  locks, rooms, waitlists, trainer assignment, attendance.
- Learning domain: programs, enrollment, paths, assignments, assessments, question
  bank, manual grading, feedback, completion, certificates, recertification.
- Reporting: completion, attendance export, compliance report, training-hours,
  dashboard rollups, analytics time-series.
- Ops: health/ready, cron monitor, Sentry hooks, backup docs/scripts.

### New / Needs Cohesion Pass

- Budget & cost (`/api/finance`, `/budget`): API/UI/spec/tests exist; env docs not
  updated; route matrix missing.
- Required-training matrix (`/api/compliance`, `/compliance`): backend solid;
  UI supports department/office by raw id only.
- Studio scheduling (`/api/session-types`, `/scheduling`): metadata + utilization
  shipped; many strings not i18n.
- Editable roles/custom roles (`/api/access`, `/access`): grants editor works, but
  custom roles are not assignable to users.
- Automation, skills, branding, notifications, custom fields: present and routed;
  docs/spec coverage is uneven by route surface.

### Deferred / Gated By Design

- Google OIDC + Directory sync.
- Paid always-on hosting + Sentry cron dashboard ops.
- PostgreSQL decision gate.
- Nomination workflow.
- Evaluation → Assessment convergence.
- Compliance presets/evidence pack.
- Recert for already-expired certs and path-based recert.
- `deliveryMode` enforcement.

## Validation Results

| Gate | Result | Notes |
|---|---:|---|
| `npm run scripts:check` | PASS | 45 script files syntax ok |
| `client npm run build` | PASS | Vite build ok |
| `client npm run lint` | PASS-fragile | 0 errors, exactly 63 warnings; cap is 63 |
| `client npm run test:run` | FAIL | 83/89 files pass, 382/391 tests pass, 9 fail |
| `server npm test` | FAIL / interrupted | `learningSessionRoutes.test.js` `beforeAll` timed out, then run hung; killed after confirmed fail |
| `node server/scripts/audit-env-doc-diff.js` | FAIL | README missing 3 runtime env vars |
| `node server/scripts/audit-route-permission-diff.js` | BROKEN | Express 5 app uses `app.router`; script reads `app._router` |
| `server npm audit --omit=dev` | FAIL | 13 moderate vulns via OpenTelemetry/uuid transitive deps |
| `client npm audit --omit=dev` | PASS | 0 vulns |

Client failed tests:

- `AutomationPage.test.jsx`: creates a rule from the dialog timeout.
- `AssessmentsTab.test.jsx`: edit assessment + create bank question timeouts.
- `AssignTrainersModal.test.jsx`: external trainer submit timeout.
- `AssignmentFormModal.test.jsx`: create timeout; validation test unexpectedly calls create.
- `ProgramFormModal.test.jsx`: create/edit policy tests timeout.
- `SessionDetailPage.test.jsx`: roster submit timeout.

Server failure observed:

- `tests/integration/learningSessionRoutes.test.js` `beforeAll` exceeded 30s.
- `seed` stayed undefined; many assertions cascade with `Cannot read properties
  of undefined (reading 'class1')`.

## Findings

### P1 — Coordinator sees Reports nav but route denies page

Evidence:

- `client/src/hooks/useRole.js:91` grants `read:reports` to Admin/Coordinator/Teacher.
- `client/src/components/nav/nav-config.js:73-75` exposes Reports tabs via `read:reports`.
- `client/src/App.jsx:302-304` wraps `/reports` with only `['Admin', 'Teacher']`.
- `docs/route-permission-matrix.md:34-35` says learning reports/dashboard are
  Admin/Coordinator/Teacher.

Impact: Coordinator can see report nav items but receives access denied on `/reports`.
This breaks a core training-ops role.

Fix sketch: include Coordinator in `/reports` route, then rely on tab-level
permissions for Overview/HR Export restrictions.

### P1 — Test gates are red

Evidence:

- Client: 9/391 tests failed.
- Server: integration suite failed/hung at `learningSessionRoutes.test.js` setup.

Impact: roadmap claims recent server/client green, but current checkout is not
release-green. Cannot safely ship more feature work until gate restored.

Fix sketch: debug modal/user-event timeouts in client tests; isolate server test
setup timeout around shared `MongoMemoryReplSet` / `getApp()` / `getCsrfHeaders`.

### P2 — "Custom roles" not end-to-end assignable

Evidence:

- Role grants editor supports custom roles (`RolesAccessPage` creates/deletes).
- `server/models/User.js:45-50` role enum allows only Admin/Coordinator/Teacher/Participant.
- `server/schemas/user.js:4,19` zod role enum same 4 roles.
- `client/src/features/users/UsersPage.jsx:39,177-179,628,678-680` role UI/bulk
  actions hard-code the same 4 roles.
- `docs/specs/capability-authz/spec.md` says assigning user to custom role is deferred.

Impact: Admin can define a custom role, but cannot assign it to any user. Current
UI wording can mislead operators.

Fix sketch: either relabel as "custom grant profiles (not assignable yet)" or
complete dynamic role assignment: user schema, user forms, filters, ProtectedRoute,
nav/useRole live grants.

### P2 — Docs and audit helpers drifted after new route/env features

Evidence:

- Runtime env reads missing from README §6.4:
  `DEFAULT_CURRENCY`, `METRIC_SNAPSHOT_RETENTION_DAYS`, `SNAPSHOT_CRON`.
- `docs/route-permission-matrix.md` has no base-path rows for new mounted routes:
  `/api/session-types`, `/api/compliance`, `/api/finance`, `/api/analytics`,
  `/api/notifications`, `/api/automation`.
- `docs/current-system-map.md` mounted-route table also predates those mounts.
- `server/scripts/audit-route-permission-diff.js:64` reads `app._router.stack`;
  Express 5 exposes `app.router.stack`.

Impact: agent/developer source-of-truth is stale, and the guard script no longer
guards.

Fix sketch: upgrade route-diff for Express 5 or source-parse mounts; update route
matrix/current-system-map/README env table in same PR.

### P2 — Compliance rule UI requires raw department/office IDs

Evidence:

- `ComplianceMatrixPage.jsx:61-77` offers department/office mode but input label
  becomes `${type} id`; no department/office picker.

Impact: Admin/Coordinator can create role rules easily, but department/office
rules require knowing Mongo IDs. This undercuts the compliance matrix's main HR use.

Fix sketch: use existing department/office hooks and render selects; store id values.

### P2 — i18n contract drift in newer UI

Evidence:

- `ComplianceMatrixPage.jsx:61-94,166-188` has many visible hard-coded strings.
- `StudioSchedulingPage.jsx:61-85` hard-codes visible labels/actions.
- Project contract says new user-facing strings must go through `t()`.

Impact: English-only product still renders fine, but repo DoD is violated and
future copy changes become scattered.

Fix sketch: add keys to `client/src/i18n/locales/en.json`; replace literals.

### P2 — Unhandled rejection handler does not exit

Evidence:

- `server/server.js:467-469` comment says Sentry/log then exit.
- `server/server.js:470-473` logs/captures but does not exit.
- `uncaughtException` does exit at `server/server.js:475-479`.

Impact: after an unhandled async failure, process may continue in unknown state
instead of orchestrator restart.

Fix sketch: decide policy. If comment is correct, schedule `process.exit(1)` after
Sentry capture, same as uncaught exception.

### P3 — Lint cap is saturated

Evidence:

- `client npm run lint`: 63 warnings, max is 63.
- Warnings include React Compiler purity/immutability, sync setState in effects,
  and a11y label/click handler issues.

Impact: one new warning breaks lint. Existing warnings hide regressions.

Fix sketch: burn down to ≤50, then ratchet cap.

### P3 — File size debt remains

Evidence examples:

- `client/src/features/classes/ClassDetailPage.jsx` 913 LOC.
- `client/src/features/users/UsersPage.jsx` 840 LOC.
- `client/src/features/groups/TeamsPage.jsx` 755 LOC.
- `server/services/scheduleService.js` 699 LOC.
- `server/server.js` 482 LOC.

Impact: conflicts and context load high. Some files are sanctioned legacy/facades,
but touch-cost remains high.

Fix sketch: extract when touched; do not big-bang refactor.

### P3 — Server runtime npm audit has moderate transitive vulns

Evidence:

- `server npm audit --omit=dev`: 13 moderate vulnerabilities.
- Sources: OpenTelemetry transitive chain; `uuid` through `exceljs`, `gaxios`,
  `googleapis-common`, `googleapis`.

Impact: not immediately exploitable from app code based on audit output, but
security gate is not clean.

Fix sketch: test `npm audit fix` for OpenTelemetry; handle `uuid` chain with
care because npm suggests breaking `exceljs` change / googleapis upgrade needs
calendar retest.

## Recommended Next Work

1. Restore quality gate first: server setup timeout + 9 client tests.
2. Fix Coordinator `/reports` access mismatch.
3. Repair docs/tooling drift: Express 5 route-diff, route matrix, current map,
   README env table.
4. Clarify or complete custom-role lifecycle.
5. Make compliance department/office rules usable with pickers.
6. Do a warning/i18n cleanup pass while touching the affected UI.

## Unresolved Questions

- Should Coordinator definitely access `/reports`? Server/docs/nav say yes; route says no.
- Are custom roles meant to be assignable now, or intentionally definition-only until a later milestone?
- Should unhandled promise rejections terminate the process in production?
- Should route matrix remain base-path level, or move to generated route inventory now that mounted routes are numerous?
