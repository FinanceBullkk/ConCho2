# Plan: Completion report rollups

**Status:** completed · **Wave:** B (Reporting) · **Type:** backend + frontend

## Context

Cohort completion reporting is live. Roadmap next asks for program/department
rollups, without changing completion policy semantics.

## Scope

- Add read-only completion rollup API returning program and department aggregates.
- Reuse existing cohort completion report rows to avoid duplicate policy logic.
- Surface rollups in the Learning Reports tab.
- Add focused backend/frontend tests and update docs.

## Out of scope

- Date range filters.
- Learner-level cross-program history.
- XLSX export for rollups.
- Large-scale batching optimization.

## Verification

- Passed: `cd server && npm test -- tests/integration/learningReportsRoutes.test.js` (7 tests)
- Passed: `cd client && npm run test:run -- src/pages/learning/__tests__/CompletionReportTable.test.jsx` (4 tests)
- Passed: `cd client && npm run test:run` (120 tests)
- Passed: `cd client && npm run lint` (0 errors, 81 warnings at configured cap)
- Passed: client production bundle command.
- Passed: backend syntax checks for changed report route/controller/repository/use-case files.

## Unresolved questions

- None.
