---
phase: 2
title: "E2 Capacity Decision and Data Audit"
status: pending
priority: P1
effort: 2d
dependencies: [1]
---

# Phase 2: Capacity Decision And Audit

## Overview

Decision/audit first. `Schedule.capacity` is metadata
(`server/models/Schedule.js:56`); Program capacity fields exist but are unused
(`server/models/LearningProgram.js:67`). No enforcement until semantics and
existing violations are known.

## Entry Gate

- E1 complete.
- Decide capacity at enrollment, session, or both.
- Decide future cohort roster live-sync or creation snapshot.
- Approve existing over-capacity handling.

## Data Flow To Decide

1. Program limits + Schedule override + proposed roster enter one policy.
2. Policy resolves effective limit and enforcement point.
3. Approved Enrollment/session/Team/cohort write persists or returns 409/422.
4. Existing violations remain readable; never auto-remove learners.
5. Admin override, if approved, requires reason and audit.

## Audit Scope

- Count Programs/Cohorts/Teams/Schedules over each possible limit.
- Compare `Schedule.capacity` with `enrolledUsers.length`.
- Quantify Team future-live-sync versus cohort creation-snapshot behavior:
  `server/models/Team.js:119`,
  `server/domains/learning/session/use-cases.js:137`.
- Output IDs/counts and remediation recommendation. Read-only; no backfill.

## Likely Files After Decision

- Create `server/domains/schedule/capacity-policy.js` and audit script/tests.
- Modify `server/domains/learning/enrollment/use-cases.js:11`.
- Modify `server/services/scheduleService.js:223`.
- Modify `server/models/Team.js:119`.
- Modify `server/domains/schedule/use-cases.js:41`.
- Re-grep client callers/file ownership before coding.

## Test Matrix

| Layer | Cases |
|---|---|
| Unit | precedence, null limits, boundary, override |
| Integration | approved chokepoints; four modes; authz/audit |
| Race | concurrent last seat; roster update versus booking |
| Regression | historical violation visible; attendance/completion unchanged |

## Risks

| Risk | Likelihood x impact | Mitigation |
|---|---|---|
| Wrong enforcement point | High x High | Hard decision gate |
| Existing violations | High x High | Audit/grandfather/manual remediation |
| Last-seat oversubscription | Medium x Critical | Transactional lock + race test |
| Team/cohort divergence | Medium x High | One policy + mode matrix |

## Success Criteria

- [ ] Exact precedence and roster lifetime approved.
- [ ] Audit covers all active records with zero destructive writes.
- [ ] Violation count and remediation approved.
- [ ] Caller/file inventory re-grepped before implementation.

## Rollback And Compatibility

Audit needs no rollback. Enforcement must be additive/reversible. Never
auto-drop Enrollment or `Schedule.enrolledUsers`; any backfill needs before/after
manifest and inverse script.

## Unresolved Questions

- Capacity at enrollment, session, or both?
- Future cohort roster live-sync or snapshot?
- Existing violations: grandfather, override, or manual remediation?
