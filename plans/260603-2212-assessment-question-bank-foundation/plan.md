# Plan: Wave B — Assessment question bank foundation

**Status:** completed · **Wave:** B (Assessment & Certification) · **Type:** backend-first

## Context

Generic assessment v1 is live with authoring, learner attempts, feedback, reporting,
and edit support. Roadmap next calls out question banks/manual grading. Start with
question banks because it is lower risk and unlocks reuse before adding manual
review workflows.

## Scope

- Add reusable assessment question-bank items.
- Support manager-only create/list/update/archive.
- Let managers import bank questions while creating/updating assessments.
- Preserve learner answer privacy; no answer keys for learners.
- Add focused integration tests.

## Out of scope

- Frontend question-bank manager.
- Randomized question selection.
- Manual grading and rubric workflows.
- Question version history.

## Related Code Files

- `server/models/Assessment.js`
- `server/models/AssessmentQuestion.js`
- `server/domains/assessment/routes.js`
- `server/domains/assessment/schemas.js`
- `server/domains/assessment/use-cases.js`
- `server/domains/assessment/repository.js`
- `server/domains/assessment/dto.js`
- `server/domains/assessment/question-bank-*.js`
- `server/tests/integration/assessmentRoutes.test.js`
- `docs/development-roadmap.md`

## Implementation Steps

1. Add bank model and DTO/use-case/controller/repository helpers.
2. Add `/api/assessment/question-bank` routes behind `assessment.manage/read`.
3. Add `questionBankItemIds` to assessment create/update payloads and materialize
   reusable items into assessment item snapshots.
4. Test manager CRUD, participant visibility, import into assessment, and archive.
5. Run focused assessment tests and update roadmap.

## Success Criteria

- Managers can create/list/update/archive bank items.
- Participants cannot manage bank items.
- Assessment create/update can include bank item IDs and stores item snapshots with
  `questionBankItemId`.
- Existing assessment attempt/grading behavior remains unchanged.

## Verification

- `cd server && npm test -- tests/integration/assessmentRoutes.test.js` — 1 file / 16 tests passed.
- `npm run scripts:check` — 39 script files syntax check passed.
- `cd server && npm run lint -- --quiet` — not available; server package has no `lint` script.

## Unresolved questions

- Should Teachers own private banks later, or should all manager-created bank items
  be shared organization-wide?
