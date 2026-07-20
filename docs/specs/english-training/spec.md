---
capability: english-training
status: evolving
owners: [domains/english-training]
last_updated: 2026-07-20
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
  - server/domains/english-training/canonical-operations.js
  - server/domains/english-training/reads.pg.js
  - server/domains/english-training/evaluation.js
  - client/src/features/english-operations/ClassesPanel.jsx
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

### Schedule and attendance evidence

Schedule and Attendance render the canonical `eng_session_units` and
`eng_attendance_records` projections on the weekly grids. Imported rows are
explicitly read-only. There is no generic live/archive source toggle.

The next write slice must port the authority model's separate Meeting entity,
one-or-two credited Session Units per Meeting, event-time roster applicability,
and one atomic full-roster attendance save with a stale-write token.

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

## Migration 047 reconciliation

Migration 047:

- adds course/run attendance ratio policy;
- adds transaction-local `eng_audit_events`;
- installs unique current-PIC and one-active-enrollment indexes;
- resolves only evidence-unambiguous duplicate active enrollments;
- removes whole-domain Archive freeze triggers from operational `eng_*` tables.

The operator cleanup soft-retires the superseded handoff projection: 5 generic
Programs, 11 Classes, 11 PIC Teams and 56 Team Enrollments. The source and
canonical English rows are preserved.

## Verification

- Unit: atomic class/PIC/run command, missing-PIC rejection, route permission
  denial, DTO ratio mapping.
- Client: PIC grouping, class detail roster, canonical Schedule/Attendance grid.
- Prototype: migrations 040–047 present; 2 canonical unique indexes;
  `eng_audit_events`; no multi-active enrollment/current-PIC violations;
  canonical writes allowed while imported raw evidence remains guarded.
- Reconciliation: 52 classes, 52 current PIC assignments, 6 courses, 91 Course
  Runs, 552 Run Enrollments, 984 Session Units and 5,962 attendance facts.

## Known next work

- Add canonical Meeting and full-roster attendance commands.
- Port learner start/transfer/leave intent commands, including capacity override
  and event-time start-session calculation.
- Add assigned-Teacher resource scope before exposing canonical rosters or
  attendance mutations to Teacher role.
