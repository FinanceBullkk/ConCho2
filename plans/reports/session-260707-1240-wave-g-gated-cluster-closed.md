# Session report — Wave G GATED schedule cluster CLOSED + PG gate #8 promoted

**Date:** 2026-07-07 · **Goal:** port the last GATED schedule roster-sync/waitlist/auto-release cluster to dual-backend, drive `server-tests-pg` to green, promote it to required gate #8.
**Result:** PG lane **6 → 1 failing** (only `p2-regression`, blocked on Wave F PR-2). Gate #8 promoted. 5 slice PRs + 1 promotion PR + batch-12 merged. 2 follow-up issues filed.

## Shipped (all merged to main, both lanes green)
| PR | Slice | Suites greened | Kind |
|---|---|---|---|
| #250 | Slice 0 (pre-session) | scheduleCancel, scheduleUseCases, sessionTrainers | reverse-assert |
| #251 | A | scheduleReassign | prod: controller `.toObject()` dual-backend guard + reverse-assert |
| #252 | B+C | waitlist, autoReleaseScope | **prod: dual-backend `domains/schedule/roster-sync.js`** |
| #253 | E | bookingRace | reverse-assert (3 counts) |
| #254 | D | enrollmentTransfer | prod: dual response read + note write + junction-add + reverse-assert |
| #257 | gate #8 | — | ci.yml + docs (promote server-tests-pg, exclude p2) |

## The core port (B+C — the hard one)
`models/Team.js syncSchedulesForTeamUpdate` (team member-edit) + `models/User.js` post-findOneAndUpdate auto-release hook shared ONE machinery (find future LIVE schedules → mutate roster → FIFO-promote freed seats → sweep still-empty). Both crashed on PG (`tx.client.query is not a function` — a raw mongoose session reached the PG-resolved `promoteIfSeatFree`).
- Ported ONCE, backend-agnostic → `domains/schedule/roster-sync.js` over `runInTransaction` + the already-dual waitlist/schedule repos + **5 new dual repo primitives** (`findFutureTeamSchedules`/`findFutureUserSchedules`/`applyRosterDelta`/`findEmptyScheduleIds`/`deleteSchedulesByIds`).
- Roster WRITE stays backend-native: Mongo `$pull`/`$push` **verbatim** (zero prod change) ⇔ PG `enrolled_users text[]` array SQL.
- Team.js + User.js became thin delegates; `groups/mutations.js` passes the whole UoW `tx`.
- Full-Mongo-suite Jest gate confirmed **zero production regression**.

## Key finding: most "GATED" suites were NOT missing ports
The booking chokepoint was already dual-backend (mig 027). The proposal's slice→port mapping was imprecise:
- **A (scheduleReassign)**: a `schedule.toObject()` in the audit-diff (plain PG row has no `.toObject()`) → 500. One-line guard + reverse-asserts.
- **E (bookingRace)**: race behaviour already correct on PG; only post-race `countDocuments` reads were stale. 3 reverse-asserts.
- **D (enrollmentTransfer)**: writes already reach PG; only the Mongoose response re-fetch, note write, and the `$addToSet` target-add (junction not mirrored) needed fixing — mostly READS, no transaction rewrite.
- Only **B+C** was a genuine transaction-critical port.

## Method (repeatable, low-risk)
1. Get ground truth: run the failing suite on PG, read the ACTUAL error (a throwaway diag test surfaced the swallowed 500 body).
2. Fix production dual-backend gaps; keep the Mongo path verbatim (0 prod risk).
3. Reverse-assert stale Mongoose reads → `readActiveRow`/`findActiveRowWhere`/`countActiveRowsWhere` (+ new `readActiveTeamMemberIds`).
4. Verify BOTH lanes per slice + a parity test for new dual methods.
5. Stacked/independent PRs, merge each when 8 gates + PG parity green.

## Gate #8 promotion (owner-approved: "promote now, exclude p2")
`ci.yml` `server-tests-pg`: dropped `continue-on-error`, renamed to "Server tests on Postgres", excludes `p2-regression` via `--testPathIgnorePatterns` (drop when Wave F PR-2 lands). Gate count 7→8 across CLAUDE.md / testing-and-ci.md / system-overview.md / ltms-gap-analysis.md; roadmap Status board + Phase-6 row updated (Phase 6 → ~55%).

## Deferred (tracked, NOT lane-greening blockers; Mongo prod path correct)
- **#255** — enrollment transfer not atomic on the PG lane (pool writes vs one `runInTransaction`).
- **#256** — `notifyPromotions` writes waitlist-promoted NotificationLog to Mongo even in PG mode.
- **p2-regression** — blocked on Wave F PR-2 (attendance-export refactor + user-mutations); the only remaining PG-lane fail.

## Guardrails held
Never ran 2 jest lanes against the shared `tms-pg` DB (lock guard). All runs `caffeinate -i`. No subagents/Workflow for jest. Every slice verified on both lanes before merge. Mongo (production) gate never regressed.

## Unresolved questions
1. When Wave F PR-2 lands, remove the `p2-regression` exclusion from `ci.yml` so gate #8 covers the whole suite — assign to that PR.
2. #255/#256 priority vs the Phase-5 cutover — do they block cutover or ride with it?
