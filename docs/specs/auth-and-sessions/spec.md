---
capability: auth-and-sessions
status: stable
owners: [controllers/authController, services/authService, services/mfaService, middleware/auth]
last_updated: 2026-06-12
related_code:
  - server/middleware/auth.js
  - server/controllers/authController.js
  - server/services/authService.js
  - server/services/mfaService.js
  - server/models/User.js
  - server/models/TokenBlocklist.js
---

# Capability: Authentication & Sessions

> **Source of truth for BEHAVIOR.** See `docs/specs/security-platform/spec.md`
> for the cross-cutting protections this builds on.

## Purpose

Authenticate the ~1000 internal employees and maintain secure sessions. Identity
is an `empCode` + password; sessions are JWTs in an HttpOnly cookie, hardened
with optional TOTP MFA, brute-force lockout, token revocation, and
session-killing on password change.

## Business Requirements (BR)

- **BR-1:** Only valid employees may obtain a session; credentials never leak.
- **BR-2:** A second factor (TOTP) must be supportable and, when enrolled,
  enforced on login.
- **BR-3:** Compromised/old sessions must be invalidatable (logout, password
  change, demotion/deactivation).
- **BR-4:** Brute-force credential guessing must be throttled durably.
- **BR-5:** Seed/default-password accounts must rotate their password before use.

## Actors & Use Cases (UC)

- **UC-1 (Any user):** logs in with empCode + password → receives a session
  cookie (or an MFA challenge).
- **UC-2 (MFA user):** completes the TOTP / backup-code challenge to finish login.
- **UC-3 (Any user):** changes password / logs out → prior tokens stop working.
- **UC-4 (User who forgot password):** requests a reset link, sets a new password.
- **UC-5 (User enrolling MFA):** sets up TOTP, confirms with a code, gets backup
  codes once.

## Entities

- **User** (auth fields, `server/models/User.js`): `password` (bcrypt, 12 rounds,
  `minlength 10`, `select:false`), `passwordChangedAt` (`select:false`),
  `mustChangePassword`, `passwordResetToken`/`Expires` (SHA-256 hash stored),
  `mfaEnabled`/`mfaSecret`/`mfaPendingSecret`(+expiry 15m)/`mfaBackupCodes`
  (bcrypt, single-use)/`mfaLastUsedCounter` (TOTP replay guard),
  `failedLoginAttempts`/`lockUntil`. All sensitive fields `select:false`.
- **TokenBlocklist** (`server/models/TokenBlocklist.js`): revoked JTIs (logout),
  TTL-expired.

## Functional Requirements (FR)

### Requirement: Password login with bcrypt [BR-1, UC-1]

The system SHALL verify credentials via bcrypt (`User.matchPassword`) and, on
success, issue an HS256 JWT in an HttpOnly cookie `tms_token` (TTL =
`JWT_EXPIRE`, default **1d** — DOCS-003) carrying a `jti`. Inactive accounts
are denied.

#### Scenario: Valid login
- **GIVEN** an Active user with correct empCode + password and MFA disabled
- **WHEN** they log in
- **THEN** an HttpOnly `tms_token` cookie (24h default) is set and
  failed-attempt count resets to 0

#### Scenario: Wrong password
- **GIVEN** an existing user
- **WHEN** the password is wrong
- **THEN** login is denied and `failedLoginAttempts` increments

#### Scenario: Non-active account
- **GIVEN** a user whose status ≠ Active
- **WHEN** any authenticated route is hit
- **THEN** **403** ("Account is <status>")

### Requirement: Brute-force lockout [BR-4, UC-1]

The system SHALL lock an account after **10** consecutive failed logins
(`LOGIN_MAX_FAILED`, default 10) for **15 minutes** (`LOGIN_LOCK_MINUTES`,
default 15) via `failedLoginAttempts` + `lockUntil`, durable across instances;
the per-route rate limiter is the first line of defence.

#### Scenario: Tenth failure locks
- **GIVEN** 9 prior failed logins
- **WHEN** a 10th fails
- **THEN** the account is locked until `lockUntil`; further attempts are refused
  even with the correct password

### Requirement: MFA challenge when enrolled [BR-2, UC-2]

When `mfaEnabled`, login SHALL return an MFA-pending token (`mfa:'pending'`, ~5
min) that authorizes only `/api/auth/mfa/verify`; a valid TOTP (speakeasy, with
replay protection: the **absolute TOTP step counter** of the accepted code is
persisted to `mfaLastUsedCounter` — SEC-018) or a single-use backup code
completes login and mints the full-session cookie.

#### Scenario: TOTP completes login
- **GIVEN** an MFA user who passed password step (holds pending token)
- **WHEN** they submit a valid current TOTP
- **THEN** a full-session cookie is issued

#### Scenario: TOTP replay rejected
- **GIVEN** a TOTP code already used to verify
- **WHEN** the same (or any earlier-step) code is submitted again
- **THEN** it is rejected (its absolute step counter ≤ stored
  `mfaLastUsedCounter`); a later step still logs in — SEC-018 fixed the
  relative-delta comparison that falsely locked users out after first login

#### Scenario: Pending token misuse
- **GIVEN** only an MFA-pending token
- **WHEN** any route other than `/mfa/verify` is hit
- **THEN** **401** ("MFA challenge incomplete")

### Requirement: MFA enrollment [BR-2, UC-5]

The system SHALL stage a `mfaPendingSecret` (15-min expiry) at setup, promote it
to `mfaSecret` only after the user proves possession via `verify-setup`, and
return 8 single-use backup codes exactly once. Enrollment-required tokens are
restricted to `{/me, /logout, /mfa/setup, /mfa/verify-setup}`.

### Requirement: Sessions are revocable [BR-3, UC-3]

The system SHALL: (a) revoke the exact token JTI on logout (TokenBlocklist);
(b) reject any token issued before `passwordChangedAt` (changing password kills
all sessions — auto-bumped in the User `pre('save')` hook, −1s skew guard);
(c) invalidate the 30s auth user-cache on user update so role/status changes
apply within seconds.

#### Scenario: Password change kills old tokens
- **GIVEN** a user with an active session token
- **WHEN** they change their password
- **THEN** the old token is rejected with 401 on next use ("Password was recently
  changed")

#### Scenario: Logout revokes token
- **GIVEN** a logged-in user
- **WHEN** they log out
- **THEN** that token's JTI is blocklisted and reuse → 401

### Requirement: Forced rotation for default passwords [BR-5, UC-3]

When `mustChangePassword`, the API SHALL restrict the session to
`{/me, /logout, /change-password}` until the password is rotated.

### Requirement: Password reset [BR-1, UC-4]

Forgot-password SHALL store only a SHA-256 hash of an emailed token with an
expiry; the public reset/forgot endpoints are rate-limited.

## Non-Functional Requirements (NFR)

Inherits `security-platform`. Specifics:
- **JWT:** HS256 pinned (`algorithms:['HS256']`) to block alg-confusion; secret
  required at boot.
- **Cookie:** HttpOnly `tms_token` (XSS-proof); Bearer header accepted for API
  clients.
- **Secrets never leak:** all MFA/password fields `select:false`; reset/MFA
  secrets stored hashed.
- **Rate limits:** login + forgot-password limiters; global cap.
- **Audit:** login, MFA setup/disable, password change recorded.

## Acceptance Criteria (AC)

- [ ] Valid login sets HttpOnly cookie (`JWT_EXPIRE`, default 24h); resets fail count.
- [ ] 10 failures → 15-min lockout, durable (both env-tunable).
- [ ] MFA user must pass TOTP/backup code; pending token can't reach other routes.
- [ ] TOTP replay rejected; backup code single-use.
- [ ] Password change / logout invalidate prior tokens.
- [ ] Default-password users restricted until rotation.
- [ ] Reset token stored hashed with expiry; endpoints rate-limited.
- [ ] No sensitive field appears in any API response.

## Error & Edge Cases

| Trigger | Behavior | Recovery |
|---|---|---|
| Wrong password | denied + increment | retry (until lock) |
| 10 failures | locked 15 min | wait / admin |
| Non-active account | 403 | admin reactivates |
| Pending token elsewhere | 401 | submit MFA code |
| Reused TOTP | rejected | wait next window |
| Token after pwd change | 401 | log in again |
| No/invalid/expired token | 401 | log in again |

## Out of Scope / Deferred

- SSO / Google Directory-backed login (Wave D2 org sync is separate).
- WebAuthn/passkeys, SMS OTP.
- Capability-based authz (see `docs/specs/capability-authz/spec.md`).
