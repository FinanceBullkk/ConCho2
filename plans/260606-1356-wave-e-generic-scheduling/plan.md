---
title: "Wave E Generic Scheduling"
description: "Start generic scheduling with exact configured windows; gate capacity and later resources on product decisions."
status: pending
priority: P1
effort: 10d
branch: main
tags: [feature, scheduling, backend, frontend, compatibility]
blockedBy: [project:260609-0146-booking-ui-loop]
blocks: []
created: 2026-06-06
---

# Wave E Generic Scheduling

## Context

D6 v1.1 complete. D2 Google OIDC/Directory sync remains owner-blocked by
missing OAuth app and allowed Workspace domain inputs
([development-roadmap.md:100](../../docs/development-roadmap.md#L100)).
Next codeable track: Wave E.

Research recommends exact config-driven windows first. Capacity-first unsafe
until two decisions: enforce at enrollment/session/both; future cohort roster
live-sync/snapshot.

## Phases

| Phase | Scope | Status | Depends on |
|---|---|---|---|
| E1 | [Exact scheduling windows + compatibility](./phase-01-exact-scheduling-windows.md) | Backend done (shared policy, all paths validated, config endpoint, settings-on-write). **Client grid slice superseded → `260609-0146-booking-ui-loop` Phase 3** (absorbed with mode-awareness so the grid is touched once). | None |
| E2 | [Capacity decision + data audit](./phase-02-capacity-decision-and-audit.md) | Pending | E1 |
| E3+ | [Rooms, instructors, waitlists gates](./phase-03-later-expansion-gates.md) | Pending/gated | E2 + decisions |

## Scope Guard

E1 includes safe scheduling config read, shared exact-window validation, exact
calendar rows/payloads, class-scoped availability, historical off-policy
visibility, tests, smoke.

E1 excludes capacity enforcement, rooms, waitlists, session instructors,
arbitrary free-form times, roster changes, persistence rename, route removal.

## Compatibility

- Keep `/api/schedules`, `/api/learning/sessions`, `Schedule`, `Class`, `Team`.
- Keep leader booking, all four modes, auth/CSRF/rate limit/audit, transaction
  locks, unique `{classId,startTime}`, attendance, completion, reminders.
- Calendar/email remain post-commit fail-soft.
- E1 has no migration. Rollback code only; stored schedules remain valid.

## Ownership

Phases sequential; shared scheduling files prohibit parallel implementation.
E1 owns window policy/grid. E2 owns capacity policy/audit. E3+ file ownership
must be re-grepped after decisions.

## Track Success

- Existing five one-hour defaults unchanged.
- Exact 90-minute and minute-offset windows work through UI and both APIs.
- Off-policy history visible, not newly bookable.
- Later phases cannot start before named decisions and audits pass.

## Unresolved Questions

- Capacity: enrollment, session, or both?
- Future cohort roster: live-sync or creation snapshot?
- Later room, instructor, cancellation, waitlist policies?
