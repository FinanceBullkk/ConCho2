# Phase 5 — Deps + ops scripts + PG seed + docs sweep

**Priority:** last. **Status:** blocked on P0-a/P0-b. Do after Phases 1–4.

## Overview
Final sweep: drop the now-unused deps, deal with the ~40 Mongo-era ops scripts,
ship a **PG-native seed** (the one genuine functional gap), and de-Mongo the docs.

## 5.1 Dependencies (`server/package.json` + lockfile)
- Remove `mongoose`, `mongodb-memory-server`.
- **Decision (plan.md #1):** `express-mongo-sanitize` + `middleware/mongo-sanitize-in-place.js`
  — keep as cheap body-key defense-in-depth, or remove as Mongo-shaped? If remove:
  drop the dep, delete the middleware, unmount `app.use(mongoSanitizeInPlace)`
  (`server.js:220`), and add a short ADR note (we rely on parameterized PG queries
  + zod validation). Regenerate lockfile in the same PR (CODE-014 rule).

## 5.2 Ops scripts (~40 in `scripts/`)
> **Partially DONE (2026-07-09, safe-subset pass):** the 34 dead Atlas-era one-offs
> (ETL, `backfill-*`, `import_*`/`reimport_*`, `cleanup_*`, `migrate-*`, data-audit/
> fix/debug) were already deleted — rollback-neutral, live doc refs folded. Remaining
> below: the KEEP-or-PG-port decisions + `verify-backup.js` (held as the Atlas
> pre-cancellation check tool → delete at Atlas cancellation).

Classify:
- **Delete (Atlas-era one-offs):** `backfill_*`, `check_enrolled`, `cleanup_*`,
  `data*audit*`, `deep_cross_check`, `debug_schedule_slots`, `fix*`, `import_*`,
  `reimport_*`, `migrate-*`, `analyze_*`, `dataAudit`, `verify-backup` (already Phase 1),
  the ETL scripts (`etl-mongo-to-pg*` — migration done). These required Mongo + are
  historical. Bulk delete.
- **PG-port IF still operationally wanted:** `create-admin.js`, `reset_admin_pw.js`,
  `seed.js` (see 5.3). Confirm with owner which are still used.
- Keep: `verify-pg-backup.js`, `audit-env-doc-diff.js`, `audit-route-permission-diff.js`,
  `security_audit.js` (non-Mongo).

## 5.3 PG-native seed (functional gap — required)
`scripts/seed.js` is Mongo-only (`connectDB`, drops collections, writes via Mongoose).
The e2e gate (#7) + dev + `npm run seed` all depend on it.
- Build a PG seed: truncate PG tables (respect FK order) + insert the same sample
  set (admin `000001` / teachers / participants / classes / schedules — same logins
  in `commands.md`) via the PG repos or direct SQL/knex.
- Wire `npm run seed` → PG seed; update `commands.md` if flags change.
- Verify e2e (Playwright) still seeds + passes end-to-end.

## 5.4 Docs sweep (de-Mongo)
- `CLAUDE.md` golden rules ("MERN", Mongoose refs), `.claude/rules/tech-stack.md`
  (Mongoose 8 / express-mongo-sanitize / MongoDB Atlas lines),
  `.claude/rules/backend-conventions.md` (Mongo transaction/concurrency notes →
  PG), `.claude/rules/domain-model-and-migration.md` ("MongoDB now, PostgreSQL later"
  → done), `.claude/rules/testing-and-ci.md` (gate set — Phase 4),
  `docs/current-system-map.md` (legacy-model scaffolding note → removed),
  `docs/system-overview.md` (Mongoose fallback edges), README (already mostly done
  2026-07-09 — remove the "legacy Mongoose scaffolding until cleanup" caveats now true).
- Update `docs/development-roadmap.md`: mark Wave K decommission COMPLETE, roll old
  changelog per the rolling-archive rule.
- Update `docs/specs/` if any capability's persistence contract is described in
  Mongo terms (spec-driven-development DoD).

## Steps
1. Deps + lockfile; middleware decision.
2. Script triage (delete bulk, PG-port the confirmed-needed few).
3. Ship + verify PG seed (dev + e2e).
4. Docs sweep + roadmap + spec registry.
5. Final: full suite + e2e + lint green; `grep -ri mongo server --include=*.js`
   (runtime) → only intentional residue (none expected). Commit.

## Success criteria
- No Mongo deps; PG seed works for dev + e2e; all Mongo references removed from
  docs/rules or explicitly justified; roadmap + specs updated.

## Open questions
- Which of `create-admin` / `reset_admin_pw` are still run against prod? (Decides
  PG-port vs delete.)
- express-mongo-sanitize keep/remove (security) — plan.md decision #1.
