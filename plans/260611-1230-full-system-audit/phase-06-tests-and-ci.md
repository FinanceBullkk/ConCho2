# Phase 06 — Tests & CI Health

**Area prefix:** QA- (continue past QA-001).
**Context:** 7 required gates; server 825 tests/82 suites (~8m CI after the
2026-06-11 heap fix), client 246/53, Playwright E2E, eslint ratchet cap 72.

## A. Coverage truth (not just numbers)
- [ ] `jest --coverage` + `vitest --coverage`: per-domain map. Flag domains
      with logic-heavy code under ~60% lines: legacy controllers (19 route
      files), services (export, sync, reminder), policy fns, client hooks.
- [ ] **Critical-invariant test inventory:** for each load-bearing rule (CSRF on,
      limiter on, soft-delete filter, capacity cap, double-book index, audit on
      mutation) — is there a test that FAILS if someone removes it? List holes.
- [ ] Error-path coverage: 4xx branches tested, not only happy paths.

## B. E2E reality check
- [ ] Playwright spec list vs the persona-critical paths from phase-03 —
      which P1 flows have NO e2e? (booking grid, MFA login, waitlist join,
      attendance mark, export download).
- [ ] E2E seed/fixture drift: do specs still match seeded data assumptions?

## C. Suite health & hygiene
- [ ] Known noise: post-teardown `ReferenceError ... cronAuth.test.js /
      csrfProtection.test.js` (mongoose save after env teardown) — root-cause
      and silence properly (no masking).
- [ ] `--forceExit` + SIGKILL on jest exit: find the open handle instead of
      forcing (detectOpenHandles output review).
- [ ] Flaky watch: rerun full suite 3× — any intermittents? Record.
- [ ] Test runtime budget: suite growth trend vs CI 15-min budget (8m today);
      consider per-file parallel shards ONLY when >12m (YAGNI now).
- [ ] mongodb-memory-server version pin + download cache in CI (cold-start cost).

## D. Gates & policy
- [ ] eslint ratchet: 72 warnings — categorize; burn-down plan with owner
      (cap only goes DOWN); confirm hard-error rules still error.
- [ ] gitleaks + npm audit gates: false-negative spot-check (plant a dummy
      secret in a scratch branch — caught?).
- [ ] Branch protection: all 7 checks required on main; no bypass actors.
- [ ] CI workflow drift: `npm install` (server) vs `npm ci` (client) rationale
      still valid (googleapis pin decision → phase-07 ties in).

## Method
Coverage runs + grep inventories + 3× suite reruns; every gap fixed lands as a
test-first PR (the test demonstrates the hole before the fix).

## Output
`plans/reports/audit-qa-{yymmdd-hhmm}-findings.md` + test PRs.
