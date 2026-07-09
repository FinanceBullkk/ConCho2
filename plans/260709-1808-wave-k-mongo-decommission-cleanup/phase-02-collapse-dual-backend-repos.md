# Phase 2 — Collapse the 58 dual-backend seams to PG-only

**Priority:** second. **Status:** blocked on P0-a/P0-b. Do after Phase 1.

## Overview
Every dual-ported data seam resolves Mongo-vs-PG at `require` time via
`config/db-backend.js` (`isPostgres ? pg : mongo`). Collapse each to its PG impl,
delete the `.mongo.js` half, and remove the selector indirection. This is
**mechanical but wide (58 seams)** — do it in cohesive batches, each green.

## The two seam shapes
1. **Repo pairs (53):** `domains/**/…repository.js` (+ `controllers/**`, `services/**`)
   with `.mongo.js` + `.pg.js`. Pattern in `repository.js`:
   ```js
   const { isPostgres } = require('../../config/db-backend');
   const mongo = require('./repository.mongo');
   const pg = require('./repository.pg');
   module.exports = { ...(isPostgres ? pg : mongo), impls: { mongo, pg } };
   ```
   → Replace with `module.exports = require('./repository.pg')` **or** inline the
   pg body into `repository.js`; delete `.mongo.js`. **NOTE the `impls` export is
   consumed by `tests/pg-parity/*`** — coordinate with Phase 4 (keep `impls.pg`
   shim until parity tests are converted, or convert tests in the same batch).
2. **Index trios (5):** `services/{attendance-by-class,attendance-by-employee,
   attendance-rollup,metric-series,metrics-funnel}/{index,mongo,pg}.js`.
   → `index.js` becomes `module.exports = require('./pg')`; delete `mongo.js`.

## Direct isMongo/isPostgres branch points (NOT repo selectors) — collapse to PG
- `domains/_shared/unit-of-work.js` — Mongo session vs PG txn → PG-only txn.
- `helpers/counter.js` — sequence/counter impl per backend → PG-only.
- `jobs/retentionPurgeJob.js` — Mongo TTL vs PG DELETE branch → PG DELETE only.
- `routes/healthRoutes.js` — `/ready` PG-vs-Mongo probe → PG probe only.
- `config/pg.js`, `config/db-backend.js` — delete `db-backend.js`; keep `config/pg.js`.
- (`server.js` boot already handled in Phase 1.)

## Steps (batched)
1. **Pilot batch** (1 repo, e.g. `domains/room`): collapse selector, delete
   `.mongo.js`, keep `impls.pg` shim; run that domain's tests. Lock the pattern.
2. Sweep repos in batches by area (domains/learning/*, domains/schedule/*,
   controllers/*, services/*). After each batch: server Jest (PG) green.
3. Collapse the 5 index trios.
4. Collapse the direct branch points (unit-of-work, counter, retentionPurge,
   healthRoutes), then delete `config/db-backend.js`.
5. Grep `db-backend` + `isMongo` + `\.mongo'` requires → zero remaining.

## Watch-outs
- `class-repository.pg.js` and `audit-repository.pg.js` **require Mongoose models**
  (for enums/constants) — leave those requires until Phase 3 handles model
  extraction; do NOT delete models here.
- `unit-of-work` is the transaction chokepoint for booking/groups/planning — its
  PG path is already parity-proven (Neon 2026-06-25); collapsing = delete the
  Mongo branch, not rewrite. Re-run booking + groups + planning integration tests.

## Success criteria
- No `.mongo.js` files, no `config/db-backend.js`, no `isMongo`/`isPostgres`
  branches remain. Full PG Jest suite + client + lint green.

## Open questions
- Inline pg body into `repository.js` vs `module.exports = require('./repository.pg')`?
  Recommend the one-line re-export first (smaller diff, reversible); flatten later
  if desired. Keeps churn low across 58 files.
