---
capability: learning-catalog
status: stable
owners: [domains/learning, controllers/classController]
last_updated: 2026-06-14
related_code:
  - server/domains/learning/controller.js
  - server/domains/learning/use-cases.js
  - server/domains/learning/repository.js
  - server/domains/learning/dto.js
  - server/models/LearningProgram.js
  - server/models/Class.js
  - client/src/features/learning/ProgramFormModal.jsx
  - client/src/features/learning/CohortFormModal.jsx
  - client/src/features/learning/CohortEditModal.jsx
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
- **UC-2 (Admin/Coordinator):** creates, edits (status + total sessions), and
  deletes a Cohort (Class) linked to a Program.
- **UC-3 (Any user):** browses programs and cohorts.

## Entities

- **LearningProgram** (`server/models/LearningProgram.js`): `code`
  (unique, uppercase, `^[A-Z0-9][A-Z0-9_-]*$`), `name` (case-insensitive unique,
  collation strength 2), `category`, `defaultSessionCount`, `deliveryMode`,
  `schedulingMode` (default `admin_scheduled`), `completionPolicy`
  {attendanceThresholdPercent, requiresAssessment, requiresFeedback},
  `certificateValidityDays`, `capacityPolicy`, `facilitatorPolicy`,
  `recertifyPolicy` {autoAssign}, `prerequisitePrograms[]`, `status`
  (active/inactive/archived), `legacyCourseName`.
- **Class / Cohort** (`server/models/Class.js`): `classCode` + `courseName`
  (**unique together**), `programId` (link), `totalSessions`, `status`
  (Ongoing/Completed), `teacherIds[]` (teacher-class binding, "open until
  populated"), `customFields` (admin-defined values keyed by
  `CustomFieldDefinition.key`, entity `Cohort`). **At most one `Ongoing` class
  per `classCode`** (partial unique). Exposed as Cohort DTO.

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

### Requirement: Cohort edit & delete [BR-2, UC-2]

The system SHALL let a holder of `cohort.manage` (Admin/Coordinator) edit a
cohort's `status`, `totalSessions`, and admin-defined `customFields` values via
`PUT /api/learning/cohorts/:id` (custom field values may also be set at create), and
**soft-archive** a cohort via `DELETE /api/learning/cohorts/:id`. Delete is
**blocked** (409) while any Group (Team) or Session (Schedule) still references
the cohort. Once unreferenced, delete is a **recoverable soft-archive** (sets
`isDeleted`/`deletedAt`, mirroring Team): in one transaction it closes the
cohort's active Enrollments (`status`→`Dropped`, like Team delete) and marks the
cohort deleted. **Evaluations and Enrollment history are PRESERVED** (golden
rule). Archived cohorts are hidden from normal reads (Class soft-delete pre-hook)
but listed via `GET /api/learning/cohorts/deleted` and recoverable via
`POST /api/learning/cohorts/:id/restore`. (Restores the capability formerly in
the removed legacy `ClassesPage`; now in the `/learning` Cohorts tab + trash view.)

#### Scenario: Completed→Ongoing flip blocked by an existing Ongoing run
- **GIVEN** an Ongoing run already exists for cohort code EL001
- **WHEN** a Completed run of EL001 is edited back to Ongoing
- **THEN** it is rejected **409** (one Ongoing per code)

#### Scenario: Delete blocked while referenced
- **GIVEN** a cohort with an assigned Group or a booked Session
- **WHEN** an admin deletes the cohort
- **THEN** it is rejected **409**; the cohort is preserved

#### Scenario: Soft-archive when unreferenced, then restore
- **GIVEN** a cohort with no Groups/Sessions but with active Enrollments + Evaluations
- **WHEN** an admin deletes it
- **THEN** it is hidden from the cohort list, its active Enrollments become
  `Dropped` (records + Evaluations preserved), and it appears in the trash view
- **WHEN** the admin restores it
- **THEN** the cohort returns to active (**200**)

#### Scenario: Non-manager blocked
- **WHEN** a Teacher calls PUT/DELETE on a cohort
- **THEN** it is rejected **403** (lacks `cohort.manage`)

### Requirement: Policies are the source for downstream behavior [BR-3]

The system SHALL persist program policies that other capabilities read:
`completionPolicy` → `completion-and-certificates`; `prerequisitePrograms` →
`enrollment`; `schedulingMode` → `scheduling-and-booking` (enforced on every
session-create path: team modes `leader_booking`/`admin_scheduled` + the
cohort-vs-team structural rule — see scheduling-and-booking "Scheduling-mode
gating"); `certificateValidityDays` → recertification.

All program policies are **editable in the program form** (`ProgramFormModal`):
`completionPolicy` (attendance threshold %, requires-assessment,
requires-feedback), `certificateValidityDays` (blank = never expires),
`capacityPolicy` (max per cohort / per session, blank = no limit),
`facilitatorPolicy` (assignment-required, visibility), and `recertifyPolicy`
(auto-assign a recertification on expiry — see `compliance-and-recertification`)
— closing the prior "enforced but only API-settable" gap.

### Requirement: Read open, write Admin-only [BR-4, UC-3]

The system SHALL allow any authenticated user to read `/api/learning/programs`
and `/api/learning/cohorts`; cohort writes (create/edit/delete) require the
`cohort.manage` capability (Admin/Coordinator).

## Non-Functional Requirements (NFR)

Inherits `security-platform`. Specifics:
- **Authz:** `/api/learning/programs` + `/api/learning/cohorts` reads
  authenticated; writes Admin.
- **Audit:** program/cohort create/update/delete recorded (cohort write audited
  as entity `Class`).
- **Data:** cohort delete is a **soft-archive** (`isDeleted`/`deletedAt` + Class
  pre-hook auto-filter, mirroring Team) — recoverable via restore; active
  enrollments closed to `Dropped`, Evaluations preserved (golden rule). Referential
  guards block delete while Groups/Sessions reference it. Uniqueness enforced at
  DB level (E11000 → 409); `teacherIds` "open until populated" graceful migration.
- **Performance:** indexes `{status,category,name}` (programs),
  `{classCode,courseName}` + `{programId,status}` + `{teacherIds}` (classes).

## Acceptance Criteria (AC)

- [ ] Program code & name unique (name case-insensitive); bad code rejected.
- [ ] Cohort `classCode`+`courseName` unique; one Ongoing per code (409 on race).
- [ ] `courseName` validates vs legacy setting or program name; fails open if no
  legacy catalog.
- [ ] Reads authenticated; cohort writes require `cohort.manage` (Admin/Coordinator).
- [ ] Cohort edit changes status/totalSessions; Completed→Ongoing flip blocked 409.
- [ ] Cohort delete blocked 409 while Groups/Sessions reference it; else
  soft-archives (recoverable): enrollments→Dropped, Evaluations preserved, hidden
  from lists, listed in trash, restorable.
- [ ] Program policies persisted and readable by downstream capabilities.

## Error & Edge Cases

| Trigger | Behavior | Recovery |
|---|---|---|
| Duplicate program code/name | unique error / 409 | choose another |
| Invalid code pattern | validation error | fix code |
| 2nd Ongoing class per code | 409 (E11000) | complete the first |
| Invalid courseName | validation error | use catalog name |
| Cohort write without `cohort.manage` | 403 | use Admin/Coordinator |
| Delete cohort with Groups/Sessions | 409 | remove refs first |

## Out of Scope / Deferred

- Physical collection rename (`Class`→`Cohort`) — deferred (DTO migration only).
- Cohort trash UI is restore-only (no permanent purge from the UI) — purge is a
  DB/ops task if ever needed.
- Program versioning / module-level curriculum.
- `facilitatorPolicy` now **fully enforced** (phase-3 policy debt closed):
  **`assignmentRequired`** blocks attendance marking until a trainer is assigned
  (`domains/schedule/facilitator-assignment-policy.js` — see `attendance`);
  **`visibility: assigned_only`** scopes a Teacher to only the sessions they are
  named on (`domains/schedule/facilitator-visibility-policy.js`, gated in the
  session list/detail and attendance mark/read — see `scheduling-and-booking`
  and `attendance`). **`deliveryMode` is metadata-only by design** (online/
  offline/hybrid is display + reporting context; it carries no behavioural
  contract, so there is nothing to "enforce"). (`schedulingMode` shipped — see
  `scheduling-and-booking`; `capacityPolicy` **enforced (Wave E2)**:
  `maxParticipantsPerSession` per-session in `scheduling-and-booking`,
  `maxParticipants` per-cohort in `enrollment`.)
