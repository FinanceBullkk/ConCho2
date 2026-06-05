# D5 v1 Implementation Plan - Assignment Reminders + Manager Escalation

## Status

Done 2026-06-05.

## Goal

Add email reminders for required training assignments created by D4. Keep v1
focused: persisted email logs, idempotent cadences, daily cron endpoint, and
weekly manager escalation for overdue direct reports.

## Scope

- Assignment reminders only.
- Email channel only.
- No in-app notification center.
- Existing attendance reminders unchanged.
- D2 Google OIDC and Directory sync remain blocked on owner inputs.

## Implemented

- `NotificationLog` model with email channel, recipient/assignment/learner
  references, cadence key, status, send timestamp, error, metadata, unique
  idempotency tuple, and 180-day TTL.
- Assignment cadence helpers:
  - `due_7`
  - `due_1`
  - `overdue_dN` every 3 overdue days starting day 1
  - `manager_overdue_YYYY-WW`
- Assignment reminder service under `server/domains/learning/assignment/`:
  - scans active, non-deleted assignments;
  - reuses D4 derived learner status;
  - skips complete learners;
  - starts overdue only after the full due date has passed;
  - records skipped logs for missing learner/manager email;
  - records failed logs for send failures without stopping the batch;
  - sends weekly manager digest for overdue direct reports with manager email.
- Email templates/senders in `server/lib/emailTemplates.js`:
  - `sendAssignmentDueSoon`
  - `sendAssignmentOverdue`
  - `sendManagerAssignmentDigest`
- Cron wiring:
  - `CRON_JOBS.assignmentReminders`
  - `POST /api/cron/assignment-reminders`
  - wrapped by `runMonitored` and persisted to `CronRun`.

## Tests

- Unit:
  - cadence key generation and D4 date-level semantics;
  - assignment email templates and senders;
  - cron monitor config exposes assignment reminders.
- Integration:
  - due-soon 7-day idempotency;
  - due-soon 1-day separate key;
  - completed learner skipped;
  - overdue every-3-day idempotency;
  - manager weekly digest includes overdue direct reports only;
  - missing learner/manager email skipped with logs;
  - cron route auth + `CronRun`.

## Verification

- Passed:
  - `cd server && npm test -- --runTestsByPath tests/integration/assignmentReminderRoutes.test.js tests/unit/emailTemplates.test.js tests/unit/assignmentReminderCadence.test.js tests/unit/cronMonitor.test.js --runInBand --forceExit`
  - `cd server && npm test -- --runInBand --forceExit` (63 suites, 621 tests)
  - `git diff --check`
  - `gitleaks detect --config .gitleaks.toml --no-git --redact`

## Deferred

- In-app notification center.
- Admin notification-log UI.
- Assignment report exports.
- Certificate expiry and recertification.
- Assessment reminders.
- Certificate issued/expiry emails.

## Unresolved Questions

- None for D5 v1 scope.
