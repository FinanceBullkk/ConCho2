---
phase: 1
title: Expose Scheduling Mode
status: completed
priority: P1
effort: 0.5d
dependencies: []
---

# Phase 1: Expose Scheduling Mode

## Overview

Surface each team's **effective `schedulingMode`** to the booking client so the
grid (Phase 2) can gate booking *before* the server 403/400s. One read-only
server populate-widening + a tiny client resolver. No mutation, no audit, no
authz change.

## Key Insight

- The booking grid loads teams via `useMyTeams()` → `GET /teams/my-teams` →
  [teamController.getMyTeams](../../server/controllers/teamController.js#L520),
  which populates `classId` as `'classCode courseName status'` — **no
  `programId`**, so the client cannot see the program's `schedulingMode`.
- `schedulingMode` lives on `LearningProgram`, reached via `Class.programId`
  (nullable). Server fallback when `programId` is null = `'leader_booking'`
  (mirrors `domains/schedule/repository.findClassSchedulingMode`). The client
  resolver MUST use the **same** fallback to stay consistent with enforcement.

## Requirements

- **Functional:** `GET /teams/my-teams` response includes the program's
  `schedulingMode` for each team's linked class (when a program is linked);
  program-less classes still return cleanly (no crash, no extra field needed).
- **Functional:** a single client helper resolves a team → effective mode with
  the canonical `leader_booking` fallback.
- **Non-functional:** read-only; payload stays lean (only `schedulingMode` added
  to the nested program); no change to authz/CSRF/rate-limit/audit; no DTO
  rewrite of the raw team docs (KISS — getMyTeams returns raw docs today).

## Architecture

```
getMyTeams ──► Team.find(...)
                 .populate({ path:'classId',
                             select:'classCode courseName status programId',
                             populate:{ path:'programId', select:'schedulingMode' } })
                 ...                                   (programId may be null)
        ▼
  res.json({ data: teams })  ── each team.classId.programId?.schedulingMode
        ▼
  client effectiveSchedulingMode(team)
     = team?.classId?.programId?.schedulingMode || 'leader_booking'
```

## Related Code Files

- **Modify:** `server/controllers/teamController.js` — widen `getMyTeams`
  (~line 528) `classId` populate to object form + nested `programId` populate
  (`select: 'schedulingMode'`). Add `programId` to the `classId` select so the
  nested populate resolves.
- **Create:** `client/src/lib/scheduling-mode.js` — `TEAM_BOOKABLE_MODE`
  (`'leader_booking'`), `effectiveSchedulingMode(team)`, `isLeaderBookable(team)`.
- **Create:** `client/src/lib/__tests__/scheduling-mode.test.js` — helper unit tests.
- **Modify (tests):** `server/tests/integration/` team routes test — assert
  `my-teams` exposes nested `schedulingMode`; null-program team returns 200.

## Implementation Steps

1. **Server:** convert the `getMyTeams` `classId` populate from the string form
   to object form, adding `programId` to the select and a nested `populate` of
   `programId` with `select: 'schedulingMode'`. Leave `leaderId`/`members`
   populates unchanged.
2. **Client helper:** add `client/src/lib/scheduling-mode.js` exporting the
   constant + `effectiveSchedulingMode` + `isLeaderBookable`. Pure, no React.
3. **Tests:** client unit tests (program present → that mode; `programId` null →
   `leader_booking`; `classId` null → `leader_booking`; unknown string passes
   through verbatim so Phase 2 can branch on it). Server integration: a team
   whose class links a program returns `classId.programId.schedulingMode`; a
   team whose class has `programId: null` returns 200 with no nested program.
4. **Verify:** `cd server && npm test` (team routes) + `cd client && npm run test:run`.

## Todo List

- [x] Widen `getMyTeams` `classId` populate (nested `programId.schedulingMode`)
- [x] Add `client/src/lib/scheduling-mode.js` resolver + constant
- [x] Client unit tests for the resolver (fallback paths)
- [x] Server integration assertion (nested mode present; null-program 200)
- [x] Tests green both sides — server 11/11, client 5/5, lint at cap 81

## Success Criteria

- [x] `GET /teams/my-teams` returns `classId.programId.schedulingMode` for
      program-linked classes; program-less teams unaffected.
- [x] `effectiveSchedulingMode` returns the program mode or `leader_booking`
      fallback, matching server enforcement.
- [x] No change to response envelope shape consumers already rely on
      (`r.data.data` array of teams); existing team tests stay green.

## Risk Assessment

- **Over-populating payload** (Low×Low): only `schedulingMode` selected on the
  nested program — negligible size. Mitigation: explicit `select`.
- **Resolver drift from server fallback** (Med×Med): if server ever changes the
  null-program fallback, the client silently disagrees. Mitigation: comment in
  `scheduling-mode.js` pointing at `repository.findClassSchedulingMode`; covered
  by Phase 2 behavior tests.

## Security Considerations

- Read-only, self-scoped (`getMyTeams` already filters to the caller's teams).
- No sensitive program fields exposed — only the `schedulingMode` enum string.

## Next Steps

Unblocks **Phase 2** (the grid needs the resolved mode to gate cells/banner).
