# Plan: Wave B UI — Learner assessment-taking

**Status:** ✅ DONE (2026-06-03) — client lint 0err/81warn, 109 tests, build clean · **Wave:** B (Assessment & Certification) · **Type:** participant self-service UI

## Context
Assessment authoring/listing UI is done for Admin/Teacher in `/learning`, but
Participants cannot access `/learning`. Backend already supports learner-safe
published assessment reads and self attempt submission via `/api/assessment`.

## Scope
- Add `/me/assessments` route for authenticated Participants.
- Link it from Participant dashboard.
- List published assessments for the learner's current/enrolled cohorts.
- Show previous attempt result from `/api/assessment/attempts`.
- Submit answers through `/api/assessment/assessments/:id/attempts`.
- Add focused component tests + docs tracker update.

## Out of scope
Question banks, item editing, manual grading, rich review of per-item results.

## Verification
- `cd client && npm run lint` — pass (0 errors, 81 warnings; current cap).
- `cd client && npm run test:run -- src/pages/__tests__/MyAssessmentsPage.test.jsx src/pages/learning/__tests__/AssessmentsTab.test.jsx` — pass (5/5).
- `cd client && npm run test:run` — pass (21 files / 109 tests).
- `cd client && npm run build` — pass.

## Unresolved questions
- None.
