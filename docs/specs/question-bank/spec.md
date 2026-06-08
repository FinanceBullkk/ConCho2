---
capability: question-bank
status: stable
owners: [domains/assessment (question-bank)]
last_updated: 2026-06-08
related_code:
  - server/domains/assessment/question-bank-use-cases.js
  - server/domains/assessment/question-bank-controller.js
  - server/domains/assessment/question-bank-repository.js
  - server/models/AssessmentQuestion.js
related_plans:
  - plans/260603-2212-assessment-question-bank-foundation
  - plans/260603-2220-assessment-question-bank-ui
---

# Capability: Question Bank

> **Source of truth for BEHAVIOR.** Companion to `docs/specs/assessments/spec.md`.

## Purpose

A library of reusable authored questions so teams don't re-type items per quiz.
Assessments import bank questions as **immutable snapshots**, so editing or
deleting a bank question never rewrites historical assessments or attempts.

## Business Requirements (BR)

- **BR-1:** Authors maintain reusable questions tagged and scoped by program/
  cohort.
- **BR-2:** Importing a bank question into an assessment copies it as a snapshot
  (decoupled from later edits).
- **BR-3:** Questions are soft-deleted, never hard-deleted.

## Actors & Use Cases (UC)

- **UC-1 (Admin/Teacher):** creates/edits/tags/soft-deletes bank questions.
- **UC-2 (Admin/Teacher):** searches/filters the bank (by type/tags/program) and
  imports questions into an assessment.

## Entities

- **AssessmentQuestion** (`server/models/AssessmentQuestion.js`): same shape as an
  assessment item (`type`, `prompt`, `options`, `correctOptionIndexes`,
  `acceptedAnswers`, `points`) plus `explanation`, `tags[]`, `programId`,
  `cohortId`, `createdBy`, soft-delete. Indexes `{type,isDeleted}`, `{tags}`,
  `{programId}`, `{cohortId}`, `{createdBy}`.

## Functional Requirements (FR)

### Requirement: Question CRUD with tagging [BR-1, UC-1]

The system SHALL let authors create/edit/soft-delete bank questions of the
supported item types, with tags and optional program/cohort scoping.

### Requirement: Snapshot import [BR-2, UC-2]

The system SHALL import a bank question into an assessment as a copied item
(optionally retaining `questionBankItemId` as a source link). Subsequent edits to
the bank question MUST NOT alter assessments/attempts that already imported it.

#### Scenario: Edit bank after import
- **GIVEN** a question imported into a published assessment
- **WHEN** the bank question's prompt is later edited
- **THEN** the assessment's copied item is unchanged

### Requirement: Search & filter [UC-2]

The system SHALL support filtering by type, tags, and program/cohort scope.

## Non-Functional Requirements (NFR)

Inherits `security-platform`. Specifics:
- **Authz:** Admin/Teacher (teacher scoped to accessible cohorts/programs).
- **Audit:** create/update/delete recorded.
- **Data:** soft-delete; reads filter `isDeleted:false`.
- **Performance:** tag + type + scope indexes for bank browsing.

## Acceptance Criteria (AC)

- [ ] Author can CRUD + tag questions; soft-delete only.
- [ ] Import copies the question as a snapshot; later bank edits don't propagate.
- [ ] Filter by type/tags/program works.

## Error & Edge Cases

| Trigger | Behavior | Recovery |
|---|---|---|
| Invalid item type | validation error | use a valid type |
| Import deleted question | excluded from bank | pick active one |

## Out of Scope / Deferred

- Versioned questions / question history.
- Difficulty calibration, analytics on item performance.
