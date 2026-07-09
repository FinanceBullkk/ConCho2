# Wave K — Mongo decommission / code cleanup (plan)

> **Status: DRAFT — DO NOT EXECUTE YET.** Held until the two owner-gated
> preconditions below are true. Drafted 2026-07-09 (bake window, ~07-15).
> Migration itself is DONE: prod runs Mongo-less on PostgreSQL/Neon
> (`/ready` → `backend=postgres`, `/api/admin-db` → 410, verified 2026-07-09).

## Why this is on hold
During the bake, Atlas `tms2` is the **fix-forward fallback**: flipping
`DB_BACKEND=mongo` (+ restoring `MONGO_URI`) would point prod back at Atlas in an
emergency. Deleting the Mongo code path **destroys that rollback**. So every
phase here waits for:

- **P0-a — bake complete + owner cancels Atlas** (irreversible; owner-only, NOT autonomous).
- **P0-b — explicit owner "go" for code removal.**

Nothing in Phases 1–5 ships before P0-a AND P0-b.

## Scope (inventory, verified 2026-07-09 from `server/`)
- **58 dual-backend seams**: 53 `*.mongo.js`/`*.pg.js` repo pairs + 5
  `index/mongo/pg` service trios (attendance-by-class/-by-employee/-rollup,
  metric-series, metrics-funnel), all resolved via `config/db-backend.js`.
- **43 Mongoose models** (`server/models/*`) — but required by more than the
  `.mongo.js` repos (2 `.pg.js` repos, zod schemas, several `helpers/*`, ~40 ops
  scripts) — mostly for enums/constants → must extract before delete.
- **Dead-under-pg Mongo-only runtime**: reconcile cluster (`reconcileService` +
  `controllers/reconcileController` + `services/reconcile/*` (6) + `jobs/reconcileJob`),
  `routes/adminDbRoutes`, `middleware/mongoOnlyGone`, `config/db` (connectDB),
  the Mongo boot branch in `server.js`, `scripts/verify-backup.js`.
- **~70 test files** on `mongodb-memory-server` (the whole `tests/pg-parity/*`
  suite exists to prove Mongo==PG + `tests/global-setup.js` + `tests/setup.js`).
- **Removable deps**: `mongoose`, `mongodb-memory-server`, and
  (decision) `express-mongo-sanitize` + `middleware/mongo-sanitize-in-place.js`.
- **Seed gap**: `scripts/seed.js` is Mongo-only → need a PG seed for dev/e2e.

## Phases (each independently green: `server` Jest PG + `client` test:run + lint ≤ cap)
| # | Phase | Risk | File |
|---|-------|------|------|
| 1 | Retire dead Mongo-only runtime (reconcile, adminDb, mongoOnlyGone, boot path, verify-backup) | Low — already skipped under pg | [phase-01](phase-01-retire-dead-mongo-runtime.md) |
| 2 | Collapse 58 dual-backend seams → PG-only; drop `db-backend` selector + direct isMongo/isPostgres branches | Med | [phase-02](phase-02-collapse-dual-backend-repos.md) |
| 3 | Extract model enums/constants, then drop the 43 Mongoose models | Med-High — broad requires | [phase-03](phase-03-drop-mongoose-models.md) |
| 4 | Test-harness + CI collapse: pg-parity → PG-only, remove Mongo lane, restructure gates | High — touches CI gate #1/#8 | [phase-04](phase-04-test-harness-and-ci-collapse.md) |
| 5 | Deps + ops scripts + PG seed + docs sweep | Low-Med | [phase-05-deps-scripts-docs-seed.md](phase-05-deps-scripts-docs-seed.md) |

Recommended order: 1 → 2 → 3 → 4 → 5 (dead runtime first = safest; models can't
go until repos collapse; tests/CI last so gates stay meaningful throughout).

## Key decisions to confirm before/at execution (see per-phase "Open questions")
1. **Keep or drop `express-mongo-sanitize`?** It strips `$`/`.` operator-injection
   keys (Mongo-shaped). PG + parameterized queries don't need it, but it's cheap
   defense-in-depth on request bodies. Security-sensitive — owner/security call.
2. **CI gate count.** Golden rule = "8 CI gates must stay green." Removing the
   Mongo lane (`server-tests`, gate #1) drops to 7 (or gate #8 `server-tests-pg`
   becomes the single `server-tests`). Owner must re-bless the gate set + update
   `.claude/rules/testing-and-ci.md` + `CLAUDE.md`.
3. **pg-parity tests: delete or convert?** They lose their compare-target once
   Mongo is gone. Recommend **convert to PG-only regression tests** (the PG
   assertions still guard behavior), not delete.
4. **Ops scripts (~40, Mongo-based): archive or PG-port?** Most are one-off
   Atlas-era tools → bulk delete. A few (`create-admin`, `reset_admin_pw`, `seed`)
   may still be operationally wanted → PG-port those only (Phase 5).

## Definition of Done (whole cleanup)
- ☑ P0-a + P0-b satisfied before any code ships
- ☑ Zero `mongoose` / `mongodb-memory-server` in `server/` runtime + tests
- ☑ Full Jest suite green on PG (the only lane); client + lint green
- ☑ CI gate set re-blessed + docs (`CLAUDE.md`, tech-stack, testing-and-ci,
      current-system-map, domain-model-and-migration) de-Mongo'd
- ☑ PG dev/e2e seed working; roadmap + spec registry updated; committed

## Open questions (whole plan)
- Confirm P0-a/P0-b timing (bake ends ~07-15; owner drives Atlas cancel).
- Decisions 1–4 above need owner sign-off.
- Do any prod **operational** scripts (create-admin/reset_admin_pw) still get
  run against prod? If yes → they must be PG-ported, not deleted.
