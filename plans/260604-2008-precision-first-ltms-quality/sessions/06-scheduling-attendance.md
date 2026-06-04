# Session 06 - Scheduling + Attendance

## Goal

Answer: are booking and attendance safe under races, cancellation, teacher
scope, and downstream reports?

## Scope

In: schedule booking/cancel, team/cohort sessions, attendance marking,
teacher-class scope, past-session preservation.

Out: generic scheduling Wave E design.

## Required Evidence

- `server/services/scheduleService.js`
- schedule and attendance routes/controllers/policies.
- Schedule, Attendance, Team, Enrollment models.
- booking race, schedule authz, attendance tests.

## Required Scenarios

- Concurrent same-slot booking creates exactly one session.
- Weekly cap cannot be bypassed by race.
- Past cancel cannot delete attendance history.
- Teacher cannot mark or view out-of-scope class attendance.
- Attendance changes flow into completion/report data.

## Verification

- booking, bookingRace, scheduleAuthz, attendance suites.
- one downstream completion/report focused assertion if current tests lack it.

## Unresolved Questions

- None.

