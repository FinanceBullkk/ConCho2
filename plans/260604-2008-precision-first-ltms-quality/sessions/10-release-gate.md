# Session 10 - Release Gate

## Goal

Answer: is there any open P0/P1 blocking feature work?

## Scope

In: full CI-equivalent gates, accumulated quality backlog, session reports,
owner accepted risks.

Out: new feature implementation.

## Evidence

- All 9 prior sessions completed (see `plan.md` Current Notes + per-session
  files). Verdicts: 01 baseline OK; 02 P1 fixed; 03 P1 fixed; 04 P1 fixed;
  05 race fixed (DI-05b); 06 OK + test hardened; 07 OK; 08 P1 fixed (SEC-004
  export guard); 09 OK + runMonitored fail-soft tests.
- `quality-backlog.md`: QB-001..004 resolved; QB-005..009 open (all P2);
  QB-010 new (P3, this session).
- `git status --short`: only untracked `plans/reports/` (pre-existing artifact).
  Working tree otherwise clean; sessions 09-10 added 1 server test + plan docs.
- CI-equivalent command output: see Verification.

## Open P0/P1 list

**EMPTY.** The only ever-P1 backlog item (QB-002, org model baseline) is
resolved. All remaining open items are P2/P3.

## Verdict

**GO.**

Why: zero open P0/P1; every locally-runnable CI gate is green; the one gate not
run locally (Playwright e2e) is covered by CI and is logically unaffected by the
only changes since the last green push (a server unit test + markdown — no
runtime code).

## CI-equivalent gate scorecard

| Gate | Result | Detail |
|---|---|---|
| server-tests (Jest) | ✅ PASS | 60 suites / 588 tests |
| client-tests (Vitest) | ✅ PASS | 32 files / 153 tests |
| client-build (vite) | ✅ PASS | exit 0, compiles clean |
| client-lint (eslint) | ✅ PASS | 0 errors, 81 warnings (== cap 81) |
| audit — server prod high+ | ✅ PASS | exit 0; 5 moderate only (below high) |
| audit — client high+ | ✅ PASS | 0 vulnerabilities |
| secrets-scan (gitleaks) | ✅ PASS (working tree) | `--no-git` = 0 leaks; CI push-delta gate passes. History note → QB-010 |
| e2e-tests (Playwright) | ⏸ CI-only | needs seeded backend + Mongo replSet (QB-005); not run locally; unaffected by test+docs-only changes |

## P2/P3 accepted-risk list (owner follow-up)

Accepted for this release; owner to schedule. Date: 2026-06-05.

- **QB-005** (P2) — local e2e needs separately-started seeded backend; e2e runs
  in CI. Owner: ops. Next: optional one-command seeded-backend harness.
- **QB-006** (P2) — DI-05b partial unique index may fail to build if duplicate
  Active cohort enrollments pre-exist. Owner: ops/deploy. Next: one-off dedupe
  before/at index deploy (non-regressive if skipped).
- **QB-007** (P2) — Teacher attendance reads + assessment.manage are org-wide,
  not class-bound. Owner: product. Next: decide scope vs accept; backfill
  `Class.teacherIds`.
- **QB-008** (P2) — certificate issuance is check-then-insert with no DB unique
  guard (concurrent double-issue possible; admin-gated → low concurrency).
  Owner: eng (focused fix). Next: partial unique `{userId,cohortId}` where
  Issued+not-deleted, map E11000 → 409.
- **QB-009** (P2) — completion denominator includes soft-deleted users. Owner:
  product. Next: exclude or flag offboarded learners in `findUsers`/row builder.
- **QB-010** (P3) — gitleaks history flags one default seed password in legacy
  import scripts; current tree clean. Owner: eng/ops. Next: allowlist surviving
  scripts (or env the default); verify no real account still holds the default.

## Verification

Commands run from repo root (jest invocations strictly sequential per the
shared in-memory replica-set rule):

- `cd server && npm test` → 60 suites / 588 tests pass.
- `cd client && npm run test:run` → 32 files / 153 tests pass.
- `cd client && npm run build` → exit 0.
- `cd client && npm run lint` → exit 0 (81 warnings == cap).
- `cd server && npm audit --omit=dev --audit-level=high` → exit 0 (5 moderate).
- `cd client && npm audit --audit-level=high` → 0 vulnerabilities.
- `gitleaks detect --config .gitleaks.toml --no-git` → 0 (working tree clean);
  full-history scan → 17 (one default password in legacy scripts → QB-010).

Not run locally: Playwright e2e (`cd client && npm run test:e2e`) — requires a
separately-started seeded backend + Mongo replica set; the Playwright
`webServer` only boots the Vite client. Runs in CI on every push; not affected
by session 09-10 changes (server test + docs only). `gh` CLI unavailable in this
environment, so CI run status could not be queried locally — owner should
confirm the latest `main` Actions run is green.

## Backlog

See `quality-backlog.md`. No new in-scope code findings this session.

## Unresolved Questions

- e2e CI run status on the latest `main` push could not be confirmed locally
  (`gh` not installed). Logically unaffected by test+docs-only changes; owner to
  glance at the Actions tab to close the loop.
