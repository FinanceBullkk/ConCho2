---
capability: attendance
status: stable
owners: [services/attendanceService, controllers/attendanceController, models/Attendance]
last_updated: 2026-06-08
related_code:
  - server/services/attendanceService.js
  - server/controllers/attendanceController.js
  - server/models/Attendance.js
  - server/helpers/teacher-class-scope.js
related_plans: []
---

# Capability: Attendance

> **Source of truth for BEHAVIOR.** File/route locations: `docs/current-system-map.md`.
> Attendance feeds completion (`completion-and-certificates`) and HR export
> (`export-and-integrations`).

## Purpose

Record per-learner presence for each session. Marking is bulk per session,
idempotent, bounded by sensible time windows, and scoped to the actor's
authority. Attendance is audit-relevant learner data and is the denominator for
completion.

## Business Requirements (BR)

- **BR-1:** Admins/Teachers record presence per session; one record per learner
  per session.
- **BR-2:** Attendance must reflect only learners actually enrolled in that
  session.
- **BR-3:** Marking must be sane in time — not before a session happens, not
  long after.
- **BR-4:** Teachers only touch attendance for sessions they're responsible for.
- **BR-5:** Records are exportable to HR exactly once (no duplicates).

## Actors & Use Cases (UC)

- **UC-1 (Admin/Teacher):** opens a past/ongoing session and marks each enrolled
  learner P/A/L/EL in one bulk submit; re-submitting corrects mistakes.
- **UC-2 (Teacher):** can only mark/view sessions in their class bindings.
- **UC-3 (Participant):** reads their own attendance stats.

## Entities

- **Attendance** (`server/models/Attendance.js`): `scheduleId` + `userId`
  (**unique together**), `status` (`P` present / `A` absent / `L` late /
  `EL` excused leave), `remark`, `photoUrl`, export tracking (`syncStatus`
  PENDING/EXPORTING/EXPORTED, `exportBatchId`, `exportedAt`).

## Functional Requirements (FR)

### Requirement: Idempotent bulk marking [BR-1, UC-1]

The system SHALL upsert attendance per `{scheduleId, userId}` (one record each),
so re-marking corrects rather than duplicates. Valid statuses are P/A/L/EL.

#### Scenario: Re-mark corrects
- **GIVEN** a learner marked A
- **WHEN** the same session is re-submitted with them as P
- **THEN** the single record updates to P (no duplicate row)

### Requirement: Enrolled-only allowlist [BR-2, UC-1]

The system SHALL reject any record whose `userId` is not in the session's
`enrolledUsers`.

#### Scenario: Non-enrolled user
- **GIVEN** a userId not enrolled in the session
- **WHEN** a record for them is submitted
- **THEN** **400** ("User … is not enrolled in this schedule")

### Requirement: Time-window guards [BR-3, UC-1]

The system SHALL reject marking a session that has not started (future) and
reject editing attendance for sessions older than 30 days.

#### Scenario: Future session
- **GIVEN** a session whose `startTime` is in the future
- **WHEN** marking is attempted
- **THEN** **400** ("Cannot mark attendance for a future session")

#### Scenario: Stale session
- **GIVEN** a session older than 30 days
- **WHEN** an edit is attempted
- **THEN** **400** ("Cannot edit attendance older than 30 days")

### Requirement: Teacher scoping [BR-4, UC-2]

The system SHALL scope a Teacher's attendance reads/writes to schedules in their
visible class bindings (`findTeacherVisibleClassIds`); Admin sees all.

### Requirement: Active-status denormalisation [BR-1]

On marking P or L, the system SHALL bump `User.lastActiveAt` to the session's
`startTime` via `$max` (never moves backward); A/EL do not. Analytics cache is
invalidated.

### Requirement: Self stats [UC-3]

The system SHALL let an authenticated participant read their own attendance
statistics.

## Non-Functional Requirements (NFR)

Inherits `security-platform`. Specifics:
- **Authz:** `/api/attendance` write = Admin/Teacher (teacher binding enforced);
  self-stats authenticated.
- **Audit:** marking recorded.
- **Data:** unique `{scheduleId,userId}`; export claim is race-safe
  (PENDING→EXPORTING→EXPORTED).
- **Performance:** indexes `{userId,createdAt}`, `{userId,status}`,
  `{createdAt,userId}`, `{syncStatus,createdAt}`, sparse `{exportBatchId}`.

## Acceptance Criteria (AC)

- [ ] Bulk mark upserts one record per learner; re-mark corrects, no dup.
- [ ] Non-enrolled userId → 400.
- [ ] Future session → 400; >30-day session edit → 400.
- [ ] Teacher limited to their class bindings; Admin sees all.
- [ ] P/L bump `lastActiveAt` (via $max); A/EL don't.
- [ ] Participant can read own stats.

## Error & Edge Cases

| Trigger | Behavior | Recovery |
|---|---|---|
| Empty records array | error | submit records |
| Invalid status | error | use P/A/L/EL |
| Non-enrolled userId | 400 | mark only enrolled |
| Future session | 400 | wait until it starts |
| >30-day session | 400 | (locked) |
| Teacher outside binding | scoped out / denied | Admin handles |

## Out of Scope / Deferred

- Self check-in / QR / geofenced attendance.
- L/EL exposure in the marking UI (stored; v1 UI exposes P/A — backlogged).
