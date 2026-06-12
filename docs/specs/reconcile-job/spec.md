---
capability: reconcile-job
status: stable
owners: [services/reconcileService, controllers/reconcileController, jobs]
last_updated: 2026-06-12
related_code:
  - server/services/reconcileService.js
  - server/controllers/reconcileController.js
  - server/models/ReconcileReport.js
  - server/models/CronRun.js
  - server/jobs
related_plans: []
---

# Capability: Reconcile Job (Data-Integrity)

> **Source of truth for BEHAVIOR.** Runs nightly via cron; shares the
> `CRON_TOKEN` auth model with `assignments-and-reminders`.

## Purpose

A nightly, read-only data-integrity sweep that detects drift between related
collections (schedules, attendance, enrollments, teams) and persists a report for
Admin review. It never fixes data automatically — fixes go through normal CRUD
after a human reviews the report.

## Business Requirements (BR)

- **BR-1:** Detect common integrity drifts without mutating data.
- **BR-2:** Run automatically every night; also runnable on demand by an Admin.
- **BR-3:** Persist each run's findings for review and trend tracking.
- **BR-4:** Cron entry points must be authenticated by `CRON_TOKEN`.

## Actors & Use Cases (UC)

- **UC-1 (Cron):** `POST /api/cron/reconcile` nightly (02:00 UTC).
- **UC-2 (Admin):** triggers a manual run and reads past reports
  (`/api/admin/reconcile`).

## Entities

- **ReconcileReport** (`server/models/ReconcileReport.js`): a run's findings —
  per-check issue lists with `description`, `refs`, `detail`, plus run metadata.
- **CronRun** (`server/models/CronRun.js`): cron execution record.

## Functional Requirements (FR)

### Requirement: Twelve read-only checks [BR-1, UC-1]

The system SHALL run, without mutating data, the checks:
1. `missing_attendance` — past session (≤90d) with fewer Attendance records than
   `enrolledUsers`;
2. `orphaned_enrollment` — Active enrollment whose user left the team's members;
3. `ghost_member` — in `team.members` but no Active enrollment;
4. `empty_future_schedule` — future schedule with 0 enrolled users;
5. `unattached_participant` — Active Participant with no Active enrollment;
6. `duplicate_active_enrollment` — same user holds ≥2 Active enrollments;
7. `orphan_schedule_class` — schedule references a Class that no longer exists;
8. `multi_team_class` — two non-deleted teams claim the same class;
9. `counter_drift` — code counter behind the max code already stored;
10. `soft_deleted_in_team_members` — team.members holds a soft-deleted user;
11. `orphan_room_booking` — RoomBooking row for a deleted/cancelled session
    (bricked room slot);
12. `stale_waitlist_entry` — a `waiting` WaitlistEntry whose session is past,
    cancelled, or deleted and can never seat it (DATA-016).

#### Scenario: Incomplete roll-call
- **GIVEN** a past session with 5 enrolled but 3 attendance records
- **WHEN** reconcile runs
- **THEN** a `missing_attendance` issue is reported (missingCount 2); no data is
  changed

#### Scenario: Stale waitlist row on a finished session
- **GIVEN** a `waiting` WaitlistEntry whose session ended yesterday without a
  seat freeing
- **WHEN** reconcile runs
- **THEN** a `stale_waitlist_entry` issue is reported (reason "session already
  ended"); the entry itself is NOT mutated — resolution stays manual
- **AND** `promoted`/`withdrawn`/`cancelled` rows and rows on future live
  sessions are not flagged

### Requirement: Persist the report [BR-3, UC-1]

The system SHALL persist each run as a `ReconcileReport` with all issues grouped
by check, and record a `Reconcile` audit line.

### Requirement: Scheduled + manual run [BR-2, UC-2]

The system SHALL run nightly via cron and support an Admin-triggered manual run
that produces the same report.

### Requirement: Cron authentication [BR-4, UC-1]

The system SHALL require a valid `CRON_TOKEN` on `/api/cron/*`; the Admin route
uses normal Admin authz.

## Non-Functional Requirements (NFR)

- **Authz:** `/api/cron/reconcile` = `CRON_TOKEN`; `/api/admin/reconcile` = Admin.
- **Read-only:** the service never writes to domain collections (only its report).
- **Performance:** batched aggregates (no N+1); shared queries across checks
  (e.g. enrollments fetched once for checks 2 & 3); 90-day lookback bounded by an
  `endTime` index.
- **Audit:** each run records a `Reconcile` audit entry.
- **Missed-run alerting (OPS-010):** every `CRON_JOBS` entry carries its crontab
  `schedule` so even a pinger-driven run upserts the Sentry monitor config —
  a schedule-less monitor can never fire "missed run" alerts.

## Acceptance Criteria (AC)

- [ ] All twelve checks run read-only and detect their drift types.
- [ ] A ReconcileReport persists per run with grouped issues.
- [ ] Nightly cron + Admin manual run both work and produce reports.
- [ ] `/api/cron/*` rejects requests without a valid CRON_TOKEN.
- [ ] No domain data is mutated by the job.

## Error & Edge Cases

| Trigger | Behavior | Recovery |
|---|---|---|
| Cron without token | 401/403 | supply CRON_TOKEN |
| Unknown check in old report | tolerated on read | (crash-fix shipped) |
| No drift found | empty report persisted | none |

## Out of Scope / Deferred

- Auto-remediation (fixes are manual by design).
- Alerting/notification on new drift (report-only today).
