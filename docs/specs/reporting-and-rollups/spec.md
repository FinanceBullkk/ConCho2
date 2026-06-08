---
capability: reporting-and-rollups
status: stable
owners: [domains/learning/reports]
last_updated: 2026-06-08
related_code:
  - server/domains/learning/reports/use-cases.js
  - server/domains/learning/reports/completion-rollup-use-case.js
  - server/domains/learning/reports/repository.js
related_plans:
  - plans/260603-2250-completion-report-rollups
  - plans/260603-2323-learning-reports-lazy-rollups
---

# Capability: Reporting & Rollups

> **Source of truth for BEHAVIOR.** Reuses the completion engine
> (`completion-and-certificates`) and certificate state
> (`compliance-and-recertification`). Read-only — never mutates.

## Purpose

Cohort-level and program-level reports for L&D/HR: per-learner completion
breakdown plus certificate status, summarised into rollups (completion rate,
counts by dimension). Built lazily over the existing completion engine so reports
stay code-truth.

## Business Requirements (BR)

- **BR-1:** Admins/Teachers see a per-learner completion report for a cohort.
- **BR-2:** Reports summarise into a rollup (completion rate + counts).
- **BR-3:** The completion rate must reflect **active** learners only (offboarded/
  soft-deleted learners don't inflate the denominator).
- **BR-4:** Teachers see only cohorts they teach.
- **BR-5:** Reports never mutate data.

## Actors & Use Cases (UC)

- **UC-1 (Admin/Teacher):** opens a cohort completion report.
- **UC-2 (Admin):** views program-level rollups.

## Entities

- Reads `Class`/Cohort, `User`, `Certificate`, completion signals. No own model —
  reports are derived. Rollup built by `buildCompletionRollup`.

## Functional Requirements (FR)

### Requirement: Per-learner cohort completion report [BR-1, BR-5, UC-1]

The system SHALL build, read-only, a row per cohort learner with attendance %,
attendance/assessment/feedback met flags, and certificate status — reusing
`evaluateCompletion` so the report matches the completion engine exactly.

#### Scenario: Cohort report
- **GIVEN** a cohort with enrolled learners
- **WHEN** the report is built
- **THEN** each active learner has a completion breakdown + certificate state, and
  no data is changed

### Requirement: Active-learner rollup [BR-2, BR-3]

The system SHALL drop learner IDs that don't resolve to an active user (soft-
deleted/offboarded) before computing the rollup, so `completionRate` reflects
active learners only.

#### Scenario: Offboarded learner excluded
- **GIVEN** a cohort where one enrolled learner was soft-deleted
- **WHEN** the rollup is computed
- **THEN** that learner is excluded from the denominator (no blank row)

### Requirement: Teacher cohort scoping [BR-4, UC-1]

The system SHALL allow a Teacher to read a cohort report only if
`isTeacherOfClass` permits (else **403**); Admin is unrestricted.

## Non-Functional Requirements (NFR)

Inherits `security-platform`. Specifics:
- **Authz:** Admin all; Teacher cohort-scoped via class binding policy.
- **Read-only:** no mutations; safe to call repeatedly.
- **Performance:** batched lookups (users/certs/learnerIds in parallel); lazy
  rollups computed on read; completion reuse avoids divergent logic.
- **Data integrity:** soft-deleted users auto-excluded (User query hooks).

## Acceptance Criteria (AC)

- [ ] Cohort report = per-learner completion breakdown + certificate state.
- [ ] Report values match the completion engine (single source).
- [ ] Completion rate counts active learners only.
- [ ] Teacher limited to taught cohorts (403 otherwise); Admin unrestricted.
- [ ] No data mutated.

## Error & Edge Cases

| Trigger | Behavior | Recovery |
|---|---|---|
| Cohort not found/deleted | 404 | valid cohort |
| Teacher outside binding | 403 | Admin reads |
| All learners offboarded | rate over 0 active | n/a |

## Out of Scope / Deferred

- Scheduled/emailed report digests.
- Custom report builder / pivot UI.
- Materialised rollup caching (computed lazily for now).
