# Session 02 - Auth + Session Security

**Status:** completed

**Report:** [session-02-auth-session-security-report.md](../reports/session-02-auth-session-security-report.md)

## Goal

Answer: can sessions be created, protected, revoked, and audited safely?

## Scope

In: login, MFA, password reset, CSRF, lockout, logout, token invalidation,
auth-related audit/log privacy.

Out: role matrix outside auth, UI polish, org permissions.

## Required Evidence

- Server routes/controllers/middleware for auth, MFA, CSRF, rate limits.
- Existing auth/MFA/password-reset tests.
- Client auth context and axios CSRF behavior.
- Audit/log behavior for sensitive auth events.

## Required Scenarios

- Happy path login/logout.
- Wrong password lockout and non-enumerating errors.
- MFA enrollment/verify/replay/backup-code behavior.
- Password reset token path and expiry/replay.
- CSRF write blocked without token and refreshed when stale.
- Logout/password change invalidates old sessions.

## Verification

- Focused server auth/MFA/password-reset/CSRF suites.
- Focused client AuthContext tests.
- Playwright auth smoke only if server gate is green.

## Unresolved Questions

- None.
