---
capability: learning-catalog
status: stable
owners: [domains/learning, controllers/classController]
last_updated: 2026-06-08
related_code:
  - server/domains/learning/controller.js
  - server/domains/learning/use-cases.js
  - server/domains/learning/repository.js
  - server/domains/learning/dto.js
  - server/models/LearningProgram.js
  - server/models/Class.js
related_plans:
  - plans/260603-0911-m3-learning-crud-ui
---

# Capability: Learning Catalog (Programs & Cohorts)

> **Source of truth for BEHAVIOR.** File/route locations: `docs/current-system-map.md`.
> Vocabulary: `LearningProgram` = **Program**; `Class` exposed as **Cohort** via DTO.

## Purpose

The catalog layer of the L&D platform: reusable **Programs** (training
definitions with policies) and **Cohorts** (one delivery of a program, physically
a legacy `Class`). This is the migration spine from TMS (fixed English courses)
to a generic training platform — Programs are new; Classes stay stored as
`classes` and link via `Class.programId`.

## Business Requirements (BR)

- **BR-1:** Admins define reusable Programs with codes, categories, and delivery/
  scheduling/completion/capacity policies.
- **BR-2:** A Cohort is one delivery of a Program; the same program runs many
  cohorts over time.
- **BR-3:** Programs carry the policies that downstream capabilities read
  (completion thresholds, certificate validity, prerequisites, scheduling mode).
- **BR-4:** Catalog is readable by all authenticated users; only Admins mutate it.
- **BR-5:** Legacy fixed courses must keep working during migration (non-
  destructive: DTOs over `Class`, no renames).

## Actors & Use Cases (UC)

- **UC-1 (Admin):** creates/edits/archives a Program.
- **UC-2 (Admin):** creates a Cohort (Class) linked to a Program.
- **UC-3 (Any user):** browses programs and cohorts.

## Entities

- **LearningProgram** (`server/models/LearningProgram.js`): `code`
  (unique, uppercase, `^[A-Z0-9][A-Z0-9_-]*$`), `name` (case-insensitive unique,
  collation strength 2), `category`, `defaultSessionCount`, `deliveryMode`,
  `schedulingMode` (default `admin_scheduled`), `completionPolicy`
  {attendanceThresholdPercent, requiresAssessment, requiresFeedback},
  `certificateValidityDays`, `capacityPolicy`, `facilitatorPolicy`,
  `prerequisitePrograms[]`, `status` (active/inactive/archived),
  `legacyCourseName`.
- **Class / Cohort** (`server/models/Class.js`): `classCode` + `courseName`
  (**unique together**), `programId` (link), `totalSessions`, `status`
  (Ongoing/Completed), `teacherIds[]` (teacher-class binding, "open until
  populated"). **At most one `Ongoing` class per `classCode`** (partial unique).
  Exposed as Cohort DTO.

## Functional Requirements (FR)

### Requirement: Program CRUD with unique code & name [BR-1, UC-1]

The system SHALL create/update/archive Programs, enforcing a unique `code` and
case-insensitive unique `name`. Codes are normalised uppercase and validated
against the allowed character pattern.

#### Scenario: Duplicate program name (different case)
- **GIVEN** a program named "Onboarding"
- **WHEN** another "onboarding" is created
- **THEN** it is rejected (case-insensitive unique index)

### Requirement: Cohort creation linked to a program [BR-2, BR-5, UC-2]

The system SHALL create a Cohort (Class) with `classCode`+`courseName` unique
together, optionally linked to a `programId`. `courseName` validates against the
legacy `COURSE_SESSIONS` setting or an existing non-archived Program name (fails
open if no legacy catalog exists).

#### Scenario: One Ongoing cohort per code
- **GIVEN** an Ongoing class for classCode EL001
- **WHEN** a second Ongoing class for EL001 is created (even concurrently)
- **THEN** the second insert is rejected **409** (partial unique index)

### Requirement: Policies are the source for downstream behavior [BR-3]

The system SHALL persist program policies that other capabilities read:
`completionPolicy` → `completion-and-certificates`; `prerequisitePrograms` →
`enrollment`; `schedulingMode` → `scheduling-and-booking` (only `leader_booking`
fully enforced today); `certificateValidityDays` → recertification.

### Requirement: Read open, write Admin-only [BR-4, UC-3]

The system SHALL allow any authenticated user to read `/api/learning/programs`
and `/api/learning/cohorts`; writes require Admin.

## Non-Functional Requirements (NFR)

Inherits `security-platform`. Specifics:
- **Authz:** `/api/learning/programs` + `/api/learning/cohorts` reads
  authenticated; writes Admin.
- **Audit:** program/cohort create/update/archive recorded.
- **Data:** soft-delete on cohorts; uniqueness enforced at DB level (E11000 →
  409); `teacherIds` "open until populated" graceful migration.
- **Performance:** indexes `{status,category,name}` (programs),
  `{classCode,courseName}` + `{programId,status}` + `{teacherIds}` (classes).

## Acceptance Criteria (AC)

- [ ] Program code & name unique (name case-insensitive); bad code rejected.
- [ ] Cohort `classCode`+`courseName` unique; one Ongoing per code (409 on race).
- [ ] `courseName` validates vs legacy setting or program name; fails open if no
  legacy catalog.
- [ ] Reads authenticated; writes Admin-only.
- [ ] Program policies persisted and readable by downstream capabilities.

## Error & Edge Cases

| Trigger | Behavior | Recovery |
|---|---|---|
| Duplicate program code/name | unique error / 409 | choose another |
| Invalid code pattern | validation error | fix code |
| 2nd Ongoing class per code | 409 (E11000) | complete the first |
| Invalid courseName | validation error | use catalog name |
| Non-admin write | 403 | use Admin |

## Out of Scope / Deferred

- Physical collection rename (`Class`→`Cohort`) — deferred (DTO migration only).
- Program versioning / module-level curriculum.
- `schedulingMode` enforcement for non-`leader_booking` (see
  `scheduling-and-booking` Out of Scope + `capability-authz`).
