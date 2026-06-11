---
capability: feedback
status: stable
owners: [domains/learning/feedback]
last_updated: 2026-06-08
related_code:
  - server/domains/learning/feedback/use-cases.js
  - server/domains/learning/feedback/controller.js
  - server/domains/learning/feedback/repository.js
  - server/models/Feedback.js
related_plans:
  - plans/260603-1733-feedback-ui
---

# Capability: Feedback

> **Source of truth for BEHAVIOR.** Feeds `completionPolicy.requiresFeedback` in
> `docs/specs/completion-and-certificates/spec.md`.

## Purpose

End-of-cohort learner feedback/survey. The minimal honest foundation that lets
the completion engine verify a `requiresFeedback` rule (previously unverifiable,
so completion reported it permanently unmet). One feedback per learner per
cohort.

## Business Requirements (BR)

- **BR-1:** A learner submits one feedback per cohort; re-submitting updates it.
- **BR-2:** An overall rating (1–5) is required; optional dimension ratings +
  comment.
- **BR-3:** Completion can check whether a learner submitted feedback.
- **BR-4:** An Admin may submit on a learner's behalf.

## Actors & Use Cases (UC)

- **UC-1 (Participant):** submits/updates end-of-cohort feedback.
- **UC-2 (Admin):** submits feedback on behalf of a learner.
- **UC-3 (Admin/Teacher):** reads feedback for reporting.

## Entities

- **Feedback** (`server/models/Feedback.js`): `cohortId` + `userId`
  (**unique together** — upsert on resubmit), `programId` (denorm), `rating`
  (required 1–5), `contentRating`/`instructorRating` (optional 1–5), `comment`
  (≤2000 chars), `submittedBy`, soft-delete fields (reserved; no delete endpoint).

## Functional Requirements (FR)

### Requirement: One feedback per learner per cohort (upsert) [BR-1, UC-1]

The system SHALL upsert on `{cohortId, userId}` so a re-submission updates the
existing record rather than creating a duplicate.

#### Scenario: Resubmit feedback
- **GIVEN** a learner who already submitted feedback for a cohort
- **WHEN** they submit again with a new rating
- **THEN** the single record updates (no duplicate)

### Requirement: Required overall rating [BR-2, UC-1]

The system SHALL require an overall `rating` in 1–5; dimension ratings are
optional 1–5; `comment` ≤ 2000 chars.

#### Scenario: Out-of-range rating
- **GIVEN** a rating of 6
- **WHEN** submitted
- **THEN** it is rejected (validation)

### Requirement: Completion can verify submission [BR-3]

The system SHALL expose whether a learner has submitted feedback for a cohort so
the completion engine can satisfy `requiresFeedback`.

### Requirement: Submit on behalf [BR-4, UC-2]

The system SHALL record `submittedBy` (the actor), which may differ from `userId`
when an Admin submits on a learner's behalf.

## Non-Functional Requirements (NFR)

Inherits `security-platform`. Specifics:
- **Authz:** learner submits own; Admin may submit for others; reads scoped
  (learner own, Admin/Teacher for reporting).
- **Audit:** submit recorded.
- **Data:** unique `{cohortId,userId}`; reads filter `isDeleted:false`.

## Acceptance Criteria (AC)

- [ ] One record per learner per cohort; resubmit updates it.
- [ ] Overall rating required and within 1–5; comment ≤ 2000.
- [ ] Completion can check feedback submission.
- [ ] `submittedBy` recorded (supports submit-on-behalf).

## Error & Edge Cases

| Trigger | Behavior | Recovery |
|---|---|---|
| Missing/oversized rating | validation error | rating 1–5 |
| Comment > 2000 chars | validation error | shorten |
| Duplicate submit | upsert (updates) | n/a |

## Out of Scope / Deferred

- Generic configurable survey/question engine (YAGNI — fixed fields for now).
- Feedback delete/trash flow (soft-delete fields reserved, no endpoint).
- Anonymous feedback.
