# Plan: Learner catalog self-enroll V1

**Status:** completed · **Wave:** C (Catalog & Self-service) · **Type:** frontend

## Context

Wave C starts with learner-facing catalog browse/search plus self-enroll. The
backend already exposes active programs/cohorts and permits Participants to
self-enroll only into cohorts whose program uses `schedulingMode: self_enroll`.

## Scope

- Add Participant route `/me/catalog`.
- Show active self-enroll programs and their ongoing cohorts.
- Add search/category filters and clear empty/loading states.
- Let learners self-enroll in an available cohort using existing enrollment API.
- Add dashboard CTA and focused component tests.
- Update roadmap/handoff after verification.

## Out of scope

- Backend catalog endpoint.
- Learning paths/prerequisite gating.
- Capacity enforcement UI beyond current API result.
- Admin catalog design changes.

## Verification

- Passed: `cd client && npm run test:run -- src/pages/__tests__/MyLearningCatalogPage.test.jsx` (2 tests)
- Passed: `cd client && npm run test:run` (122 tests)
- Passed: `cd client && npm run lint` (0 errors, 81 warnings at configured cap)
- Passed: client production bundle command.

## Unresolved questions

- None.
