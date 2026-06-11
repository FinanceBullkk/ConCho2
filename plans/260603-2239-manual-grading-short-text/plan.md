# Plan: Manual grading v1 — short-text review override

**Status:** completed · **Wave:** B (Assessment & Certification) · **Type:** backend + frontend

## Context

Generic assessment attempts are auto-graded at submission time. V1 supports
manual review only for existing `short_text` answers, with Admin/Teacher graders.
The final updated attempt score is the source of truth for completion.

## Scope

- Add manager-only manual grading endpoint for assessment attempts.
- Allow overriding short-text per-answer score/note only.
- Recompute attempt totals, score percent, and pass state after review.
- Add manager review UI in Learning Assessments tab.
- Add focused backend/frontend tests and update docs.

## Out of scope

- New manual item type.
- Assigned-teacher scoping.
- Choice-item grading overrides.
- Pending-review completion block.

## Verification

- `cd server && npm test -- tests/integration/assessmentRoutes.test.js` — 1 file / 20 tests passed.
- `cd client && npm run test:run -- src/pages/learning/__tests__/AssessmentsTab.test.jsx` — 1 file / 8 tests passed.
- `cd client && npm run test:run` — 23 files / 119 tests passed.
- `cd client && npm run lint` — 0 errors / 81 warnings (existing cap).
- Client production bundle command passed.

## Unresolved questions

- None.
