---
capability: assignments-and-reminders
status: stable
owners: [domains/learning/assignment, services/reminderService]
last_updated: 2026-06-08
related_code:
  - server/domains/learning/assignment/use-cases.js
  - server/domains/learning/assignment/status-resolver.js
  - server/domains/learning/assignment/reminder-cadence.js
  - server/domains/learning/assignment/reminder-service.js
  - server/services/reminderService.js
  - server/models/Assignment.js
  - server/models/NotificationLog.js
related_plans:
  - plans/260605-1135-assignment-due-dates
  - plans/260605-1344-assignment-reminders-escalation
---

# Capability: Assignments & Reminders

> **Source of truth for BEHAVIOR.** Assignment completion reuses
> `hasCompletedProgram` (see `enrollment`/`completion`). Reminders are delivered
> by cron (`docs/specs/reconcile-job` shares the cron-auth model).

## Purpose

Mandatory training assignments with due dates (Wave D4), per-learner status
tracking, and a reminder/escalation system (Wave D5) that nudges learners before/
after due dates and digests overdue items to managers. Plus session "starts
soon" reminders. All reminders are idempotent — never double-sent.

## Business Requirements (BR)

- **BR-1:** Admins assign a Program or Path to learners/departments with a due
  date.
- **BR-2:** Each targeted learner has a resolvable status (not started / in
  progress / complete / overdue).
- **BR-3:** Learners are reminded before due (7d, 1d) and after (overdue
  cadence).
- **BR-4:** Managers receive a weekly digest of their reports' overdue items.
- **BR-5:** Every reminder is sent at most once per cadence window (idempotent).
- **BR-6:** Sessions remind enrolled learners shortly before they start, once.

## Actors & Use Cases (UC)

- **UC-1 (Admin):** creates/edits/archives an assignment (one Program or one
  Path, a due date, target users/departments).
- **UC-2 (Admin/Teacher):** views per-learner assignment status.
- **UC-3 (Cron):** triggers reminder runs (learner + manager + session).

## Entities

- **Assignment** (`server/models/Assignment.js`): `title`, `targetType`
  (`program`|`path`, exactly one of `programId`/`pathId` — enforced in
  `pre('validate')`), `dueDate` (req), `userIds[]`, `departmentIds[]`, `status`
  (active/archived), soft-delete.
- **NotificationLog** (`server/models/NotificationLog.js`): idempotency ledger
  keyed by recipient + `cadenceKey`.
- **Schedule.remindersSentAt** (`Schedule` model): at-most-once gate for session
  reminders.

## Functional Requirements (FR)

### Requirement: Single-target assignment with due date [BR-1, UC-1]

The system SHALL require exactly one target (Program XOR Path) and a `dueDate`,
targeting learners directly (`userIds`) and/or by `departmentIds`. Archiving is a
soft-delete.

#### Scenario: Program assignment
- **GIVEN** an Admin
- **WHEN** they create an assignment with `targetType=program`, a programId, due
  date, and target users
- **THEN** it is stored active; pathId is forced null

#### Scenario: Missing target
- **GIVEN** `targetType=program` with no programId
- **WHEN** saved
- **THEN** validation error ("Program target is required")

### Requirement: Per-learner status resolution [BR-2, UC-2]

The system SHALL resolve each targeted learner to `complete` (program done / all
path programs done), `overdue` (past `dueDate` end-of-day UTC and not complete),
`in_progress` (participating), or `not_started`.

#### Scenario: Overdue learner
- **GIVEN** a learner who hasn't completed and `dueDate` passed
- **WHEN** status is resolved
- **THEN** status = `overdue`

### Requirement: Learner reminder cadence [BR-3, BR-5, UC-3]

The system SHALL send `assignment_due_soon` at exactly 7 days (`due_7`) and 1 day
(`due_1`) before due, and `assignment_overdue` in 3-day buckets after due
(`overdue_d1`, `overdue_d4`, …), each guarded by a `cadenceKey` so a given window
sends once.

#### Scenario: Due in 7 days
- **GIVEN** an active assignment due in exactly 7 days for an incomplete learner
- **WHEN** the reminder cron runs (even twice)
- **THEN** one `due_7` reminder is sent (idempotent via cadenceKey)

### Requirement: Manager weekly overdue digest [BR-4, BR-5, UC-3]

The system SHALL send managers a weekly digest of their reports' overdue
assignments, idempotent per ISO-week key (`manager_overdue_<isoWeek>`).

### Requirement: Session "starts soon" reminders [BR-6, UC-3]

The system SHALL remind enrolled learners before a session starts, gated by an
atomic `findOneAndUpdate` on `Schedule.remindersSentAt` so each session reminds
at most once even under concurrent cron fires.

## Non-Functional Requirements (NFR)

Inherits `security-platform`. Specifics:
- **Authz:** assignment read = Admin/Teacher (`assignment.read`); write = Admin
  (`assignment.manage`); reminder endpoints under `/api/cron` require
  `CRON_TOKEN`.
- **Idempotency:** NotificationLog `cadenceKey` + `Schedule.remindersSentAt`
  prevent duplicate sends across retries/concurrency.
- **Audit:** assignment create/update/archive recorded.
- **Time:** cadence computed in whole UTC days; overdue end-of-day cutoff.

## Acceptance Criteria (AC)

- [ ] Assignment requires one target (Program XOR Path) + due date; archive soft.
- [ ] Status resolves not_started/in_progress/complete/overdue correctly.
- [ ] Learner reminders at 7d, 1d, and 3-day overdue buckets, once each.
- [ ] Manager weekly digest, once per ISO week.
- [ ] Session reminder sent at most once (remindersSentAt atomic gate).
- [ ] Cron endpoints require CRON_TOKEN.

## Error & Edge Cases

| Trigger | Behavior | Recovery |
|---|---|---|
| Missing/both targets | validation error | one target |
| Missing due date | validation error | set due date |
| Reminder cron re-run | no duplicate (cadenceKey) | n/a |
| Cron without token | 401/403 | supply CRON_TOKEN |

## Out of Scope / Deferred

- Configurable per-assignment cadence (cadence is fixed).
- In-app / push notifications (email only today).
- Assignment-level completion certificates (handled per cohort).
