---
capability: evaluations
status: stable
owners: [controllers/evaluationController, models/Evaluation]
last_updated: 2026-06-11
related_code:
  - server/controllers/evaluationController.js
  - server/models/Evaluation.js
  - server/routes/evaluationRoutes.js
  - client/src/features/evaluations/EvaluationPage.jsx
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
- **UC-3 (Admin):** deletes an evaluation (SOFT — recoverable; see FR below).

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

### Requirement: Teacher-callable learner roster for grading [BR-1, UC-1]

*(ADDED 2026-06-11 — audit round 3, FLOW-001.)* To grade a learner a Teacher
must first select one. The system SHALL expose `GET /api/evaluations/roster?classId=`
(`roleGuard('Admin','Teacher')`, per-class binding via `evaluationPolicy.canRead`,
`classId` required) returning the class's **Active-enrolment** learners
(`empCode`, `name`, `department`; deduped by user). The Add-evaluation picker
SHALL source candidates from this roster for BOTH roles — never from the
org-wide Admin-only `/api/users` search (which 403'd for Teachers and left the
picker permanently empty, making teacher grading impossible despite the
Admin/Teacher write grant). Least-privilege: a teacher picks from the class
they teach, not the org directory.

#### Scenario: Teacher opens the learner picker
- **GIVEN** a Teacher bound (or legacy-permissive) to a class with Active enrolments
- **WHEN** they open Add-evaluation and the picker loads `/evaluations/roster?classId=`
- **THEN** the class's Active-enrolment learners are listed (Dropped excluded),
  the Teacher selects one and saves scores — **200**, no 403 dead end

#### Scenario: Missing or malformed classId
- **GIVEN** a roster request with no `classId` (or a non-ObjectId value)
- **WHEN** called
- **THEN** **400** (zod) — never a CastError 500; a valid-but-unknown classId → **404**

### Requirement: Delete is SOFT and revivable [BR-2, UC-1, UC-3]

*(MODIFIED 2026-06-11 — audit round 2, DATA-014; was a hard delete.)* Admin
delete SHALL flip `isDeleted`/`deletedAt` (golden rule: evaluation evidence is
never hard-deleted). Trashed rows are excluded from every read (find-family +
`distinct` + `aggregate` hooks — the Excel export aggregate included), a second
delete answers **404**, and the row stays recoverable. The `{classId,userId}`
unique index is FULL: re-upserting the same pair REVIVES the trashed row in
place (same `_id`, `isDeleted:false`, audited with a revive note) instead of
failing E11000. Legacy rows that predate `isDeleted` stay visible and revivable.

#### Scenario: Delete then re-evaluate
- **GIVEN** an evaluation that an Admin soft-deleted
- **WHEN** a Teacher/Admin upserts the same (class, learner) pair
- **THEN** the SAME row revives (`isDeleted:false`, scores updated) — no
  duplicate-key error, and reads see it again

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
