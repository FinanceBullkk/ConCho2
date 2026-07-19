# P2 — English Schedule on the generic booking grid

**Priority:** High · **Status:** 🟢 implemented

**Context:** [plan.md](plan.md) · [fit-gap §8](fit-gap-analysis.md)

## Objective

Give English Operations its own Schedule journey while creating only generic
Sessions. Admin/Coordinator schedule a course-run Cohort through the existing
cohort booking path and inherit Office/Room locking, capacity, calendar
integration, cancellation, and conflict protection.

## Scheduling path

- English Program uses `schedulingMode=nomination`.
- English Schedule posts to `/api/learning/sessions/book-slot` with `cohortId`,
  `officeId`, optional `roomId`, start/end time, and the authenticated actor.
- The generic service snapshots active direct Enrollments onto the Session.
- Reuse `domains/schedule/session-order`: `sessionNumber` is derived from
  chronological position inside the course-run Cohort. Do not store a duplicate
  sequence field.
- Calendar/notification code skips learners without email; absence of a managed
  learner email never rolls back scheduling.

## Workspace entrypoint

- Add **Schedule** to English Operations as an English-filtered view of the
  generic calendar/grid.
- It may reuse generic grid/drawer components, but its Program/Cohort pickers and
  query filters show only `category=english` course runs.
- Archive sessions never appear as editable grid cells; they remain under
  Archive after P5.

## Authorization

- Admin/Coordinator create, update, cancel, assign rooms, and manage trainers
  according to existing session capabilities and resource policies.
- Assigned Teacher sees only sessions they may teach/attend and cannot create,
  reschedule, cancel, or change Room/Trainer.
- Workspace visibility is not the check; direct API calls receive the same
  denial.

## Tests

- Create English Session through the cohort route and verify the generic
  Schedule row, roster snapshot, derived session number, Office, and Room.
- Same-Cohort slot collision and same-Room slot collision return 409 under
  concurrent attempts.
- Non-cohort `admin_scheduled` path is not used; nomination route remains the
  single supported English path.
- Unassigned Teacher and assigned Teacher mutation are denied; assigned Teacher
  read succeeds.
- Calendar configured/unconfigured and learner-without-email paths are fail-soft;
  audit/notification side effects remain deterministic.

## Success / DoD

- An English course run is scheduled end to end from English Operations with
  real generic rooms/calendar/conflict behavior.
- No English-specific booking service, Schedule table, or sequence algorithm.
- Audit, permission denial, edge-case/concurrency tests, lint, and manual smoke
  pass.
- Update `english-training` and `scheduling-and-booking` specs when this phase
  ships.
