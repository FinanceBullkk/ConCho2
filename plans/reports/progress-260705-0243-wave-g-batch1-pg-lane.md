# Wave G batch 1 — shared-fixture foundation (PG lane 117 → 82)

**Date:** 2026-07-05 · **Branch:** `feat/pg-lane-wave-g-batch1` · **Scope:** test-infra only, zero production behavior change (one non-behavioral seam added).

## Result

| Metric | Baseline (CI #237) | After batch 1 (local Docker PG) |
|---|---:|---:|
| Suites failing | 117 | **82** |
| Suites passing | 91 | **132** |
| Tests failing | 783 | **414** |
| Newly-red suites | — | **0** (name-diffed vs baseline) |

## Root causes closed

1. **Shared fixtures never reached PG.** `tests/setup.js` seeds users/classes/team via raw Mongoose; on the lane, ported readers (auth middleware `findAuthUserById` first) read PG → every authed request 401. Fix: NEW `server/tests/pg-test-utils.js` — `resetPgDatabase()` (truncate all app tables per test file = PG twin of Mongo per-file DB; safe because `--runInBand`) + `mirror{User,Class,Team}ToPg` (same ObjectId-hex ids, same bcrypt hash). All exports no-op unless `DB_BACKEND=postgres`. `setup.js` reset + mirror + `closePool` on teardown.
2. **24 `*-repository-dual-backend` suites pinned "selector = mongo by default".** Now backend-aware: `impls[isPostgres ? 'pg' : 'mongo']` (selector impls keys are `pg`/`mongo`, NOT the env literal `postgres` — first attempt `impls[DB_BACKEND]` was wrong, caught by local run).
3. **3 attendance pg-parity suites — nested-selector coupling.** The "mongo" wrappers (`services/attendance-{rollup,by-class,by-employee}/mongo.js`) reuse production `domains/attendance/analytics`, which reads the domain repository SELECTOR → resolves to pg on the lane, so the "Mongo side" of the parity comparison actually read PG. Fix: `analytics.js` takes optional `{ repo = repository }` (production callers unchanged); wrappers pin `repository.impls.mongo`.

## Verification

- 3 pg-parity attendance suites: 6/6 green on BOTH `DB_BACKEND=postgres` and default-mongo+PG_URL (real parity-gate mode).
- 24 dual-backend suites: 49/49 green on both backends.
- Full PG lane local (Docker postgres:16, migrations 1–31): 82 failed / 132 passed / 214 total.
- Full default-Mongo suite: running at report time (spot checks green: access/settings/customField/auth 35/35; result appended to PR).
- Every local FAIL cross-checked ∈ baseline-fail set at 31/62/80-suite checkpoints + final → no regression at any point.

## Remaining 82 (batch 2+)

All = suites seeding EXTRA fixtures via raw Mongoose in-file (and/or asserting via models). Convert suite-by-suite to `pg-test-utils` mirrors; grow `mirrorScheduleToPg`, `mirrorEnrollmentToPg`, `mirrorAttendanceToPg`, `mirrorProgramToPg`… per batch. Wave-F-ledger ops files (reconcile, sync, import, reminder…) surface inside these suites too.

## Local machine bring-up (done, documented in `server/.env.pg-prototype`)

Docker `tms-pg` (postgres:16, ci/ci@localhost:5432/tmsci, `--restart unless-stopped`) · 31 knex migrations applied · server `npm ci` refreshed · `.env.pg-prototype` (gitignored) → knex + parity suites auto-target local PG. NOTE: parity suites now RUN locally (no longer skip) — keep container up. Jest runs: one at a time, wrap long runs in `caffeinate -i`.

## Unresolved questions

- Suite total local = 214 vs CI summary 208 — count-method quirk (CI log also lists 214 distinct suite names); reconcile when promoting the lane to a required gate.
- Ops/cron Mongo-direct files (Wave F ledger): port as their suites surface in batches, or hold for a dedicated slice? Current plan: as surfaced.
- `learningSessionRoutes` beforeAll timeout seen in June audit resurfaces on the PG lane — verify it's the fixture class, not a latent flake, when converting that suite.
