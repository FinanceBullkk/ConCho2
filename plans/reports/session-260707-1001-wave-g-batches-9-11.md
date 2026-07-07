# Session report — Wave G batches 9–11 (PG lane)

**Date:** 2026-07-07 · **Goal:** grind workable non-GATED PG-lane suites to green, stop at GATED boundary.
**Result:** PG lane **24 → 9 failing** (all 9 remaining are GATED cluster + 1 F-PR-2-blocked). 3 stacked PRs.

## Shipped
| Batch | PR | Suites fixed | Both lanes |
|---|---|---|---|
| 9 | #247 (7 gates green) | 6: reconcileAutoHeal, analyticsTimeseries, assignmentReminderRoutes, roomOfficeScope, complianceMatrix, lastActivePerf | ✓ |
| 10 | #248 (stacked) | 8: whole `learning-*` tail | ✓ |
| 11 | #249 (stacked) | 1: mfa | ✓ |

**14 suites, ~54 test fails → 0.** PRs are a stack (9←10←11), base=main; merge in order (I'm classifier-blocked from self-merging — needs your click). #247's 7 required gates + PG parity were confirmed green.

## Real production/PG-repo fixes (not just test reverse-asserts)
- **assignment `findAssignableUsers`** — normalise populated `{_id}` → ids (PG `.map(String)` gave `"[object Object]"` → whole reminder service found nothing).
- **room / enrollment repos** — map unique-violation `23505` → Mongo-style `11000` (409 not 500) on room-code + concurrent cohort-enroll race.
- **metrics-repository `matchToWhere`** — treat a bson ObjectId as scalar equality.
- **getUsers list read ported to dual-backend** (`controllers/user/user-list-repository.{mongo,pg,index}` + parity test) — the last unported hot read; PG path reads the users table, byte-order `COLLATE "C"` sort.
- **`use-cases.ensureProgramForLegacyCourse`** — backfill via `updateProgramById` not `.save()` (PG rows have no `.save()`). *(Adopted from a concurrent session's uncommitted change — see below.)*

## Test infra added (`tests/pg-test-utils.js`)
`deleteActiveRowsWhere` (clear PG-only rows a Mongoose deleteMany misses) · `buildScalarWhere` binds booleans natively · `updateActiveRow` Mongo path switched to raw `collection.updateOne` (the timestamps plugin was clobbering explicit `createdAt`). Pattern proven for select:false RMW clobber (mfa) — read/write PG directly, dodge the mirror.

## Incident — concurrent session
Mid-session a **second Claude session (`0689acca`)** was found editing the same repo/domain (a `learning/use-cases.js` PG fix + cutover/audit docs) and running jest on the shared `tms-pg` DB. Paused, surfaced it, you confirmed to consolidate here. Adopted its `use-cases.js` fix into batch 10; left its 2 untracked docs alone. No collision occurred (it went idle). **Guardrail for future: never run two jest lanes against the shared PG DB concurrently.**

## Where the lane stands (9 left)
- **8 GATED** schedule roster-sync/waitlist cluster — see `proposal-260707-1001-gated-schedule-cluster-port.md`.
  Key finding: ~half those fails are **reverse-asserts fixable now** (booking/cancel writes already ported); 3 suites (scheduleCancel, scheduleUseCases, sessionTrainers) are fully reverse-assert. The rest need the Mongo-only `syncSchedulesForTeamUpdate` / waitlist-promotion / auto-release ported.
- **1 deferred** `p2-regression` — blocked on Wave F PR-2 (attendance-export refactor).

## Next steps (need your decision)
1. **Merge the stack** #247 → #248 → #249 (in order; rebase between if squash-merged).
2. **Approve GATED Slice 0** (reverse-assert scheduleCancel/scheduleUseCases/sessionTrainers — test-only, closes 3/8 free)?
3. **Approve GATED Slices A–E** (the real roster-sync/waitlist/auto-release port) or hand to a dedicated effort?
4. **Gate #8 promotion** — after the cluster, decide whether to promote with `p2` as known-red informational or hold for F-PR-2.

## Unresolved questions
- Should the proposal + this report be committed (and where), or kept as working-tree artifacts? (currently uncommitted)
- Is the concurrent session `0689acca` yours to close, or still needed?
