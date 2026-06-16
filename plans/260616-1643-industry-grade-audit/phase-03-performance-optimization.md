# Phase 03 — Performance & Optimization

**Priority:** P1 (owner-prioritized) · **Status:** 🔴 todo
**Anchor:** DB index/query · N+1 · pagination · caching · client bundle · ~1000-user scale

## Objective
Prove the system stays fast at the real scale (~1000 internal users, growing
audit/attendance/schedule history) — DB queries indexed, no N+1, lists bounded,
payloads lean, client bundle tight. Optimize the measured hot paths only (no
speculative micro-opt).

## Industry checks (each → evidence)
- **Index coverage vs query patterns.** For every frequent query (repository
  `find/findOne/aggregate` + their `sort`/filter fields), a supporting index
  exists with correct compound order; flag full-collection scans on hot paths
  (audit log, attendance, schedule, enrollment, notifications). Cross-ref the
  phase-00 index inventory. Flag **unused/duplicate** indexes too.
- **N+1 queries.** Loops issuing per-iteration queries / awaits; missing
  `populate` batching; per-row DB calls in list/report/rollup builders. Grep
  `for`/`map`/`Promise.all(...map(async` around repo calls.
- **List bounds / pagination.** Every list endpoint paginates or row-caps
  (export caps exist — verify users/audit/schedule/notification lists too). No
  unbounded `find()` feeding the client.
- **Lean reads / over-fetch.** Read paths use `.lean()` where no doc methods
  needed; projections trim fields; DTOs don't ship unused data.
- **Caching correctness.** analyticsCache / search cache TTLs sane; invalidation
  fires on the right mutations; no stale-after-write on dashboards.
- **Aggregation cost.** Dashboard/analytics/compliance-matrix/rollup pipelines
  scale (indexed `$match` first, no in-memory JS rollup over unbounded sets).
- **Cron/job scale.** reconcile (12 checks) + snapshot job complete within budget
  at 1000 users / large history; batched, not per-doc.
- **Client bundle.** Chunks > 250 kB gz justified; route-level lazy-loading
  complete; no duplicate/oversized vendor dep; tree-shaking effective.
- **React render cost.** Measured hot lists (roster, users, schedule grid) avoid
  needless re-renders; react-query `staleTime`/keys avoid refetch storms.

## Method (multi-agent workflow)
A DB-perf agent (index-vs-query + N+1) over `server/domains/*/repository.js` +
`services/`, a list-bounds agent over all route handlers, a client-bundle/render
agent over `client/src`. Each finding cites the file/line + the measured cost
(index missing, scan, chunk bytes). Adversarial pass confirms the hot path is
actually hot (not a cold admin-only call).

## Success criteria
- Index-coverage table (query → index → verdict); N+1 list; unbounded-list list;
  bundle hot-spots — each with a concrete optimization + expected impact.
- No P1 perf cliff on a hot path left unaddressed in phase-06.

## Todo
- [ ] index-vs-query coverage table (+ unused/dup indexes)
- [ ] N+1 scan
- [ ] list pagination/cap sweep
- [ ] lean/projection/over-fetch scan
- [ ] cache TTL + invalidation correctness
- [ ] aggregation pipeline cost review
- [ ] cron/job scale review
- [ ] client bundle hot-spots + lazy-load coverage
- [ ] React render hot-path review
