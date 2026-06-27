# PG Port — Schedule Booking Chokepoint (scout + slice plan)

> Scout of `domains/schedule` for the dual-backend port — the highest-risk port of
> the whole Mongo→PG migration. Goal: land it as **small, parity-proven slices**,
> not one 39-method big-bang. `DB_BACKEND=mongo` stays prod default throughout.
> Created 2026-06-27 · Tail order chosen: scout schedule first (owner).

## 0. What's already built (don't redo)
- **`domains/_shared/unit-of-work.js`** — `runInTransaction(fn)` (Mongo `session.withTransaction` ⇄ PG `BEGIN/COMMIT` on a checked-out client). `tx` is opaque: repo impl reads `tx.session` | `tx.client`. Parity-proven (#214).
- **`schedule/booking-write-repository.{mongo,pg}.js`** — the atomic booking INSERT seam (`insertScheduledSession` / `countScheduledForClass` / `cancelSession`) on `tx`; 23505→`{code:11000}` mapping; partial-unique double-booking guard (`uq_sched_slot_scheduled`, migration 001). Done (#214).
- Pattern to copy everywhere: `const exec = (tx,t,p) => (tx&&tx.client ? tx.client.query(t,p) : query(t,p))`.

## 1. Scope — two repos + the txn use-cases
| Unit | Methods | Nature |
|---|---|---|
| `schedule/repository.js` | 40 | ~25 pure reads (populate/aggregate) · ~14 **`session`-aware** (collision, weekly-cap, cancel, room-lock ledger, waitlist cancel, mode/capacity reads) |
| `schedule/waitlist/repository.js` | 10 | reads + simple writes (createEntry, withdraw, position, lists) — no cross-table txn |
| `services/scheduleService.js` | 3 txn blocks | `bookSlot` · `adminCreate` (cohort) · `cancelSession` — each `mongoose.startSession().withTransaction`, threads `session` into many repo calls |
| `schedule/waitlist/promotion.js` | `promoteIfSeatFree` | **FIFO in-tx**: guarded `$push` (`enrolledUsers $ne user` + `$expr size<cap`) + `entry.save({session})` + M5 overfill belt |
| `schedule/release-resources.js` | `releaseScheduleResources` | in-tx: cancel waiting entries + drop room-lock rows |

**Cross-domain note:** `learning/session` use-cases call these same `scheduleService` txns, and `Team.syncSchedulesForTeamUpdate` (groups) is **Mongo-only by design** (deferred with groups). `learning/session` rides AFTER this port (depends on it).

## 2. Migrations (one new: 027)
Existing `schedules` cols (001/003/007/020): class_id, booked_team_id, start_time, end_time, status, enrolled_users[], session_instructor_ids[], meta, room_id, office_id, topic, room_link, meet_link. **Missing → add in 027:** `cancelled_at` ts, `cancelled_by` text, `cancel_reason` text, `capacity` int (per-session cap; effectiveSessionCapacity reads it). Audit during slice 1: `external_trainer`/`session_type_id`/`materials` (likely `meta` jsonb — confirm vs columns).

**New tables (027):**
- **`waitlist_entries`** — id, schedule_id, class_id, user_id, status (`waiting|promoted|withdrawn|cancelled` default waiting), promoted_at ts, joined_by text, stamps. Indexes: **partial-unique `(schedule_id,user_id) WHERE status='waiting'`** (double-join guard ⇄ Mongo E11000→409); `(schedule_id,status,created_at)` (FIFO scan). **Status-lifecycle, NO soft-delete** (history).
- **`room_bookings`** — id, room_id, schedule_id, class_id, start_time, stamps. Indexes: **unique `(room_id,start_time)`** (THE room lock ⇄ E11000→409 "room taken"); `(schedule_id)` (release/orphan-sweep). **HARD-DELETE by design** — a soft-deleted row would brick the slot; release drops it.

## 3. Trap catalog (replicate exactly)
- **T-collision** — only LIVE rows collide: `WHERE class_id=$ AND start_time<$end AND end_time>$start AND status='scheduled' [AND id<>$exclude]` (time-overlap, not equality). Mirrors the partial-unique.
- **T-weekly-cap** — `countSchedulesForTeamInWeek`: `bookedTeamId`, week window, `status='scheduled'`, exclude id. Cancelled don't count.
- **T-room-lock** — `createRoomBooking` + `setScheduleRoom(roomId)` in ONE tx; field+ledger never drift; `cancelScheduleById` nulls `room_id` + caller `deleteRoomBookings` same tx. 23505 on `(room_id,start_time)` → `{code:11000}` → 409.
- **T-FIFO-push** — guarded seat: `UPDATE schedules SET enrolled_users=array_append(enrolled_users,$u) WHERE id=$ AND status='scheduled' AND NOT ($u=ANY(enrolled_users)) AND cardinality(enrolled_users)<$cap RETURNING 1`. `modifiedCount!==1` → re-read defense; stale head resolved WITHOUT a seat; M5 belt: post-loop `cardinality>cap` → throw (abort tx).
- **T-double-join** — partial-unique `(schedule_id,user_id) WHERE waiting`.
- **T-cancel-flip** — `UPDATE … SET status='cancelled' … WHERE id=$ AND status='scheduled' RETURNING` (conditional flip → one winner, loser null→409).
- **T-cancel-history** — never hard-delete schedule/attendance; cancelled rows are history; freed slot re-books (leaves partial index).
- **T-capacity** — `effectiveSessionCapacity({scheduleCapacity, maxPerSession})` (program policy ∪ per-session field); `$expr size<cap` ⇄ `cardinality<cap`.
- **T-live-doc** — `entry.save({session})` / Schedule live-doc mutate → explicit `UPDATE waitlist_entries SET status='promoted',promoted_at=now() WHERE id=$` (no ORM dirty-tracking on PG).
- **T-populate** — findScheduleById etc. populate classId/bookedTeamId/enrolledUsers/sessionInstructorIds → LEFT JOIN / embed; User+Class soft-delete drop-to-null; Schedule/Team have status/own hooks (verify per ref).
- **T-isolation** — UoW runs READ COMMITTED; the guarded conditional UPDATEs carry atomicity (per-statement row lock). Verify no extra `SELECT … FOR UPDATE` needed (the guarded push is self-sufficient; the M5 belt re-reads in-tx).

## 4. Slices (each = 1 PR, parity-proven on Neon, mongo-default suite green)
- **S0 — migration 027** (tables + schedule cols). ✅ DONE 2026-06-27.
- **S1 — schedule reads** (25 no-`session` methods) → `repository.{mongo,pg}.js` + **merge selector** (mongo ⊕ pg → un-ported writes stay mongo). ✅ DONE 2026-06-27 (13/13 parity, 67 mongo-default green).
- **S2 — `waitlist/repository.js`** (10) → dual-backend. Reads + simple writes; partial-unique double-join. Parity test. ✅ DONE 2026-06-27 (10/10 parity on Neon, 23 mongo-default waitlist green). Clean-swap selector (all 10 ported). One behavior-preserving tweak: controller `entry.toObject()` → `{...entry}` (both backends return plain objects).
- **S3 — schedule txn-aware methods + scheduleService blocks.** SPLIT into S3a + S3b (owner 2026-06-27: repo-layer first, design-doc the orchestration before cutover).
  - **S3a — 12 txn repo methods → dual-backend.** ✅ DONE 2026-06-27. collision, weekly-cap, capacity-policy, scheduling-mode, attendanceExists, cancelScheduleById, waitlist release pair (findWaitingEntries/cancelWaitingEntries), room-lock quartet (findRoomForLock/createRoomBooking/setScheduleRoom/deleteRoomBookings). Mongo accepts BOTH a raw `session` (legacy callers unchanged) AND a UoW `{session}` wrapper via a `sessionOf` shim (keys off `.session`/`.startTransaction` — NB a mongoose ClientSession exposes `.client`, so never discriminate on it); pg via `exec(tx)`. Selector still MERGES (updateScheduleById + findTeamById remain mongo-only). Parity 13/13 on Neon **incl. a rollback harness** (mid-tx throw → zero partial writes both backends, via real `runInTransaction.impls`). mongo-default green: booking/cancel/reassign 52, room/mode/teams/authz 50, waitlist/reconcile/queries+S1/S2 96. DB_BACKEND=mongo default unchanged.
  - **S3b — orchestration cutover.** Design doc done: `plans/reports/design-260627-1601-pg-s3b-schedule-orchestration-cutover.md` (decisions: P1=`SELECT…FOR UPDATE`, P2=one `insertSession`, SPLIT into S3b-1 create/cancel + S3b-2 updateSchedule after S4).
    - **S3b-1 — create/cancel cutover.** ✅ DONE 2026-06-27. Migrated `bookSlot`/`bookCohortSlot`/`adminCreate`/`cancelSlot` (scheduleService) + `deleteSchedule` (use-cases) from `mongoose.startSession().withTransaction`→`runInTransaction`. 2 new dual-backend seams: `loadTeamForBooking` (replaces the in-tx Team write-lock+populate; mongo `findByIdAndUpdate {updatedAt}` / pg `SELECT…FOR UPDATE`) + `insertSession` (the single create seam: core columns + meta-extras; 23505→11000). The policy/release layers (`assertBookable`/`acquireRoomLock`/`releaseScheduleResources`) are pure pass-through → just thread `tx`. Parity: new `schedule-booking-seams.pg.test.js` 6/6 on Neon incl. **the P1 concurrency proof** (two concurrent same-team bookings → exactly one wins, weekly cap held, both backends) + rollback. mongo-default green: booking/race/abstraction/studio 31, cancel/usecases/reassign/learning/room/teams/mode/authz 94; full pg-parity 40 suites/250. **Post-commit reads (re-fetch populate, cancelSlot email-load, User.find waiters) stay Mongo-direct — deferred to a read-path completion pass; harmless while DB_BACKEND=mongo.** DB_BACKEND=mongo default unchanged.
    - **S3b-2 — `updateSchedule` cutover (after S4).** Port `updateScheduleById` (generic field-mapper) + `findTeamById` (opts-session), then cut `updateSchedule` over. Sequenced after S4 because its capacity-raise branch calls `promoteIfSeatFree` (S4).
- **S4 — FIFO promotion** (`waitlist/promotion.promoteIfSeatFree`) dual-backend. ✅ DONE 2026-06-27. The business logic (FIFO loop / stale-head resolve / re-read defense / M5 overfill belt) stays in promotion.js (backend-agnostic JS); its 5 DB primitives moved to the waitlist repo as tx-aware twins: `findScheduleForPromotion`, `findWaitingEntriesForPromotion` (FIFO `created_at ASC`), **`seatWaiterIfRoom`** (the guarded seat — mongo `$push` w/ `$ne`+`$expr size<cap`; pg `array_append … WHERE NOT $u=ANY AND cardinality<cap`), `findScheduleEnrolledUsers`, `markEntryPromoted`. Waitlist mongo repo gained the `sessionOf` shim (legacy callers — Team-sync, updateSchedule — still pass a raw session). Parity `schedule-promotion.pg.test.js` 6/6 on Neon **incl. the concurrency crown** (two concurrent seats at the cap boundary → exactly one wins, roster never exceeds cap, both backends). mongo-default green: waitlist/staleReconcile/reassign/usecases/teams 57, reconcile 16; full pg-parity 41 suites/256. `notifyPromotions` left Mongo-only (post-commit email side-effect). DB_BACKEND=mongo default unchanged.

Order rationale: reads → simple writes → the txn chokepoint → the concurrency crown. Stop-and-review after S3 (it's the invasive one) before S4.

## 5. Test plan
- Per slice: `tests/pg-parity/schedule-*.pg.test.js` (Mongo==PG on real Neon) + the `DB_BACKEND=mongo` schedule/booking/waitlist integration suites stay green.
- S3/S4 add a **rollback-parity** case (mid-tx error → no partial rows) and an **overfill belt** case. CI lane "PG parity (Postgres)" runs them.

## 6. Risks / unresolved questions
1. **scheduleService is shared** by the legacy `/api/schedules/book-slot` AND the `learning/session` adapter — porting its txn blocks touches both. Confirm both still pass `DB_BACKEND=mongo` after S3.
2. **`external_trainer`/`materials`/`session_type_id`** — columns vs `meta` jsonb? Decide in S1 (cheapest to settle before writes).
3. **Isolation**: confirm READ COMMITTED + guarded UPDATE is sufficient for FIFO (vs needing `FOR UPDATE`/SERIALIZABLE). Validate with the concurrent-promoter parity case in S4.
4. **`learning/session`** port: schedule-dependent — sequence it right after S3, or fold into S3? (Lean: separate, after S3.)
5. Promotion's `enrolledUsers` lives on `schedules.enrolled_users[]` (array), NOT a join table — array_append/cardinality is the seat op; confirm no enrollment-row coupling here (there isn't — enrollment is groups' concern).
