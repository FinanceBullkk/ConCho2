---
capability: completion-and-certificates
status: stable
owners: [domains/learning/completion]
last_updated: 2026-06-08
related_code:
  - server/domains/learning/completion/use-cases.js
  - server/domains/learning/completion/repository.js
  - server/models/Certificate.js
  - server/models/LearningProgram.js
related_plans:
  - plans/260603-1043-wave-b-completion-certificates
---

# Capability: Completion & Certificates

> **Source of truth for BEHAVIOR.** Reads `completionPolicy` from
> `docs/specs/learning-catalog/spec.md`; consumes attendance, assessment
> (`grading`), and feedback signals. Certificate validity feeds
> `docs/specs/compliance-and-recertification/spec.md`.

## Purpose

Decide whether a learner completed a cohort against its program's
`completionPolicy`, and issue an immutable certificate as durable proof. The
completion check is a pure read across three dimensions (attendance, assessment,
feedback); the certificate snapshots the evidence so it stays true even if the
cohort/attendance later change.

## Business Requirements (BR)

- **BR-1:** Completion is evaluated against the program's policy (attendance
  threshold, assessment required, feedback required).
- **BR-2:** A certificate is issued only when the learner is complete.
- **BR-3:** A certificate is immutable evidence — it snapshots the proof and is
  never silently changed; lifecycle is Issued → Revoked (never hard-deleted).
- **BR-4:** Exactly one active certificate per learner per cohort.
- **BR-5:** Certificates are publicly verifiable by an opaque code without
  exposing learner data lookups.
- **BR-6:** Learners may only view their own completion/certificates.

## Actors & Use Cases (UC)

- **UC-1 (Admin/Teacher/learner):** checks a learner's completion breakdown.
- **UC-2 (Admin):** issues a certificate to a complete learner.
- **UC-3 (Admin):** revokes an issued certificate with a reason.
- **UC-4 (Anyone):** verifies a certificate by its verification code.

## Entities

- **Certificate** (`server/models/Certificate.js`): `certificateNumber`
  (unique serial CERT-YYYY-NNNNNN, atomic Counter), `verificationCode` (unique
  opaque token), `userId`, `cohortId`, `programId`, frozen snapshot
  (`learnerName`/`programName`/`cohortCode`/`completionSnapshot`), `issuedBy`/`At`,
  `validFrom`/`validUntil`/`validityDays`, `status` (Issued/Revoked),
  `revokedAt`/`Reason`, soft-delete. **Partial unique `{userId,cohortId}` where
  Issued & not deleted** (one active cert per learner/cohort).

## Functional Requirements (FR)

### Requirement: Three-dimension completion evaluation [BR-1, UC-1]

The system SHALL compute `complete = attendanceMet && assessmentMet &&
feedbackMet`, where:
- attendance: `round2(attended/total*100) >= attendanceThresholdPercent`;
- assessment: not required OR a legacy Evaluation exists OR a passing assessment
  attempt exists;
- feedback: not required OR feedback submitted.
The evaluation is a pure read and never mutates.

#### Scenario: Meets attendance + passing attempt
- **GIVEN** policy 80% attendance + assessment required, learner at 90% with a
  passing attempt and no feedback requirement
- **WHEN** completion is evaluated
- **THEN** `complete = true`

#### Scenario: Missing required feedback
- **GIVEN** a policy requiring feedback the learner hasn't submitted
- **WHEN** evaluated
- **THEN** `complete = false`, feedback reason `feedback-not-submitted`

### Requirement: Issue only when complete [BR-2, UC-2]

The system SHALL refuse issuance when the learner is not complete (**422**).

### Requirement: One active certificate per learner/cohort [BR-4, UC-2]

The system SHALL reject a second active certificate (app check + partial unique
index backstop; concurrent race → **409**).

#### Scenario: Concurrent issue
- **GIVEN** two parallel issue calls for the same learner+cohort
- **WHEN** both pass the app-level check
- **THEN** one succeeds; the other → 409

### Requirement: Immutable snapshot at issue [BR-3, UC-2]

On issue the system SHALL freeze learner/program/cohort names and the completion
breakdown onto the certificate, set serial + verification code, and compute
`validUntil` from `validityDays` (null = no expiry).

### Requirement: Revoke, never delete [BR-3, UC-3]

The system SHALL move an Issued certificate → Revoked (with reason); revoking a
non-Issued certificate → **409**. Hard deletion is never performed.

### Requirement: Public verification [BR-5, UC-4]

The system SHALL resolve a certificate by `verificationCode` at a public endpoint
(the serial is printable without being the lookup key).

### Requirement: Learner self-scoping [BR-6, UC-1]

The system SHALL restrict a Participant to their own completion/certificates
(403 on requesting another learner's).

## Non-Functional Requirements (NFR)

Inherits `security-platform`. Specifics:
- **Authz:** issue/revoke Admin; completion read scoped (learner own);
  verification public.
- **Audit:** issue/revoke recorded.
- **Data:** partial unique active-cert index (E11000 → 409); snapshots immutable;
  soft-delete distinct from Revoked.

## Acceptance Criteria (AC)

- [ ] Completion = attendance AND assessment AND feedback dimensions met.
- [ ] Issue refused if not complete (422).
- [ ] One active cert per learner/cohort; concurrent → 409.
- [ ] Issued cert snapshots evidence + serial + verification code + validity.
- [ ] Revoke only from Issued (else 409); never hard-deleted.
- [ ] Public verify by code; learner can't view others' completion (403).

## Error & Edge Cases

| Trigger | Behavior | Recovery |
|---|---|---|
| Not complete | 422 | meet policy |
| Active cert exists | 409 | revoke first |
| Concurrent issue | one 409 | n/a |
| Revoke non-Issued | 409 | n/a |
| Learner views another | 403 | own only |
| Cohort not found | 404 | valid cohort |

## Out of Scope / Deferred

- PDF certificate rendering / branded templates.
- Auto-issue on completion (issuance is an explicit Admin action).
- Recertification scheduling — see `compliance-and-recertification`.
