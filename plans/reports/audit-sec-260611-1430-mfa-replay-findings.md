# Audit — SEC-018: MFA TOTP replay guard false-lockout (incidental, Phase 03)

**Date:** 2026-06-11 · **Severity:** P1 (P0 if `MFA_REQUIRED_ROLES` is set)
**Branch:** `fix/audit-sec-round-3-mfa-replay` · **Discovered during:** Phase 03 auth walkthrough.

> Tracker note: this is a security finding (SEC series, max was SEC-017) found
> while auditing business flows. The Phase 03 round log
> (`plans/reports/audit-flows-260611-1357-findings.md` + audit `plan.md`) lists it
> as "escalated — separate PR". Owner decision 2026-06-11: **fix now, separate
> PR.** The audit `plan.md` Backlog SEC-018 row should flip escalated→FIXED when
> this and the Phase 03 PR both land (kept out of this branch to avoid a
> tracker merge conflict between the two concurrent PRs).

## Finding

### SEC-018 (P1) — TOTP login works exactly once, then false-replay lockout
- **Repro (live):** with MFA enabled, the 1st TOTP login succeeds; every later
  TOTP login returns 401 `/api/auth/mfa/verify` (not 429 — not rate-limit).
- **Root cause:** `services/mfaService.js` `verifyTokenWithReplay` persisted and
  compared the **relative** `speakeasy.totp.verifyDelta` offset (−1/0/+1) via
  `auth-login.js` (`user.mfaLastUsedCounter = delta`). `verifyDelta` computes the
  offset against the CURRENT step each call, so a legitimately-current code is
  **always delta `0`**, independent of wall-clock time (proven: two codes 60 s
  apart both `delta:0`). After the first login stores `lastUsedCounter=0`, the
  next current code (`delta 0`) hits the guard `delta <= lastUsedCounter` →
  `0 <= 0` → **falsely rejected as a replay**. Only a future-window code passes
  (delta 1, stores 1), ratcheting impossibly. Net: TOTP usable once, then the
  user falls back to 8 single-use backup codes, then is locked out of MFA.
- **Why latent:** MFA is opt-in (Phase 1.3); seeded users have it off, so no one
  reached a 2nd MFA login. If `MFA_REQUIRED_ROLES` (e.g. `Admin`) is ever set,
  every such user is locked out after their 2nd login → P0 in that config.

## Fix (this PR)

Compare and persist the **absolute TOTP step counter**, not the relative delta:
- `mfaService.verifyTokenWithReplay` now returns `{ valid, counter }` where
  `counter = Math.floor(now / 30) + verifyDelta.delta` (absolute step of the
  matched code). Rejects when `counter <= lastUsedCounter`. Adds an optional
  `nowSeconds` param for deterministic tests (defaults to `Date.now()/1000`).
- `auth-login.js` persists the absolute `counter`.
- `User.mfaLastUsedCounter` doc comment updated (absolute step, not delta).

Semantics now correct: a code from an already-consumed step (or earlier) is a
replay → rejected; a code from a later step is a fresh login → accepted. Same
TOTP-step uniqueness still blocks same-code replay within a window.

## Tests
- New `tests/unit/mfaReplayCounter.test.js` (6, deterministic via injected time):
  first login returns absolute counter; same-code replay rejected; **REGRESSION:
  next-step current code logs in** (the bug); old/consumed-step code rejected;
  wrong code / missing inputs invalid.
- Existing `tests/integration/mfa.test.js` (incl. same-window replay → 401) still
  passes. Auth/MFA/password suites: 53/53 green.

## Unresolved questions
- Existing deployments with a stored `mfaLastUsedCounter` of `0`/`1` (relative,
  from the old code) will treat it as an absolute step `0/1` — far in the past —
  so the first post-deploy login is accepted and re-anchors the counter to the
  real step. No migration needed; noting for awareness.
