# ADR: ConMeoGauGau owns English business semantics

## Status

Accepted (2026-07-20). Supersedes
[`english-live-converge.md`](english-live-converge.md).

Authority snapshot: `kyphucclv/ConMeoGauGau` commit
`4107cd52ee905e87254e099da23cb58dcbdd82a9`, especially
`CONTEXT.md`, `DATA_DICTIONARY.md`, `services/class_schedule.py`, and
`docs/adr/0001-english-domain-authority-for-concho2-integration.md`.

## Context

The first in-app convergence mapped an active English Course Run to a generic
Program/Class and converted its PIC into a run-scoped Team leader. That mapping
lost three load-bearing meanings:

- a Class/Cohort is a stable `class_code` that can take several courses;
- PIC is a dated ownership assignment and may be an employee or a normalized
  team label; it is not learner identity, teacher assignment, or roster Team;
- Run Enrollment belongs to one Course Run and is separate from continuous
  Cohort Membership.

The handoff created 5 generic Programs, 11 Classes, 11 PIC Teams and 56 Team
Enrollments. They were reversible projections, not new source evidence.

## Decision

English remains a dedicated workspace and a module inside the ConCho2 modular
monolith, but its operational aggregate is the canonical English model:

| Business concept | Canonical home |
|---|---|
| Employee | `eng_employees`, keyed by normalized `emp_code`; optional User crosswalk |
| Stable class | `eng_cohorts`, keyed by immutable `class_code` |
| PIC ownership period | `eng_cohort_pic`; employee or normalized label |
| Continuous class membership | `eng_cohort_memberships` |
| Course delivery | `eng_course_runs`; one course occurrence for one stable class |
| Delivery roster | `eng_run_enrollments` |
| Credited session | `eng_session_units` |
| Attendance fact | `eng_attendance_records`; Present or Absent |
| Final result | `eng_exam_results`; categorical level |
| Source evidence | `raw_eng_workbook_rows` and import/correction evidence |

The generic Program/Class/Team/Enrollment tables do not own English semantics.
Shared platform services may be consumed behind intent-level adapters where
their contract fits (authentication, capability checks, Room availability,
notifications), but English business entities are not flattened into similarly
named generic rows.

### Invariants

- At most one current PIC assignment per stable class.
- At most one active Run Enrollment per employee across English.
- Class creation is one transaction: stable class + current PIC + first Course
  Run + domain audit. Partial creation rolls back.
- PIC label normalization collapses repeated whitespace and preserves chosen
  display casing. A label is never guessed into an employee identity.
- Course Run snapshots `expected_units` and the attendance threshold. The
  canonical default threshold is `0.800`; exam eligibility uses the snapshot,
  not the superseded blanket “at most two absences” rule.
- Imported raw rows remain evidence. Operational canonical rows may evolve only
  through authorized, validated, audited commands.

### Correction of the superseded handoff

Migration 047 adds canonical ratio policy, domain-local transactional audit,
current-PIC and one-active-enrollment database guards. It reconciles only the
two unambiguous multi-active conflicts: the enrollment with attendance remains
active; the no-attendance competitor remains as `waiting`, its derived
membership is cancelled, and the DQ issue is resolved with an audit trail.

The cleanup command soft-retires the 5/11/11 generic Program/Class/Team rows and
closes all 56 generated Team Enrollments as `Transferred`. No historical source
row is deleted.

## Consequences

- Classes are displayed under their current PIC; opening a class shows all
  Course Runs and each Run's canonical roster.
- Schedule, attendance, and evaluation read the English domain directly. The
  generic live/archive switch and active-handoff/cutover commands are removed.
- Raw workbook evidence remains read-only in Archive; `eng_*` is no longer
  frozen wholesale because it is the operational English module.
- Meeting-versus-Session-Unit separation and transactional full-roster
  attendance write remain the next canonical ports. Until those commands ship,
  imported schedule/attendance evidence is explicitly read-only in the UI.

## Guardrails

Preserve capability authorization, validation, transactional domain audit,
source evidence, and reversible retirement. Do not mechanically reuse a generic
entity because its name resembles an English concept.
