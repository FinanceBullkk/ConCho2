---
capability: assignments-and-reminders
status: stable
owners: [domains/learning/assignment, services/reminderService]
last_updated: 2026-06-13
related_code:
  - server/domains/learning/assignment/use-cases.js
  - server/domains/learning/assignment/status-resolver.js
  - server/domains/learning/assignment/reminder-cadence.js
  - server/domains/learning/assignment/reminder-service.js
  - server/services/reminderService.js
  - server/models/Assignment.js
  - server/models/NotificationLog.js
  - server/domains/notification/use-cases.js
  - server/domains/notification/repository.js
  - server/domains/notification/dto.js
  - server/domains/notification/in-app-writer.js
  - server/domains/learning/enrollment/use-cases.js
  - server/services/scheduleService.js
  - client/src/features/notifications/NotificationBell.jsx
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

### Requirement: Learner self view + enroll suggestion (Cohesion P3) [BR-2, UC-2]

The system SHALL expose `GET /api/learning/assignments/mine`
(`assignment.self` — held by every role; ALWAYS scoped to the caller):
active assignments targeting the caller directly (`userIds`) or via their
`departmentId`, each with the caller's own derived status (same signals as
per-learner resolution, computed for one user) and — when the actionable
program (the assignment's program, or the first incomplete path step) is
`self_enroll` with an Ongoing cohort — an `enrollableCohortId`/`Code`
suggestion. Enrollment itself goes through the existing chokepoint
(capacity + prerequisites enforced there). The learner home's next-actions
feed renders these rows with a one-click Enroll CTA; learner reminder
emails deep-link to the home (`CLIENT_ORIGIN/home`) when configured.

#### Scenario: Department-targeted assignment

- **GIVEN** an active assignment targeting department D and a learner whose
  `departmentId` = D
- **WHEN** the learner calls `/assignments/mine`
- **THEN** the assignment appears with the learner's own status

#### Scenario: Enroll suggestion only for self_enroll

- **GIVEN** an incomplete program assignment whose program is
  `leader_booking`
- **WHEN** the learner calls `/assignments/mine`
- **THEN** the row has `enrollableCohortId: null` (no self-service path)

### Requirement: In-app notification feed (Cohesion P5) [BR-3]

The system SHALL expose the `NotificationLog` as a self-scoped in-app feed:
`GET /api/notifications/mine` returns the caller's own notifications (by
`recipientUserId`, newest first, excluding transient `pending` rows) plus an
`unreadCount`; `POST /api/notifications/:id/read` and
`POST /api/notifications/read-all` set a per-row `readAt`. All three are gated
by `notification.read` (held by every role) and scoped to the caller — another
user's row can never match (marking it → 404). `readAt` is in-app read state
only; it does NOT change the email `status`, and email delivery is unchanged.
A `dto` presenter maps each `type` to a title/body/link
(assignment due-soon/overdue → `/home`, manager digest → `/my-team`,
waitlist-promoted → `/me/sessions`, certificate-issued → `/me/transcript`,
certificate-expiring → `/me/transcript`, manager-certificate-expiry-digest →
`/my-team`, cohort-enrolled → `/me/programs`, booking-confirmed → `/me/sessions`,
session-enrolled → `/me/sessions`).
Most rows are `channel:'email'` (the email IS the notification); a
`channel:'in_app'` row is an in-app-only event with no email, written through
the shared fail-soft + idempotent writer `domains/notification/in-app-writer.js`
(`recordInApp`):
- **`certificate_issued`** — on certificate issue, keyed by `certificateNumber`;
- **`cohort_enrolled`** — when an Admin direct-enrolls a learner into a cohort
  (NOT on self-enroll, which the UI already confirms), keyed by the enrollment
  id, recipient = the enrolled learner;
- **`booking_confirmed`** — when a leader books a team slot (mirrors the
  booking-confirmation email), keyed by `<scheduleId>:<userId>`, recipient =
  the booker;
- **`session_enrolled`** — when a session create auto-enrolls people who did NOT
  initiate it: the rest of the team on a leader booking (booker excluded — they
  got `booking_confirmed`), and the cohort enrollees on an admin/coordinator-
  scheduled cohort session. Written from the shared `scheduleService` chokepoint
  (`bookSlot` / `bookCohortSlot` / `adminCreate`), keyed by
  `<scheduleId>:<userId>`, recipient = each enrolled learner.

The bell polls ~every 3 min (plus on tab focus). A logging hiccup (or duplicate)
never blocks the triggering mutation — the write is best-effort. In-app bell
coverage now spans certificate issuance, cohort enrollment, and every session
create path; remaining transactional emails (password reset, class cancellation)
stay email-only by design.

#### Scenario: Self-scoped feed
- **GIVEN** notifications with `recipientUserId` = me (non-pending) and others'
- **WHEN** I call `/notifications/mine`
- **THEN** only my non-pending rows return, with the correct `unreadCount`

#### Scenario: Cannot read another user's notification
- **GIVEN** a notification whose `recipientUserId` is another user
- **WHEN** I POST `/notifications/:id/read`
- **THEN** 404 and the row is unchanged

#### Scenario: Admin direct-enroll surfaces in the learner's bell
- **GIVEN** an Admin enrolls another learner into a cohort
- **WHEN** the enrollment succeeds
- **THEN** a `channel:'in_app'` `cohort_enrolled` row is written for that learner
  (link `/me/programs`); a learner self-enrolling writes no such row

#### Scenario: Booking a slot surfaces in the booker's bell
- **GIVEN** a leader books a team time slot
- **WHEN** the booking is created
- **THEN** a `channel:'in_app'` `booking_confirmed` row is written for the booker
  (keyed by `<scheduleId>:<userId>`, link `/me/sessions`)

#### Scenario: Auto-enrolled roster surfaces in each member's bell
- **GIVEN** a leader books a team slot (auto-enrolling the team), or an
  Admin/Coordinator schedules a cohort session over its active enrollees
- **WHEN** the session is created
- **THEN** each newly-enrolled learner gets a `channel:'in_app'`
  `session_enrolled` row (link `/me/sessions`); the booker is excluded (they got
  `booking_confirmed`)

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
  `CRON_TOKEN`. In-app feed (`/api/notifications/*`) = `notification.read`
  (every role; always self-scoped by `recipientUserId`); marking read is the
  caller's own UI state — NOT audited.
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
- Push / browser notifications (in-app bell shipped Cohesion P5 — read-feed
  over the email log; email + in-app today, no push).
- Assignment-level completion certificates (handled per cohort).
