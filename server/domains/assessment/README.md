# `domains/assessment` — generic assessment engine (Wave B, v1)

Generalises the legacy English 4-skill `Evaluation` into a configurable,
item-based, auto-graded assessment. The legacy `Evaluation` path is **untouched**
— this is the forward path, and either one satisfies a cohort's
`completionPolicy.requiresAssessment`.

Mounted at `/api/assessment` (own domain boundary, sibling to `learning/`).

## Layout
```
routes.js      → /api/assessment router (protect + requireCapability + validate)
controller.js  → thin HTTP handlers (envelope + audit)
use-cases.js   → business rules (authoring, attempts, scoping)
grading.js     → pure auto-grading (no DB/HTTP) — unit-tested
repository.js  → all Mongoose calls (Assessment, AssessmentAttempt, Class)
dto.js         → response shaping; hides correct answers from learners
schemas.js     → zod request validation (per-item-type cross-field rules)
```

## Model
- `Assessment` — cohort-scoped quiz with embedded `items[]`. v1 item types:
  `single_choice`, `multiple_choice`, `short_text`. Choice items reference the
  correct answer **by option index** (author in one request, no _id round-trip).
  `passingScorePercent`, `maxAttempts` (0 = unlimited), `isPublished`. Soft-delete.
- `AssessmentAttempt` — a learner's one-shot, auto-graded attempt. `cohortId` is
  denormalised so completion can resolve "passed an assessment for this cohort?"
  in one indexed query.

## Capabilities
- `assessment.manage` — author / archive (Admin, Teacher)
- `assessment.read` — list / get / list attempts (all; learners scoped to self)
- `assessment.attempt` — take an assessment (Participant)

## Endpoints
| Method | Path | Capability | Notes |
|--------|------|-----------|-------|
| POST | `/assessments` | `assessment.manage` | author (returns correct answers) |
| GET | `/assessments?cohortId=` | `assessment.read` | learners see published only, no answer keys |
| GET | `/assessments/:id` | `assessment.read` | learners 404 on unpublished |
| DELETE | `/assessments/:id` | `assessment.manage` | soft-delete (archive) |
| POST | `/assessments/:id/attempts` | `assessment.attempt` | self only; auto-graded; participant-gated; `maxAttempts`/published enforced |
| GET | `/attempts?cohortId=&assessmentId=` | `assessment.read` | learners scoped to own |

## Grading (`grading.js`)
All-or-nothing per item. Choice → exact selected-index set match. `short_text` →
trimmed, case-insensitive match to any accepted answer. Roll-up:
`scorePercent = score / maxScore`, `passed = scorePercent >= passingScorePercent`.

## Iterate (deferred)
Item update/edit-with-attempt-integrity, question banks / reusable templates,
program-level (not just cohort) assessments, manual-grade item types
(essay/rating rubric), learner-facing UI. See `docs/lms-roadmap.md` Wave B.
