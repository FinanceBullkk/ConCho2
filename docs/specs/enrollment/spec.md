---
capability: enrollment
status: evolving
owners: [domains/learning/enrollment, controllers/enrollmentController]
last_updated: 2026-06-08
related_code:
  - server/domains/learning/enrollment/use-cases.js
  - server/domains/learning/enrollment/prerequisites.js
  - server/domains/learning/enrollment/repository.js
  - server/models/Enrollment.js
  - server/controllers/enrollmentController.js
related_plans:
  - plans/260602-2125-cohort-based-enrollment
  - plans/260602-2247-m1-self-enroll-nomination-session-modes
  - plans/260603-2313-learner-catalog-self-enroll
---

# Capability: Enrollment

> **Source of truth for BEHAVIOR.** `status: evolving` — cohort-based + self-
> enroll are built; nomination & full `schedulingMode` gating are
> persisted-but-not-fully-enforced (noted below).

## Purpose

Records who is studying what. Two shapes coexist during migration:
**team-based** enrollment (legacy: a learner's membership period in a Team, an
audit trail of transfers) and **cohort-based** enrollment (L&D: a learner
enrolled directly into a Cohort with `teamId=null`). Cohort-based enrollment adds
self-enroll with prerequisite gating.

## Business Requirements (BR)

- **BR-1:** The system records each learner's enrollment with a status lifecycle
  and full history (joins/transfers/drops).
- **BR-2:** Learners may self-enroll **only** into programs that allow it.
- **BR-3:** Self-enrollment must respect program prerequisites.
- **BR-4:** A learner cannot hold two active enrollments in the same cohort
  (even under concurrency).
- **BR-5:** Learners see only their own enrollments; Admins see all.

## Actors & Use Cases (UC)

- **UC-1 (Admin):** enrolls any learner into any cohort.
- **UC-2 (Participant):** self-enrolls into a `self_enroll` program's cohort.
- **UC-3 (Admin or learner):** withdraws an active enrollment (→ Dropped).
- **UC-4 (Participant):** lists their own enrollments.

## Entities

- **Enrollment** (`server/models/Enrollment.js`): `userId`, `teamId`
  (null = cohort-based), `classId`, `joinedAt`/`leftAt`, `status`
  (Active/On-hold/Completed/Dropped/Transferred), `transferredTo`, `note`.
  - **Partial unique indexes:** `{userId,teamId}` where status Active &
    teamId is objectId (team enrollments); `{userId,classId}` where status
    Active & teamId is null (cohort enrollments) — the two never overlap.

## Functional Requirements (FR)

### Requirement: Authorized cohort enrollment [BR-2, UC-1, UC-2]

The system SHALL allow an Admin to enroll any learner; a non-Admin may enroll
**only themselves** and **only** when the cohort's program `schedulingMode ===
'self_enroll'`.

#### Scenario: Self-enroll allowed program
- **GIVEN** a participant and a cohort whose program is `self_enroll`
- **WHEN** they enroll themselves
- **THEN** an active cohort enrollment is created

#### Scenario: Self-enroll disallowed program
- **GIVEN** a cohort whose program is not `self_enroll`
- **WHEN** a participant tries to self-enroll
- **THEN** **403** ("This program does not allow self-enrollment")

#### Scenario: Enroll someone else
- **GIVEN** a non-Admin
- **WHEN** they try to enroll a different learner
- **THEN** **403**

### Requirement: Prerequisite gating on self-enroll [BR-3, UC-2]

The system SHALL block self-enrollment when the program declares
`prerequisitePrograms` the learner has not completed (direct prerequisites, one
level). "Completed" = an Issued certificate for the program, or the completion
engine passing for a participated cohort. Admins may override.

#### Scenario: Unmet prerequisite
- **GIVEN** program B requires program A and the learner hasn't completed A
- **WHEN** they self-enroll in a B cohort
- **THEN** **422** ("Prerequisite not met: complete A first")

### Requirement: No duplicate active enrollment [BR-4, UC-1]

The system SHALL reject a second active enrollment for the same learner+cohort;
the app-level check is the fast path, the partial unique index is the
concurrency backstop (E11000 → 409).

#### Scenario: Concurrent double enroll
- **GIVEN** two parallel enroll requests for the same learner+cohort
- **WHEN** both pass the app check
- **THEN** one succeeds; the other gets **409**

### Requirement: Withdraw [BR-1, UC-3]

The system SHALL let an Admin or the learner withdraw an **Active** cohort
enrollment, setting status → Dropped; non-active → 409, non-owner non-admin → 403.

### Requirement: Scoped listing [BR-5, UC-4]

The system SHALL scope enrollment lists: a Participant sees only their own;
Admin/Teacher may filter by cohort/learner.

## Non-Functional Requirements (NFR)

Inherits `security-platform`. Specifics:
- **Authz:** legacy `/api/enrollments` Admin-only; cohort enroll/withdraw under
  `/api/learning` enforce self/Admin in the use-case.
- **Audit:** enroll/withdraw/transfer recorded.
- **Data:** partial unique indexes scope team vs cohort enrollments separately;
  history preserved (records closed, not deleted).

## Acceptance Criteria (AC)

- [ ] Admin enrolls anyone; participant self-enrolls only `self_enroll` programs.
- [ ] Non-admin enrolling another → 403.
- [ ] Unmet prerequisite on self-enroll → 422; Admin overrides.
- [ ] Duplicate active enrollment → 409 (incl. concurrent race).
- [ ] Withdraw only Active, by Admin or learner; else 409/403.
- [ ] Participant lists only own enrollments.

## Error & Edge Cases

| Trigger | Behavior | Recovery |
|---|---|---|
| Self-enroll non-self program | 403 | Admin enrolls |
| Enroll another (non-admin) | 403 | Admin enrolls |
| Unmet prerequisite | 422 | complete prereq |
| Duplicate active | 409 | already enrolled |
| Withdraw non-active | 409 | n/a |
| Cohort not found/deleted | 404 | choose another |

## Out of Scope / Deferred (evolving)

- **Nomination mode:** `schedulingMode='nomination'` is persisted but has no
  distinct enforced flow (Admins enroll directly, which covers it). Dedicated
  nomination workflow not built.
- **Transitive prerequisites / cycle detection** — only direct prerequisites.
- **Capacity enforcement** (`capacityPolicy`) — persisted, not enforced.
- Cohort-based vocabulary fully replacing team enrollment — in progress.
