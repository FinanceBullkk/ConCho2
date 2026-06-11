---
capability: export-and-integrations
status: stable
owners: [services/exportService, services/calendarService, controllers/syncController, lib/google, lib/mailer]
last_updated: 2026-06-08
related_code:
  - server/services/exportService.js
  - server/services/calendarService.js
  - server/controllers/syncController.js
  - server/controllers/exportController.js
  - server/lib
  - server/models/Attendance.js
related_plans: []
---

# Capability: Export & Integrations

> **Source of truth for BEHAVIOR.** External-facing side effects: HR Excel export,
> Google Calendar/Meet, Google Sheets sync, and transactional email. All
> integrations are **fail-soft** — they never roll back a primary write.

## Purpose

Get data out to the systems HR/L&D actually use: an Excel attendance export (with
once-only claim semantics), Google Calendar invites + Meet links for sessions,
Google Sheets sync, and email (booking confirmations, password resets, reminders).

## Business Requirements (BR)

- **BR-1:** Admins export attendance to Excel for HR; each record exports once.
- **BR-2:** Exports must not OOM the instance (row cap) or allow formula
  injection.
- **BR-3:** Sessions get a Google Calendar event + Meet link where configured.
- **BR-4:** Integration failures never break the primary operation (fail-soft).
- **BR-5:** Admins can sync data to Google Sheets.
- **BR-6:** Transactional emails are sent for key events.

## Actors & Use Cases (UC)

- **UC-1 (Admin):** exports attendance for a date range to Excel.
- **UC-2 (System):** creates/updates/deletes a Calendar event when a session
  changes.
- **UC-3 (Admin):** runs a Google Sheets sync.
- **UC-4 (System):** sends booking-confirm / password-reset / reminder emails.

## Entities

- **Attendance export tracking** (`server/models/Attendance.js`): `syncStatus`
  PENDING→EXPORTING→EXPORTED, `exportBatchId`, `exportedAt`.
- **Schedule.googleEventId/meetLink** for Calendar linkage.

## Functional Requirements (FR)

### Requirement: Once-only attendance export [BR-1, UC-1]

The system SHALL claim PENDING attendance into a batch (`EXPORTING` +
`exportBatchId`), build the workbook joined to user/schedule/class/team by
**session date** (not write time), then mark the batch `EXPORTED`, so records
aren't exported twice.

#### Scenario: Two exports don't double-count
- **GIVEN** PENDING attendance records
- **WHEN** an export runs and completes
- **THEN** those records are EXPORTED and excluded from the next export

### Requirement: Export safety [BR-2, UC-1]

The system SHALL cap rows per export (`EXPORT_MAX_ROWS`, default 50,000 → **413**
when exceeded) and sanitise every cell against CSV/XLSX formula injection
(`safeCell`).

#### Scenario: Over-large export
- **GIVEN** a date range yielding > the row cap
- **WHEN** export is requested
- **THEN** **413** ("Export too large …")

### Requirement: Calendar/Meet, fail-soft [BR-3, BR-4, UC-2]

The system SHALL create/update/delete a Google Calendar event (with Meet link)
for a session **after** the booking transaction commits; failure is logged and
skipped without rolling back the booking. `googleEventId`/`meetLink` persist the
linkage.

#### Scenario: Calendar down during booking
- **GIVEN** Calendar API unavailable
- **WHEN** a session is booked
- **THEN** the booking succeeds; the event is skipped (logged)

### Requirement: Google Sheets sync [BR-5, UC-3]

The system SHALL let an Admin sync to Google Sheets via `/api/sync`, recording a
`Sync` audit entry.

### Requirement: Transactional email [BR-6, BR-4, UC-4]

The system SHALL send emails (booking confirmation, password reset, reminders)
fail-soft — email failure never breaks the triggering operation.

## Non-Functional Requirements (NFR)

Inherits `security-platform`. Specifics:
- **Authz:** `/api/export` + `/api/sync` Admin-only; export rate-limited.
- **Fail-soft:** all third-party calls catch + log; primary writes unaffected.
- **Safety:** formula-injection guard; export row cap; secrets (Google key, SMTP)
  from env, never committed.
- **Audit:** export, sync, calendar-event-created recorded.

## Acceptance Criteria (AC)

- [ ] Attendance export claims → EXPORTED; no double export.
- [ ] Export joins by session date; row cap → 413; cells formula-safe.
- [ ] Calendar/Meet created after commit; failure doesn't roll back booking.
- [ ] Admin can run Sheets sync (audited).
- [ ] Emails fail-soft.
- [ ] Export/sync Admin-only; export rate-limited.

## Error & Edge Cases

| Trigger | Behavior | Recovery |
|---|---|---|
| Export > row cap | 413 | narrow range / raise env |
| Calendar/email/Sheets down | skipped + logged | retry later |
| Non-admin export/sync | 403 | use Admin |
| Formula-like cell value | escaped | n/a |

## Out of Scope / Deferred

- Streaming export for very large datasets (buffered today; PERF-001 follow-up).
- Two-way Sheets sync / external webhooks.
- Calendar sync for non-session entities.
