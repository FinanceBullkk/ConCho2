# Session 02 - Auth + Session Security Report

**Date:** 2026-06-04

**Status:** completed

**Verdict:** Risk fixed

## Goal

Answer: can sessions be created, protected, revoked, and audited safely?

## Scope

In: login, MFA, password reset, CSRF, lockout, logout, token invalidation,
auth-related audit/log privacy.

Out: general role matrix, non-auth org permissions, UI polish outside auth
admin actions.

Stop condition: one P1 found in auth admin action client wiring; fixed before
moving on.

## Evidence

Files inspected:

- `server/routes/authRoutes.js`
- `server/controllers/authController.js`
- `server/services/authService.js`
- `server/services/mfaService.js`
- `server/policy/auth.js`
- `server/middleware/auth.js`
- `server/middleware/csrfProtection.js`
- `server/middleware/rateLimiters.js`
- `server/models/TokenBlocklist.js`
- `client/src/context/AuthContext.jsx`
- `client/src/api/api.js`
- `client/src/pages/UsersPage.jsx`
- Auth tests under `server/tests/integration/`, `server/tests/unit/`, and
  `client/src/context/__tests__/`.

Key code truth:

- Login and MFA set HttpOnly cookies. Login JSON response returns user/MFA
  state, not raw full-session JWT.
- MFA pending token is HttpOnly cookie; normal protected routes reject
  `mfa: pending`.
- MFA enrollment-required token allowlist excludes change-password.
- Logout revokes current token JTI, clears cookie with matching attributes,
  rotates CSRF, and audits logout.
- Password change bumps `passwordChangedAt`; middleware rejects older tokens.
- Password reset is non-enumerating, path-token based, hashed, single-use,
  expiry-checked, and audit logged.
- CSRF uses double-submit cookie/header, blocks writes without match, audits
  mismatch, and exempts cron only.
- Admin force logout and admin MFA disable require `currentPassword` via
  `authPolicy.requireReauth`.

## Finding

### S02-P1 - Client admin reauth mismatch

Server correctly required `currentPassword` for:

- `POST /api/auth/admin/force-logout/:userId`
- `POST /api/auth/mfa/admin-disable/:userId`

But client called both endpoints with no body. Result: admin UI actions always
failed with `reauth-missing`, despite secure backend policy.

Impact: critical admin session control unusable from UI. Security design was
correct, product path broken.

## Action

Fixed now:

- `client/src/api/api.js` now sends `{ currentPassword }` for admin force logout
  and admin MFA disable.
- `client/src/pages/UsersPage.jsx` admin confirmation modal now asks for admin
  password, blocks empty submit client-side, clears password on open/cancel/success.
- `client/src/api/__tests__/api.test.js` now has regression tests for both
  admin reauth payloads.

No broad refactor. Public route shape unchanged.

Accepted risks:

- Bearer auth fallback still exists for backwards-compatible API clients. Current
  SPA uses HttpOnly cookie path; no raw full-session JWT is returned to browser
  login response.
- Auth Playwright smoke needs real API + seeded DB. Not runnable in this local
  session because `localhost:5000` is not TMS API.

## Verification

Small tests:

- `cd client && npm run test:run -- src/api/__tests__/api.test.js src/context/__tests__/AuthContext.test.jsx`
  - Pass: 2 files, 13 tests.
- `cd client && npx eslint src/pages/UsersPage.jsx src/api/api.js src/api/__tests__/api.test.js`
  - Pass with 0 errors.
  - One existing warning: React Hook Form `watch()` incompatible-library in
    `UsersPage.jsx:79`.
- `git diff --check`
  - Pass.

Medium tests:

- `cd server && npm test -- --runTestsByPath tests/integration/auth.test.js tests/integration/authHardening.test.js tests/integration/mfa.test.js tests/integration/passwordReset.test.js tests/unit/csrfProtection.test.js`
  - Pass: 5 suites, 62 tests.
  - Note: Jest printed a post-teardown Mongoose ReferenceError from
    `tests/unit/csrfProtection.test.js`, but exited 0.
- `cd server && npm test -- --runTestsByPath tests/integration/auditWriteSide.test.js`
  - Pass: 1 suite, 10 tests.

Large tests:

- Playwright auth smoke not run. `client/e2e/auth.spec.js` requires real API
  server + seeded DB. `localhost:5000` responded as `AirTunes/870.14.1`, not
  TMS API; `localhost:3000` was not running.

Manual smoke:

- Not run for same seeded backend reason.

## Backlog

- QB-005: Release Gate should provide a repeatable seeded backend path for
  Playwright auth smoke.

## Unresolved Questions

- None.
