# Phase 01 — Backend: mode filters + `/api/english` read router

## Overview
Priority: high · Status: 🔴 not started
Additive backend separation. No model/URL renames. Two pieces:
(a) optional `mode=team|cohort` filter on existing list reads,
(b) new thin domain router `domains/english-class/` at `/api/english/*`
delegating into existing use-cases with `mode` forced to `team`.

## Key insights
- Mode lives on `LearningProgram.schedulingMode`, reached via
  `Class.programId` (nullable → fallback `leader_booking` = team world).
  Cheapest server filter: resolve the **cohort-mode class ids** once
  (programs `self_enroll|nomination` → classes `$in`), then
  team = `classId $nin`, cohort = `classId $in`.
- `domains/schedule/queries.js → listSchedules` already takes a filters
  object (classId/status/from/to/enrolledUser); `getAttendanceCalendar`
  takes `{from,to}` + requestUser. Both get `mode` support.
- `domains/learning → listCohorts/buildCohortFilter` filters on Class
  fields; mode maps to `programId $in cohortProgramIds` (cohort) or
  `$or: [{programId:null},{programId:{$nin:cohortProgramIds}}]` (team).
- When caller already scopes by `classId`/`programId`, skip the mode
  filter (already scoped; avoids `$or`+`$in` merge complexity).
- Capability gating mirrors existing equivalents: classes ≈ learning
  cohorts GET; schedules ≈ `/api/schedules` GET (protect + Participant
  enrolled-scope); attendance-calendar ≈ roleGuard('Admin','Teacher').

## Related code files
Modify:
- `server/domains/schedule/repository.js` — `findCohortModeClassIds()`
- `server/domains/schedule/queries.js` — mode in `listSchedules`,
  `getAttendanceCalendar`
- `server/schemas/schedule.js` — `listSchedulesQuery.mode`
- `server/domains/learning/schemas.js` — `listCohortsQuery.mode`
- `server/domains/learning/use-cases.js` + `repository.js` — mode in
  `listCohorts`
- `server/server.js` — mount `/api/english`
Create:
- `server/domains/english-class/routes.js` (router, reuse zod schemas)
- `server/domains/english-class/controller.js` (thin delegation)
- `server/tests/integration/english-class-routes.test.js`

## Implementation steps
1. Repository helper: cohort-mode program ids → class ids (lean, `_id`).
2. `listSchedules`: if `filters.mode && !filters.classId` →
   `query.classId = {$in|$nin: ids}`.
3. `getAttendanceCalendar`: same, merged with Teacher `$or` scope
   (combine via `$and` when both present).
4. zod: `mode: z.enum(['team','cohort']).optional()` both schemas.
5. `listCohorts`: resolve cohort-mode program ids when `query.mode` set
   and no `programId` given; build filter accordingly.
6. New router `/api/english`: GET `/classes`, `/schedules`,
   `/attendance-calendar` — validate with existing schemas, force
   `mode='team'` AFTER validation, keep Participant enrolled-user scope
   parity with `domains/schedule/controller.getSchedules`.
7. Integration tests: mode filtering correctness (team vs cohort vs
   program-less class), `/api/english/*` auth + scope + forced mode.

## Success criteria
- `GET /api/schedules?mode=cohort` excludes team-world sessions;
  `GET /api/english/schedules` returns ONLY team-world sessions.
- `GET /api/learning/cohorts?mode=cohort` excludes team classes;
  `GET /api/english/classes` returns only team classes (incl. program-less).
- Existing calls w/o `mode` byte-identical behavior. `cd server && npm test` green.

## Risk
- Program-less classes must land in TEAM world (fallback parity with
  `findClassSchedulingMode`) — covered by dedicated test.
- `$or` merge with Teacher scope in attendance-calendar — use `$and`.
