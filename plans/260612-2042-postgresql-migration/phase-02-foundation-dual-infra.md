# Phase 2 — Foundation & Dual Infrastructure

> Parent: [`plan.md`](plan.md) · Trigger: gate closed (GO confirmed 2026-06-21) ·
> Host: Neon (locked) · Tooling: Knex (confirmed in P1) · Owner: anhha

## Goal

Stand up the PostgreSQL **scaffolding** so Phase 3 can port repositories
domain-by-domain against a real, CI-proven schema — while **production stays on
MongoDB untouched**. No app behaviour changes; nothing writes to PG in prod yet.

> Built on `spike/pg-prototype` first (no main `package.json`/CI footprint). It
> merges into main only when Phase 3 begins the first real repository port — per
> the plan's "code migrates incrementally, prod stays on Mongo" rule.

## Step 0 — gate-closer (DONE 2026-06-21)
Head-to-head parity vs Mongo: identical numbers; heavy read ~6× faster on remote
Postgres than local in-memory Mongo. See
`plans/reports/report-260621-pg-gate-prototype-evidence.md`.

## Deliverables

| # | Item | Notes |
|---|------|-------|
| 2.1 | **Knex + pg** as real deps + `knexfile.js` | CJS-native; reads `PG_URL` from env (gitignored) |
| 2.2 | **`config/pg.js`** connection pool | mirrors `config/db.js`; lazy, pooled, SSL for Neon |
| 2.3 | **`DB_BACKEND` flag** (`mongo`\|`postgres`, default `mongo`) | a switch the repository layer will read in Phase 3; no-op until then |
| 2.4 | **First migration** — core tables + trap-equivalents | users/classes/teams/enrollments/schedules/attendances/certificates with `text` PK (ObjectId hex) + `jsonb` for subdocs |
| 2.5 | **Trap-equivalents in SQL** | partial unique indexes (soft-delete-aware); soft-delete columns; TTL via `pg_cron`/scheduled `DELETE` (AuditLog 730d etc.); Schedule double-booking exclusion constraint |
| 2.6 | **Reference repository port** | ONE small read repository (e.g. metrics funnel) implemented against PG behind the same interface — proves the Phase-3 pattern |
| 2.7 | **CI lane (later)** | a job that spins a PG service, runs migrations + the reference repo test; added when 2.6 is stable |

## Success criteria

- `knex migrate:latest` applies cleanly to a fresh Neon DB; the schema carries
  every trap-equivalent (partial unique enforced; soft-delete column; a TTL
  delete job defined).
- The reference repository returns the SAME numbers via PG as via Mongo (extends
  the parity harness).
- `DB_BACKEND=mongo` (default) leaves the running app 100% unchanged.

## Out of scope

- Porting ALL repositories (Phase 3). Only the reference repo here.
- Any production cutover / data ETL (Phase 5). Dual-write (never — code switches,
  data cuts over once).

## Risks

- Dep addition (knex/pg) touches the audit + `npm ci` gates → keep on the spike
  branch until Phase 3; regenerate the lockfile in the same PR when it lands.
- Trap fidelity — partial-unique predicates + TTL jobs must match Mongo semantics
  exactly (the DATA-009 guard inventory + the WS-B map are the checklist).

## Unresolved questions

- `pg_cron` availability on Neon vs an app-scheduled `DELETE` job for TTL — confirm
  when building 2.5.
- When to merge the foundation to main (proposal: with the first Phase-3 port).
