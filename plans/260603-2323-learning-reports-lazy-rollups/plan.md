# Plan: Learning reports lazy rollups

**Status:** completed · **Type:** frontend performance fix

## Context

Opening the Learning Reports tab was slow because it automatically requested
completion rollups. That endpoint computes completion across all active cohorts
and learners, so it is too heavy for tab mount.

## Scope

- Do not fetch completion rollups on Reports tab mount.
- Add explicit load/refresh action for rollups.
- Cache rollup query briefly and avoid refetch on mount.
- Add focused test proving rollups load only on request.

## Verification

- Passed: `cd client && npm run test:run -- src/pages/learning/__tests__/ReportsTab.test.jsx src/pages/learning/__tests__/CompletionReportTable.test.jsx` (5 tests)
- Passed: `cd client && npm run test:run` (123 tests)
- Passed: `cd client && npm run lint` (0 errors, 81 warnings at configured cap)
- Passed: client production bundle command.
- Passed: `git diff --check`.

## Unresolved questions

- None.
