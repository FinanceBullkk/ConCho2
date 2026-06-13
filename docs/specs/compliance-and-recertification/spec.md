---
capability: compliance-and-recertification
status: stable
owners: [domains/learning/reports (compliance)]
last_updated: 2026-06-13
related_code:
  - server/domains/learning/reports/compliance-use-cases.js
  - server/domains/learning/reports/compliance-certificate-state.js
  - server/domains/learning/reports/compliance-report-shape.js
  - server/domains/learning/completion/expiry-reminder-service.js
  - server/domains/learning/completion/recert-assignment-service.js
  - server/models/Certificate.js
  - server/models/Assignment.js
  - server/models/LearningProgram.js
related_plans:
  - plans/260605-1954-wave-d6-compliance-reporting-recertification
---

# Capability: Compliance & Recertification

> **Source of truth for BEHAVIOR.** Wave D6. Combines mandatory `assignments`
> with `certificate` validity to answer "who is compliant / expiring / overdue".

## Purpose

The compliance view for HR/L&D: for each mandatory assignment and targeted
learner, derive a certificate state (missing / issued / expiring / expired /
revoked) so the organisation can see who needs to (re)certify and when.

## Business Requirements (BR)

- **BR-1:** Each learner × required program resolves to a clear compliance state.
- **BR-2:** A certificate nearing expiry must be flagged for recertification
  (expiring window).
- **BR-3:** Path assignments roll up to the **worst** state across their programs.
- **BR-4:** The report reflects current certificate validity at read time.

## Actors & Use Cases (UC)

- **UC-1 (Admin):** views the compliance report across assignments/learners.
- **UC-2 (Admin):** identifies expiring/expired certificates to schedule
  recertification.

## Entities

- Derived over `Assignment` (target programs/path), `Certificate` (validity),
  `User`. Certificate state machine in `compliance-certificate-state.js`.

## Functional Requirements (FR)

### Requirement: Certificate state derivation [BR-1, BR-2, BR-4, UC-1]

The system SHALL derive per `{learner, program}` a state from the preferred
certificate: `missing` (none / soft-deleted), `revoked`, `issued` (valid, no
expiry or > 30 days out), `expiring` (validUntil within 30 days, end-of-UTC-day),
`expired` (validUntil past). Evaluated against "now" at read time.

#### Scenario: Expiring soon
- **GIVEN** a learner with an Issued certificate expiring in 20 days
- **WHEN** the compliance report is read
- **THEN** their state for that program is `expiring`

#### Scenario: No certificate
- **GIVEN** a learner assigned a program with no certificate
- **WHEN** read
- **THEN** state is `missing`

### Requirement: Worst-state rollup for paths [BR-3, UC-1]

For a path assignment, the system SHALL roll the learner's state across the
path's programs to the **worst** state (weight order issued < expiring < missing
< expired < revoked).

#### Scenario: One program expired in a path
- **GIVEN** a path of 3 programs where 2 are issued and 1 expired
- **WHEN** the learner's path state is computed
- **THEN** it reports `expired` (worst)

### Requirement: Prefer the most authoritative certificate [BR-1]

When multiple certificates exist for a learner+program, the system SHALL prefer
an Issued one, then the most recently issued.

### Requirement: Certificate expiry reminders [BR-2, UC-2]

The system SHALL proactively warn a learner before an **Issued, non-deleted**
certificate lapses. A daily cron
(`POST /api/cron/certificate-expiry-reminders`, `CRON_TOKEN`-protected, monitored
via `CronRun`) scans certificates whose `validUntil` is within the next 30 days
(and not already past) and emails the learner. Two once-per-cert cadence buckets,
idempotent via a `NotificationLog` `cadenceKey` of `<certificateNumber>:<bucket>`:
`expiry_30` (8–30 days out) and `expiry_7` (0–7 days out). The
`certificate_expiring` `NotificationLog` row (channel `email`) doubles as the
in-app bell item (see `assignments-and-reminders`) — a learner with no email
still sees a `skipped` row in the bell. The reminder links to `/me/transcript`.
The same job also sends each **manager a weekly digest**
(`manager_certificate_expiry_digest`, idempotent per manager per ISO-week via
`cadenceKey` `manager_cert_expiry_<isoWeek>`, link `/my-team`) of their direct
reports' expiring certificates.

### Requirement: Recertification auto-assignment [BR-2, UC-2]

For a program that opts in (`LearningProgram.recertifyPolicy.autoAssign` — default
**false**), the same daily job SHALL turn the expiry signal into an **action**:
for each Issued, non-deleted certificate of an auto-assign program whose
`validUntil` is within 30 days, it creates a recert `Assignment` (targetType
`program`, the single learner, `dueDate = validUntil`, `createdBy: null`, tagged
`sourceCertificateId`). The new Assignment then rides the existing machinery
(learner `/home` feed, reminder cadence, manager overdue digest). **Idempotent**:
at most ONE recert assignment EVER per certificate — an existence check (incl.
archived, so an Admin archiving it is respected) plus a partial unique index on
`sourceCertificateId` (race → E11000 → skip). Programs without `autoAssign` are
untouched. v1 acts only in the pre-expiry window (already-expired certs are an
Admin task via the compliance report).

#### Scenario: Auto-assign program with an expiring certificate
- **GIVEN** a program with `recertifyPolicy.autoAssign` and a learner's cert
  expiring in 10 days
- **WHEN** the daily job runs (even twice)
- **THEN** exactly one recert Assignment is created, due at the cert's `validUntil`

#### Scenario: Opt-out program / archived recert assignment
- **GIVEN** a program without `autoAssign`, OR a recert assignment that was
  archived
- **WHEN** the job runs
- **THEN** no (new) recert assignment is created

#### Scenario: Certificate within 7 days of expiry
- **GIVEN** an Issued certificate with `validUntil` 5 days out and a learner email
- **WHEN** the expiry-reminder cron runs (even twice the same day)
- **THEN** exactly one `expiry_7` email + bell row is produced (idempotent)

#### Scenario: Revoked / expired / no-validUntil certificate
- **GIVEN** a revoked, soft-deleted, already-expired, or never-expiring cert
- **WHEN** the cron runs
- **THEN** no reminder is produced

## Non-Functional Requirements (NFR)

Inherits `security-platform`. Specifics:
- **Authz:** Admin (HR/L&D) read; Teacher scoping per class binding where
  applicable.
- **Read-only:** derived report; no mutation.
- **Time:** expiry windows computed at end-of-UTC-day; 30-day expiring window.

## Acceptance Criteria (AC)

- [ ] Per learner×program state ∈ {missing, issued, expiring, expired, revoked}.
- [ ] Expiring window = validUntil within 30 days; expired = past.
- [ ] Path assignment rolls up to the worst program state.
- [ ] Multiple certs → prefer Issued, then most recent.
- [ ] State reflects validity at read time; report never mutates.

## Error & Edge Cases

| Trigger | Behavior | Recovery |
|---|---|---|
| Soft-deleted cert | treated as `missing` | re-issue |
| Revoked cert | state `revoked` | re-issue |
| No validUntil | `issued` (no expiry) | n/a |

## Out of Scope / Deferred

- Recertification for ALREADY-expired certs (v1 acts in the pre-expiry window;
  long-expired certs are an Admin task via the compliance report).
- Path-based recert auto-assignment (program target only in v1).
- Org-wide compliance dashboards beyond the report shape.
