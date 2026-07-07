# Audit — PG migration (dual-backend, Phase 3 Wave-G)

**Date:** 2026-07-07 · **Auditor:** inline session (parallel to batch-9 run) · **Method:** read-only, no source edits · **Scope:** the Mongo→Postgres dual-backend migration — seam architecture, parity gating, test-infra, remaining Mongo-only surface.

## Verdict

Migration architecture is **sound and honestly tracked**. Core repo parity is **well-gated** (55 `pg-parity` suites vs real Postgres, HARD gate). Two real risks stand out: **one live PG-mode crash** in an already-ported domain, and a **systemic false-green/split-brain risk** from the test-only auto-mirror shim masking unported production write paths. Neither blocks Wave-G grind; both must be closed before the Phase-5 cutover / before promoting `server-tests-pg` to a required gate.

## Architecture map (verified)

- **Selector:** `config/db-backend.js` — `DB_BACKEND` (default `mongo`) → each dual-ported repo resolves `impls[pg|mongo]`. 43 `*.pg.js` impls today. No dual-write; switch-then-cutover design.
- **Transactions:** `domains/_shared/unit-of-work.js` `runInTransaction(fn)` — Mongo `session.withTransaction` ⇄ PG `BEGIN/COMMIT/ROLLBACK` on a checked-out client. `impls` exported for parity drive.
- **Parity gates (3 tiers):**
  1. `tests/pg-parity/*` (55 suites) — real postgres:16 + migrations, row-level Mongo↔PG equality. **HARD CI gate** (not `continue-on-error`). ← the real proof.
  2. `tests/integration/*-repository-dual-backend.test.js` — mostly selector-wiring + Mongo path; parity delegated to tier 1.
  3. `server-tests-pg` — ENTIRE suite on `DB_BACKEND=postgres` via auto-mirror. **Informational** (`continue-on-error: true`), Wave-G bring-up lane.
- **Test shim:** `tests/pg-auto-mirror.js` + `pg-row-mappers.js` — global Mongoose plugin + raw-collection patch; mirrors every mapped-model write into PG so legacy Mongoose-seeding suites read correctly on the PG lane. PG-lane-only, inert on Mongo.

## Findings (severity-ordered)

> **Resolution (2026-07-07):** F1 FIXED (`use-cases.js` now backfills via `repository.updateProgramById` — dual-backend, no `.save()`; syntax-checked, jest deferred until batch-9 idle). F2 → owner chose **port ALL before Wave J**; full port-or-delete inventory + cutover gate written to `plans/260612-2042-postgresql-migration/phase-05-cutover-decommission.md`.

### F1 [HIGH — live PG crash] `byName.save()` on a POJO — learning/use-cases.js:110
`ensureProgramForLegacyCourse` calls `repository.findProgramByName(courseName)` then `byName.save()`.
- mongo impl (`repository.mongo.js:25`) returns a **hydrated** `LearningProgram.findOne(...)` → `.save()` works.
- pg impl (`repository.pg.js:158`) returns `programRow(rows[0])` → a **plain POJO** → `byName.save()` throws `TypeError: byName.save is not a function` under `DB_BACKEND=postgres`.
- **Reachable in prod:** `controllers/class/class-mutations.js:43,99` → class-create with a `courseName` matching an existing program that lacks `legacyCourseName` → 500 on PG.
- **Why gates miss it:** `pg-parity` tests repo *methods*, not use-case *flows*; the PG lane rarely hits this narrow branch (programs created for legacy courses already carry `legacyCourseName`).
- **Fix:** `await repository.updateProgramById(byName._id, { legacyCourseName: courseName })` (dual-backend), drop the `.save()`.

### F2 [HIGH — cutover] Auto-mirror false-green → read/write split-brain in real PG
The PG lane's green partly comes from auto-mirroring **unported production Mongoose writes** into PG. In real PG prod there is **no mirror**, and `config/db.js` `connectDB()` is called **unconditionally** (`server.js:380`, no `isMongo` guard) → Mongoose still connects to Mongo. So any model whose **write is unported (raw Mongoose)** but whose **read is ported (`repository.pg`)** splits: writes land in Mongo, ported reads hit PG → **silent data loss**.
- Clearest case: **notification bell** — `domains/notification/in-app-writer.js:17` writes `NotificationLog.create()` (raw Mongoose, fail-soft-swallowed) while `domains/notification/repository.pg.js` reads PG → bell shows nothing on PG.
- Same asymmetry class: `domains/learning/completion/recert-assignment-service.js:50` (`Assignment.create`), `expiry-reminder-service` / `assignment/reminder-service` (`NotificationLog`), `domains/access/grants-loader.js:25` (`Role.updateOne`), `services/pushService.js`, plus the whole F-PR-2 / ops-cron deferred tail (`reconcile`, `import`, `reminderService`, `enrollment/*`, `settingController`, `evaluationController`).
- Many are acknowledged "deferred by design" in the ledger, but the ledger frames them as *side-effects*, not as a **read-ported/write-unported split-brain inventory** — which is the thing that bites at cutover.
- **Recommend:** (a) produce the explicit "read-ported ∧ write-unported" model list; (b) add a lane guard that counts **app-origin** Mongoose writes to mapped models on `server-tests-pg` so greenness can't hide an unported write path.

### F3 [MED] `server-tests-pg` greenness ≠ port completeness
Corollary of F2. The lane proves "app boots + reads resolve on PG," **not** "all writes ported" — auto-mirror papers over the gap. Promoting to required gate #8 on greenness alone = false confidence while the mirror is active. Gate the promotion on F2's guard being clean, not just 0 red suites.

### F4 [MED] Strong parity suites cover repo methods, not composed use-case flows
`pg-parity` is method-level; F1 is exactly the class of bug that slips through (a use-case composing ported repos in a PG-incompatible way). Add a thin set of dual-backend **flow** tests for the highest-risk composed paths: class-create (F1), booking chokepoint, enrollment create/transfer.

### F5 [LOW] auto-mirror generic reflective mapper fails SOFT on schema mismatch
`pg-auto-mirror.js:131-135` — a renamed/nested field reflecting to `undefined` → NULL on a NOT NULL column is swallowed (`warnOnce`), so the row silently isn't mirrored → later a confusing false-red (missing PG row) two layers up. Acceptable for test-infra, but a debugging-friction source; explicit MAPPERS entries (fail-loud) are the escape hatch — add one whenever a model's PG reads get asserted.

### F6 [LOW — review item, no instance found] UoW caller discipline
Every PG txn repo routes through a shared `exec(tx, …)` → `tx.client.query` when present, else pool (schedule/groups/planning — consistent, correct). Residual risk is **caller-side**: a method called inside `runInTransaction` that forgets to *pass* `tx` runs on the pool (auto-commit, non-atomic) with no error. `booking-transaction.pg.test.js` (commit/rollback/double-book/cancel) covers the obvious paths. Keep the "pass tx everywhere in a UoW" rule in review checklist for each new txn seam.

## Positives (keep doing)

- **Parity is genuinely gated** — `pg-parity` HARD gate on real PG catches repo-level divergence (the lane already surfaced 3 real org divergences + office setter fidelity, all fixed).
- **Tracker honesty** — roadmap numbers (117→77→58→47→44 across batches) reconcile with batch ledgers; deferred seams carry precise root causes. No stealth-green.
- **Transaction abstraction** — clean, uniform `exec(tx)` pattern; UoW parity-proven on real Neon.
- **Fail-loud/fail-soft split** in the mirror is deliberate and documented (explicit mappers loud, generic reflective soft).

## Unresolved questions

1. **Phase-5 cutover intent:** does prod PG mode keep Mongoose connected (dual-DB) or go pure-PG? If pure-PG, every raw-Mongoose write in F2 becomes a hard failure, not just split-brain — raising all of F2 to blocker. Owner call needed to rank the F2 tail.
2. **F1 blast radius:** any other ported use-case calling hydrated-doc methods (`.save`/`.populate`) on repo return values? Grep found only F1 live (learning) + `controllers/enrollment/*.populate` which is *unported* (still real Mongoose docs, not a bug). Re-grep after each new domain port.
3. **Lane suite count** 214 (local) vs 208 (CI summary) — reconcile before promoting the lane to a required gate (already flagged in batch-1 report).
