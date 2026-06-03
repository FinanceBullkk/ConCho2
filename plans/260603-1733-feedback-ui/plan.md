# Plan: Wave B UI — Feedback surfaces

**Status:** completed · **Wave:** B (Assessment & Certification) · **Type:** frontend over existing `/api/learning/feedback`

## Context
Feedback backend exists and completion now enforces `requiresFeedback`, but there
is no UI for learners to submit feedback or for Admin/Teacher to review cohort
feedback.

## Scope
- Add Admin/Teacher Feedback tab in `/learning`.
- Add Participant-only `/me/feedback` self-service page and dashboard CTA.
- Add feedback API/query hooks.
- Support rating/content/instructor/comment submit or re-submit.
- Add focused component tests.

## Out of scope
Anonymous surveys, custom feedback forms, analytics charts.

## Verification
- `cd client && npm run lint` — 0 errors / 81 warnings (existing cap).
- `cd client && npm run test:run -- src/pages/learning/__tests__/FeedbackTab.test.jsx src/pages/__tests__/MyFeedbackPage.test.jsx` — 2 files / 4 tests passed.
- `cd client && npm run test:run` — 23 files / 114 tests passed.
- `cd client && npm run build` — passed.
- `curl -I http://127.0.0.1:3000/me/feedback` — 200 OK.

## Unresolved questions
- None.
