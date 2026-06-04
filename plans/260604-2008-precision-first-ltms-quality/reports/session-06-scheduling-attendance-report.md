# Session 06 Report - Scheduling + Attendance

**Date:** 2026-06-04
**Verdict:** OK (no P0/P1; 1 test-coverage gap closed, 1 P2 promoted)
**Action:** added weekly-cap boundary race test; no code fix needed
**Status:** completed

## Goal

Are booking and attendance safe under races, cancellation, teacher scope, and
downstream reports?

## Scope

In: schedule booking/cancel, team/cohort sessions, attendance marking,
teacher-class scope, past-session preservation.
Out: generic scheduling Wave E design.

## Evidence

- Read: `scheduleService.js` (`assertValidBookingSlot`, `bookSlot`,
  `bookCohortSlot`, `cancelSlot`), `models/Schedule.js`, `policy/attendance.js`,
  `policy/classBinding.js`, `controllers/attendanceController.js`,
  `routes/attendanceRoutes.js`, `completion/use-cases.js` (+ repository).
- Tests inspected: `bookingRace`, `booking`, `scheduleAuthz`, `attendance`,
  `learningCompletionRoutes`.

## Scenario Verdicts

| Scenario | Verdict | Evidence |
|---|---|---|
| Concurrent same-slot → exactly one session | OK | `bookSlot` in `withTransaction` + collision check + **UNIQUE `{classId,startTime}`** backstop, E11000→409. Tested 2× and 3× concurrent (`bookingRace`). |
| Weekly cap cannot be bypassed by race | OK (test hardened) | Cap enforced by team-doc write-lock (`Team.findByIdAndUpdate` inside txn) serializing same-team bookings; `countDocuments >=2` rejects. Prior test only covered the *full* (count=2) boundary → **added a count=1 boundary race test**. |
| Past cancel cannot delete attendance | OK | `cancelSlot` rejects any session where `startTime <= now` (409) — PR6/DATA-005 fix. Past roll-call preserved. |
| Teacher cannot mark/view out-of-scope class | OK (mark/read-by-schedule) | `bulkMark` + `getAttendanceBySchedule` resolve class → `attendancePolicy` → `isTeacherOfClass` (class binding). Admin bypass. **Caveat:** `/user/:userId` + `analytics/by-*` are Teacher-broad → QB-007. |
| Attendance flows into completion/report | OK | `evaluateCompletion` reads `countAttendedSessions` → `attendancePercent` → `complete` + cert snapshot. Tested in `learningCompletionRoutes` (25% < 50% incomplete; threshold met → complete). |

## Test coverage gap closed

`bookingRace` "weekly cap" test booked 2 sequentially then raced 2 more — both
fail because the cap was *already full*, which passes regardless of whether the
serialization lock works. The real protection (team write-lock) was unverified.
Added `server/tests/integration/bookingRace.test.js`: from an empty week, 3
concurrent bookings on 3 distinct slots → exactly two 201, one 400, DB count 2.
This fails if the write-lock is ever removed (unique index won't catch
different-slot cap bypass). Suite: 4/4 pass.

## Observations promoted

- **QB-007 (P2):** Teacher attendance read scope. `GET /attendance/user/:userId`
  (Admin/Teacher → anyone) and `analytics/by-employee|team|class` (roleGuard
  Admin/Teacher, arbitrary `userId`/`classId`) are NOT limited to the teacher's
  bound classes — a teacher can read any employee's/class's attendance. Marking
  and per-schedule roster reads ARE class-scoped. Documented design intent
  (`SEC-IDOR-02` allows teacher org-wide analytics), so promoting rather than
  fixing; needs a product decision before scoping.

## Notes (by design — not findings)

- `classBinding` is "open until populated": empty `Class.teacherIds` =
  permissive. Out-of-scope attendance protection only becomes effective once
  admins backfill `teacherIds`. Intentional graceful migration (CLAUDE rule:
  preserve). Worth an ops backfill task, not a code change.
- `bookCohortSlot` (team-less self_enroll/nomination) shares the same unique
  index + collision guard; no per-team weekly cap by design.

## Verification

- `bookingRace` — 4/4 pass (incl. new count=1 cap boundary test).
- Scenarios 1/3/4/5 covered by existing green suites (`booking`,
  `scheduleAuthz`, `attendance`, `learningCompletionRoutes`).
- No production code changed this session (test-only) → no regression surface.

## Unresolved Questions

- None.
