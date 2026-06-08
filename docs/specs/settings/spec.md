---
capability: settings
status: stable
owners: [controllers/settingController, models/Setting]
last_updated: 2026-06-08
related_code:
  - server/controllers/settingController.js
  - server/models/Setting.js
related_plans: []
---

# Capability: Settings (config)

> **Source of truth for BEHAVIOR.** Admin-managed runtime configuration. The
> booking slot config (`ALLOWED_TIME_SLOTS`) read here drives
> `docs/specs/scheduling-and-booking/spec.md`.

## Purpose

A small, whitelisted key/value store for runtime config an Admin can change
without a deploy. Writes are key-whitelisted (no arbitrary key injection) and
audited per key.

## Business Requirements (BR)

- **BR-1:** Admins read and update runtime settings.
- **BR-2:** Only whitelisted keys may be written (injection-safe).
- **BR-3:** Each changed key is audited with before/after.

## Actors & Use Cases (UC)

- **UC-1 (Admin):** reads all settings.
- **UC-2 (Admin):** updates one or more whitelisted settings.

## Entities

- **Setting** (`server/models/Setting.js`): `{key, value}` documents. Whitelist =
  `ALLOWED_SETTING_KEYS` (currently `ALLOWED_TIME_SLOTS`).

## Functional Requirements (FR)

### Requirement: Whitelisted updates only [BR-2, UC-2]

The system SHALL accept only keys in `ALLOWED_SETTING_KEYS`, upsert their values,
and return a warning listing ignored unknown keys.

#### Scenario: Unknown key submitted
- **GIVEN** a PUT with `ALLOWED_TIME_SLOTS` plus an unknown key
- **WHEN** processed
- **THEN** the known key is updated and the response warns the unknown key was
  ignored

### Requirement: Per-key audit with diff [BR-3, UC-2]

The system SHALL record one audit entry per changed key with a `{before, after}`
diff, skipping unchanged (idempotent) writes.

#### Scenario: Idempotent write
- **GIVEN** a setting written with its current value
- **WHEN** submitted
- **THEN** no audit row is created (unchanged)

### Requirement: Read all settings [BR-1, UC-1]

The system SHALL return all settings to an Admin.

## Non-Functional Requirements (NFR)

Inherits `security-platform`. Specifics:
- **Authz:** `/api/settings` Admin-only.
- **Audit:** per-key, with before/after diff.
- **Injection-safe:** non-whitelisted keys are dropped, not stored.

## Acceptance Criteria (AC)

- [ ] Only whitelisted keys are written; unknown keys ignored with a warning.
- [ ] Each changed key audited with before/after; unchanged writes skip audit.
- [ ] Admin can read all settings.

## Error & Edge Cases

| Trigger | Behavior | Recovery |
|---|---|---|
| Non-array body | 400 | send `{settings:[...]}` |
| Unknown key | ignored + warning | use a whitelisted key |
| Non-admin | 403 | use Admin |

## Out of Scope / Deferred

- A broader config schema / typed validation per key.
- Per-tenant or per-environment overrides.
