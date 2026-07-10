# Wave K · D2 — drop `mongoose` (fixture-layer decouple + model removal)

> **Status: PLAN (not executing).** Drafted 2026-07-11. Prereq: D2a (#288) merged.
> The runtime + repos are already PG-only (D1b #287 deleted the 44 `.mongo.js`
> + parity scaffolding + collapsed every selector to `require('./…pg')`). What
> remains to make Mongo *fully gone* is this: the test fixture layer + the 35
> Mongoose models + the `mongoose`/`mongodb-memory-server` deps.

## Current Mongo surface (measured post-D1b+D2a, 2026-07-11)
- **Runtime, non-model (5 usages, small):**
  - `domains/attendance/repository.pg.js` + `domains/learning/use-cases.js` +
    `services/export/evaluation-export.js` — `mongoose.Types.ObjectId` (validate /
    construct only).
  - `routes/healthRoutes.js` — `/ready` still probes `mongoose.connection`
    (Mongo branch; D1a made boot PG-only but left this).
  - `domains/learning/use-cases.js` — `mongoose.model('Setting')` read.
- **35 Mongoose models** (`server/models/*.js`) — each `require('mongoose')`.
  Consumed for enums/constants by **8 runtime files** (repos/schemas/helpers) →
  must extract those constants before deleting the models.
- **Test fixture layer (the keystone):** `tests/global-setup.js` (one
  `MongoMemoryReplSet`), `tests/setup.js` (mongoose core seed +
  `mirrorCoreSeedToPg` + registers auto-mirror + write-gate), `pg-auto-mirror.js`
  + `pg-row-mappers.js` (mirror every Mongoose write → PG), `pg-write-gate.js`
  (fails the lane on raw-Mongoose PROD writes). **79 test files import a model /
  69 seed via `.create`/`insertMany`.**
- **Deps:** `mongoose`, `mongodb-memory-server`. **KEEP `express-mongo-sanitize`**
  (owner decision — defense-in-depth on PG too; [[project_atlas_cancelled_wave_k_unblocked]]).
- **Reusable foundation:** `scripts/seed-pg.js` (253 lines) already authors
  fixtures PG-native — `bcrypt.hash(_,12)`, `genId()` (24-hex, ObjectId-regex-
  compatible), model-default-matching INSERTs. The fixture builders extend this.

## Approach — decided (A), not B
| | Approach A — PG-native fixture builders + rewrite call sites (**CHOSEN**) | Approach B — "mongoose-lite over PG" shim |
|---|---|---|
| Idea | `tests/fixtures/*` helpers (`createUser/createClass/…`) INSERT to PG (reuse seed-pg helpers + model defaults); migrate the 69 files `Model.create` → `fixtures.create*` | Replace `mongoose` with a fake `Model` API (create/save/find/populate/hooks/virtuals) backed by PG |
| Pros | incremental, each file green independently; KISS; explicit fixtures; reuses seed-pg | almost no test-file edits |
| Cons | wide grind (~69 files) | rebuilds a mini-ORM (hooks/virtuals/select:false/validation/populate) — high risk, anti-KISS, still must match every model |
| Verdict | **chosen** — YAGNI/KISS, incremental green | rejected — rebuilding mongoose is more code + risk than migrating call sites |

Auto-mirror + models + mongod all stay until the **last** file migrates — the
"drop mongoose" payoff lands only at the end, so this is a multi-PR campaign.

## Phases (each independently green on the PG lane — the only lane now)
| # | Phase | Scope | Risk |
|---|-------|-------|------|
| **D2b** | Runtime non-model mongoose removal | `helpers/object-id.js` (regex validate + passthrough) replaces the 3 `Types.ObjectId` sites; `/ready` → PG-only probe (drop Mongo branch); `mongoose.model('Setting')` → settings repo | Low — 5 sites, own PR, doesn't drop mongoose yet |
| **D2c** | Fixture foundation + pilot | Extract seed-pg helpers into `tests/fixtures/` builders (bcrypt/genId/defaults per model); migrate `setup.js` CORE seed (users/teams/classes/settings) mongoose→PG-native; pilot-migrate 2–3 test files; auto-mirror stays for the rest | Med — the pattern the whole grind depends on; prove it green first |
| **D2d** | Fixture migration (grind) | Migrate the remaining ~66 test files in domain batches (auth · schedule · learning · attendance · org · assessment · …): `Model.create` → `fixtures.create*`, drop `require('mongoose')`, each batch green | Med — wide but mechanical; validation-error tests handled case-by-case (assert repo/zod error, not Mongoose `ValidationError`) |
| **D2e** | Delete Mongo test layer + models + deps | Once ZERO test uses mongoose: delete `pg-auto-mirror` + `pg-write-gate` + global-setup mongod + setup.js mongoose seed + `global-teardown` write-gate verdict; extract the 8 runtime enum-consumers' constants → delete the 35 models; drop `mongoose` + `mongodb-memory-server` from `server/package.json`; delete `config/db.js` + the dead Mongo dev-tools scripts | Med-High — broad requires; the payoff (mongoose gone) |

## Definition of Done (whole D2)
- ☑ Zero `mongoose` / `mongodb-memory-server` in `server/` (runtime + tests)
- ☑ Full Jest suite green on the PG lane; client + lint unchanged
- ☑ 35 models deleted, their enums/constants extracted + consumers repointed
- ☑ `express-mongo-sanitize` KEPT; docs (tech-stack, testing-and-ci, system-map) de-Mongo'd
- ☑ Roadmap + spec registry updated; each phase its own green PR

## Open questions
1. **Validation-error tests** — a few suites assert Mongoose `ValidationError`
   shapes on bad fixtures. Re-home as zod-schema unit tests, or drop? (per-case in D2d)
2. **`config/db.js` + 4 Mongo dev-tools scripts** — delete in D2e, or keep any
   for prod ops? (they're Mongo-only → dead once Atlas gone; recommend delete)
3. **Start with D2b now** (small, safe, independent — shrinks runtime, un-gated on
   the fixture grind) or go straight to D2c foundation? Recommend **D2b first**.
