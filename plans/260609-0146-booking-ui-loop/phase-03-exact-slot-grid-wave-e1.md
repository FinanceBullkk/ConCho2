---
phase: 3
title: "Exact-Slot Grid (Wave E1)"
status: pending
priority: P1
effort: "3-4d"
dependencies: [2]
---

# Phase 3: Exact-Slot Grid (Wave E1 client slice)

> **Absorbed from** `plans/260606-1356-wave-e-generic-scheduling/phase-01-exact-scheduling-windows.md`
> (steps 5–9). That phase's **backend is done** (commit `02d3ce3`: shared
> `scheduling-window-policy`, all four mutation paths validated,
> `GET /api/learning/sessions/config`, settings-on-write). This phase is the
> **client slice only**. The Wave E phase-01 file is marked superseded → here;
> consult it for the exhaustive server mutation trace / preserved invariants.

## Overview

Make `ALLOWED_TIME_SLOTS` authoritative on the client. The grid currently
hardcodes integer hours and submits `hour + 1`
([BookClassPage.jsx:260](../../client/src/pages/BookClassPage.jsx#L260)), so exact
minutes / non-60-min durations can neither render nor book. Replace integer-hour
rows with **slot descriptors** from the config endpoint, scope availability by
`classId`, and carry Phase 2's mode-gating through the refactor.

## Key Insight

- Backend already emits the safe DTO at `GET /api/learning/sessions/config`
  ([routes.js:78](../../server/domains/learning/routes.js#L78) →
  `sessionController.getSchedulingConfig`):
  `{ timezone, utcOffsetMinutes, weeklyTeamLimit, slots[] }`, each slot
  `{ id, label, startHour, startMinute, endHour, endMinute, durationMinutes }`,
  canonical id `HH:mm-HH:mm`, stable start-time order.
- `CalendarGrid`'s interface is integer-hour-shaped today:
  `timeRows: number[]`, `renderCell(day, hour)`, row key `HH:00`. This is the
  seam that must change to descriptors — and **three** pages consume it
  (Book, Schedules, Attendance), so it's a real seam, not a hypothetical one.
- **Fail closed:** empty/malformed config disables new/moved bookings; historical
  off-policy rows still render (read-only), never silently re-bookable.

## Requirements

- **Functional:** add `useSchedulingConfig` (React Query) + timezone-safe
  `scheduling-slots` helpers; no hardcoded booking fallback.
- **Functional:** `CalendarGrid` rows use exact descriptors; row key includes
  exact start+end (kills same-hour collisions when two windows share an hour).
- **Functional:** Participant submits the exact configured end — **remove
  `hour + 1`**; date + descriptor → exact UTC ISO start/end.
- **Functional:** availability scoped by the selected Team's `classId` (matches
  server Class-scoped collision at `scheduleService.js:271`).
- **Functional:** historical/imported off-policy rows visible, labelled
  read-only, not bookable; non-time edits of off-policy rows remain allowed.
- **Functional:** Phase 2 mode-gating preserved — non-`leader_booking` modes
  still yield `locked` cells + banner under the new descriptor grid.
- **Non-functional:** new strings via `t()` + `en.json`; delete `useTimeSlots`
  only after all three callers migrate; ≤ lint cap; client tests added.

## Architecture / Data Flow

```
GET /api/learning/sessions/config ──► useSchedulingConfig (RQ)
        │ slots[] descriptors (Asia/Ho_Chi_Minh)
        ▼
 scheduling-slots.js (pure, tz-safe)
   - descriptorsToRows(config)        → CalendarGrid rows
   - mergeOffPolicy(rows, schedules)  → unmatched schedule rows = bookable:false
   - toUtcRange(day, descriptor)      → { startISO, endISO }  (no hour+1)
        ▼
 CalendarGrid (descriptor rows) ──renderCell(day, descriptor)──►
   bookingCellState({ ..., bookable })   // Phase 2 helper, unchanged logic
        ▼
 book → { teamId, startTime, endTime } exact ISO → existing mutation/collision path
```

## Related Code Files

**Create:**
- `client/src/hooks/useSchedulingConfig.js` — RQ hook over the config endpoint.
- `client/src/lib/scheduling-slots.js` — pure descriptor/merge/tz helpers.
- `client/src/lib/__tests__/scheduling-slots.test.js` — helper unit tests
  (90-min window, minute offset, tz key, off-policy row, empty config).

**Modify:**
- `client/src/api/api.js` — add `schedulesAPI`/`sessionsAPI` config getter.
- `client/src/hooks/queryKeys.js` — add `schedulingConfig` key.
- `client/src/components/CalendarGrid.jsx` — descriptor rows; `renderCell(day,
  descriptor)`; sticky time label from `descriptor.label`; row key exact
  start+end.
- `client/src/components/ScheduleDrawer.jsx` / `BookDrawer.jsx` — exact label.
- `client/src/pages/BookClassPage.jsx` — consume config; remove `parseSlot` +
  `hour + 1`; build exact UTC range; scope availability by `classId`; keep Phase 2
  banner/locked gating.
- `client/src/pages/SchedulesPage.jsx`, `client/src/pages/AttendancePage.jsx` —
  migrate to descriptor rows + off-policy merge.
- `client/src/pages/CourseManager.jsx` — Admin create/move restricted to
  configured slots.
- `client/src/i18n/locales/en.json` — slot/off-policy/config-error strings.

**Delete (after all callers migrate):**
- `client/src/hooks/useTimeSlots.js`.

## Implementation Steps

1. **Helpers first (tests-first):** `scheduling-slots.js` pure functions +
   tests — descriptors→rows, off-policy merge, `toUtcRange` (tz-safe, no
   `setHours` drift), empty/malformed config → no bookable rows.
2. Add `useSchedulingConfig` hook + `api.js` getter + `queryKeys` entry.
3. Refactor `CalendarGrid` to descriptor rows; row key = exact start+end; label
   from descriptor; keep `renderCell` delegation contract.
4. Migrate `BookClassPage`: replace `TIME_SLOTS`/`timeRows`/`parseSlot`/`hour+1`
   with descriptors + `toUtcRange`; scope availability by selected `classId`;
   route cells through `bookingCellState` (Phase 2) so gating survives.
5. Migrate `SchedulesPage` + `AttendancePage`; merge configured + off-policy rows
   (off-policy = read-only).
6. Restrict Admin create/move (`CourseManager`) to date + configured slot.
7. Add i18n; delete `useTimeSlots`; grep for stragglers.
8. `cd client && npm run test:run && npm run lint && npm run build`; manual smoke
   (defaults; 09:15–10:45; off-policy visibility; fail-soft Calendar/email).

## Test Matrix (client)

| Layer | Required cases |
|---|---|
| Unit | malformed/empty/duplicate config → no bookable rows; stable order; duration; minute offset; tz key; off-policy row |
| Component | exact label/payload; scoped availability by classId; config-failure state; historical read-only row; Phase 2 `locked` cell under descriptor grid; Admin create/move |
| Regression | mode banner/gating unchanged; cancel flow; weekly-cap UI hint |

## Todo List

- [ ] `scheduling-slots.js` helpers + tests (tz-safe, fail-closed)
- [ ] `useSchedulingConfig` hook + api.js + queryKeys
- [ ] `CalendarGrid` descriptor refactor (exact row key)
- [ ] `BookClassPage` migrate; remove `hour + 1`; scope by classId; keep gating
- [ ] `SchedulesPage` + `AttendancePage` migrate; off-policy merge
- [ ] `CourseManager` Admin create/move restricted to configured slots
- [ ] i18n; delete `useTimeSlots`; grep stragglers
- [ ] test:run + lint + build green; manual smoke

## Success Criteria

- [ ] Default five one-hour slots render/book unchanged.
- [ ] 90-min and minute-offset windows render and book exactly through the UI.
- [ ] No `hour + 1`; submitted start/end equal the configured window in tz.
- [ ] Availability scoped by selected `classId` (no cross-class false blocks).
- [ ] Off-policy history visible + read-only; not newly bookable.
- [ ] Config failure disables booking, keeps history; never invents slots.
- [ ] Phase 2 mode gating intact under the descriptor grid.
- [ ] `useTimeSlots` deleted; no remaining importers.

## Risk Assessment

- **Timezone drift** (Med×High): exact ISO must use `Asia/Ho_Chi_Minh` offset,
  not local `setHours`. Mitigation: pure `toUtcRange` with explicit offset +
  unit tests (this is the #1 bug surface of the refactor).
- **Same-hour row collision** (High×High): two windows in one hour. Mitigation:
  row key = exact start+end IDs; multi-row component test.
- **Lost mode-gating in refactor** (Med×Med): rewriting `renderCell` could drop
  Phase 2. Mitigation: gating stays in `booking-cell-state.js`; regression test.
- **Three-page migration churn** (Med×Med): shared `CalendarGrid` seam. Mitigation:
  migrate behind the new descriptor contract one page at a time; keep tests green
  between pages.

## Security Considerations

- Config GET uses `protect` (authenticated, all roles); `/api/settings` stays
  Admin-only — never read Setting docs directly client-side.
- Writes keep CSRF + global/booking rate limits + role/policy checks + audit.
  This phase does not touch any server guard.

## Next Steps

Completing this unblocks the Wave E plan's **E2** (capacity decision/audit) — see
`plans/260606-1356-wave-e-generic-scheduling/plan.md`.
