# Wave K Phase 2 — drop Mongo entirely (collapse to PG-only)

> Branch `chore/wave-k-phase-2-collapse` (off main `f52cde0`, after the 9-domain
> scope trim). Supersedes the sequencing in `plans/260709-1808-wave-k-mongo-decommission-cleanup/`
> phases 2–5 (folds them into one correctly-ordered effort).

## The core fact
Prod **already** runs on `.pg.js` (`DB_BACKEND=postgres`). The `.mongo.js` files (44
pairs + 5 index trios) + `mongoose` + `mongodb-memory-server` now exist **only** to
serve the Mongo test infrastructure:
- CI gate #1 `server-tests` (Jest on Mongo memory-server)
- the `tests/pg-parity/*` compare-both suites (`impls.mongo` vs `impls.pg`)
- the **e2e** gate (Mongo replica-set service + `scripts/seed.js` + `MONGO_URI`)

So "collapse to PG-only" ≠ a mechanical repo sweep — it's **retiring the Mongo test
infra first**, then deleting the now-dead Mongo code. You cannot delete `.mongo.js`
while gate #1 / e2e still run on Mongo.

## Two owner decisions (needed at the batches below)
1. **CI gates 8→7.** Removing the Mongo `server-tests` lane drops the gate count.
   The PG lane (`server-tests-pg`) becomes the sole server-test gate. This edits the
   **CLAUDE.md golden rule ("8 CI gates")** + `testing-and-ci.md`. → **approve at Batch C.**
2. **`express-mongo-sanitize`.** Strips `$`/`.` operator-injection keys (Mongo-shaped).
   PG + parameterized queries don't need it, but it's cheap body defense-in-depth.
   **Recommend KEEP** (no security regression). → confirm at Batch D.

## Batches (each an independently green PR)
**A — PG-native seed** (foundational; `scripts/seed.js` is Mongo-only, e2e needs it).
- Write a PG seed: truncate PG tables (FK order) + insert the sample set (same logins
  `000001`/`000004`/…) via the PG repos or knex/SQL. Wire `npm run seed` → PG.
- Verify locally (seed → boot on PG → login). No CI change yet (Mongo seed still default). Green.

**B — Migrate e2e → PG.**
- `ci.yml` e2e job: swap the Mongo replica-set service for a **Postgres service**;
  set `DB_BACKEND=postgres` + `PG_URL`; run PG migrations + the Batch-A seed; drop
  `MONGO_URI` + the `scripts/seed.js` (Mongo) step. Playwright specs unchanged.
- Verify e2e green on PG.

**C — Retire the Mongo test infra** (the gate change — decision #1).
- Remove gate #1 `server-tests` (Mongo lane) from `ci.yml`; `server-tests-pg` becomes
  the server-test gate.
- Convert `tests/pg-parity/*` to **PG-only** (drop the `impls.mongo` comparison; keep
  the PG assertions as regression tests).
- Remove `mongodb-memory-server` from `tests/global-setup.js` / `tests/setup.js` →
  PG-only harness (keep the docker-PG + jest run-lock + caffeinate + 8GB-heap rules).
- Docs: `testing-and-ci.md` + `CLAUDE.md` "8 gates"→7; README badges.
- After this: nothing runs on Mongo; `.mongo.js` files are dead but present. Green.

**D — Delete the dead Mongo code + drop deps** (decision #2).
- Collapse every selector `repository.js` → `module.exports = require('./repository.pg')`
  (or inline); delete all 44 `.mongo.js` + 5 index `mongo.js`; delete `config/db-backend.js`.
- Collapse direct `isMongo/isPostgres` branches: `domains/_shared/unit-of-work`,
  `helpers/counter`, `jobs/retentionPurgeJob`, `routes/healthRoutes`, the 5 metric/
  attendance `index.js`.
- `server.js` boot → PG-only (drop `connectDB` + the `if(isPostgres)…else` branch +
  the Mongoose shutdown-close). Delete `config/db.js` + the Mongo `scripts/seed.js`
  (replaced by Batch A). Delete `verify-backup.js` (Atlas retired).
- Remove `mongoose` + `mongodb-memory-server` (+ `express-mongo-sanitize` per decision #2)
  from `server/package.json`; regenerate lockfile.
- Grep `mongoose` / `\.mongo'` / `DB_BACKEND` in server runtime → 0. Green (PG lane + e2e).

## Sequence rationale
A (seed) → B (e2e on PG) → C (retire Mongo test infra) → D (delete Mongo code). Each
batch is green because Mongo isn't removed until nothing depends on it. Reverse orders
break (can't delete `.mongo.js` while gate #1/e2e run on Mongo).

## DoD
- ☑ Zero `mongoose` / `mongodb-memory-server` in server runtime + tests
- ☑ One server-test gate (PG) + e2e on PG; full suite green
- ☑ CI gate set re-blessed (8→7) + docs updated; PG seed works for dev + e2e
- ☑ Atlas can be cancelled with no code impact (already Mongo-less at runtime)

## Open questions
- Decisions #1 (gate 8→7) + #2 (express-mongo-sanitize) — owner sign-off.
- Confirm the e2e Postgres service shape in CI (a `postgres:` service container + run
  migrations, mirroring the `server-tests-pg` job's PG setup).
