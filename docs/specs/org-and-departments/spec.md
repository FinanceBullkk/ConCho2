---
capability: org-and-departments
status: stable
owners: [domains/org, models/Department, models/Office]
last_updated: 2026-06-10
related_code:
  - server/domains/org/routes.js
  - server/domains/org/use-cases.js
  - server/domains/org/repository.js
  - server/domains/org/office-use-cases.js
  - server/domains/org/office-repository.js
  - server/models/Department.js
  - server/models/Office.js
  - server/models/User.js
related_plans:
  - plans/260609-2215-ltms-recenter-coordinator-offline   # Phase 1 — Office + Coordinator
---

# Capability: Org & Departments (+ Offices)

> **Source of truth for BEHAVIOR.** Wave D3 + re-center Phase 1. Structured org
> hierarchy (departments + manager tree + offices) replacing the legacy
> free-text `User.department` non-destructively. Feeds assignment
> dept-targeting (`assignments-and-reminders`), the manager dashboard, and
> (Phase 3) Office-scoped Rooms.

## Purpose

A real department entity, a queryable manager hierarchy, and a first-class
Office (physical site) entity, layered alongside the legacy `User.department`
string ("open until populated"). Provides department CRUD, office CRUD,
manager/department/office assignment, and a self-scoped manager dashboard ("my
team") of direct reports' training status.

## Business Requirements (BR)

- **BR-1:** Admins manage departments as first-class entities (unique code).
- **BR-2:** Admins assign a user's manager, department, and office.
- **BR-3:** Any manager can see their own direct reports' training status (and
  only theirs).
- **BR-4:** A department/office can't be archived while users still reference it.
- **BR-5:** Org records are soft-deleted; a deleted code can be reused.
- **BR-6:** Offices (2–3 physical sites) are first-class and distinct from
  departments; Admins AND Training coordinators manage them (ADR
  coordinator-scheduled-offline-model).

## Actors & Use Cases (UC)

- **UC-1 (Admin):** CRUD departments.
- **UC-2 (Admin):** sets a user's `managerId`/`departmentId`/`officeId`.
- **UC-3 (Any manager):** views `/api/org/my-team` — own reports only.
- **UC-4 (Admin/Coordinator):** CRUD offices (`office.manage`); Teacher reads
  (`office.read`, pickers/reports); Participant denied.

## Entities

- **Department** (`server/models/Department.js`): `name`, `code` (uppercase,
  **unique among live** via partial index), `description`, soft-delete
  (`select:false`). Auto-excludes deleted on `find*`.
- **Office** (`server/models/Office.js`): `name`, `code` (uppercase, unique
  among live via partial index), optional `address` + `timezone`, soft-delete.
  Same auto-exclude hooks as Department.
- **User.managerId / departmentId / officeId** (`server/models/User.js`): the
  manager tree + department + office links (nullable; "open until populated";
  `officeId` manually set until Directory sync, Wave D2).

## Functional Requirements (FR)

### Requirement: Department CRUD with live-unique code [BR-1, BR-5, UC-1]

The system SHALL create/edit/archive departments; `code` is unique among
non-deleted departments (E11000 → **409**); a soft-deleted code may be reused.
Requires `department.manage` (Admin); `department.read` lists them.

#### Scenario: Duplicate live code
- **GIVEN** a live department code "ENG"
- **WHEN** another "ENG" is created
- **THEN** **409** ("A department with this code already exists")

### Requirement: Archive guard [BR-4, UC-1]

The system SHALL refuse to archive a department while users still point at it
(reassign first), to avoid orphaning `departmentId` references.

#### Scenario: Archive in-use department
- **GIVEN** a department with users assigned
- **WHEN** an Admin archives it
- **THEN** it is refused until those users are reassigned

### Requirement: Office CRUD with live-unique code [BR-5, BR-6, UC-4]

The system SHALL create/edit/archive offices; `code` is unique among
non-deleted offices (E11000 → **409**); a soft-deleted code may be reused.
Requires `office.manage` (Admin, Coordinator); `office.read` lists them
(Admin, Coordinator, Teacher). All mutations audited (entity `Office`).

#### Scenario: Coordinator manages an office
- **GIVEN** a user with the `Coordinator` role
- **WHEN** they POST `/api/org/offices`
- **THEN** **201** and an audit row with `actorRole: Coordinator` is written

#### Scenario: Participant lists offices
- **GIVEN** a Participant
- **WHEN** they GET `/api/org/offices`
- **THEN** **403** (no `office.read`)

### Requirement: Office archive guard [BR-4, UC-4]

The system SHALL refuse to archive an office while users still point at it
(**409**); Phase 3 extends the guard to Rooms.

### Requirement: Manager/department/office assignment [BR-2, UC-2]

The system SHALL let an Admin (`org.manage`) set a user's `managerId`,
`departmentId`, and `officeId` (`null` clears; unknown office → **422**).
Coordinators do NOT hold `org.manage`.

### Requirement: Self-scoped manager dashboard [BR-3, UC-3]

The system SHALL return, at `/api/org/my-team` (`team.read`), ONLY the caller's
own direct reports and their training status — regardless of role.

#### Scenario: Manager views team
- **GIVEN** a manager with 4 direct reports
- **WHEN** they GET `/my-team`
- **THEN** they see those 4 (and not other managers' reports)

## Non-Functional Requirements (NFR)

Inherits `security-platform` + `capability-authz`. Specifics:
- **Authz:** `requireCapability` — `department.read`/`department.manage`,
  `office.read`/`office.manage`, `org.manage`, `team.read`; `/my-team` is
  self-scoped in the use-case.
- **Audit:** department + office + assignment changes recorded.
- **Data:** soft-delete with auto-filter; partial-unique live code; non-
  destructive alongside legacy `department` string.

## Acceptance Criteria (AC)

- [ ] Department CRUD; code unique among live (409); deleted code reusable.
- [ ] Office CRUD by Admin AND Coordinator; Teacher read; Participant 403.
- [ ] Archive refused while users reference the department/office.
- [ ] Admin sets user manager/department/office.
- [ ] `/my-team` returns only the caller's direct reports (any role).

## Error & Edge Cases

| Trigger | Behavior | Recovery |
|---|---|---|
| Duplicate live code (dept/office) | 409 | choose another |
| Archive in-use dept/office | 409 refused | reassign users first |
| Assignment with unknown office | 422 | pick a live office |
| Non-manager `/my-team` | own (possibly empty) reports | n/a |
| Missing capability | 403 | use authorised role |

## Out of Scope / Deferred

- Google Directory sync auto-provisioning of users/departments/offices (Wave D2).
- Multi-level org rollups beyond direct reports.
- Physical removal of the legacy `User.department` string.
- Rooms scoped to an Office + extended archive guard (re-center Phase 3).
