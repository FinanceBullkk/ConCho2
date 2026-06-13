---
capability: assessments
status: stable
owners: [domains/assessment, controllers/evaluationController]
last_updated: 2026-06-14
related_code:
  - server/domains/assessment/use-cases.js
  - server/domains/assessment/controller.js
  - server/domains/assessment/grading.js
  - server/domains/assessment/access.js
  - server/models/Assessment.js
  - server/models/AssessmentAttempt.js
related_plans:
  - plans/260603-1710-assessment-authoring-ui
  - plans/260603-1721-learner-assessment-taking-ui
  - plans/260603-1746-assessment-edit-support
---

# Capability: Assessments (Authoring & Taking)

> **Source of truth for BEHAVIOR.** The grading engine has its own spec
> (`docs/specs/grading/spec.md`); reusable questions live in
> `docs/specs/question-bank/spec.md`.
>
> **Phase 1 convergence (2026-06-14):** Assessment is now the SINGLE assessment
> concept with two *modes* — learner-attempted **quiz** (this engine) and
> instructor-scored **evaluation** (`docs/specs/evaluations/spec.md`, the English
> 4-skill rubric). A unified read **`GET /api/assessment/results/mine`**
> (`assessment.read`, self-scoped) returns the caller's results across BOTH modes
> in one shape (`{ source: 'quiz'|'evaluation', title, scorePercent, passed,
> date }`, newest-first); the learner transcript consumes it. The Evaluation
> remains its own model/write-path (instructor-scored mode), adapted into this
> surface — not merged into the quiz model. See ADR
> `converge-to-one-training-model`.

## Purpose

A configurable, item-based quiz attached to a cohort. Generalises the legacy
English `Evaluation` into a generic, auto-gradable assessment so any program can
test learners. v1 items are objective and auto-gradable; one-shot attempts are
graded immediately and frozen.

## Business Requirements (BR)

- **BR-1:** Authors (Admin/Teacher) build a quiz in one request, with correct
  answers declared inline.
- **BR-2:** Only published assessments are attemptable by learners.
- **BR-3:** Attempt counts may be capped per assessment.
- **BR-4:** An attempt is graded at submit and the score frozen (auditable).
- **BR-5:** A passing attempt feeds completion (`requiresAssessment`).
- **BR-6:** Assessments are soft-deleted (trash), never hard-deleted.

## Actors & Use Cases (UC)

- **UC-1 (Admin/Teacher):** authors an assessment on a cohort — items, points,
  passing %, max attempts — and publishes it.
- **UC-2 (Participant):** opens a published assessment and submits answers; gets
  an immediate score/pass result.
- **UC-3 (Admin/Teacher):** edits/unpublishes/soft-deletes an assessment.

## Entities

- **Assessment** (`server/models/Assessment.js`): `title`, `cohortId` (req),
  `programId` (denorm), `items[]` (`single_choice`/`multiple_choice`/
  `short_text`; choice correctness by **option index**; each item has `_id`,
  `points`, optional `questionBankItemId`), `passingScorePercent`, `maxAttempts`
  (0 = unlimited), `isPublished`, `createdBy`, soft-delete. ≥1 item required.
- **AssessmentAttempt** (`server/models/AssessmentAttempt.js`): `assessmentId`,
  `userId`, `cohortId` (denorm), `answers[]` (per-item graded snapshot:
  pointsEarned/Possible, correct, + manual-grade fields), `score`/`maxScore`/
  `scorePercent`/`passed`, `submittedAt`. Index `{cohortId,userId,passed}` for
  completion lookup.

## Functional Requirements (FR)

### Requirement: Single-request authoring [BR-1, UC-1]

The system SHALL let an author create an assessment with all items in one
request, where choice items reference correct answers by option index (no
create→read→patch round-trip). At least one item is required.

#### Scenario: Author a 3-item quiz
- **GIVEN** an author and a cohort
- **WHEN** they POST a title + 3 items with points and correct indexes
- **THEN** the assessment is created unpublished with those items

### Requirement: Only published assessments are attemptable [BR-2, UC-2]

The system SHALL reject learner attempts on unpublished (or soft-deleted)
assessments.

#### Scenario: Attempt unpublished
- **GIVEN** an unpublished assessment
- **WHEN** a learner submits an attempt
- **THEN** it is rejected

### Requirement: Attempt cap [BR-3, UC-2]

When `maxAttempts > 0`, the system SHALL reject submissions beyond that count for
the learner; `0` means unlimited.

#### Scenario: Exceed max attempts
- **GIVEN** `maxAttempts = 1` and the learner already has one attempt
- **WHEN** they submit again
- **THEN** it is rejected

### Requirement: Immediate one-shot grading [BR-4, BR-5, UC-2]

On submit the system SHALL auto-grade the attempt (see `grading` spec), freeze
`score`/`scorePercent`/`passed`, and snapshot per-item outcomes. `passed` =
`scorePercent >= passingScorePercent`. A passing attempt is discoverable by the
completion engine via the denormalised `cohortId`.

#### Scenario: Submit and pass
- **GIVEN** a published assessment, passing 70%
- **WHEN** a learner submits answers worth 80%
- **THEN** the attempt is stored with `passed = true`

### Requirement: Teacher cohort scoping [UC-1, UC-3]

The system SHALL restrict Teacher authoring/management to cohorts they can access
(`assertTeacherCanAccessCohort`); Admin is unrestricted.

## Non-Functional Requirements (NFR)

Inherits `security-platform`. Specifics:
- **Authz:** authoring/management Admin/Teacher (teacher cohort-scoped); taking =
  enrolled participant.
- **Audit:** create/update/publish/delete recorded.
- **Data:** soft-delete; attempt scores frozen at submit (immutable except
  manual grading).
- **Immutability:** items imported from the question bank are snapshots — later
  bank edits never rewrite existing assessments/attempts.

## Acceptance Criteria (AC)

- [ ] Author creates a multi-item assessment in one request; ≥1 item enforced.
- [ ] Unpublished/soft-deleted assessment not attemptable.
- [ ] `maxAttempts` enforced (0 = unlimited).
- [ ] Submit auto-grades, freezes score, sets `passed` vs `passingScorePercent`.
- [ ] Teacher limited to accessible cohorts; Admin unrestricted.

## Error & Edge Cases

| Trigger | Behavior | Recovery |
|---|---|---|
| Zero items | validation error | add an item |
| Attempt unpublished | rejected | publish first |
| Over max attempts | rejected | n/a |
| Teacher outside cohort | denied | Admin handles |

## Out of Scope / Deferred

- Multi-session / resumable attempts (v1 is one-shot).
- Question randomisation, time limits, partial credit on choice items.
- Migrating legacy `Evaluation` onto this engine.
