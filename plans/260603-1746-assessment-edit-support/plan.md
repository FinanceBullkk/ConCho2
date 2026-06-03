# Plan: Wave B — Assessment edit support

**Status:** completed · **Wave:** B (Assessment & Certification) · **Type:** backend + frontend over existing `/api/assessment`

## Context
Generic assessment v1 is live, with authoring UI and learner attempt-taking. The
roadmap still calls out assessment-engine iteration, especially item editing.
Today authors can create/archive, but cannot fix titles, publication state, or
items after creation.

## Scope
- Add manager-only update endpoint for assessments.
- Reuse existing create validation shape where possible.
- Add React Query update mutation and API method.
- Let Admin/Teacher open existing assessments in the authoring modal and save.
- Add focused backend/frontend tests.

## Out of scope
Question banks, versioning, manual grading, per-item attempt review.

## Verification
- `cd server && npm test -- tests/integration/assessmentRoutes.test.js` — 1 file / 13 tests passed.
- `cd client && npm run test:run -- src/pages/learning/__tests__/AssessmentsTab.test.jsx` — 1 file / 4 tests passed.
- `cd client && npm run lint` — 0 errors / 81 warnings (existing cap).
- `cd client && npm run test:run` — 23 files / 115 tests passed.
- `cd client && npm run build` — passed.
- `curl -I http://127.0.0.1:3000/learning` — 200 OK.
- Full `cd server && npm test` was attempted, but hung silently with leftover mongodb-memory-server processes; stopped/cleaned up after focused assessment integration passed.

## Unresolved questions
- Why full server Jest run hung in this session; focused changed-area server coverage passed.
