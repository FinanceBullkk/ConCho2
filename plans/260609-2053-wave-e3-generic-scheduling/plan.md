---
title: Wave E3 — Generic Scheduling (session-types, rooms, instructors, cancellation+waitlists)
status: pending
priority: high
effort_total: 16-20 dev-days (sequenced; some overlap possible)
created: 2026-06-09
---

# Wave E3 — Generic Scheduling

## Context
E1 (exact-window validation, `scheduling-window-policy.assertValidBookingWindow`) and E2 (capacity at
`assertBookable`: weekly **400** → collision **409** → capacity **422**) are **DONE**. E3 builds *on* them
additively. The load-bearing booking chokepoint (`scheduleService.bookSlot`/`bookCohortSlot`/`adminCreate`,
the `{classId,startTime}` unique index at `Schedule.js:133`, team auto-enroll, post-commit fail-soft
Calendar/email, Mongoose transactions) is **never weakened**. E3 attaches rooms, instructors, lifecycle
status, and waitlists to the existing `Schedule` additively, and generalizes the fixed-slot model with a
lightweight per-program `sessionPolicy`.

The four subsystems share the Schedule booking path, so they are **strictly sequenced**: foundation first
(shared model fields + indexes + seams), then the two resource gates (rooms, instructors), then durable
cancellation + waitlists last (it owns the most invasive change — the partial-unique index migration and
the seat-freeing hooks every other subsystem touches).

## Decisions (recommended; all overridable unless marked load-bearing)
| # | Decision | Overridable |
|---|---|---|
| D1 | `sessionPolicy` (roomPolicy, instructorPolicy) lives on `LearningProgram`, **not** a new collection. Capacity reuses existing `capacityPolicy` (E2). | Yes |
| D2 | **DROP `durationMinutes`** — no variable-length slot config exists to satisfy it (all E1 slots are 60-min). YAGNI. | Yes |
| D3 | **DROP denormalized `waitlistCount`** — compute on read; the denorm field drifts on every roster `$pull`. | Yes |
| D4 | Rooms = own `Room` collection (soft-delete + partial-unique `code`); `Schedule.roomId` nullable ref. **Physical-only** (drop `kind:'online'` — Google Meet/`roomLink` already covers virtual). | Yes |
| D5 | Room exclusivity enforced by a **`RoomBooking` ledger** with **unique `{roomId,startTime}`** (valid because E1 forces exact-instant slots) — the DB is the final guard, not an in-tx scan. `RoomBooking` is a hard-deletable lock (NOT soft-delete). `Schedule.roomId` written **atomically with** the ledger row. | **No (load-bearing)** |
| D6 | Instructors = `Schedule.sessionInstructorIds` (User refs, override-or-inherit `?? Class.teacherIds`). Authz = **UNION** (cohort teacher never loses access). Admin-only assign via new `session.assign-instructor` capability + `roleGuard('Admin')`. | Yes |
| D7 | Cancellation = durable `status:'cancelled'` (never hard-delete). Partial-unique `{classId,startTime}` **where status='scheduled'** replaces the full unique index (lets the slot re-book; still guards live double-book). | **No (load-bearing)** |
| D8 | Waitlist = **per-session** `WaitlistEntry` collection, FIFO, **auto-promotion in-tx** with the seat-free. Real seat-freers = **team-sync, User auto-release, capacity-raise, admin-promote**. Cohort `enrollment/withdraw` is **NOT** a seat-freer (decoupled from `Schedule.enrolledUsers`). | Yes |
| D9 | **ALL** Schedule-removal paths (cancelSlot, deleteSchedule, Team-sync `deleteMany`, User auto-release `deleteMany`) route through ONE `releaseSchedule(ids, session)` helper that (a) drops `RoomBooking` rows, (b) transitions active `WaitlistEntry`→`cancelled`. Reconcile CHECK 4 + orphan sweep added. | **No (load-bearing)** |

## Phases
| Phase | Title | Status | Depends on | Effort |
|---|---|---|---|---|
| 1 | Foundation: session-types, additive Schedule fields, shared seams, release-helper contract | pending | E1, E2 | 3.5–4.5d |
| 2 | Rooms + conflict lock (RoomBooking ledger, atomic roomId, availability=Admin-only) | pending | Phase 1 | 4–5d |
| 3 | Session instructors (override-or-inherit, UNION authz, calendar attendees) | pending | Phase 1 | 3.5–4.5d |
| 4 | Durable cancellation states + waitlists (partial-unique migration, FIFO auto-promotion) | pending | Phases 1, 2, 3 | 5–6d |

Phases 2 and 3 are independent of each other (both depend only on Phase 1) and **may run in parallel** if
file ownership is split (room domain vs instructor policy). Phase 4 lands last — it owns the index
migration and the unified `releaseSchedule` helper that Phase 2's ledger cleanup plugs into.

## Scope guard (YAGNI — explicitly OUT)
- `durationMinutes` / variable-length slots; `Room.capacity` enforcement; `kind:'online'` rooms;
  denormalized `waitlistCount`; cohort-level waitlists; accept-handshake promotion; forward-backfill
  scripts for rooms; per-session leader room/instructor picking (Admin-only in v1).
- Leader booking body is **UNCHANGED** in all phases (leaders never set room/instructor/status).
- No collection renames (locked decision). No SCORM/xAPI/video/mobile.

## Compatibility (must hold)
Every new field nullable/defaulted; legacy reads unaffected; `{classId,startTime}` guarantee preserved
(as partial-unique after Phase 4); Calendar/email stay POST-COMMIT fail-soft; E1/E2 ordering at
`assertBookable` untouched (room/instructor/waitlist checks run **outside or after** it, never weaken it).

## Success criteria
- All 7 CI gates green; eslint ≤ cap (never up). Regression suite (booking/race/mode/reassign/authz) green
  unchanged — proves the spine is non-behavior-changing on the load-bearing path.
- Race tests pass: concurrent same-room (one 201 / one 409), concurrent same-session promotion (exactly one
  promote, roster ≤ cap), concurrent cancel (one 200 / one 409), double-waitlist-join (one 201 / one 409).
- No leak: `sessionDto.instructors` = name only (no email); availability = Admin-only; Participant cannot
  list a waitlist.
- Definition of Done per phase: tracker + spec + commit (see each phase).

## Open questions for the owner
1. **Freed-seat event for whole-session cancel** — confirm waiters get notified their `WaitlistEntry` was
   cancelled (reuse `sendClassCancellation`) vs. silent. (Phase 4 / waitlist critique M1.)
2. **Room scope** — does a room block globally or per-`location`/site? Plan assumes **global** (simplest);
   confirm before Phase 2 index. (Rooms Q2.)
3. **Analytics grain for guest instructors** — should a session instructor's by-team/by-employee analytics
   include their guest session? Plan keeps **single-session grain** (narrow analytics). (Instructors M3.)
4. **Empty-schedule deletion** — keep Team-sync/auto-release empties as hard-delete (pragmatic, plan's
   choice) or convert to `cancelled`? Plan keeps hard-delete but routes them through `releaseSchedule` so
   ledger + waitlist rows are cleaned. Confirm. (Waitlist B2/Q2.)
5. **Cohort teachers self-assigning a co-instructor** — Admin-only in v1; confirm no resource-policy
   exception wanted. (Instructors Q3.)
