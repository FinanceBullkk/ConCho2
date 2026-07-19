---
capability: enrollment
status: evolving
owners: [domains/learning/enrollment, controllers/enrollmentController]
last_updated: 2026-07-19
related_code:
  - server/domains/learning/enrollment/use-cases.js
  - server/domains/learning/enrollment/writes.js
  - server/domains/learning/enrollment/prerequisites.js
  - server/domains/learning/enrollment/repository.js
  - server/domains/learning/enrollment/dto.js
  - server/domains/learning/enrollment/controller.js
  - server/domains/learning/enrollment/schemas.js
  - server/domains/groups/enrollment-sync.js
  - server/models/Enrollment.js
  - server/controllers/enrollmentController.js
  - client/src/features/learning/EnrollLearnersModal.jsx
  - client/src/features/learner/MyProgramsPage.jsx
related_plans:
  - plans/260602-2125-cohort-based-enrollment
  - plans/260602-2247-m1-self-enroll-nomination-session-modes
  - plans/260603-2313-learner-catalog-self-enroll
---

# Capability: Enrollment

> **Source of truth for BEHAVIOR.** `status: evolving` — cohort-based + self-
> enroll + **Admin bulk-enroll** are built; the dedicated nomination workflow is
> persisted-but-not-yet-enforced (noted below). `capacityPolicy.maxParticipants`
> is now **enforced** at enrollment (Wave E2), including across a bulk batch.
> (Session `schedulingMode` gating is enforced — see `scheduling-and-booking`.)

## Purpose

Records who is studying what. Two shapes coexist during migration:
**team-based** enrollment (legacy: a learner's membership period in a Team, an
audit trail of transfers) and **cohort-based** enrollment (L&D: a learner
enrolled directly into a Cohort with `teamId=null`). Cohort-based enrollment adds
self-enroll with prerequisite gating.

> **Convergence (Phase 2, read 2026-06-14):** the two shapes are **one Enrollment
> concept read through one surface**. `GET /api/learning/enrollments/mine`
> (self-scoped) returns a learner's enrollments across BOTH modes in one shape,
> each row tagged `mode: 'group'` (joined via a team) or `mode: 'direct'`
> (enrolled straight into the cohort). The learner "My programs" list consumes it,
> so a team-booked learner finally sees their cohort there. No model merge, no
> data move (per ADR `converge-to-one-training-model`).
>
> **Convergence (Phase 2, write-spine 2026-06-15):** the **create** write path is
> now unified — both modes create their Active enrollment through ONE spine
> (`domains/learning/enrollment/writes.createActiveEnrollment` →
> `repository.insertActiveEnrollment`), and team membership-sync now publishes the
> same `ENROLLMENT_CREATED` domain event cohort enroll does, so notification (the
> `cohort_enrolled` bell) and automation react uniformly for both modes. Team
> events fire **post-commit** (a rolled-back team transaction never emits) and
> only when the team has a cohort.
>
> **Convergence (Phase 2, transfer 2026-06-18):** the team **transfer** path now
> also publishes `ENROLLMENT_CREATED` for the new target-team enrollment —
> **but only when the learner lands in a DIFFERENT cohort** than the one they
> left (a same-cohort team rebalance stays email-only, so the transferred learner
> is never double-notified). Still deferred: the member **drop** close-path
> (status→Dropped) keeps its team-specific `sendEnrollmentDropped` email and emits
> no unified event (a drop is a close, not a create).

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

### Requirement: Bulk cohort enrollment [BR-1, BR-4, UC-1]

The system SHALL let an **Admin** (`enrollment.manage` only — no self path) enroll
many learners into one cohort in a single request
(`POST /api/learning/enrollments/bulk`, `{cohortId, userIds[1..500]}`).
Enrollment is **partial-success**: each learner is attempted independently and a
per-learner skip reason is returned rather than failing the batch. A learner
already actively enrolled is skipped (`already_enrolled`); once the program's
`capacityPolicy.maxParticipants` is reached the remaining learners are skipped
(`cohort_full`). The cohort + capacity policy are read once; each admitted
learner gets a `cohort_enrolled` in-app notification (DRY with single enroll).
The batch is audited once (`bulk-enrolled`, with the enrolled ids + skip list).

#### Scenario: Bulk enroll with a duplicate
- **GIVEN** learner A is already enrolled and learners A, B are submitted
- **WHEN** an Admin bulk-enrolls
- **THEN** B is enrolled, A is skipped `already_enrolled`, response `enrolledCount=1`

#### Scenario: Bulk enroll past capacity
- **GIVEN** a cohort whose program `maxParticipants=1` and two learners submitted
- **WHEN** an Admin bulk-enrolls
- **THEN** one is enrolled, the other is skipped `cohort_full`

#### Scenario: Non-admin bulk enroll
- **GIVEN** a non-Admin caller
- **WHEN** they POST `/enrollments/bulk`
- **THEN** **403** (bulk has no self path)

### Requirement: Withdraw [BR-1, UC-3]

The system SHALL let an Admin or the learner withdraw an **Active** cohort
enrollment, setting status → Dropped; non-active → 409, non-owner non-admin → 403.

### Requirement: Scoped listing [BR-5, UC-4]

The system SHALL scope enrollment lists: a Participant sees only their own;
Admin/Teacher may filter by cohort/learner.

### Requirement: Unified self enrollment read [BR-5, UC-4]

The system SHALL expose one self-scoped read
(`GET /api/learning/enrollments/mine`) returning the caller's enrollments across
**both** modes — team-based (group) and cohort-based (direct) — in one shape,
each row tagged `mode` (`group` | `direct`). The read is always scoped to the
caller (no cross-learner access) regardless of role; rows carry the cohort
(`cohortId`/`cohortCode`/`cohortName`) and, for group rows, the `group`
(`{id,name}`).

#### Scenario: Learner enrolled both ways
- **GIVEN** a learner with a team-based enrollment AND a direct cohort enrollment
- **WHEN** they GET `/api/learning/enrollments/mine`
- **THEN** both rows return in one list, tagged `mode: 'group'` and `mode: 'direct'`

#### Scenario: Self-scoped
- **GIVEN** another learner's enrollments exist
- **WHEN** a learner reads `/enrollments/mine`
- **THEN** only their own rows return; another learner's never leak

#### Scenario: Unauthenticated
- **GIVEN** no session
- **WHEN** `/enrollments/mine` is requested
- **THEN** **401**

### Requirement: Uniform enrollment-created event (both modes) [BR-1, UC-1]

When an Active enrollment is created by an Admin action — **either** a direct
cohort enroll **or** a team membership-sync that adds a member to a team bound to
a cohort — the system SHALL publish a single `ENROLLMENT_CREATED` domain event so
cross-cutting concerns (the `cohort_enrolled` in-app bell + enrollment automation)
react uniformly. Self-enroll is exempt (already confirmed in the UI). A team event
fires **post-commit** and **only** when the team has a cohort; a program-less team
publishes nothing.

#### Scenario: Admin adds a member to a team with a cohort
- **GIVEN** a team bound to a cohort
- **WHEN** an Admin adds a learner to that team
- **THEN** the learner gets a `cohort_enrolled` in-app bell (same shape as a
  direct cohort enrollee)

#### Scenario: Program-less team
- **GIVEN** a team with no cohort (`classId` null)
- **WHEN** an Admin adds a learner to it
- **THEN** an enrollment is created but **no** event/bell is published

#### Scenario: Rolled-back team transaction
- **GIVEN** a team update whose transaction fails after the enrollment write
- **WHEN** the transaction rolls back
- **THEN** no `ENROLLMENT_CREATED` event is emitted (events flush only post-commit)

#### Scenario: Transfer to a different cohort
- **GIVEN** a learner with an Active enrollment in a team bound to cohort A
- **WHEN** an Admin transfers them to a team bound to cohort B (B ≠ A)
- **THEN** the new target enrollment fires `ENROLLMENT_CREATED` and the learner
  gets a `cohort_enrolled` bell (in addition to the legacy transfer email)

#### Scenario: Same-cohort rebalance
- **GIVEN** two teams bound to the SAME cohort
- **WHEN** an Admin transfers a learner between them
- **THEN** no `ENROLLMENT_CREATED` event fires (no redundant bell); the learner
  receives the transfer email only

### Requirement: Staff nomination enrollment supports late joiners [BR-1]

Admin and Coordinator (`enrollment.manage`) SHALL create or bulk-create direct
Enrollments for a nomination Cohort. An English Enrollment may carry
`startSessionNumber >= 1`; values beyond the Cohort's total session count are
rejected. Attendance/eligibility treats earlier sessions as not applicable.

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
- [ ] Enrolling past program `maxParticipants` → 422 (all roles); raising the cap admits more.
- [ ] Withdraw only Active, by Admin or learner; else 409/403.
- [ ] Participant lists only own enrollments.
- [ ] Admin bulk-enrolls many in one call; duplicates → `already_enrolled`,
      over-capacity → `cohort_full` (partial success); non-admin → 403.
- [ ] `/enrollments/mine` returns both team-based (`group`) and cohort-based
      (`direct`) enrollments in one shape, self-scoped; unauthenticated → 401.
- [ ] Admin adding a member to a cohort-bound team writes a `cohort_enrolled`
      bell for that member (same as direct enroll); a program-less team writes none.
- [ ] Transferring a learner to a DIFFERENT cohort writes a `cohort_enrolled`
      bell (plus the transfer email); a same-cohort rebalance writes no bell.

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
- **Cohort capacity** (`capacityPolicy.maxParticipants`) — **enforced (Wave E2,
  2026-06-09)**: enrolling past the program's `maxParticipants` is rejected
  (422), for all roles (a data-integrity cap, not a self-enroll gate). App-level
  count check — a rare concurrent race past the cap is a documented limitation
  (strict enforcement would need a transaction lock). `maxParticipantsPerSession`
  (per-session) is enforced in `scheduling-and-booking`.
- Cohort-based vocabulary fully replacing team enrollment — in progress. **Read
  layer converged (Phase 2, 2026-06-14):** one self read serves both modes
  (`/enrollments/mine`). **Create write-spine + event converged (Phase 2,
  2026-06-15):** both modes create through one spine and publish
  `ENROLLMENT_CREATED`, so notification/automation subscribe uniformly (team
  events post-commit, cohort-scoped). **Transfer converged (Phase 2,
  2026-06-18):** the team transfer path fires `ENROLLMENT_CREATED` for the new
  enrollment when the learner moves to a different cohort (same-cohort rebalance
  stays email-only). Still deferred: the member **drop** close-path keeps its
  team-specific `sendEnrollmentDropped` email (a close, not a create — no unified
  event) — tracked in the converge plan.
