# Proposal — GATED schedule roster-sync / waitlist cluster (Wave G tail)

**Status:** awaiting owner sign-off · **Author:** Wave G autonomous session (2026-07-07)
**Decision needed:** approve slicing + which slices to run · **Blocks:** last 9 PG-lane fails

## 1. Where we are
After batches 9–11 the `server-tests-pg` lane has **9 failing suites left**:
- **8 GATED** schedule cluster: `scheduleReassign` · `scheduleCancel` · `scheduleUseCases` ·
  `sessionTrainers` · `waitlist` · `bookingRace` · `autoReleaseScope` · `enrollmentTransfer`.
- **1 deferred** `p2-regression` — blocked on Wave F PR-2 (attendance-export refactor), out of scope here.

Everything non-GATED is green. The gate (#8) can't be promoted until these close.

## 2. Why it was GATED
The booking chokepoint (`scheduleService`) is fully dual-backend since mig 027 — **zero direct
Mongoose**. But three post-commit / side-effect paths were left **Mongo-only by design**:
- `domains/groups/mutations.syncSchedulesForTeamUpdate` — roster rebuild + capacity + FIFO on team change.
- `domains/schedule/waitlist/promotion.js` — FIFO auto-promotion (best-effort, fail-soft, outside the txn).
- User AUTO-RELEASE hook (`models/User` post-findOneAndUpdate: status→Dropped ⇒ pull from future
  schedules + promote) — the F-PR-2 `user-mutations` blocker.

## 3. Finding (diagnostic run, 21 fails / 72 across the 8 suites)
The failures split into **two classes** — this is the key input for slicing:

### 3a. Reverse-asserts — WRITE already ported, only the Mongoose READ lags (fixable now, test-only)
| Suite | Fails | Read that needs the active backend |
|---|---|---|
| `scheduleCancel` | 2 | `Schedule.findById` cancel-flip + freed-slot `Schedule.find` rows |
| `scheduleUseCases` | 1 | `Schedule.findById` durable-cancel flip |
| `sessionTrainers` | 1 | `Schedule.findById` sessionInstructorIds/externalTrainer clear |
| `waitlist` (partial) | ~3 | `WaitlistEntry` leave/dissolve status + double-join count |
| `bookingRace` (partial) | ~1 | `Schedule.countDocuments` after the (already-working) 201/409 race |

→ **`scheduleCancel` + `scheduleUseCases` + `sessionTrainers` are FULLY reverse-assert** (all their
fails are stale reads) — greenable with `readActiveRow`/`findActiveRowsWhere`, **no production change**,
identical to batches 9–11. ~1 small batch.

### 3b. Genuine port-needed — the Mongo-only path doesn't run on PG (app 500s / wrong roster)
| Suite | Fails | Root |
|---|---|---|
| `scheduleReassign` | 4 | reassign→roster rebuild + capacity edit **500** — `syncSchedulesForTeamUpdate` |
| `waitlist` (FIFO) | ~4 | capacity-raise promote **500**, team-removal promote, stale-head **500**, team-reassign-dissolve **500** — `waitlist/promotion` + roster-sync |
| `autoReleaseScope` | 1 | drop-user → schedule pull + promote — User auto-release hook |
| `enrollmentTransfer` | 1 | transfer atomicity across both teams — team transfer close-path |
| `bookingRace` (cap) | 2 | concurrent weekly 2-session cap not atomic on PG |

## 4. Proposed slicing (each = its own PR, parity-tested, both lanes)
- **Slice 0 — reverse-assert the 3 fully-stale suites** (`scheduleCancel`, `scheduleUseCases`,
  `sessionTrainers`). Test-only, low-risk, ~1 batch. *Unblocks 3 of 8 immediately.*
- **Slice A — port `syncSchedulesForTeamUpdate`** (roster rebuild + capacity) to dual-backend via the
  existing `_shared/unit-of-work` (parity-proven 2026-06-25). *Unblocks `scheduleReassign` + waitlist roster paths.*
- **Slice B — port `waitlist/promotion` FIFO** to dual-backend (SELECT … FOR UPDATE oldest-waiter +
  seat + NotificationLog, in-txn). *Unblocks `waitlist` FIFO + the mixed reverse-asserts alongside.*
- **Slice C — port the User auto-release hook** (F-PR-2 `user-mutations`) — route through the schedule
  domain's dual-backend seams, NOT replicate a Mongoose hook. *Unblocks `autoReleaseScope` + Dropped-promotion.*
- **Slice D — enrollment transfer/drop close-path onto the `createActiveEnrollment` spine** (already
  flagged as the batch-9 follow-up in `domain-model-and-migration.md`). *Unblocks `enrollmentTransfer`.*
- **Slice E — atomic weekly 2-session cap** on PG (the booking race path). *Unblocks `bookingRace` cap.*

Sequence: **0 → A → B → C → D → E**. 0 is independent/low-risk; A unblocks the most; B depends on A's
roster helpers; C reuses A+B; D+E are small tails.

## 5. Risk
- **Machinery exists** — the dual-backend transaction abstraction (`runInTransaction`) is built and
  parity-proven, and the booking-write seam already maps 23505→11000. So this is *extending* a proven
  pattern, not inventing one. Highest-risk unknown (transactions) already retired.
- **Blast radius** — these paths mutate rosters/seats atomically; a wrong port corrupts enrollment state.
  Mitigated by: parity tests per slice (Mongo↔PG identical) + both-lane integration runs, same discipline
  as batches 9–11.
- **Mongo lane untouched** — all ports are `.pg.js` + selector; the Mongo path stays verbatim.

## 6. Recommendation
Approve **Slice 0 now** (test-only, zero production risk, closes 3/8 for free) and **Slices A–C** as the
substantive port (closes 4 more). D+E are small tails. That takes the PG lane to **1 remaining**
(`p2-regression`, itself gated on Wave F PR-2). Then promote `server-tests-pg` to required gate #8.

## Unresolved questions
1. Approve Slice 0 (reverse-asserts on 3 GATED suites) independently of the port? (recommended yes)
2. Run A–E in this session's continuation, or hand to a dedicated schedule-domain effort?
3. `p2-regression`/Wave F PR-2 (attendance-export refactor) — schedule now, or defer past gate promotion
   (promote the gate with p2 as a known-red informational, or hold the gate until F-PR-2 lands)?
