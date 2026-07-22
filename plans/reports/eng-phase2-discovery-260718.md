# English Training — Phase-2 Workbook Discovery

- Workbook: `.tmp/Copy of ENGCLASS_MANA.xlsx`
- Checksum prefix: `9e514aea2350fa33`
- Method: read-only profiling with the repository's ExcelJS dependency
- Date: 2026-07-18

## Locked source model

`CLASS_SESSIONS` is the canonical session source: 984 meaningful rows, 51
classes, 6 courses, session numbers 1–21, and 984 distinct natural keys
`(class code, course name, session number)`. No duplicate session keys exist.
The source proves one occurrence per numbered unit, so Phase 2 uses one
`eng_session_units` table and does not introduce a speculative meetings table.

`ATTENDANCE` is the canonical normalized attendance source: 5,996 meaningful
rows with only `Present` (5,172) and `Absent` (824). All rows resolve to a Phase-1
Course Run, Run Enrollment, employee, and session. They collapse to 5,962
canonical `(session, enrollment)` records plus 34 duplicate source rows; profiling
found no conflicting duplicate status/date pairs.

`ATTENDANCE_GRID` and `ATTENDANCE_INPUT` are derived/wide helper views.
`Attendance_Dropped` is a 48-row manual report of learners cut from the wide
input so they do not affect its rate. It is not additional canonical attendance.
The normalized `ATTENDANCE` sheet already preserves dropped-enrollment evidence.

## Mapping and anomalies

- `CLASS_SESSIONS.Date` is authoritative. Its Excel values are timezone-free
  Vietnam wall clocks: the ISO-looking value emitted by ExcelJS preserves the
  clock components but is not a UTC instant. Archive UIs must reinterpret that
  value as `Asia/Ho_Chi_Minh` before using the shared UTC scheduling grid, or a
  second `+07:00` conversion will turn 10:00 into 17:00. Attendance source dates
  are retained in metadata when they differ.
- 54 attendance rows have a date different from the canonical session date;
  all are retained and flagged `attendance_date_mismatch`.
- 573 attendance rows carry `Dropped Enrollment = Yes`; this is evidence, not a
  reason to delete the attendance record.
- 58 session units exceed the Phase-1 expected-unit snapshot. They are retained
  and flagged `session_unit_out_of_range`.
- 62 canonical sessions have no attendance yet, including future sessions; they
  remain valid scheduled sessions.
- Eligibility counts only canonical `absent` records and compares them with the
  Course Run's snapshotted maximum (2 in the reference workbook).

## Reconciliation lock

`CLASS_SESSIONS: 984 = 984 loaded`

`ATTENDANCE: 5,996 = 5,962 loaded + 34 explicitly ignored duplicate rows`

Every meaningful source row remains in append-only raw staging regardless of
whether it becomes a canonical row or a DQ issue.
