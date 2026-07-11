# Wave K · D2 — drop `mongoose` (fixture-layer decouple + model removal)

> **Status: IN PROGRESS.** Drafted 2026-07-11. Prereq: D2a (#288) merged.
> **D2b shipped** (587c3c0 — runtime non-model mongoose removed).
> **D2c shipped** 2026-07-11 — PG-native fixture foundation (`tests/fixtures/pg-fixtures.js`)
> + 2 pilot suites off Mongoose (`trainingHoursReport`, `classReadGate`).
> The runtime + repos are already PG-only (D1b #287 deleted the 44 `.mongo.js`
> + parity scaffolding + collapsed every selector to `require('./…pg')`). What
> remains to make Mongo *fully gone*: the rest of the test fixture layer + the 35
> Mongoose models + the `mongoose`/`mongodb-memory-server` deps.
>
> **D2c scope call (executed):** the batch delivered the fixture *foundation* +
> pilots but **left the shared `setup.js` CORE seed on Mongoose+mirror**. Reason:
> the auto-mirror's UPDATE path (`pre(UPDATE_OPS)` → re-read the doc from Mongo →
> upsert to PG) requires the doc to EXIST in Mongo. A PG-only core seed silently
> breaks the ~25 suites that mutate it via `Class.findByIdAndUpdate(seed.class1._id,…)`
> / `User.updateOne({_id: seed.member1._id},…)` / `Team.findByIdAndUpdate(seed.team._id,…)`
> — those writes find nothing in Mongo, mirror nothing, and the app (reading PG)
> never sees the change. So the core-seed swap is COUPLED to converting those
> mutator sites (→ `updateActiveRow`/`deleteActiveRowsWhere` from pg-test-utils)
> and is folded into the D2d grind, keeping every batch independently green.

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

## ⚠️ D2d discovery (2026-07-11): unported RUNTIME Mongoose reads

Converting fixtures to PG-native (fx builders → PG-only rows) UNMASKED that the
runtime is **not** actually PG-only. **6 app files still run Mongoose model
queries** (`Class.find`, `Certificate.find`, `LearningProgram.find`,
`Enrollment.find`, `Schedule.exists`, `User.find`, …) → they read the now-empty
Mongo on the PG lane. D2b's "runtime mongoose removal" only grepped the
`mongoose.` object, not `Model.query()` calls, so it missed them; its "only
`models/*` + `config/db.js` still touch mongoose" claim was wrong. The test
auto-mirror hid these (Mongoose fixtures existed in BOTH stores); PG-only
fixtures expose them as failures. Latent prod bugs (masked only because the org
has no real users/data yet). See [[project_unported_runtime_mongoose_reads]].

**Files:** `helpers/teacher-class-scope.js` (teacher visible-class scope — used by
attendance analytics + assessment access + learning dashboard),
`domains/learning/enrollment/prerequisites.js` (worst — 7 model queries),
`domains/learning/completion/expiry-reminder-service.js`,
`domains/learning/assignment/reminder-service.js`,
`domains/learning/path/use-cases.js`, `helpers/cohortMembership.js`.

**Sub-phase D2d-0 — DONE 2026-07-11 (commit bf371a9):** ported all 6 runtime
reads to Postgres (`config/pg` — direct queries; the two `.populate()` reminder
services rebuilt via SQL LEFT JOINs reconstructing the populated shape). Runtime
is now genuinely mongoose-free (only `models/*` + dev `config/db.js` remain).
Verified via consumer suites on PG (teacherBinding 18/18 now PG-native +
prerequisite/path/feedback/assessment green); the reminder cron suites are
infra-broken locally like cronRoutes → CI (dedicated PG) covers them. Grep
confirms zero runtime `Model.query()` calls remain.

## Phases (each independently green on the PG lane — the only lane now)
| # | Phase | Scope | Risk |
|---|-------|-------|------|
| **D2b** | Runtime non-model mongoose removal | `helpers/object-id.js` (regex validate + passthrough) replaces the 3 `Types.ObjectId` sites; `/ready` → PG-only probe (drop Mongo branch); `mongoose.model('Setting')` → settings repo | Low — 5 sites, own PR, doesn't drop mongoose yet |
| **D2c** ✅ | Fixture foundation + pilot | **DONE 2026-07-11.** `tests/fixtures/pg-fixtures.js` builders (genId + create User/Class/Team/Enrollment/Schedule/Attendance) reusing `pg-row-mappers.toRow`; pilot-migrated `trainingHoursReport` + `classReadGate` fully off Mongoose; auto-mirror stays for the rest. **CORE seed swap DEFERRED to D2d** (coupled to the ~25 mutator sites — see scope call above). | Med — proved green first |
| **D2d** | Fixture migration (grind) + core-seed swap | Migrate the remaining ~66 test files in domain batches (auth · schedule · learning · attendance · org · assessment · …): `Model.create` → `fixtures.create*`, drop `require('mongoose')`, each batch green. **Fold in the `setup.js` core-seed PG-native swap** + convert the ~25 core-seed mutator sites (`findByIdAndUpdate(seed.*…)` → `updateActiveRow`, etc.). Add builders per model as suites need them (unmapped models → add a `pg-row-mappers` entry). | Med — wide but mechanical; validation-error tests handled case-by-case (assert repo/zod error, not Mongoose `ValidationError`) |
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
