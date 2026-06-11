---
capability: grading
status: stable
owners: [domains/assessment (grading, manual-grading-use-cases)]
last_updated: 2026-06-08
related_code:
  - server/domains/assessment/grading.js
  - server/domains/assessment/manual-grading-use-cases.js
  - server/domains/assessment/access.js
  - server/models/AssessmentAttempt.js
related_plans:
  - plans/260603-2239-manual-grading-short-text
---

# Capability: Grading (Auto & Manual)

> **Source of truth for BEHAVIOR.** Grades attempts produced by
> `docs/specs/assessments/spec.md`. Auto-grading is a pure function (no DB/HTTP).

## Purpose

Score assessment attempts. Objective items grade automatically and immediately at
submit; free-text (`short_text`) items can additionally be re-graded by a
facilitator. Scores roll up to a percentage and a pass/fail flag that feeds
completion.

## Business Requirements (BR)

- **BR-1:** Objective items grade deterministically with no human in the loop.
- **BR-2:** A facilitator may override the grade of free-text answers.
- **BR-3:** A manual grade must never exceed the item's points and must recompute
  the attempt total.
- **BR-4:** Only authorised facilitators (cohort access) may manually grade.

## Actors & Use Cases (UC)

- **UC-1 (System):** auto-grades every attempt at submit.
- **UC-2 (Admin/Teacher):** manually grades `short_text` answers and the attempt
  is recalculated.

## Entities

- **AssessmentAttempt.answers[]** (`server/models/AssessmentAttempt.js`):
  `pointsEarned`/`pointsPossible`/`correct` (auto) plus
  `manualPointsEarned`/`manualCorrect`/`manualNote`/`manualGradedBy`/
  `manualGradedAt` (manual overlay).

## Functional Requirements (FR)

### Requirement: Deterministic auto-grading [BR-1, UC-1]

The system SHALL grade each item all-or-nothing: choice items earn full points
only on an **exact set match** of selected indexes to correct indexes; a
`short_text` item earns full points on a **trimmed, case-insensitive** match to
any accepted answer; unanswered/unknown items earn zero. Total `scorePercent` =
`round2(score/maxScore*100)`; `passed` = `scorePercent >= passingScorePercent`.

#### Scenario: Multi-choice exact match
- **GIVEN** a multiple_choice item with correct {0,2}
- **WHEN** the learner selects {0,2}
- **THEN** full points; selecting {0} or {0,1,2} earns zero

#### Scenario: short_text case/space-insensitive
- **GIVEN** accepted answer "Paris"
- **WHEN** the learner answers " paris "
- **THEN** full points

### Requirement: Manual grade of free-text only [BR-2, BR-3, UC-2]

The system SHALL allow manual grading of `short_text` answers only (others →
422), reject a manual score exceeding the item's points (422), set
`correct = pointsEarned >= pointsPossible && pointsPossible > 0`, record grader +
timestamp + note, and recompute the attempt's score/percent/passed.

#### Scenario: Grade a free-text answer
- **GIVEN** a submitted attempt with a short_text answer worth 5 points
- **WHEN** a teacher awards 4
- **THEN** that answer = 4 points, the attempt total and pass flag recompute, and
  grader/time are recorded

#### Scenario: Grade a choice item
- **GIVEN** a manual grade targeting a single_choice answer
- **WHEN** submitted
- **THEN** **422** ("Only short_text answers can be manually graded")

#### Scenario: Over-award
- **GIVEN** an item worth 5 points
- **WHEN** a manual score of 6 is submitted
- **THEN** **422** ("Manual score cannot exceed item points")

#### Scenario: Unknown answer target
- **GIVEN** a manual grade for an itemId not in the attempt
- **WHEN** submitted
- **THEN** **404** ("Attempt answer not found …")

### Requirement: Authorised graders only [BR-4, UC-2]

The system SHALL require `assertTeacherCanAccessCohort(actor, cohort, 'grade')`;
Admin is unrestricted, Teachers limited to accessible cohorts.

## Non-Functional Requirements (NFR)

Inherits `security-platform`. Specifics:
- **Authz:** Admin/Teacher (cohort-scoped) for manual grading.
- **Audit:** manual grade recorded (who/when/note on the answer).
- **Determinism:** auto-grader is pure & unit-tested; rounding to 2 decimals.

## Acceptance Criteria (AC)

- [ ] Choice grading is exact-set, all-or-nothing.
- [ ] short_text auto-grade trims + case-folds against accepted answers.
- [ ] `passed` = scorePercent ≥ passingScorePercent.
- [ ] Manual grade only on short_text (else 422); can't exceed points (422).
- [ ] Manual grade recomputes attempt total/pass and records grader/time/note.
- [ ] Unknown item target → 404; unauthorised grader → denied.

## Error & Edge Cases

| Trigger | Behavior | Recovery |
|---|---|---|
| Manual grade non-short_text | 422 | only free-text |
| Score > item points | 422 | lower the score |
| Item not in attempt | 404 | correct itemId |
| Teacher outside cohort | denied | Admin grades |

## Out of Scope / Deferred

- Partial credit / rubrics on choice items.
- Regrade-all on assessment edit (scores are frozen snapshots).
