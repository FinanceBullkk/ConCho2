---
phase: 2
title: "Mode-Aware Booking Grid"
status: pending
priority: P1
effort: "1d"
dependencies: [1]
---

# Phase 2: Mode-Aware Booking Grid

## Overview

Gate the booking grid by the selected team's effective `schedulingMode` so a
leader never submits a booking the server will reject. Bookable cells appear
only for `leader_booking`; other modes show **read-only/locked** cells plus a
mode-specific banner explaining where to schedule instead.

## Key Insight — the enforcement matrix (mirror Pass C)

| Effective mode | Leader self-book on this grid? | Server result if attempted | UI |
|---|---|---|---|
| `leader_booking` | ✅ yes | 200 | "+ Book" cells (current behavior) |
| `admin_scheduled` | ❌ no | **403** (`assertTeamMode`) | locked cells + "admin-scheduled" banner |
| `self_enroll` / `nomination` | ❌ no (cohort modes) | **400** (book against cohort) | locked cells + "enrolls by cohort" banner |
| unknown / future | ❌ no | 501 / blocked | locked cells + generic banner |

`LearningProgram.schedulingMode` **defaults to `admin_scheduled`**, so any
program-linked class is non-bookable by a leader *by default* — this is the live
403 wall this phase removes. Existing-session visibility (your sessions, other
teams' taken slots) is preserved in **every** mode — only the empty-cell
"+ Book" affordance is gated.

## Requirements

- **Functional:** when the selected team's mode ≠ `leader_booking`, empty future
  cells render non-interactive (no `onClick`, no "+ Book"); a banner above the
  grid states the reason + where to act, mode-specific, via `t()`.
- **Functional:** mode resolves per **selected** team (a leader may lead several
  teams with different modes); switching teams re-evaluates banner + cells.
- **Functional:** `mySchedule` (cancelable) and `blocker` (other-team taken)
  cells render unchanged in all modes — read-only visibility is not gated.
- **Non-functional:** English-only strings in `en.json`; dark/light tokens; no
  new lint warnings; the cell-variant decision is unit-testable.

## Architecture

Extract the per-cell variant decision into a pure, testable helper so the
bug-prone gating lives in one place (and survives Phase 3's descriptor refactor):

```js
// client/src/lib/booking-cell-state.js
// → 'mine' | 'blocker' | 'bookable' | 'locked' | 'empty-past'
bookingCellState({ mySchedule, blocker, isPast, bookable })
```

`BookClassPage` consumes it:

```
selectedMode = effectiveSchedulingMode(selectedTeamObj)   // from Phase 1
bookable     = isLeaderBookable(selectedTeamObj)
renderCell → switch(bookingCellState({...}))
              case 'bookable': interactive "+ Book"
              case 'locked':   muted, non-interactive, lock affordance
              ...
banner shown when !bookable, keyed by selectedMode
```

## Related Code Files

- **Create:** `client/src/lib/booking-cell-state.js` — pure cell-variant fn.
- **Create:** `client/src/lib/__tests__/booking-cell-state.test.js`.
- **Modify:** `client/src/pages/BookClassPage.jsx` — compute `selectedMode` /
  `bookable` from the Phase 1 resolver; render the mode banner; route the
  empty-cell branch through `bookingCellState` so non-`leader_booking` modes
  yield a `locked` cell instead of a bookable one.
- **Modify:** `client/src/i18n/locales/en.json` — banner + locked-cell strings
  (`booking.modeLocked.adminScheduled`, `booking.modeLocked.cohort`,
  `booking.modeLocked.generic`, `booking.lockedCell`).
- **Optional:** `client/src/pages/__tests__/BookClassPage.*` RTL test for the
  banner + absence of "+ Book" under `admin_scheduled` (if a page test harness
  exists; else cover via the pure helper test).

## Implementation Steps

1. Add `booking-cell-state.js` returning the variant for a cell given
   `{ mySchedule, blocker, isPast, bookable }`. Unit-test all branches
   (incl. `locked` when `!bookable` and the cell is an empty future slot).
2. In `BookClassPage`, derive `selectedMode`/`bookable` (Phase 1 helpers); add a
   banner component above `<CalendarGrid>` rendered only when `!bookable`,
   message chosen by `selectedMode` via `t()`.
3. Rework the `renderCell` empty-cell branch: when the computed variant is
   `locked`, render a muted non-interactive cell (lock icon + short label, no
   `onClick`, no prefill); keep `mine`/`blocker`/`empty-past` exactly as today.
4. Add i18n strings; ensure no Vietnamese; keep `cn()` + theme tokens.
5. `cd client && npm run test:run && npm run lint` (≤ cap 81). Manual smoke:
   seed a program-linked class (default `admin_scheduled`) → grid shows banner +
   locked cells, no 403 round-trip; a `leader_booking` program → "+ Book" works.

## Todo List

- [ ] `booking-cell-state.js` pure helper + branch tests
- [ ] `BookClassPage` mode banner (mode-specific copy)
- [ ] Gate empty-cell branch → `locked` for non-`leader_booking`
- [ ] i18n strings (no VN)
- [ ] test:run + lint green; manual smoke both modes

## Success Criteria

- [ ] `admin_scheduled` team → no "+ Book" cells, banner explains Admin-only; no
      booking request is ever sent (no post-submit 403).
- [ ] `self_enroll`/`nomination` team → locked cells + "enrolls by cohort" banner.
- [ ] `leader_booking` team → unchanged bookable grid.
- [ ] Switching the selected team re-evaluates banner + cells live.
- [ ] Your-session / other-team cells still render in every mode.

## Risk Assessment

- **Double-touch with Phase 3** (Med×Low): Phase 3 changes `renderCell`'s
  signature to slot descriptors. Mitigation: keep gating in
  `booking-cell-state.js` (signature-independent) so Phase 3 only re-wires the
  call site, not the logic.
- **Mode copy ambiguity** (Low×Med): leaders may not know what "admin-scheduled"
  means. Mitigation: banner says *who* can act + *where* (e.g. "contact an
  Admin"), not just the enum.

## Security Considerations

- UI gating is **UX only** — the server (`assertTeamMode` at the `bookSlot`
  chokepoint) remains the security boundary. Never present the client check as
  authoritative; do not loosen any server guard to match the UI.

## Next Steps

Unblocks **Phase 3**: the exact-slot descriptor refactor must carry this gating
through (the `locked`/`bookable` decision stays in `booking-cell-state.js`).
