# Phase 04 — Performance & Scale

**Area prefix:** PERF- (continue past PERF-010).
**Context:** ~1000 employees, single Render instance, MongoDB Atlas shared
cluster. Target: snappy ops pages at 10× current data, not web-scale.

## A. Database
- [ ] **Index ↔ query map:** for the hot read paths (schedules list, learning
      sessions list+count, availability grid, dashboards, completion/compliance
      reports, attendance analytics, search) run `explain()` on realistic data —
      IXSCAN everywhere? List COLLSCANs.
- [ ] Index inventory per model vs actual filters (unused indexes = write cost).
- [ ] `populate` storms: `populateSessionQuery` (6 populates) and friends —
      measure payload + latency on a 200-session cohort; trim selects.
- [ ] Aggregations (dashboards, analytics): stage order, $match-first, memory.
- [ ] N+1 loops: per-row awaits in controllers/services (grep `await` in `for`
      over query results — each is fine only if bounded small; document bounds).

## B. API behavior under load
- [ ] Pagination: every list endpoint has default + max limit clamps (the
      sessions list default-50 truncation bug class — verify caps documented).
- [ ] Artillery suites: run `test:smoke`, `:load`, `:spike` — record baselines
      (p95 latency, error rate) into the report; set pass thresholds.
- [ ] Rate limiters as DoS backstop: globalLimiter 200/min sane for 1000 users?
- [ ] Big exports (Excel, Sheets sync) — streaming vs memory buffering; size cap.

## C. Server runtime
- [ ] Memory growth profile: one long soak run locally (the CI heap OOM at 82
      suites hints at module-level retention — confirm prod process is flat).
- [ ] Mongoose connection pool sizing vs Atlas tier limits (PERF-009 history).
- [ ] Session-order cache (`invalidateSessionOrderCache`) hit rate + invalidation
      correctness (over-invalidation = silent perf loss).
- [ ] node-cron jobs: reconcile duration on full data; runs inside request loop?

## D. Client
- [ ] Bundle audit: `vite build` chunk report — flag chunks > ~150kB gz beyond
      vendor; verify lazy-loading still covers all routes.
- [ ] React Query: stale times/refetch storms on operational pages (network tab
      pass); shared `qk` invalidation breadth (over-invalidation re-fetch cost).
- [ ] Table rendering with 200+ rows (cohort sessions, users list) — virtualize
      only if measurably janky (YAGNI otherwise).

## Method
Measure BEFORE judging: seed a 10× dataset (script), capture explain plans +
artillery baselines into the report. Only optimize what the numbers indict.

## Output
`plans/reports/audit-perf-{yymmdd-hhmm}-findings.md` (incl. baseline tables) + fix PRs.
