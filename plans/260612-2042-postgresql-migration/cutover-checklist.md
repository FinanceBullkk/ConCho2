# Wave J — Cutover checklist (Mongo Atlas → Neon PG)

**Status:** ready — 🧪 items rehearsed 2026-07-08; PROD items await owner scheduling
**Created:** 2026-07-08 · **Parent:** `master-execution-plan.md` Wave J/K, `phase-05-cutover-decommission.md`
**Decisions baked in (owner 2026-07-08 + delegated same day):** Neon **FREE** tier (~100 real users; dry-run size 10MB ≪ 0.5GB gate) · bake = **1 week** Atlas read-only · reconcile **RETIRED** at cutover (not ported) · **adminDb explorer RETIRED at Wave K** (Neon console/psql replaces it; write-gate row E1) · cron-pinger reused at ≤4-min work-hours cadence · **backups live in the PRIVATE `ConCho2-backups` repo** (the code repo is PUBLIC — its Actions artifacts are world-downloadable; PII dumps, even encrypted, must not be public) · waitlist CASCADE kept (promoteAndSweep needs it).

> **HARD RULE:** everything below marked 🔒 touches prod (Atlas, Render env, real users) — DO NOT execute without the owner. Everything marked 🧪 can be rehearsed end-to-end on a Neon branch/throwaway DB by the agent alone.

## 0. Pre-flight gates (all must be ✅ BEFORE scheduling the window)

- [ ] Slice 4 (B1–B7) merged, 9/9 gates green
- [ ] Slice 5 F3 lane counter merged — full PG suite proves **0 production Mongoose writes** (the real "port complete" signal)
- [ ] D-CronRun closed (cron_runs table or advisory lock — no Mongo-only ops model left)
- [ ] H ETL script merged + **dry-run done** against docker/Neon-branch; row-count reconciliation table clean; **total size measured < 0.5GB** (Neon FREE gate — if over, STOP, owner call on paid tier)
- [ ] I FK/CHECK migration (mig 036) written & reviewed — **NOT applied** yet (applies post-ETL, step 5)
- [ ] B5 sync bulk reads ported (Sheets export survives cutover) — or owner explicitly accepts Sheets-sync death
- [ ] pg_dump backup job ready (Neon free keeps ~6h history only) + `docs/backup-dr.md` updated
- [ ] `server-tests-pg` gate #8 green on main at the cutover commit

## 1. Provision Neon (🧪 rehearsable / 🔒 prod project)

- [ ] 🔒 Owner creates Neon FREE project (region closest to Render region), copies pooled connection string
- [ ] 🔒 Add `PG_URL` to Render env (**do not** set `DB_BACKEND` yet)
- [ ] 🧪 `npx knex migrate:latest --knexfile db/pg/knexfile.js` against Neon (all 35+ migrations; verify `knex_migrations` count matches local docker `tmsci`)
- [ ] 🧪 Smoke: `SELECT count(*) FROM information_schema.tables WHERE table_schema='public'` matches local

## 2. Freeze (🔒)

- [ ] 🔒 Owner announces freeze window to ~100 users (email/notice; short window — ETL at this size is minutes, budget 1–2h total)
- [ ] 🔒 Disable cron jobs that write (nightly reconcile is retired anyway; reminder/expiry crons — pause pinger-triggered endpoints or set maintenance flag)
- [ ] 🔒 Confirm no in-flight imports/exports

## 3. Final ETL (🔒 prod run · 🧪 rehearsed beforehand)

- [ ] Run `node server/scripts/etl-mongo-to-pg.js` with `MONGO_URI=<Atlas>` `PG_URL=<Neon>` (full run, all collections)
- [ ] Script is idempotent (`INSERT … ON CONFLICT (id) DO UPDATE`) — safe to re-run on partial failure

## 4. Verify (🔒 on prod data)

- [ ] Row-count reconciliation table printed by ETL: Mongo count == PG count per collection (soft-deleted rows INCLUDED both sides)
- [ ] Dangling-FK warning list empty (or each entry explained + accepted)
- [ ] Spot checksums: users / schedules / enrollments / evaluations (script prints per-collection field-level samples)
- [ ] Counters: `counters.seq` >= max issued certificate number (gapless invariant)

## 5. Apply FK/CHECK hardening (🔒)

- [ ] mig 036 lives in `server/db/pg/migrations-cutover/` (deliberately NOT auto-applied — the jest harness TRUNCATEs per-table, which FKs forbid; CI proved this). Apply by copy-then-migrate, only after step 4 shows zero dangling refs:
  ```bash
  cp server/db/pg/migrations-cutover/036_fk_check_hardening.js server/db/pg/migrations/
  npx knex migrate:latest --knexfile db/pg/knexfile.js   # against Neon
  ```
  Do NOT commit the copy back into `migrations/` — CI must keep skipping it until Wave K retires the Mongo test harness.

## 6. Smoke on staging config (🧪)

- [ ] Local/staging server boot with `DB_BACKEND=postgres PG_URL=<Neon>` → `/health` + `/ready` green
- [ ] Manual smoke: login (JWT + CSRF) → book slot → mark attendance → evaluation upsert → settings read → notification bell → user import dry
- [ ] Watch pino logs for any Mongo connection attempt (there must be none on request paths)

## 7. Flip (🔒)

- [ ] 🔒 Render env: set `DB_BACKEND=postgres` → redeploy
- [ ] `/ready` green; run the same manual smoke against prod
- [ ] Un-freeze: owner announces resume

## 8. Post-flip ops (🔒 setup, then automatic)

- [ ] Cron-pinger (reuse `docs/cron-pinger-setup.md` pattern) pings during VN work hours at **≤4-min cadence** against a PG-touching endpoint → masks Neon FREE autosuspend cold-start
- [ ] pg_dump backup live in the PRIVATE **`ConCho2-backups`** repo (🔒 owner creates it — one command: `gh repo create FinanceBullkk/ConCho2-backups --private`; then copy the STAGED files from this plan dir into it: `pg-backup.yml` → `.github/workflows/pg-backup.yml`, `pg-backup-repo-readme.md` → `README.md`): add secrets `NEON_PG_URL` + `BACKUP_PASSPHRASE` there (passphrase ALSO into the owner's password manager — lost passphrase = unreadable backups), **uncomment the `schedule:` cron block**, run once via *Run workflow*, confirm the restore-verify job green
- [ ] Sentry watched for 48h (5xx spike = candidate rollback trigger)

## 9. Bake + rollback plan

- [ ] Atlas stays **read-only, untouched** for the bake: **1 week** (decided 2026-07-08 — rollback value decays within days anyway; the daily restore-verified pg_dump is the real safety net)
- [ ] **Rollback (during bake only):** flip `DB_BACKEND` back to mongo on Render + re-freeze + reverse-ETL of the delta is NOT built — rollback means accepting loss of writes made on PG since flip. Decision rule: rollback only for data-corruption-class failures in the first days; otherwise fix-forward on PG.
- [ ] During bake: NO writes to Atlas from anywhere (app is 100% PG from flip day)

## 10. Wave K — decommission (🔒 owner-driven, separate wave — NOT part of J)

- [ ] After bake expires + owner sign-off: drop Mongoose models, mongo-memory test harness, `DB_BACKEND` switch (PG-only), cancel Atlas, update docs/specs
- [ ] **Agent does NOT start Wave K autonomously** — owner explicitly schedules it

## Open items to fill before the window

1. Exact window date/time (owner) + who sends the freeze comms.
2. Bake length (owner: 1 or 2 weeks).
3. Neon region choice (match Render region — check Render dashboard).
4. Backup destination for pg_dump artifacts (see backup section of phase-05 work — finalize with the backup PR).
