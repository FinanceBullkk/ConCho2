# Session 05 Report - Learning Enrollment

**Date:** 2026-06-04
**Verdict:** Risk (1 P1 found + fixed inline)
**Action:** fixed cohort double-enroll race; no follow-up plan needed
**Status:** completed

## Goal

Are programs, cohorts, enrollments, prerequisites, and paths truthful and
consistent?

## Scope

In: LearningProgram, Class/cohort DTO, cohort enrollment, self-enroll, withdrawal,
prerequisites, LearningPath progress.
Out: attendance marking, assessment scoring, report export (Sessions 06/07/08).

## Evidence

- Read: `server/domains/learning/enrollment/{use-cases,prerequisites,repository,dto}.js`,
  `server/domains/learning/path/use-cases.js`, `server/models/Enrollment.js`.
- Tests inspected: `learningEnrollmentRoutes`, `learningPrerequisiteRoutes`,
  `learningPathRoutes` (+ index-impacting `enrollmentTransfer`, `enrollmentRoutes`,
  `teams`, `bookingRace`, `softDeleteEmpCodeReuse`).

## Scenario Verdicts

| Scenario | Verdict | Evidence |
|---|---|---|
| Duplicate active enrollment rejected | **P1 → fixed** | Sequential dup → 409 (app check). **Concurrent** dup had NO DB guard — `Enrollment.js:79-81` deliberately left cohort uniqueness app-only. TOCTOU: both callers pass `findActiveCohortEnrollment`, both insert → 2 Active. |
| Withdrawn / soft-deleted not active | OK | `withdraw` → status `Dropped`+`leftAt`; `findActiveCohortEnrollment` filters `status:'Active'`; completion `PARTICIPATING_STATUSES` excludes Dropped. |
| Self-enroll respects scheduling mode | OK | `use-cases.enroll`: non-admin self-enroll requires `schedulingMode==='self_enroll'`, else 403. Tested. |
| Prerequisites use completion/cert truth | OK | `prerequisites.hasCompletedProgram`: Issued certificate fast-path, else real `evaluateCompletion` across participated cohorts. Direct (one-level) prereqs by design. |
| Path progress completed/current/locked | OK | `path/use-cases.getPathProgress`: completed via shared engine; first incomplete = `current`; rest = `locked`; percent/complete summary correct. |

## P1 — Cohort enrollment double-enroll race (fixed)

Root cause: team enrollments had a partial unique index
(`{userId,teamId}` + `status:'Active'` + `teamId $type objectId`), but the
cohort path (teamId null) relied solely on an app-level check, with a comment
asserting a null partial filter was "brittle." It is not — `$type:'null'`
(BSON type 10) is the symmetric counterpart to the team index's `$type:'objectId'`.

Fix (3 changes):
1. `server/models/Enrollment.js` — partial unique index
   `{userId:1, classId:1}` on `{status:'Active', teamId:{$type:'null'}}` (DI-05b).
2. `server/domains/learning/enrollment/use-cases.js` — wrap
   `createCohortEnrollment`; translate E11000 (race loser) → `ServiceError 409`.
3. `server/tests/integration/learningEnrollmentRoutes.test.js` — `Enrollment.init()`
   in `beforeAll` + concurrency test: `Promise.all` two identical enrolls →
   `[201,409]`, exactly 1 Active in DB.

## Verification

- `learningEnrollmentRoutes` — 7/7 pass (6 prior + new race test).
- `learningPrerequisiteRoutes learningPathRoutes enrollmentTransfer enrollmentRoutes
  teams bookingRace softDeleteEmpCodeReuse` — 8 suites / 67 tests pass (no
  regression from the new index).
- Index disjoint from team index (objectId vs null teamId) — confirmed by green
  team/transfer suites.

## Deploy note

Building a unique index fails if pre-existing duplicate Active cohort enrollments
exist. Risk is low (app check has guarded the sequential path) and non-regressive
(failed build = today's behaviour, no unique guard). Operators should run a
one-off dedupe check on `{userId,classId,teamId:null,status:'Active'}` before/at
deploy; promoted as QB-006 follow-up.

## Observations (not fixed — below P1)

- `enroll` does not verify the target `userId` exists / is not soft-deleted; an
  Admin can create an enrollment for a soft-deleted user. Low impact (audit
  trail), P3.
- `listCohortEnrollments`/`enrollmentDto` surface enrollments of soft-deleted
  users without flagging — display-only, P3.
- Prerequisites enforced only on the self-enroll path (Admin override by design).

## Backlog Promoted

- QB-006: pre-deploy dedupe check for duplicate Active cohort enrollments before
  the DI-05b unique index builds. (P2, open)

## Unresolved Questions

- None.
