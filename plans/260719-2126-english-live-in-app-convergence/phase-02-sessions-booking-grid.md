# P2 — Live sessions via the booking grid

**Priority:** High · **Status:** 🔴 proposed
**Context:** [plan.md](plan.md) · [fit-gap §5](fit-gap-analysis.md)

## Objective

HR/Teacher create English sessions live through `domains/schedule` — inheriting
rooms, calendar invites, and the conflict/capacity guard (owner chose the full
booking grid) — instead of importing `eng_session_units`.

## Key changes

- English sessions = `Schedule` rows under the English cohort, created via the
  schedule domain at the `bookSlot`/`adminCreate` chokepoint with
  `schedulingMode = admin_scheduled` (already enforced).
- Carry the English run **session sequence number** as session metadata.
- Reuse room binding, Google Calendar sync (`domains/schedule/calendar-sync`),
  and the partial-unique double-booking guard as-is.

## Files

- `domains/schedule/*` (no fork — English rides the existing create paths),
  client English section create-session UI (reuse schedule components).
- Tests: create English session → conflict guard fires on double-book; room +
  calendar side-effects; admin_scheduled blocks any leader-book attempt.

## Dependencies

P1 (program/cohort exist).

## Risks

- Scope creep into schedule internals — English must **use** the chokepoint, not
  special-case it.
- Calendar/room side-effects on managed (login-disabled) learners — verify invites
  don't assume a login/email that isn't there.

## Success / DoD

- A live English session booked through the grid with room + conflict guard.
  Tests + lint green. Spec: `english-training` + `session-scheduling` MODIFIED.
