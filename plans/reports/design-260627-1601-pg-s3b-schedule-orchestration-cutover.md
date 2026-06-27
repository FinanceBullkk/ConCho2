# Design — S3b: schedule orchestration cutover to runInTransaction (PG port)

> Gate doc requested by owner (2026-06-27) before coding S3b — the invasive,
> highest-blast-radius slice of the whole Mongo→PG migration. S3a (repo-layer 12
> txn methods + rollback harness) shipped in PR #223. S3b makes the WHOLE booking
> write path run on PG when `DB_BACKEND=postgres`. Default stays mongo throughout.
> Decision needed on P1/P5 (marked) before implementation.

## 1. Goal & scope
Cut the schedule **mutation orchestration** from `mongoose.startSession().withTransaction`
to the backend-agnostic `runInTransaction(fn)`, port the 2 repo methods S3a deferred,
and replace the direct-Mongoose writes inside each tx with dual-backend repo seams.

In scope (6 transaction bodies):
- `services/scheduleService.js`: `bookSlot`, `bookCohortSlot`, `adminCreate`, `cancelSlot`
- `domains/schedule/use-cases.js`: `updateSchedule`, `deleteSchedule`

Out of scope: `learning/session` adapter (depends on scheduleService — sequence AFTER S3b);
`Team.syncSchedulesForTeamUpdate` (Mongo-only by design — stays raw-session); the post-commit
side-effects (calendar / email / notification bell) which already run OUTSIDE the tx.

## 2. What actually runs inside each tx today (inventory)
| tx body | direct Mongoose in-tx | repo/policy in-tx (already tx-aware after S3a) |
|---|---|---|
| bookSlot | `Team.findByIdAndUpdate({updatedAt}).populate(members)` (write-lock+load), `Schedule.create` | assertBookable (weekly-cap+collision+capacity) |
| bookCohortSlot | `Schedule.create` | assertBookable (collision+capacity), roomLockPolicy.acquireRoomLock |
| adminCreate | `Team.findById().populate(members)`, `Schedule.create(...scheduleData spread)` | assertBookable, acquireRoomLock |
| cancelSlot | — | releaseScheduleResources (room+waitlist), cancelScheduleById |
| updateSchedule | — | collision, weekly-cap, attendanceExists, **findTeamById**, capacity-policy, **updateScheduleById**, dissolveWaitlist, promoteIfSeatFree, room release/reacquire |
| deleteSchedule | — | releaseScheduleResources, cancelScheduleById |

So the only **direct Mongoose writes** left to seam are: the Team write-lock+load (bookSlot/adminCreate) and `Schedule.create` (3 create paths). Everything else already flows through S3a repo methods (which accept `tx` via the `sessionOf` shim) — passing the `tx` wrapper instead of a raw session is the whole change for them.

## 3. The hard problems + proposed decisions

### P1. Mongo write-lock has no clean PG equivalent  ⚠️ DECISION NEEDED
`bookSlot` does `Team.findByIdAndUpdate(teamId,{updatedAt},{session})` purely to **serialize concurrent bookings for the same team** — so two parallel bookings can't both pass the per-team **weekly-cap** read (the partial-unique index guards only the `(class,start)` *slot*, NOT the 2/week cap).
- **Options:** (a) `SELECT id FROM teams WHERE id=$1 FOR UPDATE` inside the tx — a real row lock, same serialization semantics; (b) rely on partial-unique only — **rejected**, it doesn't cover the weekly cap so two same-team/same-week bookings could both commit; (c) `pg_advisory_xact_lock(hashtext(teamId))` — works but opaque vs a plain row lock.
- **Recommendation: (a) `FOR UPDATE`.** New dual-backend repo seam `lockAndLoadTeamForBooking(teamId, tx)` → returns `{_id, classId, leaderId, members:[{_id,status}]}`; mongo = the existing `findByIdAndUpdate({updatedAt}).populate` (unchanged); pg = `SELECT ... FOR UPDATE` + a `team_members`/users fetch. adminCreate uses a non-locking `findTeamForBooking` (it never touched `updatedAt`; partial-unique is its only slot guard — keep that).
- **Pros:** faithful concurrency on both backends; one focused seam. **Cons:** a PG concurrency test is mandatory (two same-team bookings race → exactly one passes the cap).

### P2. `Schedule.create` with arbitrary fields → extend the booking-write seam
Field sets per path: bookSlot `{classId,bookedTeamId,startTime,endTime,enrolledUsers}` (already covered by `insertScheduledSession`); bookCohortSlot `+officeId`; adminCreate `...scheduleData` spread (bounded whitelist: + topic, roomLink, capacity, sessionInstructorIds, agenda, materials, customFields, externalTrainer, meetLink).
- **Recommendation:** ONE extended `insertSession(fields, tx)` superseding the narrow `insertScheduledSession`; core columns mapped explicitly, the jsonb-extras (agenda/materials/customFields/externalTrainer) folded into `schedules.meta` exactly like `baseSchedule` reads them back (S1 convention). Mongo twin = `Schedule.create([fields],{session})`. Returns the created-session shape used by the populate re-fetch.
- **Pros:** one seam, all 3 create paths; symmetric with the S1 meta-extras read. **Cons:** must keep the whitelist in sync with `ALLOWED_UPDATE_FIELDS`/schema.

### P3. `updateScheduleById` generic field-mapper (deferred from S3a)
`data` is a bounded whitelist (classId, bookedTeamId, startTime, endTime, roomLink, capacity, topic, agenda, materials, customFields, enrolledUsers, roomId, sessionInstructorIds, externalTrainer).
- **Recommendation:** pg = dynamic `UPDATE` building `SET` from a field→column map; extras merge into `meta` (`meta = COALESCE(meta,'{}') || $patch::jsonb`); return `baseSchedule(updated)`. Mongo unchanged. (Same meta convention as P2.)

### P4. `findTeamById(id, opts)` opts-carried session (deferred from S3a)
2 call shapes only: `{select:'classId'}` → `{_id,classId}`; `{select:'members', populate members status}` → `{_id, members:[{_id,status}]}`.
- **Recommendation:** keep the signature; tx travels in `opts.session` (mongo `sessionOf`, pg `exec(opts.session)`); bounded pg impl branches on `opts.select`. Callers migrate to pass the `tx` wrapper in `opts.session`.

### P5. Threading & the side-effect boundary  ⚠️ CONFIRM
Each body becomes `await runInTransaction(async (tx) => { …repo(tx)… })`. The post-commit side-effects (calendar create/delete, emails, `recordInApp`, `invalidateSessionOrderCache`, `notifyPromotions`) MUST stay OUTSIDE the closure (they already are). The duplicate-key→409 catch wraps the `runInTransaction` call (PG insert dup throws `{code:11000}` from the S3a seam; mongo throws E11000 — both already handled).
- **Confirm:** no in-tx code reads the raw `session` object directly anymore (all via repo). `waitlistPromotion.promoteIfSeatFree` + `dissolveWaitlist` already take a session arg → pass `tx` (they call S3a repo methods). `promoteIfSeatFree` itself is S4 — for S3b it stays mongo-only and is only reached on the mongo path; **on `DB_BACKEND=postgres` the capacity-raise promotion path is not yet ported** → updateSchedule's `body.capacity` branch would need S4 first OR a guarded no-op. *(This couples updateSchedule to S4 — see Q3.)*

## 4. Proposed repo seam delta (S3b)
- NEW `lockAndLoadTeamForBooking(teamId, tx)` (P1) · NEW `findTeamForBooking(teamId, tx)` (adminCreate, non-locking) · `insertSession(fields, tx)` (P2, supersedes insertScheduledSession) · pg `updateScheduleById` (P3) · pg `findTeamById` (P4). Selector becomes a **clean swap** once these land (no mongo-only remainder).

## 5. Test plan
- Extend `schedule-txn-repository.pg.test.js`: `insertSession` (all field shapes incl. meta extras), `updateScheduleById` (core cols + meta merge), `findTeamById` (both shapes), `lockAndLoadTeamForBooking`.
- **Concurrency parity** (new): two same-team bookings in one week race under `runInTransaction` → exactly one commits (cap/slot), both backends.
- **Booking-path smoke under `DB_BACKEND=postgres`**: bookSlot / bookCohortSlot / adminCreate / cancel happy-path + the 409/400/422 edges, parity vs mongo.
- All existing mongo-default suites (booking/cancel/reassign/room/teams/waitlist/reconcile) stay green — the cutover changes orchestration internals, not behavior.

## 6. Sequencing
S3b → then S4 (FIFO promotion `promoteIfSeatFree`) → then `learning/session` adapter (depends on scheduleService) → then `planning`. Owner's "stop-and-review after S3" gate applies to this doc + the S3b PR.

## Unresolved questions
1. **P1 lock mechanism** — `SELECT … FOR UPDATE` (recommended) vs advisory lock? Confirm.
2. **bookCohortSlot** — in S3b (recommended, it uses room-lock) or deferred? (Plan's original S3 text said "bookSlot · adminCreate · cancelSession" — bookCohortSlot was implicit.)
3. **updateSchedule × S4 coupling (P5)** — the `body.capacity` capacity-raise promotion uses `promoteIfSeatFree` (S4, still mongo-only). Options: (a) do S4 before S3b's updateSchedule cutover; (b) port updateSchedule but guard the promotion branch as mongo-only until S4; (c) fold a minimal `promoteIfSeatFree` into S3b. Recommend (a) reorder **S4 before the updateSchedule half of S3b**, OR split S3b into S3b-1 (create/cancel paths: bookSlot/bookCohortSlot/adminCreate/cancelSlot/deleteSchedule) + S3b-2 (updateSchedule, after S4).
4. **insertSession** — one extended method (recommended) vs per-path methods?
5. Flip-to-postgres smoke: acceptable to add a CI lane that runs a booking subset with `DB_BACKEND=postgres` against Neon, or keep parity-only?
