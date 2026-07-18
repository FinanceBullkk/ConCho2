---
capability: english-training
status: evolving                        # Phase 1: identity + structure only (no attendance/eval yet)
owners: [domains/english-training]
last_updated: 2026-07-18
related_plans: [plans/english-integration-phase-1.md]
related_code:
  - server/db/pg/migrations/036_english_training.js
  - server/db/pg/migrations/037_english_training_corrections.js
  - server/domains/english-training/routes.js
  - server/domains/english-training/reads.pg.js
  - server/domains/english-training/import/pipeline.js
  - server/scripts/eng-import.js
---

# Capability: English Training (Phase 1 — Identity & Structure)

> **Source of truth for BEHAVIOR.** Describes what the English-training domain
> does *today*. Business authority for the model is `kyphucclv/ConMeoGauGau`
> (ADR: that repo's `docs/adr/0001-...`). ConCho2 is the host platform.

## Purpose

Bring the English-class business into ConCho2 as a canonical domain with correct
entity grain, so later phases (attendance, make-up, evaluation, completion) attach
to a trustworthy spine. Phase 1 covers **identity + learning structure** and a
**lossless import** of the real workbook. It does NOT collapse ConCho2's existing
`classes/enrollments/attendances` into English concepts — it adds new `eng_*`
tables whose row-meanings match the English model.

## Business Requirements (BR)

- **BR-1:** An employee's English-training identity is stable across time and is
  keyed by `emp_code`, independent of whether they have a login account.
- **BR-2:** A stable learning group (Cohort) can study many courses over time; a
  repeat of the same course is a distinct delivery (Course Run), never overwriting.
- **BR-3:** Historical data must migrate with **no silent loss** — every source
  row ends loaded, staged, or recorded as a data-quality issue.
- **BR-4:** Employment status (left the company) is separate from course-lifecycle
  status (finished/stopped a course).

## Actors & Use Cases (UC)

- **UC-1 (Admin/L&D — import):** run `scripts/eng-import.js <workbook>` → the six
  Phase-1 sheets are staged, transformed, loaded into `eng_*`, and reconciled;
  anomalies land in `eng_data_quality_issues`.
- **UC-2 (Admin/Coordinator — review):** call `/api/english-training/*` read
  endpoints to inspect cohorts, courses, course runs, employees, and the DQ issue
  summary through the ConCho2 shell (login + roles reused).
- **UC-3 (Admin/Coordinator — correct):** resolve missing employee BU/job role
  through a controlled correction overlay; raw workbook rows remain immutable.

## Entities

Canonical `eng_*` tables (migration 036). One row means:
- **eng_employees** — one English-training employee; `emp_code` unique
  (case-insensitive); `employment_status ∈ {active,inactive,unknown}`; nullable
  `user_id` crosswalk to `users` (no account required in Phase 1).
- **eng_cohorts** — one stable group (`class_code` unique).
- **eng_cohort_memberships** — one employee's membership period in one cohort;
  ≤1 active per (cohort, employee) (partial unique).
- **eng_courses** — one reusable course; `course_code` unique (generated slug);
  `expected_units`, `max_absences_allowed` (default 2).
- **eng_course_runs** — one delivery of one course to one cohort; unique
  `(cohort_id, course_id, run_number)`; policy snapshotted per run.
- **eng_run_enrollments** — one employee in one course run;
  `status ∈ {active,waiting,completed,transferred,dropped,cancelled}`;
  org snapshot immutable.
- **eng_cohort_pic** — one PIC assignment (employee ref OR free-text label).
- Support: **raw_eng_workbook_rows** (append-only staging),
  **eng_data_quality_issues** (durable issue log).
- Correction support (migration 037): **eng_employee_corrections** (current
  overlay keyed by stable `emp_code`) and **eng_employee_correction_history**
  (append-only before/after/reason/actor history). DQ issues carry
  `open/resolved/accepted` status.

## Functional Requirements (FR)

### Requirement: Stable employee identity by emp_code [BR-1]

The system MUST key each English employee by a normalized `emp_code` and MUST NOT
require a login account.

#### Scenario: import normalizes Excel-float codes
- **GIVEN** a source `Emp Code` stored as `237050.0`
- **WHEN** the import runs
- **THEN** one `eng_employees` row exists with `emp_code = '237050'` and `user_id = NULL`.

#### Scenario: duplicate emp_code rejected
- **GIVEN** an existing employee `237050`
- **WHEN** a second row with the same code is inserted
- **THEN** the case-insensitive unique index rejects it.

### Requirement: Cohort takes many courses; repeats are new runs [BR-2]

The system MUST model a Course Run as `(cohort, course, run_number)` and MUST allow
a cohort to hold runs of several different courses.

#### Scenario: one cohort, several courses
- **GIVEN** cohort `EL001` with rows for Business English, Communication 1, and Communication 2
- **WHEN** the import runs
- **THEN** `EL001` has three course runs, each `run_number = 1`.

### Requirement: Employment vs course status separated [BR-4]

The system MUST set `employment_status = inactive` only when the source
`Drop reason = 'Resign'`; all other drop reasons keep `active`.

#### Scenario: course drop is not resignation
- **GIVEN** a learner with `Drop reason = 'High workload'`
- **WHEN** the import runs
- **THEN** their `employment_status = active` and the course outcome is on the enrollment, not the employee.

### Requirement: Lossless import with reconciliation [BR-3]

The system MUST satisfy `source rows = loaded + issues` per sheet and MUST record
every anomaly instead of dropping it.

#### Scenario: reconciliation balances
- **WHEN** the reference workbook imports
- **THEN** STUDENTS 308→308, COURSE_PLAN 6→6, CLASSES 91→91, ENROLLMENTS 552→552,
  PIC 52→52, and issues (resign, missing BU/ROLE, multi-active, missing start,
  cohort-without-run) are recorded in `eng_data_quality_issues`.

#### Scenario: re-run is idempotent (staging)
- **GIVEN** a workbook already staged
- **WHEN** the import re-runs with the same checksum
- **THEN** `raw_eng_workbook_rows` gains no duplicate rows.

### Requirement: Read projections are role-gated [UC-2]

Read endpoints MUST require an authenticated Admin or Coordinator and MUST expose
task-oriented projections, not raw table dumps.

#### Scenario: learner cannot read
- **GIVEN** a Participant session
- **WHEN** they call `GET /api/english-training/cohorts`
- **THEN** the response is `403`.

### Requirement: Missing employee org data can be corrected safely [UC-3]

The system MUST preserve raw workbook evidence, persist corrections by stable
employee code, backfill only `unknown` enrollment snapshots, resolve matching DQ
issues, and retain correction history plus the global audit entry.

#### Scenario: correct missing BU and role
- **GIVEN** an imported employee with `missing_bu` and `missing_role` issues
- **WHEN** an Admin or Coordinator submits BU, job role, and a reason
- **THEN** the overlay and history are written, unknown snapshots are backfilled,
  both issues become resolved, and the mutation is audited.

#### Scenario: correction survives re-import
- **GIVEN** a persisted correction overlay
- **WHEN** the canonical workbook data is reset and imported again
- **THEN** the overlay is re-applied and the regenerated matching issues are
  immediately resolved without modifying `raw_eng_workbook_rows`.

## Non-Functional Requirements (NFR)

- **NFR-1:** DB constraints enforce the grain (unique emp_code, class_code,
  course_code, `(cohort,course,run_number)`; FK integrity across all tables).
- **NFR-2:** Production ships dark unless `ENGLISH_TRAINING_ENABLED=true`; local
  development enables the module so an imported dev DB is inspectable.
- **NFR-3:** Import runs against a disposable/prototype DB during development; it is
  never pointed at an unknown database.

## Acceptance Criteria (AC)

- **AC-1:** Migration 036 creates the 9 tables with inline FK/CHECK/UNIQUE; `up`/`down` reversible.
- **AC-2:** Reference import reconciles exactly (no dropped row) and records the expected DQ issues.
- **AC-3:** Transform mappings unit-tested (`tests/unit/english-training-transform.test.js`).
- **AC-4:** Read endpoints return the documented shapes and enforce Admin/Coordinator.
- **AC-5:** Migration 037 adds correction overlay/history and DQ resolution state;
  correction writes are validated, capability-gated, audited, and re-import-safe.

## Out of Scope (Phase 1 — why "evolving")

Attendance, session units, meetings, make-up credit, evaluations/versions,
placement, exam eligibility, completion, transfer command, full org-history model,
login-account creation, and generic HTTP write commands beyond the targeted
missing-BU/job-role correction overlay. The **one-active-enrollment**
rule is intentionally a **soft/reporting rule** (not a DB guard): real data has
legitimate concurrent enrollment, flagged via `multi_active_enrollment` for review.
