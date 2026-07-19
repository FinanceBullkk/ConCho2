# English Training Integration — Phase 2 Plan (Sessions + Attendance)

- **Status:** 🟢 Implemented and verified on dev DB (2026-07-18)
- **Created:** 2026-07-18
- **Depends on:** Phase 1 commits `3ef3695`, `3247a77`, `6d79f96`, `3976355`
- **Source workbook:** `.tmp/Copy of ENGCLASS_MANA.xlsx` (known checksum prefix
  `9e514aea2350fa33`; discovery report:
  [`reports/eng-phase2-discovery-260718.md`](reports/eng-phase2-discovery-260718.md))
- **Known scale:** `CLASS_SESSIONS` 984 rows · `ATTENDANCE` 5,996 rows ·
  `Attendance_Dropped` 48 rows

## 1. Outcome

Replace the next spreadsheet loop with one complete, reviewable slice:

1. preserve every historical English session and attendance row;
2. attach each record to the Phase-1 Course Run and Run Enrollment spine;
3. let Admin/Coordinator inspect run sessions, learner attendance, and data issues;
4. calculate absence eligibility from the snapshotted run policy;
5. keep the English history separate from ConCho2's legacy schedule/attendance
   tables until an explicit convergence decision is made.

This phase is historical import + operations visibility. It does **not** yet make
the English module the live attendance-entry system for Teachers.

## 2. Why this slice is next

Phase 1 established the only safe foreign keys for attendance:

`Employee → Cohort → Course Run → Run Enrollment`

The remaining workbook volume is dominated by sessions and attendance. Importing
evaluation or completion first would calculate outcomes without a trustworthy
attendance denominator. The business rule already confirmed in Phase 1 is
absolute: **absence count greater than 2 means not eligible**, snapshotted per run
as `max_absences_allowed_snapshot`.

## 3. Discovery gate — mandatory before migration design

Run a read-only workbook profiler and record its output under `plans/reports/`.
No schema or importer is implemented until these facts are measured:

- exact headers, types, formulas, and meaningful-row counts for
  `CLASS_SESSIONS`, `ATTENDANCE`, `Attendance_Dropped`, and the
  `ATTENDANCE_GRID/INPUT` helper sheets;
- candidate natural keys and duplicate counts;
- distinct attendance statuses, blanks, and spelling variants;
- percentage of session rows resolvable to `(class_code, course_name)` and a
  Phase-1 Course Run;
- percentage of attendance rows resolvable to both a session and Run Enrollment;
- whether one curriculum unit can have several actual meetings (make-up or
  reschedule), and whether the workbook stores that relationship explicitly;
- how late/excused/make-up records affect the absence count;
- date/time timezone, serial-date behavior, cancelled rows, and sessions outside
  run start/end dates;
- whether `Attendance_Dropped` is additional evidence, a correction ledger, or a
  duplicate view of rows already in `ATTENDANCE`.

The profiler must not edit the workbook. Its reconciliation equations and sample
anomalies become fixtures for import tests.

## 4. Implemented domain grain (locked by discovery)

Do not reuse `schedules` or `attendances`. Those tables are keyed to ConCho2 login
users and booking schedules; imported English employees do not require accounts,
and the workbook's Course Run grain is independent.

### 4.1 Candidate tables

| Table | One row means | Required constraints |
|---|---|---|
| `eng_session_units` | One numbered occurrence in one Course Run | FK run; unique `(course_run_id, session_number)`; `session_number >= 1` |
| `eng_attendance_records` | One Run Enrollment's attendance result at one session | FK enrollment + session; unique `(session_unit_id, run_enrollment_id)`; controlled status |

Profiling proved a strict one-row-per-number relationship and no separate meeting
identity. A speculative `eng_meetings` table was therefore not added.

### 4.2 Candidate attendance statuses

Canonical status is CHECK-constrained to `present | absent`, the only two values
present in the normalized source. Unsupported future values become DQ issues.

### 4.3 Eligibility projection

For each Run Enrollment:

- `absence_count` is derived from canonical attendance records according to the
  status policy locked after profiling;
- `allowed_absences` comes from
  `eng_course_runs.max_absences_allowed_snapshot`;
- `eligible = absence_count <= allowed_absences`;
- incomplete/unresolved attendance produces `eligibility_status = unknown`, not a
  guessed pass/fail.

Eligibility is a projection, not a mutable truth column in this phase.

## 5. Lossless import and reconciliation

Extend the existing stage → normalize → load → reconcile pipeline:

1. **Stage:** append every meaningful row with workbook checksum, sheet, source
   row, raw payload, and row hash.
2. **Normalize sessions:** resolve Course Run, parse unit/date/time/status, and
   retain the source key.
3. **Load sessions:** insert units then meetings inside transactions.
4. **Normalize attendance:** resolve meeting + Run Enrollment and map status.
5. **Load attendance:** insert records; never silently overwrite duplicates.
6. **Reconcile:** for every source sheet,
   `meaningful source rows = loaded + issue + ignored-by-explicit-rule`.

Re-import must be idempotent. Phase-1 employee correction overlays must remain
untouched and continue to apply.

### Data-quality issue codes to prove with fixtures

- `session_run_unresolved`
- `session_duplicate_source_key`
- `session_time_invalid`
- `session_outside_run_window`
- `session_unit_out_of_range`
- `attendance_meeting_unresolved`
- `attendance_employee_unresolved`
- `attendance_enrollment_unresolved`
- `attendance_duplicate`
- `attendance_status_unknown`
- `attendance_dropped_unresolved`

Names may be refined after profiling, but every anomaly class must remain visible
through the existing DQ summary/drill-down.

## 6. Backend read contracts

Keep the module mounted behind `ENGLISH_TRAINING_ENABLED` and reuse the Phase-1
Admin/Coordinator + `report.read` gate.

- `GET /api/english-training/sessions` — searchable session list and counts.
- `GET /api/english-training/sessions/:id/attendance` — roster projection with
  canonical status plus explicit `unmarked` rows.
- `GET /api/english-training/eligibility` — searchable per-enrollment absence
  count, allowed threshold, and eligibility state.

No generic table CRUD. Any later correction write must use a targeted overlay,
reason, actor attribution, resolution state, and audit, matching migration 037.

## 7. Frontend vertical slice

Extend the existing `/english-training` operations view rather than creating a
second English admin area:

1. Sessions tab shows session units and present/absent counts.
2. Selecting a session shows the enrollment roster and marks missing evidence as `unmarked`.
3. Eligibility view shows absence count versus allowed count and clearly marks
   unresolved data as `Unknown`.
4. New DQ issue codes use the existing issue drill-down.

All new strings go through `t()` and `client/src/i18n/locales/en.json`.

## 8. Authorization, audit, and data safety

- Imported history reads: Admin/Coordinator + `report.read`.
- Import: script/ops path only; never a public HTTP upload in this phase.
- No Teacher mutation until teacher identity, Course Run assignment, and a valid
  edit-time policy for historical rows are explicitly designed.
- Raw workbook rows remain append-only evidence.
- Import transactions must roll back the affected phase on reconciliation failure.
- Never run destructive integration tests against the dev login database.

## 9. Test contract

Use a disposable Postgres database and a small workbook fixture covering:

- happy-path session + attendance import;
- permission denial for Participant/Teacher reads;
- duplicate source row and unknown status;
- unresolved employee, run, meeting, and enrollment;
- a learner who joined after unit 1;
- cancelled/rescheduled or multiple-meeting behavior discovered in the workbook;
- eligibility at 2 absences (eligible) and 3 absences (not eligible);
- unresolved attendance yields unknown eligibility;
- same-checksum re-import adds zero duplicates;
- reconciliation balances for every included sheet;
- transaction rollback leaves no partial meetings/attendance.

Client tests cover Course Run → Meeting → Attendance navigation, eligibility
states, loading/error/empty states, and hidden access for unauthorized roles.

## 10. Definition of Done

- Discovery report locks source keys, status mapping, Unit/Meeting cardinality,
  dropped-row semantics, and absence policy.
- In-chain migration is reversible and constraints are verified on disposable PG.
- Real workbook reconciles exactly; no source row disappears.
- Backend contracts, role/capability denial, audit behavior, and edge cases pass.
- Admin/Coordinator can inspect sessions, attendance, and eligibility in the UI.
- DQ anomalies drill down to actionable source evidence.
- Client lint/build and targeted tests pass.
- Capability spec, route matrix, system map, and living tracker are updated.
- Manual smoke flow and real import counts are recorded.

## 11. Explicit non-goals

- Evaluation/levels/placement/certificates.
- Live Teacher attendance entry or offline PWA integration.
- Calendar invitations, notifications, room booking, trainer scheduling.
- Generic edits of imported history.
- Automatic convergence with legacy `schedules`/`attendances`.
- Make-up credit accounting until the workbook proves its source semantics.

## 12. Implementation order

1. Profile the four attendance/session source areas and publish the discovery report.
2. Lock source keys, mappings, Unit/Meeting cardinality, and absence semantics.
3. Add migration and pure transform fixtures.
4. Extend staging/import/reconciliation and run on disposable PG.
5. Add task-oriented reads and authz tests.
6. Wire Course Run/session/attendance/eligibility UI.
7. Import the real workbook to dev, verify counts, and inspect DQ issues with owner. ✅
8. Update specs/maps/tracker, then commit Phase 2 as independently reviewable slices. ✅

## 13. Verification record

Migration `038` is applied to the same dev PostgreSQL database used by the app.
The real import reconciled in 5.3 seconds after batching database writes:
984 sessions, 5,962 attendance records, 182 total open DQ issues, and 7,989 raw
source rows. Authenticated API smoke verified session and eligibility projections.
