# Audit Round — Phase 04: Performance & Scale

**Date:** 2026-06-11 · **Plan:** `plans/260611-1230-full-system-audit/phase-04-performance-and-scale.md`
**Method:** static hot-path analysis (index↔query, N+1, populate, pagination, aggregations, runtime, bundle) on the real code. Dynamic load baselines (artillery, 10× explain) **deferred** — see Notes.
**Target:** snappy ops at ~1000 employees / 10× data, single Render instance, Atlas shared.
**Verdict: 0×P0/P1, 1×P2, 2×P3.** Hot paths are mostly well-built (batched aggregations, denormalized caches, real indexes).

## Verified CLEAN / well-built (evidence)

| Area | Evidence |
|---|---|
| Index coverage on hot filters | Schedule: partial-unique `{classId,startTime}`, range `{classId,startTime,endTime}`, `{bookedTeamId,startTime}` (weekly count), `{enrolledUsers,startTime}` (auto-release/sync), `{officeId,startTime}`, `{sessionInstructorIds,startTime}`, `{endTime}`, `{remindersSentAt,startTime}`. User `{role,status}`,`{department}`,`{managerId}`,`{departmentId}`,`{officeId}`. Enrollment `{userId,status}`,`{teamId,status}`,`{classId}`. Attendance unique `{scheduleId,userId}` + history/export indexes. Evaluation/Feedback unique compound. AuditLog entity/actor+createdAt. The PERF-010-era missing indexes (Team.members, Schedule.endTime/remindersSentAt, Attendance.exportBatchId) all now EXIST. |
| Dashboard stats | `dashboard/dashboard-stats.js` — 14 aggregations run in ONE `Promise.allSettled`, composed in-process (zero extra round-trips, no N+1). Fine at 1000; the only growth concern is a filtered `userId:{$in:[...]}` array (~participant count) — acceptable to 10×. |
| N+1 sweep | reconcile (`services/reconcile/*`), dashboard, user-list all BATCH ($in / distinct / aggregate) then iterate in-memory. No per-row `await <query>` in any hot read path. Nightly reconcile = O(few queries), not O(N). |
| User list | `user/user-queries.js` — denormalized `lastActiveAt` (PERF-008) killed the per-page Attendance×Schedule aggregation; paginated. |
| Pagination (validated routes) | `paginationQuery` = `limit.min(1).max(2000).default(50)`; `listUsersQuery`/`listEnrollmentsQuery`/`listSchedulesQuery` extend it. AuditLog `/` caps at 200 in-handler. |
| Connection pool | `config/db.js` maxPoolSize 20 / minPoolSize 2 (env-tunable) + 10s serverSelection — sane for Atlas shared on a single instance (PERF-009 resolved). |
| Cron | `jobs/*` register on a `node-cron` timer (out of the request loop); reconcile batched. |
| Client bundle | `vite build` chunks all lazy-loaded by route; largest react-vendor 220kB/71gz, radix 110/34, LearningPage 113/22 — no non-vendor chunk > ~150kB gz outside vendors. |

## Findings

### PERF-014 (P2) — session-order cache is INVALIDATED on every read (defeats the cache)
- **Evidence:** `domains/learning/session/repository.js:39` `findSessions` runs `sessions.forEach((s) => invalidateSessionOrderCache(getClassId(s)))` and `:48` `findSessionById` runs `invalidateSessionOrderCache(...)` — both **before** `attachSessionNumbers`. The module contract (`domains/schedule/session-order.js:8-14`) is explicit: *reads call `attachSessionNumbers`; only create/delete paths call `invalidateSessionOrderCache`*. All write paths already invalidate (scheduleService `adminCreate`/`bookSlot`/`bookCohortSlot`/auto-release/cancel at lines 255/356/356/470/611; `domains/schedule/use-cases` reassign/delete at 298/300/348).
- **Impact:** every learning-session list/detail read deletes the cache entry for each cohort it touches → guaranteed cache MISS → an extra `Schedule.find({classId:{$in}, status:'scheduled'}).sort()` runs on every read; AND it wipes entries the legacy schedule-list path warmed (cross-path thrash). The cache (5-min TTL) effectively never serves a hit on these paths. Silent wasted DB work that scales with session-list traffic (cohort detail pages).
- **Fix:** delete the two read-path `invalidateSessionOrderCache(...)` calls (`repository.js:39,48`). Writes keep numbers fresh; reads read-through + recompute on miss. Safe (verified all writers invalidate). Regression test: two consecutive `findSessions` for a cohort → 2nd is a cache hit (no re-query); a session create between them → next read misses (fresh numbers).

### PERF-015 (P3) — learning/class list endpoints return ALL rows (unpaginated)
- **Evidence:** `domains/learning/repository.js` `findPrograms` (`:7`), `findCohorts` (`:23`), and legacy `controllers/class/class-queries.js getClasses` (`:29`) all `Model.find(filter).sort()...` with **no skip/limit**. Cohorts (`Class`) each `populate('programId')`.
- **Impact:** programs are few (bounded); cohorts grow ~1 per delivery — for 1000 employees over time this reaches hundreds–thousands of rows + populated programs in one response. Not urgent; degrades quietly. (Same class as the resolved PERF-011 "getTeams unpaginated".)
- **Fix:** add `paginationQuery` + skip/limit to these lists (and their client hooks), or a sane hard cap. Backlog.

### PERF-016 (P3) — `populateSessionQuery` hydrates full enrolledUsers on the LIST path
- **Evidence:** `domains/learning/session/repository.js:12-25` populates `enrolledUsers` (empCode/name/department/status) + 5 more refs; `findSessions` (`:29`) uses it for the LIST. A 200-session cohort × ~9–30 enrolled = thousands of populated sub-docs + payload, when list rows only need the enrolled COUNT (the DTO exposes `enrolledLearnerCount`).
- **Impact:** list latency + payload grow with roster×sessions. Detail view legitimately needs the roster; the list does not.
- **Fix:** trim the list query's enrolledUsers populate to a count (or `select('_id')`), keep the full populate only on `findSessionById`. Backlog.

## Notes (no finding / acceptable at target scale)
- User search (`user-queries.js:29-36`) uses case-insensitive `$regex` `$or` over 4 fields → COLLSCAN, but ~1000–10k users = tens of ms. Acceptable; upgrade to a text index / prefix-anchored search only if it grows. 
- `paginationQuery` max **2000** is high (a 2000-row response is heavy) but bounded — not a dump vector. AuditLog page offset is unbounded (`?page=999999` → big skip) but admin-only + capped page size 200.
- Dashboard `User.aggregate` calls don't `$match isDeleted` (aggregate bypasses soft-delete hooks) → trashed participants may be counted in stats. **Data-accuracy, not perf** — flag for a DATA follow-up, not fixed here.

## Triage outcome (owner, 2026-06-11)
- **PERF-014 → FIXED** (owner pick: fix only PERF-014 this round). Removed the
  two read-path `invalidateSessionOrderCache` calls in
  `domains/learning/session/repository.js` (+ the now-unused import/helper).
  Verified all WRITE paths still invalidate. +2 regression tests
  (`tests/integration/auditPerfRound4.test.js`: the cohort cache entry is
  POPULATED after a read, was deleted before). Removing read-invalidation
  surfaced a latent test-infra coupling — `learningSessionRoutes.test.js`
  `afterEach` deletes Schedules directly (bypassing the service writers) without
  invalidating; added `sessionOrderCache.flushAll()` there (mirrors prod's
  invalidate-on-write). Full server suite **851/851**.
- **PERF-015, PERF-016 → BACKLOG** (plan.md Backlog table).
- **DATA-017? → needs-triage** in a future DATA round (data-accuracy, not perf).
- **Dynamic load baselines → DEFERRED** (owner pick): shared-Atlas load-test is
  unsafe/unrepresentative; recommend artillery in CI vs a dedicated local Mongo.

## Unresolved questions
- DATA-017? (dashboard `User.aggregate` not filtering `isDeleted`) — confirm in a
  DATA round whether soft-deleted participants inflate dashboard stats, and
  whether other `Model.aggregate` callers share the gap.
- Artillery/explain baselines still owed if a future change touches a hot path —
  wire `test:smoke` in CI against a dedicated Mongo when convenient.
