# Plan: Wave B UI — Assessment authoring tab

**Status:** ✅ DONE (2026-06-03) — client lint 0err/81warn, 106 tests, build clean · **Wave:** B (Assessment & Certification) · **Type:** frontend over existing `/api/assessment`

## Context
The generic assessment engine v1 is live on the backend, but `/learning?tab=assessments`
still shows compatibility copy. Roadmap next asks for more L&D UI: assessment
authoring/taking and feedback. First slice: let Admins/Teachers author and list
cohort assessments.

## Scope
- Replace Assessments compatibility tab with real `AssessmentsTab`.
- Add assessment API methods + React Query hooks.
- Add manager create modal for v1 item types (`single_choice`, `multiple_choice`, `short_text`).
- Add archive action for Admin/Teacher managers.
- Add i18n en/vi.

## Out of scope
Learner attempt-taking UI, item editing, question banks, feedback UI.

## Verification
- `cd client && npm run lint` — pass (0 errors, 81 warnings; current cap).
- `cd client && npm run test:run -- src/pages/learning/__tests__/AssessmentsTab.test.jsx` — pass (3/3).
- `cd client && npm run test:run` — pass (20 files / 106 tests).
- `cd client && npm run build` — pass.

## Unresolved questions
- None.
