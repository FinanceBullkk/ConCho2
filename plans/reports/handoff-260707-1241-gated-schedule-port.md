# Handoff — Wave G GATED schedule-cluster port (Slices A–E)

**For:** a fresh session picking up the PostgreSQL dual-backend migration tail.
**Mission:** port the Mongo-only schedule roster-sync / waitlist / auto-release paths to
dual-backend, close the last 5 GATED suites on `server-tests-pg`, then promote the lane
to required CI gate #8. Repo: `/Users/hao/Documents/GitHub/ConCho2`.

## Read first (mandatory)
- `plans/reports/proposal-260707-1001-gated-schedule-cluster-port.md` — the SLICING PLAN (Slice 0 + A–E), owner-approved "proceed".
- `plans/reports/session-260707-1001-wave-g-batches-9-11.md` — batches 9–11 summary.
- `plans/260612-2042-postgresql-migration/phase-03-repository-ports.md` — port ledger (F-PR-2 seams + the `syncSchedulesForTeamUpdate` Mongo-only-by-design note).
- `plans/260705-0316-wave-g-batch2-suite-conversion/plan.md` — Wave G playbook + helpers.
- `docs/development-roadmap.md` changelog (2026-07-07 entries, batches 9–12).

## State at handoff (verify with git)
- **main = batches 9–12 merged** (2caafe1 #250 tip). Verify: `git log --oneline -5 origin/main`.
- PRs #247–#250 all merged. Nothing pending.
- **PG lane = 6 failing**: 5 GATED needing the port (**scheduleReassign, waitlist, bookingRace, autoReleaseScope, enrollmentTransfer**) + **p2-regression** (blocked on Wave F PR-2 attendance-export refactor — DO NOT touch here).
- Journey so far: 24 → 6 failing across batches 9–12 (18 suites). Every reverse-assert-fixable suite is done; these 5 REQUIRE production ports.

## Machine setup (ready)
Docker `tms-pg` (postgres:16, `postgresql://ci:ci@localhost:5432/tmsci`, 31+ migrations).
Rewrite two scripts into this session's scratchpad (scratchpad is session-specific):
- **run-pg.sh**: `cd server` + `caffeinate -i env NODE_ENV=test JWT_SECRET=local-test DB_BACKEND=postgres PG_URL=postgresql://ci:ci@localhost:5432/tmsci NODE_OPTIONS=--max-old-space-size=8192 npx jest "$@" --runInBand --forceExit`, with a lock guard on `/tmp/concho2-jest.lock` refusing a 2nd concurrent jest.
- **run-mongo.sh**: identical, drop `DB_BACKEND` + `PG_URL`.
Authoritative fail-list from CI: `gh run view <run-id> --job <pg-lane-job> --log | grep -oE "FAIL tests/[^ ]+"` (local full-suite OOMs → fake FAILs).

## Hard rules (unchanged from Wave G)
1. **NEVER run two jest at once** (one shared PG DB) — use the lock guard.
2. Always wrap `caffeinate -i`; **don't close the laptop lid** (caffeinate doesn't block clamshell sleep → broken run).
3. **No subagents / no Workflow tool for the jest work** — inline only, serialize the DB.
4. **Verify BOTH lanes every slice** (Mongo is the enforced gate, no regress). Port pattern keeps the `.mongo` impl verbatim → Mongo safe; the new `.pg` impl runs only on the PG lane.
5. Small batches; verify locally before commit. Each git commit resets cwd to repo-root → `cd server` for jest.
6. **Stacked PRs**: each slice = new branch off the previous (or off main if the prev merged), PR base=main. After a squash-merge the next branch goes DIRTY → `git rebase --onto origin/main <prev-tip> <branch>` → `git push --force-with-lease`.
7. **Merge/force-push need the owner's OK per session** (the classifier blocks self-merge + force-push without explicit authorization AND confirmation all gates are green). Always confirm 7 required gates + PG-parity green before merge.

## Test helpers (server/tests/pg-test-utils.js, no-op on Mongo)
`readActiveRow(model,id)` · `findActiveRowWhere/findActiveRowsWhere/countActiveRowsWhere(model,where)` · `distinctActiveValues` · `deleteActiveRowsWhere` · `updateActiveRow(model,id,patch)` · `findActiveAuditRow/Chain`. `buildScalarWhere` handles null→IS NULL, binds boolean + Date natively, dotted `target.id`→`target_id`. Explicit mappers: `tests/pg-row-mappers.js`. Auto-mirror Mongoose→PG + raw-collection patch: `tests/pg-auto-mirror.js`. **GOTCHA:** `externalTrainer`/`vendorId`/… live in the `schedules.meta` jsonb on PG (not top-level columns) — a reader must spread `meta` like the production `scheduleRow`.

## TASK: the 5 port slices (A–E)
The booking chokepoint is ALREADY dual-backend (mig 027, `scheduleService` has ZERO direct Mongoose) and the UoW abstraction `domains/_shared/unit-of-work.js` `runInTransaction` (Mongo `session.withTransaction` ⇄ PG `BEGIN/COMMIT`) is built + parity-proven on Neon. Three paths stay Mongo-only-by-design and need porting:

### Slice A — `syncSchedulesForTeamUpdate` (highest value, do first)
- **Location:** `server/models/Team.js` lines 120–281 — a Mongoose **static** (roster rebuild + capacity guard 422 + waitlist FIFO promotion + sweep-empty). Session-aware. Called from `domains/groups/mutations.js:219`.
- **Logic:** fetch future LIVE schedules for the team (`startTime>=today`, `bookedTeamId`, `status:'scheduled'`) → per-schedule compute toRemove/toAdd → capacity guard (`effectiveSessionCapacity`, throw `ServiceError` 422) → `Schedule.bulkWrite` `$pull`/`$push enrolledUsers` → `promoteIfSeatFree(scheduleId, session)` in-tx → sweep still-empty (`releaseScheduleResources` + `deleteMany`).
- **Port:** extract to a dual-backend repo (e.g. `domains/groups/schedule-sync-repository.{mongo,pg,index}.js`); Mongo impl = verbatim; PG impl = SQL twins (SELECT future schedules; UPDATE `enrolled_users` text[] array ops; capacity policy read; call the waitlist-promotion PG twin — Slice B; DELETE still-empty). Run inside the UoW. `mutations.js` calls via the selector. Add a `tests/pg-parity/` test. **Unblocks `scheduleReassign`** (500→200 roster rebuild) + waitlist's roster paths.
- ⚠ Circular deps: the file uses lazy `require` (session-booking-policy, schedule/repository, waitlist/promotion, release-resources) — keep that pattern.

### Slice B — `waitlist/promotion` FIFO
`server/domains/schedule/waitlist/promotion.js` — `promoteIfSeatFree` (SELECT oldest waiter FOR UPDATE + seat into enrolledUsers + NotificationLog, in-tx; `notifyPromotions` post-commit). Port the PG twin. **Unblocks `waitlist`** (capacity-raise / Dropped / team-removal promotion 500s).

### Slice C — User auto-release hook
`server/models/User.js` post-`findOneAndUpdate` (status→Dropped ⇒ pull from future schedules + promotion). This is the F-PR-2 `user-mutations` blocker. Port by routing through the schedule domain's dual-backend seams — do NOT replicate a Mongoose hook. **Unblocks `autoReleaseScope`.**

### Slice D — enrollment transfer/drop close-path
Fold onto the spine `domains/learning/enrollment/writes.createActiveEnrollment` (already flagged as the follow-up in `domain-model-and-migration.md`). **Unblocks `enrollmentTransfer`.**

### Slice E — atomic weekly 2-session cap on PG (booking race path). **Unblocks `bookingRace`** (weekly-cap concurrency) + its count reverse-assert.

**Order: A → B → C → D → E.** A unblocks the most; B reuses A's roster helpers; C reuses A+B.

## The 5 target suites + failure shape (from a diagnostic run, 21 fails/72)
- `scheduleReassign` (4): reassign→roster rebuild + capacity edit → **500** (needs A).
- `waitlist` (~8): FIFO promotion 500 (needs B) + a few WaitlistEntry-read reverse-asserts (fix alongside).
- `bookingRace` (3): weekly-cap concurrency wrong (needs E) + a `Schedule.countDocuments`→`countActiveRowsWhere` reverse-assert.
- `autoReleaseScope` (1): drop-user → schedule pull (needs C).
- `enrollmentTransfer` (1): transfer atomicity (needs D).
After porting each path, the residual fails are usually reverse-asserts (Schedule/Enrollment/WaitlistEntry reads via Mongoose → route to active-backend helpers).

## Risk
Transaction-critical (roster/seat atomicity) — a wrong port corrupts enrollment state. Mitigations: Mongo path verbatim (zero current-prod risk, Mongo stays default) + a parity test per slice (Mongo↔PG identical) + both-lane integration. The UoW + `booking-write-repository` (23505→11000) are the proven foundation.

## DoD per slice
Code per conventions → both lanes green (real) → parity test → update `docs/development-roadmap.md` changelog (roll to `docs/changelog-archive/` if >~400 lines) → update `docs/specs/` if behavior changed → conventional commit (no AI refs) → PR base=main → merge when 7 gates + PG-parity green (owner OK). After all 5: PG lane → ~1 (p2), then decide gate #8 promotion (either promote with p2 as known-red informational, or hold for Wave F PR-2).

## Unresolved questions
1. Circular-dep untangling when extracting `syncSchedulesForTeamUpdate` from the Team model (keep lazy requires).
2. Waitlist promotion needs `SELECT … FOR UPDATE` on PG — verify the UoW keeps the row lock for the seat.
3. Slice C is a Mongoose middleware hook — porting means moving the trigger to the domain layer; audit every caller that sets User status→Dropped (admin update, import, reconcile).
4. Gate-#8 promotion policy: promote with p2 known-red, or hold until Wave F PR-2 lands?
