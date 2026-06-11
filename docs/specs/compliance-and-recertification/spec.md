---
capability: compliance-and-recertification
status: stable
owners: [domains/learning/reports (compliance)]
last_updated: 2026-06-08
related_code:
  - server/domains/learning/reports/compliance-use-cases.js
  - server/domains/learning/reports/compliance-certificate-state.js
  - server/domains/learning/reports/compliance-report-shape.js
  - server/models/Certificate.js
  - server/models/Assignment.js
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

- Auto-creating recertification assignments (identification only today).
- Reminder emails for expiring certs (uses `assignments-and-reminders` cadence
  where wired).
- Org-wide compliance dashboards beyond the report shape.
