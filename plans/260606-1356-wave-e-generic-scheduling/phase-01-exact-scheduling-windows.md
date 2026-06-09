---
phase: 1
title: "E1 Exact Scheduling Windows and Compatibility Baseline"
status: backend-done-client-pending
priority: P1
effort: 5d
dependencies: []
---

> **Progress (2026-06-08):** Backend slice shipped in commit `02d3ce3` — shared
> `scheduling-window-policy`, all four mutation paths validated (incl. Admin
> move), settings-on-write validation, and `GET /api/learning/sessions/config`.
> Folded into `docs/specs/scheduling-and-booking`.
>
> **Client slice (steps 5–9 below) SUPERSEDED (2026-06-09)** → executed in
> `plans/260609-0146-booking-ui-loop/phase-03-exact-slot-grid-wave-e1.md`, where
> it is absorbed alongside the Pass C schedulingMode-awareness so the booking
> grid is refactored once. The step detail below remains the authoritative spec
> for that work (Phase 3 references it). Wave E **E2** (capacity) is blocked until
> that Phase 3 ships.

# Phase 1: Exact Scheduling Windows

## Goal

Make `ALLOWED_TIME_SLOTS` authoritative end-to-end. Support exact minutes and
duration without schema migration or scheduling-semantic change.

## Requirements

- Add authenticated read-only `GET /api/learning/sessions/config`.
- Return only `{ timezone, utcOffsetMinutes, weeklyTeamLimit, slots[] }`.
- Slot DTO: `{ id, label, startHour, startMinute, endHour, endMinute,
  durationMinutes }`; canonical ID `HH:mm-HH:mm`.
- Central policy validates numeric, unique, non-overlapping, same-day positive
  windows and returns them in stable start-time order.
- Reuse policy for legacy leader booking, Learning group/cohort booking, Admin
  create, and time-changing Admin update.
- Empty/malformed config disables new/moved bookings; history still renders.
- Calendar rows use exact descriptors, not integer hours.
- Participant submits exact configured end; remove `hour + 1`
  (`client/src/pages/BookClassPage.jsx:260`).
- Availability uses selected Team's Class, matching server Class-scoped
  collision (`server/services/scheduleService.js:271`).
- Historical/imported off-policy rows visible, labelled read-only, not bookable.
- Non-time edit of off-policy Schedule remains allowed.
- New strings use `client/src/i18n/locales/en.json` and `t()`.

## Data Flow

1. `Setting.ALLOWED_TIME_SLOTS` enters one scheduling-window policy.
2. Policy normalizes descriptors in `Asia/Ho_Chi_Minh`
   (`server/helpers/dayjsConfig.js:23`) and validates writes.
3. Config endpoint emits safe DTO to React Query.
4. Client merges configured rows with rows derived from visible Schedules;
   unmatched rows become `bookable:false`.
5. Date + descriptor transforms to exact UTC ISO start/end.
6. Existing mutation enters policy, then unchanged transaction/collision path.
7. Unchanged Schedule exits to both APIs, Calendar/email, attendance,
   completion, and reminders.

## Mutation Trace

- Legacy leader: `server/routes/scheduleRoutes.js:27` ->
  `server/controllers/scheduleController.js:16` ->
  `server/services/scheduleService.js:223`.
- Learning modes: `server/domains/learning/routes.js:76` ->
  `server/domains/learning/session/use-cases.js:148` -> service lines 107/138.
- Admin create: `server/routes/scheduleRoutes.js:34` ->
  `server/services/scheduleService.js:621`.
- Admin update: `server/routes/scheduleRoutes.js:38` ->
  `server/controllers/scheduleController.js:149` ->
  `server/domains/schedule/use-cases.js:41`.
- Historical import intentionally bypasses policy:
  `server/controllers/importController.js:55`.

## Preserved Invariants

- Team lock/weekly cap: `server/services/scheduleService.js:235`.
- Overlap + unique fallback: `server/services/scheduleService.js:271`,
  `server/models/Schedule.js:127`.
- Four modes: `server/domains/learning/session/use-cases.js:65`.
- Roster/future Team sync: `server/models/Schedule.js:62`,
  `server/models/Team.js:119`.
- Attendance allowlist: `server/services/attendanceService.js:61`.
- Completion denominator: `server/domains/learning/completion/repository.js:41`.
- Calendar after commit/fail-soft: `server/services/scheduleService.js:314`.
- Reminder idempotency: `server/services/reminderService.js:81`.

## Files

Create:

- `server/domains/schedule/scheduling-window-policy.js`
- `server/tests/unit/scheduling-window-policy.test.js`
- `client/src/hooks/useSchedulingConfig.js`
- `client/src/lib/scheduling-slots.js`
- Focused client tests for helpers, grid, booking, Admin create/move.

Modify:

- Server: `server/domains/learning/routes.js`,
  `server/domains/learning/session/controller.js`,
  `server/services/scheduleService.js`,
  `server/domains/schedule/use-cases.js`,
  `server/controllers/settingController.js`.
- Client: `client/src/api/api.js`, `client/src/hooks/queryKeys.js`,
  `client/src/components/CalendarGrid.jsx`,
  `client/src/components/ScheduleDrawer.jsx`,
  `client/src/pages/BookClassPage.jsx`, `client/src/pages/SchedulesPage.jsx`,
  `client/src/pages/AttendancePage.jsx`, `client/src/pages/CourseManager.jsx`,
  `client/src/i18n/locales/en.json`.
- Tests: `booking.test.js`, `bookingRace.test.js`,
  `learningSessionRoutes.test.js`, `settings.test.js`, `attendance.test.js`.

Delete after all three callers migrate:

- `client/src/hooks/useTimeSlots.js`

## Implementation Steps

1. Tests first: policy, config auth/DTO, 90-minute/minute-offset windows,
   Admin update, off-policy non-time edit.
2. Extract shared policy; use it in all four mutation paths and settings update.
3. Admin update validates effective window only when start/end changes.
4. Add protected config route before `/sessions/:id`; keep `/api/settings`
   Admin-only.
5. Add API/query hook and timezone-safe client helpers. No booking fallback.
6. Refactor `CalendarGrid` to descriptors; row key includes exact start+end.
7. Migrate Book/Schedules/Attendance; merge configured + off-policy rows.
8. Scope availability by selected `classId`.
9. Restrict Admin create/move to date + configured slot; update CourseManager.
10. Add i18n; run focused/full tests, syntax, client build/lint, manual smoke.

## Test Matrix

| Layer | Required cases |
|---|---|
| Unit | malformed/empty/duplicate/overlap; stable ordering; duration; minute offset; timezone key; off-policy row |
| Integration | config 200 all roles/401 anonymous; Settings remains 403; legacy + Learning exact booking; Admin create/update; four modes |
| Race | same Class overlap 409; another Class allowed; identical slot one success; weekly cap stays two |
| Regression | roster, attendance, completion, audit, reminder claim unchanged |
| Client | exact label/payload; scoped availability; config failure; historical row; Admin create/move |
| Smoke | defaults; 09:15-10:45; off-policy visibility; Calendar/email fail-soft |

## Risks And Security

| Risk | Likelihood x impact | Mitigation |
|---|---|---|
| Wrong timezone ISO | Medium x High | Explicit timezone/offset; pure helper tests |
| Same-hour row collision | High x High | Exact start+end IDs; multi-row test |
| Config leaks settings | Low x High | Explicit DTO, never Setting docs |
| Missing config creates fake slots | Medium x High | Fail closed, disable writes |
| Race regression | Low x Critical | Preserve transaction/index; race tests |
| History hidden | Medium x High | Derived read-only rows |

Config GET uses `protect`. Writes retain CSRF, global/booking rate limits,
role/capability/resource checks, and current audit controllers.

## Acceptance Criteria

- [ ] Config safe for all authenticated roles; anonymous denied.
- [ ] Default five one-hour slots unchanged.
- [ ] 90-minute and minute-offset windows exact through both APIs.
- [ ] Duplicate or overlapping configured windows are rejected.
- [ ] Invalid new/moved windows fail consistently.
- [ ] Off-policy visible; non-time edit allowed; time move denied.
- [ ] Collision/weekly race guarantees unchanged.
- [ ] Attendance/completion/roster fixtures unchanged.
- [ ] Tests, syntax, build, lint, smoke pass.

## Rollback

Revert E1 code. No data/index migration. On config failure keep history visible,
disable writes, rollback; stored timestamps remain valid.

## Unresolved Questions

None blocking E1. Retain current global Vietnam window scope.
