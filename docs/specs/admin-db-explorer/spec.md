---
capability: admin-db-explorer
status: stable
owners: [routes/adminDbRoutes]
last_updated: 2026-06-08
related_code:
  - server/routes/adminDbRoutes.js
related_plans: []
---

# Capability: Admin DB Explorer

> **Source of truth for BEHAVIOR.** A hardened generic CRUD surface over
> whitelisted models, powering the Data page "Database" tab. Admin-only.

## Purpose

Give Admins a safe, generic way to inspect and edit registered collections
without raw DB access — heavily hardened against injection, sensitive-field
tampering, and unsafe deletes, with every mutation audited.

## Business Requirements (BR)

- **BR-1:** Admins browse/edit a whitelisted set of collections generically.
- **BR-2:** The surface must not become an account-takeover or injection vector.
- **BR-3:** Critical data must not be hard-deletable here.
- **BR-4:** Every mutation is audited with a full before/after diff.

## Actors & Use Cases (UC)

- **UC-1 (Admin):** lists/filters/searches documents of an allowed model.
- **UC-2 (Admin):** updates non-forbidden fields of a document.
- **UC-3 (Admin):** hard-deletes a document of a non-critical collection only.

## Entities

- Operates over `ALLOWED_MODELS` (User, Team, Class, Schedule, Attendance,
  Enrollment, Evaluation, LearningProgram, Counter, Setting). Writes `AuditLog`
  (entity `AdminDb`/`Counter`).

## Functional Requirements (FR)

### Requirement: Whitelisted models only [BR-1, UC-1]

The system SHALL serve generic CRUD only for models in the allowlist; others are
refused.

### Requirement: Injection hardening [BR-2, UC-1, UC-2]

The system SHALL re-sanitise parsed JSON filters and regex-escape search input so
user-supplied operators/patterns can't be executed.

#### Scenario: Operator in filter
- **GIVEN** a filter containing Mongo operators
- **WHEN** parsed
- **THEN** it is re-sanitised before querying

### Requirement: Forbidden field protection [BR-2, UC-2]

The system SHALL block updates to sensitive fields (password, passwordChangedAt,
MFA/lockout fields, soft-delete flags, email, …) via the generic update — those
require dedicated endpoints.

#### Scenario: Flip mfaEnabled via generic update
- **GIVEN** an update body setting `mfaEnabled`
- **WHEN** submitted
- **THEN** that field is rejected/ignored (forbidden list)

### Requirement: Restricted hard delete [BR-3, UC-3]

The system SHALL restrict hard delete to non-critical collections; critical
user/attendance/evaluation data is not hard-deletable here.

### Requirement: Audited mutations [BR-4, UC-2, UC-3]

The system SHALL write an `AuditLog` row with a full before/after diff for every
mutation.

## Non-Functional Requirements (NFR)

Inherits `security-platform`. Specifics:
- **Authz:** `protect` + `roleGuard('Admin')` on all routes.
- **Hardening:** filter re-sanitisation, regex escaping, forbidden-field
  blacklist, restricted hard delete.
- **Audit:** every mutation diff-logged (forensics).

## Acceptance Criteria (AC)

- [ ] Only allowlisted models are accessible.
- [ ] Filters re-sanitised; search regex-escaped.
- [ ] Forbidden (auth/MFA/soft-delete/email) fields can't be set generically.
- [ ] Hard delete restricted to non-critical collections.
- [ ] Every mutation audited with before/after.

## Error & Edge Cases

| Trigger | Behavior | Recovery |
|---|---|---|
| Non-allowlisted model | refused | use a dedicated endpoint |
| Forbidden field update | rejected/ignored | use dedicated endpoint |
| Hard delete critical data | refused | soft-delete via proper flow |
| Non-admin | 403 | use Admin |

## Out of Scope / Deferred

- Arbitrary aggregation / query builder UI.
- Bulk generic edits across collections.
