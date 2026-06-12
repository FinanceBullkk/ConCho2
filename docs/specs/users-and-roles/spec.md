---
capability: users-and-roles
status: stable
owners: [controllers/userController, models/User]
last_updated: 2026-06-12
related_code:
  - server/controllers/userController.js
  - server/controllers/user
  - server/models/User.js
  - server/schemas/user.js
related_plans: []
---

# Capability: Users & Roles

> **Source of truth for BEHAVIOR.** File/route locations: `docs/current-system-map.md`.

## Purpose

Admin lifecycle management of the ~1000 employee accounts: create, update, role
and status changes, soft-delete/restore, and the structured org hierarchy that
feeds manager-scoped dashboards. Identity is an admin-entered `empCode`.

## Business Requirements (BR)

- **BR-1:** Admins manage all employee records; each user carries the unique
  empCode the admin enters (source data is HR-issued — never auto-generated).
- **BR-2:** Four roles (Admin/Coordinator/Teacher/Participant) gate access;
  changes apply promptly.
- **BR-3:** Dropping a learner must not leave them on future sessions.
- **BR-4:** User data is audit-relevant — never hard-delete; deletes are
  recoverable and free the empCode/email slot for a replacement.
- **BR-5:** An org tree (manager/department) must be queryable for reporting.

## Actors & Use Cases (UC)

- **UC-1 (Admin):** creates a user, entering the HR-issued `empCode` and the
  user's email; the user must change password on first login.
- **UC-2 (Admin):** edits role/status/profile → cache invalidated so changes are
  near-immediate.
- **UC-3 (Admin):** sets a user `Dropped` → user is auto-removed from all future
  schedules.
- **UC-4 (Admin):** soft-deletes a user → goes to "trash"; can restore later.

## Entities

- **User** (`server/models/User.js`): `empCode` (unique, uppercase,
  admin-entered, 1–32 chars), `name`, `email` (partial-unique, REQUIRED on
  create — Google Calendar invites need it; admin enters per-user since emails
  follow no pattern), `role` (Admin/Coordinator/Teacher/Participant —
  Coordinator is the training-ops management bundle, see `capability-authz`),
  `status` (Active/Inactive/Dropped/Transferred/
  On-hold/Waiting for class), org fields (`managerId`, `departmentId`,
  `position`, legacy `department` string), `lastActiveAt` cache, soft-delete
  fields (`isDeleted`/`deletedAt`/`_softDeletedEmail`). A "Team Leader" is simply
  a Participant referenced by `Team.leaderId` (no separate role).

## Functional Requirements (FR)

### Requirement: Create user with admin-entered empCode + email [BR-1, UC-1]

The system SHALL require `empCode` (admin-entered, zod `1–32` chars, stored
uppercase, unique), `email`, `name` and `role` on create (`server/schemas/user.js`
— there is NO auto-generation; empCode/email come from HR source data); created
users start `mustChangePassword`.

#### Scenario: Duplicate empCode
- **GIVEN** an existing user with empCode 000123
- **WHEN** an admin creates another user with empCode 000123
- **THEN** the create is rejected by the unique index (no silent overwrite)

#### Scenario: Missing email
- **GIVEN** a create payload without `email`
- **WHEN** submitted
- **THEN** zod validation rejects it (email is required for calendar invites)

### Requirement: Role/status changes apply promptly [BR-2, UC-2]

On update the system SHALL invalidate the 30s auth user-cache so a demotion or
deactivation takes effect within seconds (not after TTL).

#### Scenario: Demote Admin → Participant
- **GIVEN** an Admin with an active session
- **WHEN** their role is changed to Participant
- **THEN** subsequent requests are authorized as Participant within seconds

### Requirement: Auto-release on Dropped [BR-3, UC-3]

When a user's status changes to `Dropped`, the system SHALL atomically `$pull`
them from all **future** schedules they're enrolled in and delete any of *those*
schedules that become empty — scoped to the affected set only (never touching
other teams' schedules).

#### Scenario: Drop a solo-booked learner
- **GIVEN** a user enrolled in future sessions, one of which only has them
- **WHEN** they are set Dropped
- **THEN** they are removed from those sessions and the now-empty one is deleted;
  unrelated empty placeholders are untouched

### Requirement: Soft-delete & restore [BR-4, UC-4]

The system SHALL soft-delete (never hard-delete): set `isDeleted`, move
`empCode`→`<code>__DEL_<ts>` and email→`_softDeletedEmail` so the slot frees up.
Restore reverses both, or 409s if the original empCode/email is now taken.
Queries auto-exclude soft-deleted rows (find + aggregate hooks) unless explicitly
asked.

#### Scenario: Delete frees the code for a new hire
- **GIVEN** user with empCode 000123 is soft-deleted
- **WHEN** a new hire is created
- **THEN** 000123 can be reused; the deleted user is hidden from normal lists

## Non-Functional Requirements (NFR)

Inherits `security-platform`. Specifics:
- **Authz:** all `/api/users` routes Admin-only.
- **Audit:** create/update/delete/restore + status change recorded with diffs
  (sensitive fields redacted).
- **Data:** soft-delete auto-filter on `find*` + `aggregate`; partial-unique
  email index (excludes nulls).
- **Performance:** indexes on `{role,status}`, `department`, `managerId`,
  `departmentId`; `lastActiveAt` denormalised to avoid per-render aggregation.

## Acceptance Criteria (AC)

- [ ] Create requires admin-entered unique `empCode` + required email; duplicates rejected.
- [ ] Update invalidates auth cache (prompt role/status effect).
- [ ] Dropped user removed from future schedules, scoped; empty ones deleted.
- [ ] Soft-delete hides user + frees empCode/email; restore reverses or 409s.
- [ ] Soft-deleted users excluded from lists and analytics aggregations.

## Error & Edge Cases

| Trigger | Behavior | Recovery |
|---|---|---|
| Missing empCode/email/name/role | validation error | supply fields |
| Duplicate empCode | unique-index error | use the HR-issued code |
| Duplicate email | unique-index error | use another email |
| Restore over taken code/email | 409 | resolve the conflict |
| Non-admin hits `/api/users` | 403 | use Admin |

## Out of Scope / Deferred

- Self-service profile editing beyond `/me`.
- Google Directory sync auto-provisioning (Wave D2).
- Capability/permission assignment per user (see `capability-authz`).
