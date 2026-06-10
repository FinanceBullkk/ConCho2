---
phase: 3
title: Session Instructors (override-or-inherit, UNION authz)
status: pending
priority: medium
effort: 3.5–4.5 dev-days
depends_on: [1]
---

# Phase 3 — Session Instructors

## Context Links
- Overview: `./plan.md`; foundation: `./phase-01-foundation-session-types-and-data-model.md`.
- Source design: "Session Instructors" subsystem + its critique (B1–B3, M1–M5, m1–m5).
- Reuses `policy/classBinding.isTeacherOfClass`; spec: `docs/specs/attendance/spec.md` (UNION delta) +
  `docs/specs/scheduling-and-booking/spec.md`.

## Overview
- **Priority:** medium (independent of Phase 2; can run in parallel with file-ownership split).
- **Status:** pending.
- **Description:** A `Schedule` may carry per-session instructors that **override-or-inherit**
  `Class.teacherIds` (`effective = sessionInstructorIds ?? Class.teacherIds`). Attendance + visibility
  authz = **UNION** (cohort teacher never loses access; named session instructor gains single-session
  access). Calendar attendees include effective instructors. No learner field feeds learner gating.

## Key Insights (from critique — folded in)
- **B1 (instructors):** the three read paths disagree on empty `teacherIds` today
  (`helpers/teacher-class-scope.js` + `repository.js:67` permissive; `session/repository.js:48` +
  `session/use-cases.js:61` restrictive). Routing `getSession` through the permissive `canAccessSession`
  would **silently flip `/api/learning/sessions/:id` restrictive→permissive**. **Decision:** keep
  session-read RESTRICTIVE — implement as `existingRestrictiveCohortCheck(actor, class) OR
  isSessionInstructor(actor, schedule)`, NOT a blanket route through `canAccessSession`. Add per-path
  empty-binding tests so the flip can't hide.
- **B2 (instructors):** `z.array(objectId).max(3)` accepts duplicates; `countDocuments($in)` de-dupes so
  `[A,A]` stores verbatim and pollutes audit/DTO. → dedupe in the use-case (`[...new Set(ids.map(String))]`),
  `.refine` uniqueness, store deduped, validate against deduped length.
- **B3 (instructors):** calendar attendees come from `createCalendarEventForSchedule` (`scheduleService.js:74`,
  `attendees: schedule.enrolledUsers`), NOT the response re-fetch sites. → add a shared
  `effectiveAttendeesForSchedule()` (dedupe-by-email of learners ++ effective instructors) and call it from
  BOTH `createCalendarEventForSchedule` and the update-sync block (`domains/schedule/use-cases.js:171-187`).
  Drop the response-populate edits as the calendar mechanism.
- **M1/M2/M4 (instructors):** DROP the single-doc transaction wrapper (YAGNI — orthogonal field). Capture a
  **`before` snapshot** for the audit diff (clearing override silently revokes access — needs a trail). Add
  `roleGuard('Admin')` belt-and-suspenders alongside the capability.
- **M3 (instructors):** widening `attendance-scope.js:15` + `attendance-analytics.js:135` to the union folds
  guest sessions into by-team/by-employee rollups — broader than single-session grain. **Decision:** keep
  single-session grain → do NOT widen analytics scopes; only widen `getSession`/list visibility +
  attendance mark/read-by-schedule. Pin numbers with a test. (Owner Q3.)
- **m2/m4/m5:** legacy `findScheduleById`/`findSchedulesPage` must `populate('classId','teacherIds')` or
  `effectiveInstructors` silently `[]`. Skip calendar `sendUpdates` when `startTime <= now`. Cap `.max(3)`
  (matches the "≤~3-element list" rationale).

## Requirements
**Functional**
- F1: Admin-only `PUT /api/schedules/:id/instructors` (capability `session.assign-instructor` +
  `roleGuard('Admin')`); `[]` = clear → inherit cohort.
- F2: Effective instructors = override-or-inherit; UNION authz for attendance mark/read + session
  visibility; cohort teacher never revoked.
- F3: Effective instructors added to Calendar attendees (deduped by email) via the create + update-sync
  paths; skipped for past sessions.
- F4: Reads surface `sessionInstructors` (name + empCode, **no email**) + derived `effectiveInstructors`.

**Non-functional**
- NF1: No new unique constraint; field orthogonal to `{classId,startTime}`; `assertBookable` untouched.
- NF2: No learner leak — policy consults only `teacherIds`/`sessionInstructorIds`, never `enrolledUsers`.
- NF3: Instructor identity validated (active Teacher/Admin, not deleted); deduped before store.

## Architecture
**Field:** `Schedule.sessionInstructorIds` (added in Phase 1) + index (Phase 1).

**Policy** (`server/policy/sessionInstructors.js`, new — reuses `classBinding.isTeacherOfClass`):
- `effectiveInstructorIds(schedule, classDoc)` → own if non-empty else `classDoc.teacherIds`.
- `canAccessSession(actor, schedule, classDoc)` = UNION: cohort decision OR named session instructor.
  **For session READ (B1): wrap the EXISTING restrictive cohort check, not the permissive one** —
  `restrictiveCohortVisible(actor,class) OR isSessionInstructor`.

**Write path** (NO transaction — M1): controller → `setSessionInstructors(id, ids, actor)`:
1. dedupe ids; 2. `findValidInstructorIds` (active Teacher/Admin, not deleted) → 400 on mismatch;
3. capture `before = existing.sessionInstructorIds`; 4. `updateScheduleById` (404 if gone);
5. audit `diff(before, after)`.

**Calendar** (B3): `effectiveAttendeesForSchedule(schedule, classDoc)` shared helper; called from
`createCalendarEventForSchedule:74` + update-sync `domains/schedule/use-cases.js:171`; skip if past.

**Authz wiring** (UNION, single-session grain):
- `attendanceController.loadClassForSchedule:12` → also load `schedule.sessionInstructorIds`; swap
  `bulkMarkAttendance`/`getAttendanceBySchedule` to `canAccessSession`.
- `session/use-cases.getSession:61` → `restrictive OR isSessionInstructor`.
- `session/use-cases.buildFilter:28` + `queries.getAttendanceCalendar:104` → `$or:[{classId:{$in:visible}},
  {sessionInstructorIds: me}]`.
- **Do NOT** widen `attendance-scope.js:15` / `attendance-analytics.js:135` (M3 — keep single-session grain).

## Related Code Files
**Create**
- `server/policy/sessionInstructors.js`
- `server/tests/integration/sessionInstructors.test.js`, `server/tests/unit/sessionInstructorsPolicy.test.js`
**Modify**
- `server/controllers/attendanceController.js:12,44,73` — load instructors; swap to `canAccessSession`.
- `server/domains/schedule/use-cases.js:13` (`ALLOWED_UPDATE_FIELDS`), new `setSessionInstructors`.
- `server/domains/schedule/repository.js` — `findValidInstructorIds`, `findSessionScopeForTeacher`;
  populate `classId.teacherIds` on `findScheduleById`/`findSchedulesPage` (m2).
- `server/domains/schedule/queries.js:104` — `$or` teacher scope.
- `server/domains/learning/session/{repository,use-cases,dto}.js` — UNION read scope (B1 restrictive-OR),
  populate instructors, emit `sessionInstructors`(name+empCode)+`effectiveInstructors`.
- `server/services/scheduleService.js:74` + `domains/schedule/use-cases.js:171` — `effectiveAttendeesForSchedule`.
- `server/services/calendarService.js:55` — dedupe attendees by email; skip past (m4).
- `server/controllers/scheduleController.js` — thin `setInstructors` (audit before/after).
- `server/routes/scheduleRoutes.js:38` — `PUT /:id/instructors` (+ `roleGuard('Admin')`, M4) before `/:id`.
- `server/schemas/schedule.js:14` — `setSessionInstructorsBody` (`.max(3)` + `.refine` unique).
- `server/policy/capabilities.js` — `SESSION_ASSIGN_INSTRUCTOR` (Admin via `ALL_CAPABILITIES` only).
- `client/src/api/api.js`, `client/src/hooks/useSchedules.js`, `client/src/components/AttendanceDrawer.jsx`,
  new `SessionInstructorPicker`, `client/src/i18n/locales/en.json`.

## Implementation Steps
1. Policy module + unit tests (effective resolve; UNION; **restrictive-OR for read**; empty-binding cases).
2. Write path (NO tx): dedupe, validate identity, before/after audit, route+capability+`roleGuard('Admin')`.
3. Attendance authz swap (mark/read-by-schedule) — keep analytics scopes unchanged (M3).
4. Session/list visibility UNION (restrictive-OR-instructor); populate `classId.teacherIds` (m2).
5. `effectiveAttendeesForSchedule` into create + update-sync calendar paths; skip past (B3/m4).
6. DTO: `sessionInstructors`(name+empCode)+`effectiveInstructors`.
7. Frontend picker (admin-gated) + AttendanceDrawer line + en.json.
8. Tests: happy/deny/race/edge + per-path empty-binding (proves no silent flip) + calendar-attendee assert.

## Todo
- [ ] sessionInstructors policy + unit tests (restrictive-OR read, B1)
- [ ] Write path no-tx + dedupe + identity validation + before/after audit (B2/M1/M2)
- [ ] Route + capability + roleGuard('Admin') (M4)
- [ ] Attendance mark/read UNION; analytics scopes UNCHANGED (M3)
- [ ] Session/list visibility UNION + classId.teacherIds populate (m2)
- [ ] effectiveAttendeesForSchedule into create+update calendar; skip past (B3/m4)
- [ ] DTO instructors (name+empCode, no email)
- [ ] Frontend picker + drawer + en.json
- [ ] Tests incl. empty-binding per-path + calendar attendees
- [ ] Tracker + route-permission-matrix + attendance spec UNION delta

## Success Criteria
- Named session instructor marks/reads their guest session (200); cohort teacher still 200 (UNION not
  revoked); unrelated teacher 403 `reason:'teacher-not-bound-to-class'`.
- Empty-binding behavior UNCHANGED on every read path (no silent restrictive→permissive flip) — pinned.
- Calendar invites include effective instructors (create + update); duplicates `[A,A]` rejected.
- `sessionDto.instructors` carries no email; analytics rollups unchanged for guest sessions.

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Silent permissive flip on session read | High | High | Restrictive-OR wiring + per-path empty-binding tests (B1). |
| Duplicate instructors pollute audit/DTO | Med | Med | Dedupe + `.refine` unique + `.max(3)` (B2). |
| Instructors never reach calendar | High | Med | Shared helper at the real attendee source (B3). |
| One-sided audit on clear | Med | Med | Before-snapshot diff (M2). |
| Analytics grain creep | Med | Med | Don't widen analytics scopes (M3). |

## Security Considerations
- Capability + `roleGuard('Admin')` double gate. No learner field feeds learner gating (enrollment-only,
  untouched). Instructor DTO = name+empCode (no email). Calendar payload server-filters emails. Open-until-
  populated preserved on the cohort layer; the override only ADDS a named instructor, never revokes cohort.

## Next Steps / Dependencies
- Depends on Phase 1 (`sessionInstructorIds` field/index, `findClassTeacherBinding`).
- Independent of Phase 2. Coordinate with Phase 4 only on shared `domains/schedule/use-cases.js` edits.
- **Definition of Done:** tests/lint green + roadmap changelog + `route-permission-matrix.md` (new route) +
  attendance spec MODIFIED delta (UNION rule) + commit.
