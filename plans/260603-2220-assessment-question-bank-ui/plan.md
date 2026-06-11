# Plan: Wave B — Assessment question bank UI

**Status:** completed · **Wave:** B (Assessment & Certification) · **Type:** frontend over existing backend

## Context

Backend question-bank endpoints are live. Managers can create/list/update/archive
bank items through `/api/assessment/question-bank`, and assessment create/update
can import reusable questions via `questionBankItemIds`.

## Scope

- Add client API + React Query hooks for question-bank items.
- Add a manager-only Question Bank panel in the Learning Assessments tab.
- Let managers create/archive simple bank questions.
- Let managers import selected bank questions when creating/updating assessments.
- Add focused component tests and i18n en+vi.

## Out of scope

- Full bank edit modal.
- Randomized question pools.
- Manual grading.
- Dedicated route/sidebar entry.

## Related Code Files

- `client/src/api/api.js`
- `client/src/hooks/useAssessment.js`
- `client/src/hooks/queryKeys.js`
- `client/src/pages/learning/AssessmentsTab.jsx`
- `client/src/pages/learning/AssessmentFormModal.jsx`
- `client/src/pages/learning/QuestionBankPanel.jsx`
- `client/src/pages/learning/QuestionBankFormModal.jsx`
- `client/src/pages/learning/__tests__/AssessmentsTab.test.jsx`
- `client/src/i18n/locales/en.json`
- `client/src/i18n/locales/vi.json`

## Success Criteria

- Admin/Teacher can see bank items and create/archive bank questions.
- Participants/read-only roles do not see manager bank controls.
- Assessment modal can include selected bank item IDs in create/update payloads.
- Existing manual item authoring remains unchanged.

## Verification

- `cd client && npm run test:run -- src/pages/learning/__tests__/AssessmentsTab.test.jsx` — 1 file / 6 tests passed.
- `cd client && npm run test:run` — 23 files / 117 tests passed.
- `cd client && npm run lint` — 0 errors / 81 warnings (existing cap).
- Client production bundle command passed.

## Unresolved questions

- Should bank item update be exposed in the same panel or deferred to a fuller manager view?
