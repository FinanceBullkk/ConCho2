---
title: 'Booking-UI Loop: schedulingMode awareness + exact-slot grid'
description: >-
  Close the client loop on two shipped backend features — schedulingMode
  enforcement (Pass C) and exact scheduling windows (Wave E1) — so leaders see
  the right bookable cells instead of hitting post-submit 403/400.
status: pending
priority: P1
branch: main
tags:
  - feature
  - scheduling
  - frontend
  - ux
  - compatibility
blockedBy: []
blocks:
  - 'project:260606-1356-wave-e-generic-scheduling'
created: '2026-06-08T18:53:50.284Z'
createdBy: 'ck:plan'
source: skill
---

# Booking-UI Loop: schedulingMode awareness + exact-slot grid

## Overview

The server is now authoritative on two booking invariants the client ignores:

1. **schedulingMode** (Pass C, enforced at the `bookSlot` chokepoint) — but the
   booking grid is mode-blind, and `LearningProgram.schedulingMode` defaults to
   `admin_scheduled`, so a leader who self-books a program-linked class hits a
   **post-submit 403** with no warning.
2. **Exact scheduling windows** (Wave E1 backend, commit `02d3ce3`,
   `GET /api/learning/sessions/config`) — but the client hardcodes integer hours
   and submits `hour + 1` ([BookClassPage.jsx:260](../../client/src/pages/BookClassPage.jsx#L260)),
   so 90-minute / minute-offset windows can't render or book.

This plan closes both loops in one coherent client effort (the grid is touched
once per concern). Backend for both is already shipped — this is **client-only**
plus one small server populate-widening.

## Phases

| Phase | Name | Status | Effort | Depends |
|-------|------|--------|--------|---------|
| 1 | [Expose Scheduling Mode](./phase-01-expose-scheduling-mode.md) | ✅ Done | S (~0.5d) | — |
| 2 | [Mode-Aware Booking Grid](./phase-02-mode-aware-booking-grid.md) | ✅ Done | M (~1d) | P1 |
| 3 | [Exact-Slot Grid (Wave E1)](./phase-03-exact-slot-grid-wave-e1.md) | ✅ Done | L (~3–4d) | P2 |

Phases ship incrementally: **P1+P2 close the 403 surprise fast** (the high-value,
fully-unblocked slice); **P3** is the larger exact-slot refactor that the roadmap
names as the next explicit item.

## Dependencies

- **Absorbs** the pending client slice (steps 5–9) of
  `plans/260606-1356-wave-e-generic-scheduling/phase-01-exact-scheduling-windows.md`.
  That plan's E1 **backend is done**; its client steps are executed here as
  **Phase 3** (Wave E phase-01 is marked superseded → this plan). Wave E's E2
  (capacity) / E3 (rooms, instructors) remain owned by the Wave E plan and are
  unblocked once Phase 3 ships — hence `blocks: [260606-1356-wave-e-generic-scheduling]`.
- **No backend behavior change** beyond Phase 1's read-only populate widening →
  no new capability spec, but `scheduling-and-booking` spec's client-visibility
  note may be touched if AC wording changes.

## Definition of Done

- ☑ Code per `frontend-conventions.md` (React Query, `t()` + `en.json`, `cn()`).
- ☑ `cd client && npm run test:run` + `npm run lint` (≤ cap 81) green; `cd server && npm test` green.
- ☑ Tracker updated (`docs/development-roadmap.md`); Wave E plan cross-link synced.
- ☑ No new Vietnamese strings; security layers untouched.
- ☑ Committed (conventional, no AI refs); **confirm before push**.
