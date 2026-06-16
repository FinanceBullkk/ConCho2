---
capability: reporting-and-rollups
status: stable
owners: [domains/learning/reports, domains/learning/dashboard]
last_updated: 2026-06-16
related_code:
  - server/domains/learning/reports/use-cases.js
  - server/domains/learning/reports/completion-rollup-use-case.js
  - server/domains/learning/reports/training-hours-use-case.js
  - server/domains/learning/reports/repository.js
  - server/domains/learning/dashboard/use-cases.js
  - server/domains/learning/dashboard/repository.js
  - client/src/features/learning/TrainingHoursTab.jsx
related_plans:
  - plans/260603-2250-completion-report-rollups
  - plans/260603-2323-learning-reports-lazy-rollups
  - plans/260610-0830-ltms-2tier-dashboard
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
- **BR-6:** L&D operations get a single dashboard bundle (completion, attendance,
  sessions, overdue assignments, certificate expiry, assessment pass rate,
  feedback averages, training coverage) that degrades per-metric instead of
  failing whole.
- **BR-7:** HR gets an audit-ready **training-hours** report per employee and per
  department (labour-law minimums), derived from attended sessions × duration.

## Actors & Use Cases (UC)

- **UC-1 (Admin/Teacher):** opens a cohort completion report.
- **UC-2 (Admin):** views program-level rollups.
- **UC-3 (Admin/Teacher):** opens the operational dashboard bundle.
- **UC-4 (Admin/Teacher, `report.read`):** opens the training-hours report
  (`GET /api/learning/reports/training-hours?from=&to=&groupBy=user|department&departmentId=`).

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

### Requirement: Executive dashboard bundle + cost config [BR-5, BR-6, UC-3]

`GET /api/learning/dashboard/executive` (capability `report.read` + **Admin-only
inside the use-case**, mirroring the compliance gate) SHALL return one read-only
bundle: coverage (org + by department), a 6-month event trend (enrollments
created, certificates issued — recorded events, since completion is derived),
a Kirkpatrick rollup (L1 feedback average and L2 attempt-level pass rate marked
`measured: true`; L3–L5 marked `measured: false` with a reason), a
certificate-based path-completion (mobility) count, an org-wide certificate
validity rollup, and financial KPIs. Financials SHALL be
`{ configured: false }` with **no numeric fields** unless the `LND_COST_CONFIG`
Setting exists; when configured, `costPerEmployeeMinor` = annual budget /
active users and `costPerCompletionMinor` = annual budget / certificates issued
in the trailing 12 months (integer minor currency units).
When `avgLoadedHourlyCostMinor`, `coordinatorCount`, and
`automationHoursReclaimedPerWeek` are all configured + positive, financials
ALSO include an **efficiency dividend** (ROI §10):
`efficiencyDividendMinor = hoursReclaimedPerWeek × coordinatorCount × 52 ×
avgLoadedHourlyCostMinor`; it is `null` whenever any input is unset (never
fabricated). When configured, financials ALSO carry A1 actuals —
`actualSpendTrailing12MonthsMinor` (Σ logged `CostEntry` over the trailing year)
and `costPerCompletionActualMinor` — surfaced next to the budget-derived
estimates (see [budget-and-cost](../budget-and-cost/spec.md)).
`GET/PUT /api/learning/dashboard/cost-config` (same gating)
read/upsert that Setting; the PUT is validated (integer minor units, 3-letter
currency, optional `coordinatorCount`/`automationHoursReclaimedPerWeek`) and
audit-logged with a before/after diff.

#### Scenario: Admin-only tier
- **GIVEN** a Teacher holding `report.read`
- **WHEN** they request the executive bundle or the cost config
- **THEN** the response is **403** (the coarse capability is not sufficient)

#### Scenario: Financials never fabricated
- **GIVEN** no `LND_COST_CONFIG` Setting
- **WHEN** an Admin requests the executive bundle
- **THEN** `financials` is exactly `{ configured: false }`; after a valid PUT of
  the config, the same request returns computed cost-per-employee and
  cost-per-completion values

### Requirement: Operational dashboard bundle [BR-5, BR-6, UC-3]

`GET /api/learning/dashboard/operational` (capability `report.read`) SHALL
return one read-only bundle composing the completion rollup, attendance totals
(present = the completion engine's attended statuses), session counts split
around now, org-wide overdue assignment counts + top-10 (derived via the D4
status resolver), certificate expiry buckets (expired / ≤30d / ≤60d) + top-10
soonest-expiring, attempt-level assessment pass rate, feedback averages
(overall + by program), and training coverage over a `window` of 30|60|90 days
(default 30). Cohort-scoped metrics use the Teacher class-scope helper;
`assignments` and `coverage` stay org-wide (counts/top-N only — same exposure
as D4 `assignment.read`).

#### Scenario: Admin bundle
- **GIVEN** seeded learning data
- **WHEN** an Admin requests the dashboard
- **THEN** every metric block is populated org-wide, `errors` is empty, and the
  completion block equals the completion rollup endpoint for the same actor

#### Scenario: Per-metric fail-soft
- **GIVEN** one metric's aggregation throws
- **WHEN** the bundle is built
- **THEN** that block is `null`, `errors[]` names the metric, the other blocks
  still compute, and the response stays **200**

#### Scenario: Scope and denial
- **GIVEN** a cohort the Teacher does not teach
- **WHEN** the Teacher requests the dashboard
- **THEN** that cohort's attendance/certificates/sessions are excluded; a
  Participant gets **403**; an invalid `window` gets **400**

### Requirement: Home setup status + at-a-glance [BR-5, UC-3]

`GET /api/learning/dashboard/setup` (capability `report.read`) SHALL return the
Home onboarding checklist + this-week counts, all derived from real data:
- `steps[]` — six boolean config signals (directory=departments exist, program,
  custom roles, automation rule, configured completion policy, coordinators)
  plus `completedSteps`/`totalSteps`.
- `atGlance` — `activeLearners`/`totalEmployees` (active participants vs live
  users), `sessionsThisWeek` (schedules Mon–Sun), `pendingEnrollment`
  (`Waiting for class` users). Counts only — never fabricated.

#### Scenario: Setup signals
- **GIVEN** an Admin on Home
- **WHEN** they load the setup status
- **THEN** six steps return with real `done` flags; a Participant gets **403**

### Requirement: Department performance [BR-2, BR-5, UC-3]

`GET /api/learning/dashboard/departments?window=7|30|90|365` (capability
`report.read`) SHALL return per-department `{ headcount, completionPercent,
coveragePercent, overdueCount }` (sorted by headcount), all from real data:
headcount = live users by `department`; completion = users with ≥1 issued
certificate ÷ headcount; coverage = engaged ÷ active in the window; overdue =
overdue assignments bucketed by the assignee's department. Invalid `window`
falls back to 30.

#### Scenario: Window + denial
- **GIVEN** an Admin requests `?window=365`
- **THEN** `windowDays = 365`; an invalid window falls back to 30; a Participant gets **403**

### Requirement: Program completion trend [BR-1, UC-3]

`GET /api/learning/programs/:id/completion-trend` (capability `report.read`)
SHALL return `series[]` of the last 8 months `{ month: 'YYYY-MM', completions }`,
zero-filled, where completions = certificates issued for the program that month
(real data — drives the Program-detail trend sparkline).

### Requirement: Training-hours report [BR-7, UC-4]

`GET /api/learning/reports/training-hours` (capability `report.read`) SHALL return
training hours over a window (default last 90 days), where a learner's hours = Σ
over their **attended** (`P`/`L`) sessions of that session's duration
(`Schedule.endTime − startTime`). `groupBy=user` returns one row per Participant
(0-hours included so gaps show); `groupBy=department` rolls up
`{ employees, withHours, sessions, hours, avgHours }`. Optional `departmentId`
scopes the set. Read-only — no new model. An invalid date is rejected with **400**.

#### Scenario: Hours from attended sessions
- **GIVEN** a learner attended (`P`) one 2-hour session in the window
- **WHEN** an Admin requests the training-hours report
- **THEN** that learner's row shows `hours: 2`, `sessions: 1`, and the totals + the
  learner's department roll the 2 hours up
- **AND** a Participant (no `report.read`) gets **403**

### Requirement: Evidence pack + saved presets [BR-7, UC-4]

`GET /api/learning/reports/evidence-pack?from=&to=&departmentId=` (capability
`report.read`) SHALL stream a single timestamped **.xlsx** workbook with a Summary
cover sheet, the training-hours table, and the compliance table, and write an
audit line (`entity:'Report'`, action `exported`). It refuses to build a partial
workbook past the compliance row cap (**413**). Saved configs persist via
`ReportPreset` (`name`, `kind`, `filters`, `schedule`, soft-delete):
`GET/POST/PUT/DELETE /api/learning/reports/presets` (all `report.read`; mutations
audited `entity:'ReportPreset'`). The `schedule` field (`none|monthly|quarterly`)
is persisted for a future cron (not yet auto-run). PDF + zip from the handoff are
deferred — no PDF dependency in-repo; the multi-sheet xlsx is itself audit-ready.

#### Scenario: Evidence pack downloads and is audited
- **GIVEN** an Admin requests the evidence pack for a window
- **WHEN** it generates
- **THEN** the response is an `.xlsx` attachment (`evidence-pack-<date>.xlsx`) and an
  `exported` `Report` audit line is written
- **AND** a Participant (no `report.read`) gets **403**

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
- [ ] Training-hours = Σ attended-session durations; per-user + per-department
      rollups; `report.read`-gated; invalid date → 400.
- [ ] Evidence pack streams a timestamped multi-sheet xlsx (summary + hours +
      compliance), audited `entity:'Report'`; saved presets CRUD audited
      `entity:'ReportPreset'`; all `report.read`-gated.
- [ ] Dashboard bundle: completion parity with the rollup endpoint; per-metric
      fail-soft (`null` + `errors[]`, response 200); Teacher class-scoped;
      Participant 403; invalid `window` 400.

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
