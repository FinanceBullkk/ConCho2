---
capability: bulk-import
status: stable
owners: [controllers/importController, services/importService]
last_updated: 2026-06-12
related_code:
  - server/controllers/importController.js
  - server/services/importService.js
related_plans: []
---

# Capability: Bulk Import

> **Source of truth for BEHAVIOR.** Admin bulk-loading of users and classes.

## Purpose

Let Admins onboard data at scale — import many users or classes in one request
(create-or-update), with every import audited so "who imported what, when" is
answerable.

## Business Requirements (BR)

- **BR-1:** Admins import users and classes in bulk (upsert semantics).
- **BR-2:** Each import is audited with a summary.
- **BR-3:** Imports must not corrupt derived caches/state.

## Actors & Use Cases (UC)

- **UC-1 (Admin):** uploads a batch of users → created/updated/skipped counts.
- **UC-2 (Admin):** uploads a batch of classes → created/updated counts.

## Entities

- Operates on `User` and `Class` via `importService`; writes `AuditLog`
  (entity `Import`).

## Functional Requirements (FR)

### Requirement: Bulk upsert users/classes [BR-1, UC-1, UC-2]

The system SHALL create-or-update records from a batch and return
created/updated/skipped counts.

#### Scenario: Mixed batch
- **GIVEN** a batch with some new and some existing users
- **WHEN** imported
- **THEN** new ones are created, existing updated, and counts are returned

### Requirement: Trash guard — never overwrite soft-deleted records [BR-1, UC-1, UC-2]

The system SHALL refuse the WHOLE batch (loud `ServiceError`, listing up to 5
offending codes) when any row matches a soft-deleted user (`empCode`) or an
archived cohort (`{classCode, courseName}`) — the hook-bypassing `bulkWrite`
upsert would otherwise silently overwrite the trashed doc (DATA-013, audit
round 2). Restore from trash first, then re-import.

#### Scenario: Batch contains a trashed empCode
- **GIVEN** a soft-deleted user with empCode 000123 and an import batch
  containing 000123
- **WHEN** imported
- **THEN** the whole batch is rejected with a message naming 000123; nothing
  is written

### Requirement: Audit every import [BR-2, UC-1]

The system SHALL record an `imported` audit entry with the summary note.

### Requirement: Invalidate derived caches [BR-3, UC-1]

The system SHALL invalidate the analytics cache after an import so dashboards
reflect the new data.

## Non-Functional Requirements (NFR)

Inherits `security-platform`. Specifics:
- **Authz:** `/api/import` Admin-only.
- **Audit:** each import recorded (entity `Import`).
- **Validation:** rows validated in the service before write.

## Acceptance Criteria (AC)

- [ ] Bulk user/class import upserts and returns created/updated/skipped.
- [ ] Each import writes an audit line with a summary.
- [ ] Analytics cache invalidated post-import.
- [ ] Admin-only.

## Error & Edge Cases

| Trigger | Behavior | Recovery |
|---|---|---|
| Invalid rows | reported/skipped | fix and re-import |
| Row matches trashed user/cohort | whole batch refused (named codes) | restore from trash, re-import |
| Non-admin | 403 | use Admin |

## Out of Scope / Deferred

- CSV/Excel file parsing UI (payload is structured JSON today).
- Import of attendance/evaluation history.
