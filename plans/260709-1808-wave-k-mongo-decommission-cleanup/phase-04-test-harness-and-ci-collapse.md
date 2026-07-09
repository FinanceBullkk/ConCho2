# Phase 4 — Test-harness + CI collapse (Mongo lane out)

**Priority:** fourth (highest risk — touches CI gates). **Status:** blocked on P0-a/P0-b.
Do after Phases 1–3 so the runtime is already PG-only.

## Overview
~70 test files use `mongodb-memory-server`. The bulk is `tests/pg-parity/*` — those
suites exist to **prove Mongo==PG** by running the same assertions on both `impls`.
Once Mongo is gone there is no compare-target, so the harness and the two-backend
CI structure both change. This is the riskiest phase because **CI gate #8
(`server-tests-pg`) is REQUIRED** and gate #1 (`server-tests`, the Mongo lane) exists.

> **Boot-path PG-only collapse lands HERE (deferred from Phase 1).** Only once the
> **e2e gate boots the server on PostgreSQL** (needs the Phase-5 PG seed) and the
> Mongo test lane is retired can `server.js` drop the backend-aware boot
> (`if(isPostgres)…else connectDB()`), the Mongoose shutdown-close, the `connectDB`/
> `isPostgres` requires, and `config/db.js`. Doing it earlier breaks the e2e boot
> (`PG connection string missing`) — see the Phase-1 CI correction. Sequence:
> migrate e2e → PG seed (Phase 5) → retire Mongo lane (this phase) → THEN collapse boot.

## What changes
| Item | Now | Action |
|---|---|---|
| `tests/pg-parity/*` (~65) | run mongo `impls.mongo` vs `impls.pg` | **convert to PG-only** regression tests (keep pg assertions; drop the mongo side + `impls.mongo` shim) |
| `tests/global-setup.js`, `tests/setup.js` | spin up `mongodb-memory-server` | remove Mongo memory server; PG test container only (`pg-test-utils`) |
| `tests/integration/booking-transaction-abstraction.test.js` | uses memory-server | repoint to PG or fold into pg-parity/booking |
| `scripts/dev-tools/pg-*-parity.js` | Mongo↔PG proof tools | delete (their job is done) |
| CI gate #1 `server-tests` (Mongo) | Jest on `DB_BACKEND=mongo` | **remove** (or rename gate #8 → the single `server-tests`) |
| CI gate #8 `server-tests-pg` | full Jest on PG | becomes the sole server test lane |

## Steps
1. Convert pg-parity suites: drop the `impls.mongo` branch, assert only against the
   (now default) PG repo. Remove the `impls` shim left from Phase 2.
2. Strip `mongodb-memory-server` from `tests/global-setup.js` + `tests/setup.js`;
   ensure the PG test harness is the only DB setup. Verify the jest run-lock +
   `tms-pg` docker + 8GB heap notes still apply (see memory: jest run rules).
3. Delete the dev-tools parity scripts + `tests/unit/mongoOnlyGone.test.js` /
   `adminDb.test.js` if not already gone in Phase 1.
4. Rework `.github/workflows/ci.yml`: remove the Mongo `server-tests` job (or merge
   into `server-tests-pg` and rename). Re-number/rename gates consistently.
5. **Owner sign-off on the new gate set** (golden rule says "8 gates green"): update
   `.claude/rules/testing-and-ci.md`, `CLAUDE.md` golden rules, and README badges.
6. Full suite green on the single PG lane; e2e (gate #7) still green (needs Phase 5 PG seed).

## Watch-outs
- **Jest concurrency rules** (memory `concho2-jest-export-suite-deadlock`): still one
  shared docker PG `tms-pg`, never overlap runs, `/tmp/concho2-jest.lock`, caffeinate,
  8GB heap on the PG lane. These persist — only the Mongo replica-set half goes.
- Some non-parity integration tests may implicitly rely on the Mongo memory server
  via `tests/setup.js` — sweep for breakage after step 2.
- Reducing gate count changes branch-protection expectations (QA-012 is procedural,
  not enforced) — document the new required set.

## Success criteria
- Zero `mongodb-memory-server` references; one server test lane (PG), green; CI
  workflow + docs reflect the new gate set; e2e green.

## Open questions
- Delete vs convert pg-parity tests → **convert** (retain regression value). Confirm.
- New gate numbering: keep "8 gates" branding by splitting something, or move to
  "7 gates" and update all "8 CI gates" references? Owner call (decision #2 in plan.md).
