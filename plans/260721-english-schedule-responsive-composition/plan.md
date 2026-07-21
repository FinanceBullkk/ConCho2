---
change: english-schedule-responsive-composition
status: applied
target_specs: [english-training]
milestone: English Training — live convergence
created: 2026-07-21
---

# Proposal: Compose the English Schedule calendar and drawer responsively

## Why

The embedded shared Schedule duplicated its page header, and the editor layout
did not follow the calendar/drawer composition required for compact desktop and
mobile operation.

## Delivery Contract

- **User outcome:** an English operator keeps the calendar full-width while the
  editor is closed, gets a compact side drawer on desktop, and a reachable
  bottom-sheet editor on mobile.
- **In scope:** shared calendar density option, embedded-header suppression,
  custom historical drawer slot, English editor composition, and component
  tests.
- **Non-goals:** command/domain behavior, migration/data changes, generic
  Schedule mutation semantics, and new navigation.
- **Domain authority:** `docs/specs/english-training/spec.md`, the existing
  shared ConCho2 Schedule calendar/drawer pattern, and
  `.claude/rules/testing-and-ci.md` viewport standard.
- **Data impact:** none.
- **Feedback loop:** CalendarGrid, SchedulesPage, and OperationalGridOwnership
  component tests. Real Playwright interaction at 1440x900, 1280x800, and
  390x844 remains Gate 3.
- **UI reference and states:** English Operations → Schedule; drawer closed,
  create open, edit open, cancel-confirm open, mutation success/failure, and
  horizontal overflow/clipping at all required viewports.

### Acceptance Examples

- **Happy path:** Given the Schedule tab with no selection, when it renders,
  then no empty drawer column or duplicate Schedule header consumes width.
- **Permission denial:** Given a user without schedule mutation capability,
  when the surface renders, then this composition does not create or expose a
  new mutation path.
- **Core edge case:** Given a 390x844 viewport and an open editor, when controls
  exceed available height, then the bottom sheet remains scrollable and its
  footer actions remain reachable.

## Tasks

- [x] Add opt-in dense CalendarGrid columns.
- [x] Add embedded-header and custom-drawer composition points.
- [x] Move the English editor into desktop drawer/mobile bottom sheet.
- [x] Add focused component tests.
- [ ] Exercise drawer open/closed and overflow through the Playwright matrix
  (Gate 3).

## Verification

- `client/src/components/__tests__/CalendarGrid.test.jsx`
- `client/src/features/schedule/__tests__/SchedulesPage.test.jsx`
- `client/src/features/english-operations/__tests__/OperationalGridOwnership.test.jsx`
- Browser interaction and failure-artifact evidence remain required before
  Verified.

## Stop / Re-plan Checkpoint

Re-baseline if shared Schedule behavior changes, a second workspace adopts the
custom drawer API, or the slice crosses the review thresholds. Do not add
Meeting command or data semantics here.
