---
capability: org-and-departments
status: stable
owners: [domains/org, models/Department]
last_updated: 2026-06-08
related_code:
  - server/domains/org/routes.js
  - server/domains/org/use-cases.js
  - server/domains/org/repository.js
  - server/models/Department.js
  - server/models/User.js
related_plans: []   # Wave D3 — org model (see development-roadmap 2026-06-04)
---

# Capability: Org & Departments

> **Source of truth for BEHAVIOR.** Wave D3. Structured org hierarchy
> (departments + manager tree) replacing the legacy free-text `User.department`
> non-destructively. Feeds assignment dept-targeting (`assignments-and-reminders`)
> and the manager dashboard.

## Purpose

A real department entity and a queryable manager hierarchy, layered alongside the
legacy `User.department` string ("open until populated"). Provides department
CRUD, manager/department assignment, and a self-scoped manager dashboard ("my
team") of direct reports' training status.

## Business Requirements (BR)

- **BR-1:** Admins manage departments as first-class entities (unique code).
- **BR-2:** Admins assign a user's manager and department.
- **BR-3:** Any manager can see their own direct reports' training status (and
  only theirs).
- **BR-4:** A department can't be archived while users still reference it.
- **BR-5:** Org records are soft-deleted; a deleted code can be reused.

## Actors & Use Cases (UC)

- **UC-1 (Admin):** CRUD departments.
- **UC-2 (Admin):** sets a user's `managerId`/`departmentId`.
- **UC-3 (Any manager):** views `/api/org/my-team` — own reports only.

## Entities

- **Department** (`server/models/Department.js`): `name`, `code` (uppercase,
  **unique among live** via partial index), `description`, soft-delete
  (`select:false`). Auto-excludes deleted on `find*`.
- **User.managerId / departmentId** (`server/models/User.js`): the manager tree +
  department link (nullable; "open until populated").

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

### Requirement: Manager/department assignment [BR-2, UC-2]

The system SHALL let an Admin (`org.manage`) set a user's `managerId` and
`departmentId`.

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
  `org.manage`, `team.read`; `/my-team` is self-scoped in the use-case.
- **Audit:** department + assignment changes recorded.
- **Data:** soft-delete with auto-filter; partial-unique live code; non-
  destructive alongside legacy `department` string.

## Acceptance Criteria (AC)

- [ ] Department CRUD; code unique among live (409); deleted code reusable.
- [ ] Archive refused while users reference the department.
- [ ] Admin sets user manager/department.
- [ ] `/my-team` returns only the caller's direct reports (any role).

## Error & Edge Cases

| Trigger | Behavior | Recovery |
|---|---|---|
| Duplicate live code | 409 | choose another |
| Archive in-use dept | refused | reassign users first |
| Non-manager `/my-team` | own (possibly empty) reports | n/a |
| Missing capability | 403 | use authorised role |

## Out of Scope / Deferred

- Google Directory sync auto-provisioning of users/departments (Wave D2).
- Multi-level org rollups beyond direct reports.
- Physical removal of the legacy `User.department` string.
