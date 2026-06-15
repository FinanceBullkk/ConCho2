---
capability: reconcile-job
status: stable
owners: [services/reconcileService, controllers/reconcileController, jobs]
last_updated: 2026-06-15
related_code:
  - server/services/reconcileService.js
  - server/services/reconcile/healers.js
  - server/controllers/reconcileController.js
  - server/routes/reconcileRoutes.js
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
Admin review. The *sweep* never mutates domain data. Separately, an Admin may
**opt in to auto-heal** the four checks whose fix is deterministic, reversible,
and audited; every other check stays manual and links to the record.

## Business Requirements (BR)

- **BR-1:** Detect common integrity drifts without mutating data.
- **BR-2:** Run automatically every night; also runnable on demand by an Admin.
- **BR-3:** Persist each run's findings for review and trend tracking.
- **BR-4:** Cron entry points must be authenticated by `CRON_TOKEN`.
- **BR-5:** An Admin can apply a SAFE auto-heal for fixable checks; each fix is
  deterministic, audited (`entity:'Reconcile'`), and reversible. Non-safe checks
  are never auto-healed.

## Actors & Use Cases (UC)

- **UC-1 (Cron):** `POST /api/cron/reconcile` nightly (02:00 UTC).
- **UC-2 (Admin):** triggers a manual run, reads past reports + the drift trend
  (`/api/admin/reconcile`, `/api/admin/reconcile/trend`), and auto-heals a safe
  check (`POST /api/admin/reconcile/heal`).

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

### Requirement: Safe auto-heal [BR-5, UC-2]

The system SHALL let an Admin auto-heal exactly four SAFE checks via
`POST /api/admin/reconcile/heal { check, refs? }`:
- `orphan_room_booking` → delete the dangling RoomBooking ledger row (frees the slot);
- `stale_waitlist_entry` → set the `waiting` entry to `cancelled` (dissolved);
- `soft_deleted_in_team_members` → `$pull` the soft-deleted id from `members[]`;
- `counter_drift` → bump `Counter.seq` up to the max code already in use.

The server SHALL re-derive the affected check (never trust client-supplied row
state), apply the fix to each current issue, audit each fix (`entity:'Reconcile'`),
then re-derive the check to report what remains. A non-safe check SHALL be
rejected with **422** (returning the safe-check list). The route is gated by
`system.ops` and rate-limited.

#### Scenario: Heal a bricked room slot
- **GIVEN** a `RoomBooking` whose `Schedule` was hard-deleted (slot bricked)
- **WHEN** an Admin posts `{ check: 'orphan_room_booking' }`
- **THEN** the dangling row is deleted, a `Reconcile` audit line is written, and
  the response reports `healed ≥ 1` with `remaining` re-derived

#### Scenario: Non-safe check is refused
- **GIVEN** an Admin posts `{ check: 'duplicate_active_enrollment' }`
- **WHEN** the heal route handles it
- **THEN** the response is **422** with the list of auto-healable checks; no data
  is changed

### Requirement: Scheduled + manual run [BR-2, UC-2]

The system SHALL run nightly via cron and support an Admin-triggered manual run
that produces the same report.

### Requirement: Cron authentication [BR-4, UC-1]

The system SHALL require a valid `CRON_TOKEN` on `/api/cron/*`; the Admin route
uses normal Admin authz.

## Non-Functional Requirements (NFR)

- **Authz:** `/api/cron/reconcile` = `CRON_TOKEN`; `/api/admin/reconcile/*` =
  `system.ops`; `/heal` additionally rate-limited.
- **Read-only sweep:** the reconcile RUN never writes to domain collections (only
  its report). Mutation happens ONLY through the explicit, opt-in `/heal` action
  on the four safe checks — never on the nightly path.
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
- [ ] No domain data is mutated by the nightly/manual RUN.
- [ ] Auto-heal fixes only the four safe checks, audits each, and re-derives the
  remaining count; a non-safe check is rejected with 422.

## Error & Edge Cases

| Trigger | Behavior | Recovery |
|---|---|---|
| Cron without token | 401/403 | supply CRON_TOKEN |
| Unknown check in old report | tolerated on read | (crash-fix shipped) |
| No drift found | empty report persisted | none |
| Heal a non-safe check | 422 + safe-check list; no mutation | resolve from the record |
| Heal when nothing is broken | no-op (`healed: 0`) | none |

## Out of Scope / Deferred

- Auto-remediation of the non-safe checks (require human judgement — link to the
  record). Only the four deterministic/reversible checks auto-heal.
- True one-click UNDO of a heal (the audit line captures before-state for manual
  reversal).
- Alerting/notification on new drift (report-only today).
