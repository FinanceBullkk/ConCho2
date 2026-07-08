# Session 2026-07-08 — Wave J cutover EXECUTED (prod live on PostgreSQL/Neon)

## Outcome
**Prod `concho2.onrender.com` is now serving from Neon PostgreSQL 17.10** (ap-southeast-1).
Mongo→PG cutover done via the **fresh-start** path (owner: no real users/data yet).

## Divergence from the checklist (important)
Checklist assumed ~100 live users → freeze + Atlas-prod ETL. Owner confirmed **no real
users, no real data** → **fresh start**: **no freeze, no Atlas ETL**. Atlas `tms2` left
untouched. Seeded starter data instead of migrating Atlas contents (owner chose "full sample").

## What ran (in order)
1. **Seed throwaway mongod** — standalone `mongod` (cached mms binary 8.2.6) on :27099, `seed.js`
   → 33 docs / 11 collections (10 users incl. admin `000001`, 2 teams, 3 classes, 3 schedules,
   programs/offices/enrollments/settings/counters).
2. **Verify Neon** — PG **17.10**, migrations 001–035 already applied, 43 data tables **empty**,
   0 FK. Clean slate.
3. **ETL** `etl-mongo-to-pg.js` (throwaway mongo → prod Neon) — 11 tables, **counts matched
   Mongo==PG**, **0 dangling refs**, total **10 MB** (≪ 0.5 GB Neon-FREE gate).
4. **mig 036** copy-then-migrate (`db/pg/migrations-cutover/` → `migrations/`, `knex migrate:latest`)
   — **30 FK + 323 CHECK**, `knex_migrations`=36. Copy removed from `migrations/` (uncommitted, per rule).
5. **Local smoke** `DB_BACKEND=postgres`+Neon (MONGO_URI→throwaway for boot) — boot OK, `/health` 200,
   `/ready` connected; CSRF; admin login (bcrypt vs PG, mustChangePassword gate = expected); teacher
   login; reads `/api/schedules`=3, `/api/learning/cohorts`=3; role/capability 403s correct;
   **live write round-trip** bad→good login moved `failed_login_attempts` 0→1→0 in Neon. Zero errors,
   zero mongo-write warnings.
6. **Owner flipped Render** — set `DB_BACKEND=postgres` + `PG_URL`, **kept `MONGO_URI`** (boot calls
   `connectDB()` unconditionally; Atlas = bake fallback).
7. **Flip CONFIRMED on prod** — teacher login 200 + `/api/schedules`=3 + a **prod** failed-login probe
   drove Neon `failed_login_attempts` **0→1** (then reset). Proves prod writes land in **Neon**, not
   Atlas `tms2`.

## Backup pipeline (private `ConCho2-backups`)
- Daily `schedule: '0 18 * * *'` (01:00 ICT) **enabled**; secrets `NEON_PG_URL` + `BACKUP_PASSPHRASE` present.
- **Fixed a real workflow bug:** ubuntu-latest runner shipped `pg_dump` 16 vs Neon 17 → "server version
  mismatch". Pinned `/usr/lib/postgresql/17/bin` onto `$GITHUB_PATH` in both jobs + version-assert. Dump now green.
- **Fixed `verify-pg-backup.js`:** it hard-failed on 0-row tables; on a fresh DB `attendances`/`evaluations`
  are legitimately 0 and the manifest agrees (0==manifest 0). Now in `--counts` mode an empty table is an
  info note, not a fail. Validated against Neon → **14/14 PASS**. (CI verify job goes green once this merges to main.)

## Code changes (need a PR — NOT yet pushed)
- `server/scripts/verify-pg-backup.js` — empty-table handling in manifest mode.
- `plans/260612-2042-postgresql-migration/pg-backup.yml` — PG17 PATH fix + schedule enabled (already
  mirrored into the backups repo live).
- `plans/260612-2042-postgresql-migration/cutover-checklist.md` — EXECUTED banner + fresh-start record.
- `docs/development-roadmap.md` — Status board + changelog.
- (backups repo already updated live via API — outside the code-repo PR.)

## Follow-ups (deferred)
- `/ready` probes Mongo only → after flip it reflects Atlas, not Neon. Patch to probe PG under `DB_BACKEND=postgres`.
- Pre-existing repo-wide: PG `ssl: { rejectUnauthorized: false }` (semgrep warning) — codebase convention for
  Neon; harden repo-wide separately if desired.
- Cron-pinger ≤4-min resume (mask Neon autosuspend cold-start) = owner action on cron-job.org.
- **Wave K decommission** = owner-scheduled after the 1-week bake (drop Mongoose models + memory test harness
  + `DB_BACKEND` switch → PG-only; cancel Atlas).

## Unresolved questions (owner)
1. Push the code-repo PR now (verify-script fix + docs)? Until merged, the daily backup **verify** job stays
   red (the **dump** is green + valid regardless).
2. Bake length confirmed at 1 week? Wave K trigger is your call.
3. Resume/keep the cron-pinger paused? No real users, so cold-start only affects your own testing for now.
