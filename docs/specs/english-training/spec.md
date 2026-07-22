---
capability: english-training
status: evolving
owners: [domains/english-training]
last_updated: 2026-07-22
authority:
  repository: kyphucclv/ConMeoGauGau
  commit: 4107cd52ee905e87254e099da23cb58dcbdd82a9
related_decisions:
  - docs/decisions/english-domain-authority.md
related_code:
  - server/db/pg/migrations/036_english_training.js
  - server/db/pg/migrations/038_english_training_attendance.js
  - server/db/pg/migrations/039_english_training_evaluation.js
  - server/db/pg/migrations/047_english_canonical_authority.js
  - server/db/pg/migrations/048_english_live_meetings_attendance.js
  - server/db/pg/migrations/049_english_meeting_calendar.js
  - server/db/pg/migrations/050_english_future_meeting_handoff.js
  - server/domains/english-training/import/pipeline.js
  - server/domains/english-training/canonical-operations.js
  - server/domains/english-training/meeting-delivery.js
  - server/domains/english-training/reads.pg.js
  - server/domains/english-training/evaluation.js
  - client/src/features/english-operations/ClassesPanel.jsx
  - client/src/features/english-operations/SchedulePanel.jsx
  - client/src/features/english-operations/AttendancePanel.jsx
---

# Capability: Canonical English Operations

## Purpose

Operate English classes inside ConCho2 without flattening the business model
into generic Program/Class/Team rows. English has a dedicated workspace and a
canonical module in the same modular monolith. Shared authentication,
authorization, UI shell, and infrastructure remain reused.

## Business vocabulary and grain

| Entity | One row means |
|---|---|
| `eng_employees` | one employee identity keyed by case-insensitive `emp_code` |
| `eng_cohorts` | one stable class code across courses and time |
| `eng_cohort_pic` | one dated PIC ownership assignment for a class |
| `eng_cohort_memberships` | one employee membership period in a stable class |
| `eng_courses` | one reusable English course definition |
| `eng_course_runs` | one numbered occurrence of one course for one class |
| `eng_run_enrollments` | one employee's participation in one Course Run |
| `eng_meetings` | one real calendar occurrence with start, duration, and lifecycle status |
| `eng_session_units` | one credited logical session in a Course Run |
| `eng_attendance_records` | one Present/Absent result for Enrollment × Session Unit |
| `eng_exam_results` | one active categorical final level per Run Enrollment |
| `raw_eng_workbook_rows` | one immutable source row retained as evidence |

PIC may reference an English employee or hold a normalized team label. PIC is
not a teacher assignment, login identity, generic Team, or roster container.

## Invariants

- `emp_code` is stable identity; login capability is orthogonal.
- `class_code` identifies the stable class, not a Course Run.
- At most one current PIC exists per class (`end_date IS NULL`).
- At most one active Run Enrollment exists per employee across English.
- A repeated course creates the next Course Run; it does not overwrite history.
- Course Run snapshots expected units and `attendance_threshold_ratio`.
- The default attendance threshold is `0.800`; eligibility uses the Run
  snapshot and requires recorded attendance.
- A Meeting is the calendar occurrence; a Session Unit is logical credit. One
  Meeting may contain at most two normal Session Units.
- New Meetings use an exact configured booking slot. One active English
  Meeting may occupy a company-wide start time.
- A learner starts at the next non-cancelled logical session and may hold at
  most one active English Run Enrollment across all Course Runs.
- Attendance applicability is calculated at event time. Planned rosters propose
  Present; completed historical gaps remain unknown rather than becoming Absent.
- One attendance save contains every applicable Run Enrollment exactly once.
  The opaque roster token rejects stale writes, and Meeting completion,
  attendance facts, and domain audit commit in one transaction.
- Only `present` and `absent` are canonical attendance states.
- Source rows are never silently discarded. A row is loaded, staged, or
  represented by a data-quality issue.
- English mutations require capability authorization, validation, and audit.

## Current workflows

### List classes and rosters

`GET /api/english-training/workspace/classes` returns stable classes with
capacity, current PIC, active membership count, and Course Run count.

`GET /api/english-training/workspace/classes/:id` returns the stable class,
current PIC, every Course Run, and each Run's roster with enrollment status,
applicable start session, attendance ratio, and eligibility state.

The Classes UI groups stable classes by their current PIC. The roster is read
from `eng_run_enrollments`; it never queries generic Team Enrollments.

### Create class with first Course Run

`POST /api/english-training/workspace/classes` accepts:

- `classCode`, `displayName`, `courseId`, `startDate`, `capacity`, `status`;
- either `picEmployeeId` or `picLabel`.

One transaction creates the Cohort, current PIC assignment, Course Run 1, and
three `eng_audit_events`. Any validation, FK, or uniqueness failure rolls back
the full command. Admin and Coordinator require `cohort.manage`.

### Add a learner to a Course Run

Creating a brand-new managed learner creates the login-disabled shared User and
the canonical English Employee crosswalk with the same normalized `emp_code` in
one transaction. Existing imported Employees are provisioned/linked by the same
key; roster selectors page through the full Employee directory.

`POST /api/english-training/workspace/course-runs/:courseRunId/enrollments`
starts one active Run Enrollment at the operator-confirmed next Session Unit.
It reuses or creates the stable Cohort Membership, checks capacity and the
one-active-enrollment invariant, and writes the domain audit atomically.

### Schedule and attendance

Schedule and Attendance render the canonical `eng_session_units` and
`eng_attendance_records` projections on the weekly grids. Past imported rows
remain explicitly read-only. Planned, attendance-free imported Meetings still
in the future are handed to live operations with their source timestamp and
duration retained as a baseline. There is no generic live/archive source toggle.

`POST /api/english-training/workspace/course-runs/:courseRunId/sessions`
creates one planned Meeting and its first normal Session Unit after exact-slot,
Course Run state, conflict, and confirmed-sequence validation.

Admin and Coordinator can click an empty configured grid cell to prefill that
command. A live planned Meeting can be opened from its card and moved with
`PATCH .../meetings/:meetingId`; the Course Run, Session Unit identity, logical
session number, and event-time roster remain unchanged. `DELETE` on the same
resource is a durable cancellation with a required reason: Meeting and Session
Unit statuses change to cancelled while the row and audit history remain.
Unadopted imported history, started, completed, cancelled, or attendance-bearing
Meetings are read-only. Create and move both reject past time and occupied active
slots.

After commit, Meeting delivery is fail-soft like the shared ConCho2 schedule:
linked learners and the current PIC receive bell notifications; roster emails
are sent when SMTP is configured; and Google Calendar is created, updated, or
deleted when the Calendar integration is configured. Provider failures never
roll back the canonical Meeting mutation. Migration 049 stores the optional
Google event id and Meet link on the Meeting.

`GET .../session-units/:sessionUnitId/attendance` returns the event-time roster
and an opaque stale-write token. `PUT` to the same path accepts only Present or
Absent and must contain the exact full roster once each. A successful save
upserts the facts, completes the Meeting and Session Unit, and records the
domain audit in one transaction. Teacher access remains closed until assigned-
resource scope is ported.

The English workspace presents these commands as HR-facing tasks:

- Overview starts with direct actions for attendance review, session planning,
  and PIC-owned class management.
- Schedule follows the shared ConCho2 calendar + drawer pattern. Empty
  configured cells open a prefilled drawer; operational cards open the same
  compact move/cancel drawer; the duplicated embedded page header is hidden and
  an unopened drawer does not reserve calendar width.
- Attendance separates all sessions, sessions needing evidence, recorded
  sessions, and upcoming sessions. Opening a roster keeps the calendar width
  stable and renders the roster as an inline full-width work area.
- Imported gaps are labelled `No evidence` and remain unknown. The UI never
  derives Present, Absent, or Dropped from a missing historical source row.

### Evaluation

Final evaluation records one of the ordered English levels. The server permits
participating (`active` or `completed`) enrollments only when attendance exists
and the actual Present ratio meets the Course Run snapshot. Results soft-delete
on clear so history is retained.

### Imported evidence

Archive exposes workbook/import evidence without a freeze or cutover command.
Canonical operational English tables are writable through controlled commands;
raw rows, DQ records, and time-correction evidence retain database freeze
protection from the older archive mechanism.

## Migrations 047-050 reconciliation

Migration 047:

- adds course/run attendance ratio policy;
- adds transaction-local `eng_audit_events`;
- installs unique current-PIC and one-active-enrollment indexes;
- resolves only evidence-unambiguous duplicate active enrollments;
- removes whole-domain Archive freeze triggers from operational `eng_*` tables.

The operator cleanup soft-retires the superseded handoff projection: 5 generic
Programs, 11 Classes, 11 PIC Teams and 56 Team Enrollments. The source and
canonical English rows are preserved.

Migration 048 creates `eng_meetings`, backfills one Meeting for every imported
Session Unit, adds Meeting/Session-Unit integrity guards, and opens only the
source columns required for controlled live commands. It also preserves each
attendance row's original status and records the live actor separately. No raw
workbook row is edited.

Migration 049 adds nullable Google Calendar identity and Meet-link fields to
`eng_meetings`. It does not rewrite imported Meetings or attendance evidence.

Migration 050 preserves source start/duration on every imported Meeting, then
hands only future planned attendance-free occurrences to live operations. The
imported wall-clock value is reinterpreted as a real Asia/Ho_Chi_Minh instant,
the linked Session Unit is moved with it, and one domain-audit event is recorded
per handoff. Past Meetings and all imported attendance facts are untouched.

The reproducible importer is schema-aware. Before load it applies migration
047's evidence rule to source multi-active enrollments and aborts ambiguous or
unbalanced input. Inside the transaction it stages imported Meetings as
cancelled, loads their linked Session Units and original attendance status, and
reapplies the approved correction overlay. A fresh current-schema database
bootstraps that same deterministic overlay with correction evidence rather than
weakening the slot guard. The importer then opens final planned/completed states
and reproduces migration 050's source baseline, Vietnam instant, future handoff,
and domain audit. Any remaining collision rolls back the complete reset/import.

## Verification

- Unit: atomic class/PIC/run command, learner-start sequence and capacity
  guards, Meeting create/reschedule/durable-cancel, delivery notifications,
  full-roster save, stale token, route permission denial, and DTO ratio mapping.
- Client: PIC grouping, class detail roster, canonical Schedule/Attendance grid,
  imported wall-clock conversion, live Meeting instant/duration mapping,
  evidence filters, inline roster layout, query-tab breadcrumbs, empty-cell
  creation, and live Meeting move/cancel controls.
- Prototype: migrations 040–050 present; 27 canonical columns; 2 canonical
  unique indexes; `eng_audit_events`; no multi-active enrollment/current-PIC or
  Meeting-link/operational-baseline violations; 14 future imported Meetings are
  under live control; canonical writes are allowed while imported raw evidence
  remains guarded.
- Reconciliation: 52 classes, 52 current PIC assignments, 6 courses, 91 Course
  Runs, 552 Run Enrollments, 984 Meetings, 984 Session Units and 5,962
  attendance facts.
- Fresh-rebuild rehearsal: PostgreSQL 17 migrated 001–050; source counts above
  reproduced from checksum `9e514aea…3362`; 79 active and 13 waiting Run
  Enrollments; 180 open and 2 resolved DQ issues; zero multi-active, active-slot,
  or orphan violations. An induced slot collision preserved all pre-import rows
  and an exam-result sentinel, proving transaction rollback and reset FK order.

## Known next work

- Port learner transfer/leave intent commands and explicit capacity override.
- Add the authority model's optional second normal Session Unit and linked
  make-up replacement-credit workflow.
- Add assigned-Teacher resource scope before exposing canonical rosters or
  attendance mutations to Teacher role.
