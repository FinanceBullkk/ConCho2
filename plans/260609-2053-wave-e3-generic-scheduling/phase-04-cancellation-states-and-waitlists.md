---
phase: 4
title: Durable Cancellation States + Waitlists (capacity-atomic FIFO promotion)
status: in_progress  # slice A (durable cancel) SHIPPED 2026-06-11; B (waitlist+promotion) + C (UI) pending
priority: high
effort: 5–6 dev-days
depends_on: [1, 2, 3]
---

> **2026-06-11 — Slice A shipped (durable cancel).** Code-truth note: Wave E3
> phases 1–3 never shipped as written — the foundation this file assumed
> (`Schedule.status`, unified `releaseSchedule`) did NOT exist, so slice A
> created `Schedule.status/cancelledAt/cancelledBy/cancelReason`, the
> partial-unique `{classId,startTime} where status:'scheduled'` index (+
> `scripts/migrate-schedule-partial-unique-index.js`), atomic conditional
> cancel flips on `cancelSlot`/`deleteSchedule`, room-ledger release +
> `roomId:null` in-tx, and the live-only sweep across ~20 operational queries.
> The room-release primitive is `roomLockPolicy.releaseRoomLock` (re-center
> Phase 3), not Wave E3's `releaseSchedule` — slice B should extend THAT (or
> finally introduce `releaseSchedule` wrapping it + the waitlist transition).
> Spec delta folded into `docs/specs/scheduling-and-booking`. Slices B/C below
> remain as designed.

# Phase 4 — Durable Cancellation + Waitlists

## Context Links
- Overview: `./plan.md`; foundation: `./phase-01-*`; rooms: `./phase-02-*` (shares `releaseSchedule`).
- Source design: "Durable Cancellation + Waitlists" subsystem + its critique (B1–B3, M1–M5, m1–m5).
- Spec: `docs/specs/scheduling-and-booking/spec.md` (MODIFIED cancellation delta + new Waitlist block).

## Overview
- **Priority:** high (closes the hard-delete golden-rule violation; lands LAST — owns the index migration).
- **Status:** pending.
- **Description:** Cancellation becomes durable (`status:'cancelled'`, never hard-delete); the
  `{classId,startTime}` unique index becomes **partial-unique where status='scheduled'** so the slot
  re-books while still guarding live double-book. Per-session FIFO **`WaitlistEntry`** with auto-promotion
  performed **in the same transaction that frees the seat**. Splittable: **Phase A** = durable cancel
  (shippable alone, de-risks the migration), **Phase B** = waitlist + promotion, **Phase C** = UI.

## Key Insights (from critique — folded in)
- **B1 (waitlist) — FATAL to the original headline path:** cohort `Enrollment` docs are **decoupled** from
  `Schedule.enrolledUsers` (snapshotted at booking time, no ongoing sync), and `enrollment/withdraw` runs
  **no transaction**. → **DROP cohort `enrollment/withdraw` as a seat-freer.** Real per-session seat-freers
  (all already in-tx): **(1) `Team.syncSchedulesForTeamUpdate` (`Team.js:236`)**, **(2) User auto-release
  (`User.js:360-398`)**, **(3) capacity-raise on `updateSchedule`**, **(4) admin manual promote**.
- **B2/B3 (waitlist):** `Team.js:237` + `User.js:385` **`deleteMany`** hard-delete empty future schedules,
  and reconcile **CHECK 4** flags empties — all untouched by the original design, so they destroy waitlist
  rows and (with cancellation) drift the slot semantics. → Route **both deleteMany paths** through the
  unified `releaseSchedule` (Phase-1 contract, extended here) which transitions active
  `WaitlistEntry`→`cancelled` before/with deletion; add `status:'scheduled'` to **CHECK 4** and every
  collision/weekly/availability/reminder query. **Decision (owner Q4):** empties stay HARD-deleted
  (pragmatic) but go through `releaseSchedule` so ledger + waitlist rows are cleaned — OR forbid removing a
  `scheduled` session with active waitlist entries.
- **M1 (waitlist):** whole-session cancel currently emails the whole roster; waiters get **nothing**. Add a
  waitlist-cancellation notice (reuse `sendClassCancellation` for `status:'waiting'` entries) — or document
  silent (owner Q1).
- **M2 (waitlist):** add `cancelReason` to a zod schema (trim/maxLength — unvalidated free-text today);
  populate the durable-cancel audit `diff`; confirm the learning cancel adapter path actually audits.
- **M3 (waitlist):** capacity-raise promotion MUST run **inside** `updateSchedule`'s `withTransaction`
  (after `repository.updateScheduleById:159`), not post-commit — else the seat-free/promote atomicity (the
  whole race-safety argument) breaks.
- **M4/m4 (waitlist):** the join "at capacity" check + the UI fullness gate MUST use
  `effectiveSessionCapacity` (program override > field > 9), NOT the `availableSpots` virtual. The waitlist
  scope check is **team/cohort membership** (`bookedTeamId` / active cohort `Enrollment`), **NOT**
  `enrolledUsers` membership (a waitlister is by definition not enrolled).
- **m2 (waitlist):** `NotificationLog` dedupe needs deterministic `recipientUserId` + `recipientEmail` on
  the `waitlist_promoted` create (else compound-key mismatch double-emails).
- **m5 (waitlist):** admin manual promote + `cancelled` waitlist state + `promotedBy` are borderline YAGNI;
  ship auto-promotion + join/leave/list first, defer manual promote as a fast-follow if desired.

## Requirements
**Functional**
- F1: Cancel = durable status flip (`cancelled`/`cancelledAt`/`cancelledBy`/`cancelReason`); started-session
  cancel still 409, attendance untouched. Applies to BOTH leader-cancel (`cancelSlot`) and admin-delete
  (`deleteSchedule`).
- F2: Partial-unique `{classId,startTime} where status='scheduled'` replaces the full unique index;
  cancelled rows may share the slot (history); freed slot re-books.
- F3: Per-session `WaitlistEntry` (FIFO) join/leave/list; join only when at `effectiveSessionCapacity`.
- F4: Auto-promotion FIFO, capacity-atomic, **in-tx with the seat-free**, idempotent
  (`enrolledUsers:{$ne:userId}` guard); `waitlist_promoted` `NotificationLog` (idempotent).
- F5: ALL Schedule-removal paths transition active waitlist entries via `releaseSchedule`.

**Non-functional**
- NF1: Index migration idempotent + pre-deploy; status backfill folded in (Phase 1's may suffice).
- NF2: E2 ordering at `assertBookable` untouched (join creates no new session). Promotion reuses
  `effectiveSessionCapacity` — roster never exceeds cap (assert post-loop, M5-waitlist belt).
- NF3: Cancelled rows excluded from collision/weekly/availability/reminder/reconcile queries.

## Architecture
**`Schedule`** (status fields added in Phase 1) + **index migration**: drop full
`classId_1_startTime_1` unique → create partial-unique `where status:'scheduled'`. Script
`server/scripts/migrate-schedule-partial-unique-index.js` (idempotent: ensure status, drop, recreate).

**`server/models/WaitlistEntry.js`** (new): `{ scheduleId, classId, userId, status
('waiting'|'promoted'|'withdrawn'|'cancelled'), promotedAt, joinedBy }` + **partial-unique
`{scheduleId,userId} where status:'waiting'`** (join-race guard) + `{scheduleId,status,createdAt}`
(FIFO scan). Never hard-deleted (status lifecycle).

**`NotificationLog`**: add `'waitlist_promoted'` enum; `cadenceKey = '<scheduleId>:<userId>'`.

**Waitlist sub-domain** `server/domains/schedule/waitlist/{controller,use-cases,repository,policy,
schemas,dto}.js`:
- `join` — load scheduled future session (404 else); **team/cohort membership** scope (403); at
  `effectiveSessionCapacity` (409 if seats free); not already enrolled/waiting (409); insert (partial-unique
  → 409 on race).
- `leave` — `waiting`→`withdrawn` (404 if none; 403 if not self/Admin).
- `list` — Admin/Teacher (Teacher scoped, open-until-populated); Participant gets own entry only (no roster leak).
- `promoteIfSeatFree({scheduleId}, session)` — in caller's tx: re-read roster R; `cap =
  effectiveSessionCapacity`; `free = cap - R`; FIFO `limit(free)`; per-candidate `$push` guarded by
  `{$ne:userId}` (idempotent) + flip entry→`promoted`; post-loop assert `roster ≤ cap`. Post-commit:
  idempotent notify + calendar add.

**Seat-freeing hooks** (call `promoteIfSeatFree` in the EXISTING tx):
- `Team.syncSchedulesForTeamUpdate` (after `$pull`, before/instead-of empty deleteMany).
- `User.js` auto-release (after `$pull`).
- `updateSchedule` capacity-raise — **inside** `withTransaction` (M3).
- Admin manual promote (optional/deferred — m5).

**`releaseSchedule` (extended from Phase 2):** now ALSO
`WaitlistEntry.updateMany({scheduleId:{$in}, status:'waiting'}, {$set:{status:'cancelled'}}, {session})`.

## Related Code Files
**Create**
- `server/models/WaitlistEntry.js`
- `server/domains/schedule/waitlist/{controller,use-cases,repository,policy,schemas,dto}.js`
- `server/scripts/migrate-schedule-partial-unique-index.js`
- `server/tests/integration/{scheduleCancel,waitlist}.test.js`
**Modify**
- `server/models/Schedule.js:133` — replace unique with partial-unique (status='scheduled').
- `server/models/NotificationLog.js:9` — add `waitlist_promoted`.
- `server/services/scheduleService.js:351` (`cancelSlot` durable flip, audit diff, no Attendance delete).
- `server/domains/schedule/use-cases.js:200` (`deleteSchedule` durable flip), `:159` (capacity-raise
  promotion in-tx).
- `server/domains/schedule/repository.js` — `cancelScheduleById`; add `status:'scheduled'` to
  `findScheduleForCollision:113`, `countSchedulesForTeamInWeek:125`, availability/upcoming/page queries;
  **extend `releaseSchedule`** with the waitlist transition.
- `server/models/Team.js:236`, `server/models/User.js:385` — route empties through `releaseSchedule` +
  `promoteIfSeatFree`.
- `server/services/reconcile/schedule-checks.js:73` (CHECK 4) — `status:'scheduled'`.
- `server/services/reminderService.js:86` — `status:'scheduled'` in claim filter.
- `server/routes/scheduleRoutes.js`, `server/domains/learning/routes.js` — waitlist routes (before `/:id`).
- `server/schemas/schedule.js` — `cancelBody {cancelReason?}`, `waitlistBody {userId?}`.
- `server/lib/emailTemplates.js` — `tplWaitlistPromoted`/`sendWaitlistPromoted`.
- `client/src/hooks/*`, `client/src/api/api.js`, `client/src/hooks/queryKeys.js`,
  `client/src/pages/{BookClassPage,ClassDetailPage}.jsx`, `client/src/components/StatusBadge.jsx`,
  `client/src/i18n/locales/en.json`.

## Implementation Steps
**Phase A (durable cancel — shippable alone):**
1. Partial-unique index migration script (idempotent) + status backfill confirm.
2. Durable `cancelSlot` + `deleteSchedule` (status flip, no Attendance/doc delete, audit diff, cancelReason
   zod). Confirm learning adapter audits (M2).
3. Add `status:'scheduled'` to collision/weekly/availability/upcoming/reminder/reconcile-CHECK-4 queries.
4. Cancelled chip UI (StatusBadge).
**Phase B (waitlist + promotion):**
5. `WaitlistEntry` model + sub-domain (join/leave/list, policy = team/cohort membership scope, FIFO).
6. `promoteIfSeatFree` (E2 capacity reuse, `$ne` idempotency, post-loop cap assert) + `NotificationLog`
   `waitlist_promoted` (deterministic recipient fields) + email template.
7. Wire seat-freers: Team-sync, User auto-release, capacity-raise (in-tx), [admin promote deferred].
8. **Extend `releaseSchedule`** with waitlist transition; wire all removal paths (incl. Team/User deleteMany).
9. Waitlist-cancelled notice on whole-session cancel (M1 / owner Q1).
**Phase C (UI):** full-cell "Join waitlist", admin waitlist panel, hooks/keys/en.json.
10. Tests: durable cancel happy/edge/deny/race; waitlist join/leave/double-join; FIFO promotion;
    capacity-raise promote; **concurrent same-session promote (one promote, roster ≤ cap)**; orphan/cleanup.

## Todo
- [ ] Partial-unique index migration (idempotent, pre-deploy)
- [ ] Durable cancelSlot + deleteSchedule (no hard-delete) + cancelReason zod + audit diff
- [ ] status:'scheduled' on all collision/weekly/availability/reminder/CHECK-4 queries
- [ ] WaitlistEntry model + sub-domain (membership scope, FIFO, partial-unique)
- [ ] promoteIfSeatFree in-tx + post-loop cap assert + idempotent notify
- [ ] Drop cohort enrollment/withdraw seat-freer (B1); wire Team-sync/User-auto-release/capacity-raise
- [ ] Extend releaseSchedule (waitlist transition); route Team/User deleteMany through it
- [ ] Waitlist-cancelled notice (owner Q1)
- [ ] UI: cancelled chip, join-waitlist cell, admin panel
- [ ] Tests incl. concurrent same-session promotion race
- [ ] Tracker + scheduling spec MODIFIED (cancellation) + new Waitlist requirement block

## Success Criteria
- Leader cancel → 200, doc persists `cancelled`, slot re-bookable (book same `{classId,startTime}` → 201).
- Started-session cancel → 409, attendance untouched. Concurrent cancel → one 200 / one 409, one audit.
- Full session join → 201 `waiting`; non-full join → 409; double-join → 409; non-member → 403 (no leak).
- 1 free seat + 2 concurrent withdrawals → exactly one promotion, roster ≤ cap, one `waitlist_promoted` log.
- No Schedule-removal path orphans a `RoomBooking` or leaves a dangling `waiting` entry.

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Cohort-withdraw promotes a phantom seat | High | High | Dropped as seat-freer; real triggers only (B1). |
| Untouched deleteMany destroys waitlist/ledger rows | High | High | Unified `releaseSchedule` on Team/User paths + CHECK 4 filter (B2/B3). |
| Capacity-raise promote post-tx races | Med | High | Promotion inside updateSchedule tx (M3). |
| Index migration leaves dup live rows | Low | High | Idempotent script; status backfill first; verify before recreate. |
| Fullness computed two ways (virtual vs effective) | Med | Med | Both gate + UI use `effectiveSessionCapacity` (M4). |
| Double promotion email | Med | Low | Deterministic NotificationLog recipient fields (m2). |

## Security Considerations
- Join/leave `roleGuard('Admin','Participant')` + `bookingLimiter` (POST **and** DELETE); list
  `roleGuard('Admin','Teacher')`. CSRF on all (confirm mount after `csrfProtection`). Participant sees only
  own entry (`{position,status}`) — never co-waiter names. Soft-lifecycle waitlist (never hard-delete);
  attendance never touched on cancel (golden rule). Cancelled sessions excluded from learner-facing reads.

## Next Steps / Dependencies
- Depends on Phase 1 (`status`, `releaseSchedule`), Phase 2 (`releaseSchedule` ledger body to coexist with
  the waitlist body), Phase 3 (shared `domains/schedule/use-cases.js` edits — coordinate merge).
- **Definition of Done:** tests/lint green + `development-roadmap.md` changelog + scheduling spec MODIFIED
  cancellation delta + new Waitlist requirement block (bump `last_updated`) + `current-system-map.md` +
  commit.
