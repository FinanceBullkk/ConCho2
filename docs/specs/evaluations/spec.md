---
capability: evaluations
status: stable
owners: [controllers/evaluationController, models/Evaluation]
last_updated: 2026-06-08
related_code:
  - server/controllers/evaluationController.js
  - server/models/Evaluation.js
related_plans: []
---

# Capability: Evaluations (legacy English 4-skill)

> **Source of truth for BEHAVIOR.** This is the legacy English-language
> assessment. The generic engine (`docs/specs/assessments/spec.md`) is the
> forward path; both satisfy `completionPolicy.requiresAssessment`. Still live —
> not yet migrated.

## Purpose

A teacher's skill evaluation of a learner in a class: four English sub-skill
scores (grammar, vocabulary, pronunciation, fluency) with a derived average and a
comment. One evaluation per learner per class.

## Business Requirements (BR)

- **BR-1:** Teachers/Admins record a learner's 4-skill scores per class.
- **BR-2:** Exactly one evaluation per learner per class (updates, not
  duplicates).
- **BR-3:** Evaluations count toward completion's assessment requirement.
- **BR-4:** Learners may read their own evaluation; teacher scoping applies.

## Actors & Use Cases (UC)

- **UC-1 (Admin/Teacher):** creates/updates a learner's evaluation for a class.
- **UC-2 (Participant):** reads their own evaluation.
- **UC-3 (Admin):** deletes an evaluation.

## Entities

- **Evaluation** (`server/models/Evaluation.js`): `classId` + `userId`
  (**unique together**), `level`, `grammarScore`/`vocabularyScore`/
  `pronunciationScore`/`fluencyScore` (each 0–10), `averageScore` (virtual = mean
  of 4, 2 dp), `teacherComment`, `createdBy`.

## Functional Requirements (FR)

### Requirement: One evaluation per learner per class [BR-1, BR-2, UC-1]

The system SHALL enforce a unique `{classId, userId}` evaluation; scores are
0–10; `averageScore` is derived (not stored). `createdBy` records the
Teacher/Admin of record.

#### Scenario: Score out of range
- **GIVEN** a grammarScore of 11
- **WHEN** saved
- **THEN** validation error (max 10)

### Requirement: Feeds completion [BR-3]

The system SHALL make an existing Evaluation satisfy `requiresAssessment` in the
completion engine (alongside a passing generic-assessment attempt).

### Requirement: Role-scoped access [BR-4, UC-2, UC-3]

The system SHALL allow Admin/Teacher writes, Admin delete, and participant
read scoped to self; teacher binding applies per class.

#### Scenario: Participant reads another's evaluation
- **GIVEN** a participant
- **WHEN** they request another learner's evaluation
- **THEN** it is not returned (self-scoped)

## Non-Functional Requirements (NFR)

Inherits `security-platform`. Specifics:
- **Authz:** `/api/evaluations` Admin/Teacher write, Admin delete, participant
  self read.
- **Audit:** create/update/delete recorded (entity `Evaluation`).
- **Data:** unique `{classId,userId}`.

## Acceptance Criteria (AC)

- [ ] One evaluation per learner per class; scores 0–10; average derived.
- [ ] Existing evaluation satisfies completion's assessment requirement.
- [ ] Participant reads only own; Admin/Teacher write; Admin delete.

## Error & Edge Cases

| Trigger | Behavior | Recovery |
|---|---|---|
| Score >10 / <0 | validation error | fix score |
| Duplicate {class,user} | unique error | update existing |
| Participant reads other | not returned | own only |

## Out of Scope / Deferred

- Migrating Evaluation onto the generic assessment engine.
- Non-English skill dimensions (fixed 4 skills).
