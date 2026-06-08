---
capability: dashboard-analytics
status: stable
owners: [controllers/dashboardController]
last_updated: 2026-06-08
related_code:
  - server/controllers/dashboardController.js
  - server/middleware/analyticsCache.js
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

## Actors & Use Cases (UC)

- **UC-1 (Admin):** loads filter options and filtered participant stats.
- **UC-2 (Admin):** views the alerts panel.

## Entities

- Derived over `User`/`Class`/`Schedule`/`Attendance`/`Team`. No own model;
  results cached via `analyticsCache` (invalidated on relevant writes).

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

## Error & Edge Cases

| Trigger | Behavior | Recovery |
|---|---|---|
| Non-admin | 403 | use Admin |
| Stale alert (within 30s) | cached value | wait for TTL |

## Out of Scope / Deferred

- Per-manager scoped dashboards (org hierarchy view) beyond current filters.
- Exportable dashboard snapshots.
