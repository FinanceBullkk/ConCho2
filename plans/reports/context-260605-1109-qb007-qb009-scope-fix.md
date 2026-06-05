# QB-007 + QB-009 Continuation Report

**Date:** 2026-06-05  
**Context:** Continued from Claude handoff after QB-008/QB-010 push  
**Status:** completed locally, pending commit/push  
**Verdict:** focused backlog fixes green

## Goal

Apply owner decisions:

- QB-007: scope Teacher attendance/report/assessment access to bound classes.
- QB-009: exclude soft-deleted/offboarded learners from completion report
  denominator.

## Changes

- Added shared `server/helpers/teacher-class-scope.js`.
- Attendance:
  - `GET /api/attendance/user/:userId` filters Teacher results to visible
    classes.
  - `analytics/by-employee` filters attendance records by visible schedules.
  - `analytics/by-team` filters both teams and attendance counters by visible
    classes.
  - `analytics/by-class` returns 403 for out-of-scope Teacher.
  - Analytics cache keys now include actor scope to prevent Admin cached data
    leaking to Teacher.
- Assessment:
  - Teacher create/list/get/update/archive/list-attempts/manual-grade now check
    cohort `teacherIds`.
  - Empty `teacherIds` remains graceful/permissive.
- Completion reports:
  - Teacher report/export/rollup scoped to visible cohorts.
  - Soft-deleted users are dropped from rows and denominator.
- Backlog:
  - QB-007 marked resolved.
  - QB-009 marked resolved.

## Verification

- Syntax checks passed for touched server files and tests.
- Focused suite: `teacherBinding`, `assessmentRoutes`, `learningReportsRoutes`
  passed: 3 suites, 48 tests.
- Blast-radius suite passed: 8 suites, 96 tests.
- Service-level analytics regression suite passed: 2 suites, 13 tests.

## Remaining Open Backlog

- QB-005: local seeded e2e backend harness.
- QB-006: deploy-time dedupe before DI-05b index build.
- QB-010(b): owner confirms no real account still uses legacy default import
  password.

## Unresolved Questions

- None.
