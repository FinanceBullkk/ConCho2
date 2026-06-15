---
capability: dashboard-analytics
status: stable
owners: [controllers/dashboardController, services/analyticsSeriesService, jobs/snapshotJob]
last_updated: 2026-06-15
related_code:
  - server/controllers/dashboardController.js
  - server/middleware/analyticsCache.js
  - server/models/MetricSnapshot.js
  - server/services/metricSnapshotService.js
  - server/services/analyticsSeriesService.js
  - server/routes/analyticsRoutes.js
  - server/jobs/snapshotJob.js
  - server/scripts/backfill-metric-snapshots.js
related_plans: []
---

# Capability: Dashboard Analytics

> **Source of truth for BEHAVIOR.** Admin operational analytics. Distinct from
> `reporting-and-rollups` (learning completion) — this is participant/operations
> stats + alerts.

## Purpose

The Admin home analytics: filterable participant statistics (by department,
position, level, status) and operational alerts (e.g. sessions with missing
attendance), cached so frequent dashboard refreshes don't hammer the DB.

## Business Requirements (BR)

- **BR-1:** Admins see participant stats sliced by org/status dimensions.
- **BR-2:** Admins see operational alerts (recent integrity/attention items).
- **BR-3:** Analytics must not overload the DB on frequent refresh.
- **BR-4:** Trend lines reflect REAL day-by-day history (a durable rollup), not a
  series recomputed or faked at read time; empty history degrades gracefully.

## Actors & Use Cases (UC)

- **UC-1 (Admin):** loads filter options and filtered participant stats.
- **UC-2 (Admin):** views the alerts panel.
- **UC-3 (Admin):** reads a metric trend (`/api/analytics/series`), the
  enroll→complete→certify funnel (`/api/analytics/funnel`), or a program's
  Analytics tab (`/api/analytics/program/:id`).

## Entities

- Derived over `User`/`Class`/`Schedule`/`Attendance`/`Team`. No own model;
  results cached via `analyticsCache` (invalidated on relevant writes).
- **MetricSnapshot** (`server/models/MetricSnapshot.js`): one durable row per
  `{scope (global|program|office), scopeId, key, date (UTC midnight)}` → `value`.
  Keys: `active_enrollments` (point-in-time), `enrollments` / `completions` /
  `certs_issued` (cumulative). Written nightly by `jobs/snapshotJob.js`; TTL
  ~400 days. Backfilled (derivable cumulative history, global + per-program) by
  `scripts/backfill-metric-snapshots.js`.

## Functional Requirements (FR)

### Requirement: Filterable participant stats [BR-1, UC-1]

The system SHALL expose distinct filter options and compute participant stats
filtered by department/position/entranceLevel/currentLevel/status (Participants
only).

#### Scenario: Filter by department
- **GIVEN** an Admin selects a department
- **WHEN** stats are requested
- **THEN** only that department's participants are counted

### Requirement: Cached alerts with bounded lookback [BR-2, BR-3, UC-2]

The system SHALL compute alerts over a bounded lookback (default 30 days) and
cache the result (~30s per process) so browser-focus refetches don't rescan all
history.

#### Scenario: Rapid dashboard refresh
- **GIVEN** an admin tab refetching alerts on focus
- **WHEN** alerts are requested repeatedly within 30s
- **THEN** the cached result is served (no repeated full scan)

### Requirement: Cache invalidation [BR-3]

The system SHALL invalidate the analytics cache on writes that change the
underlying data (e.g. attendance marking, import).

### Requirement: Durable metric time-series + funnel [BR-4, UC-3]

A nightly cron SHALL write one `MetricSnapshot` row per tracked metric per scope
(global + per-program). `GET /api/analytics/series?key=&scope=&scopeId=&range=`
SHALL return that metric's stored daily trend (ascending), with `collecting:true`
when no history exists yet (the client shows "collecting data", never a fake
line). `GET /api/analytics/funnel?programId=` SHALL return the live
enroll→complete→certify stage counts + conversion %. `GET /api/analytics/program/:id`
SHALL combine a program's stored series with its funnel. All three are
`analytics.read`-gated and cached. A backfill script seeds the derivable
cumulative history (global + per-program) at deploy.

#### Scenario: Trend reads stored history
- **GIVEN** the snapshot cron has run for several days
- **WHEN** an Admin requests `/api/analytics/series?key=active_enrollments`
- **THEN** the response is the actual day-by-day values, ascending by date

#### Scenario: No history yet
- **GIVEN** a fresh install with no snapshots for a key
- **WHEN** the series is requested
- **THEN** `data` is `[]` and `meta.collecting` is `true` (graceful empty state)

#### Scenario: Funnel conversion
- **GIVEN** a program with 3 enrolled, 1 completed, 1 certified
- **WHEN** `/api/analytics/funnel?programId=` is requested
- **THEN** stages are 3 / 1 / 1 and `conversion.overall` is 33 (%)

## Non-Functional Requirements (NFR)

Inherits `security-platform`. Specifics:
- **Authz:** `/api/dashboard` Admin-only.
- **Performance:** 30-day alert lookback; 30s result cache; soft-deleted users
  excluded.
- **Read-only:** analytics never mutate domain data.

## Acceptance Criteria (AC)

- [ ] Filter options + filtered participant stats (Participants only).
- [ ] Alerts bounded to a lookback window and cached ~30s.
- [ ] Cache invalidated on relevant writes.
- [ ] Admin-only.
- [ ] Nightly cron writes one snapshot per metric per scope; backfill seeds
  derivable history; series/funnel/program endpoints read it back; empty history
  returns `collecting:true` (no fake line); all `analytics.read` + cached.

## Error & Edge Cases

| Trigger | Behavior | Recovery |
|---|---|---|
| Non-admin | 403 | use Admin |
| Stale alert (within 30s) | cached value | wait for TTL |

## Out of Scope / Deferred

- Per-manager scoped dashboards (org hierarchy view) beyond current filters.
- Exportable dashboard snapshots.
