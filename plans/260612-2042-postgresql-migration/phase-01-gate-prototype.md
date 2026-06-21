# Phase 1 — Gate Prototype (read-only proof on Neon)

> Parent: [`plan.md`](plan.md) · ADR: `docs/decisions/mongo-now-postgres-later.md`
> Status: `ready — blocked on owner provisioning Neon` · Trigger: gate OPEN 2026-06-21 ·
> Host: **Neon** (locked) · Owner: anhha

## Goal

Prove — cheaply, **read-only**, throwaway — that PostgreSQL can serve the
heavy reports with the SAME numbers and acceptable latency, AND that the three
Mongo-specific traps have working SQL equivalents, BEFORE committing to the
2-month Phases 2–5. Production Mongo is **never touched**; this is a disposable
spike. Output = a go/no-go with evidence + the tooling confirmation (Knex).

## Prerequisite — owner provisions Neon (one-time, ~5 min, free)

1. Go to **neon.tech** → sign up (GitHub/Google login).
2. **Create a project** (region: pick the one closest to the Render app region).
3. It auto-creates a database + a **connection string** (`postgresql://user:pass@…neon.tech/db`).
4. Copy that string and give it to me. I set it as a LOCAL env var
   (`PG_PROTOTYPE_URL`) — it is **never committed** (gitignored, like `MONGO_URI`).
5. (Optional) create a Neon **branch** for the prototype so the throwaway load is
   isolated and discardable.

> Nothing else is needed from the owner. No payment — the free tier covers the
> whole prototype.

## Steps (me, once the connection string exists)

1. **Tooling spike** — add `knex` + `pg` as throwaway devDependencies on a
   `spike/pg-prototype` branch (Phase 1 is where `pg`/Knex first appear — the
   Phase-0 zero-PG boundary no longer applies). Read-only connection to Neon.
2. **ETL a snapshot** — from a Mongo snapshot (mongodump or a read-only export),
   load the report-relevant collections into Neon: `users`, `classes`,
   `enrollments`, `schedules`, `attendances`, `certificates`, `metricsnapshots`.
   ObjectId hex → `text` PK; flexible subdocs → `jsonb` (per plan strategy).
3. **Port the 3 heaviest reads** to SQL and run them on Neon:
   - the dashboard aggregation batch (`dashboard-stats-repository.js`),
   - `PERF-003` `analyticsByTeam` (the per-team attendance scan),
   - the live funnel (`analyticsSeriesService.getFunnel`).
4. **Measure** — (a) **correctness parity**: SQL results equal the Mongo numbers
   on the same snapshot; (b) **latency**: SQL vs Mongo wall-clock on the heavy
   reports.
5. **Prove the 3 trap-equivalents** work on Neon:
   - soft-delete → explicit `WHERE is_deleted = false` (or per-table view),
   - partial unique → `CREATE UNIQUE INDEX … WHERE <predicate>` (+ the Schedule
     double-booking exclusion constraint),
   - TTL → a `pg_cron` / scheduled `DELETE` for AuditLog 730d etc.
6. **Go/No-go** — write `plans/reports/` evidence: parity table, latency numbers,
   trap-equivalents confirmed, Knex confirmed-or-not. Decide: proceed to Phase 2,
   or stop and stay on Mongo.

## Success criteria

- The 3 heavy reports run on Neon with **numbers identical** to Mongo on the same
  snapshot, latency measured (target: ≤ Mongo, ideally better on PERF-003).
- The 3 trap-equivalents demonstrably work.
- Tooling decision (Knex) confirmed by hands-on evidence.
- A recorded go/no-go. If go → Phase 2 (foundation & dual infra) unblocks.

## Out of scope

- Any WRITE to Postgres from the app; dual-write; any production change.
- Porting ALL repositories (that is Phase 3) — only the 3 heavy reads here.
- Schema finalisation — the prototype schema is disposable.

## Risks

- **ETL fidelity** — subtle type coercions (ObjectId, Date, Decimal) must match;
  validate with the parity check, not by eye.
- **Snapshot staleness** — prototype runs on a point-in-time copy; that is fine
  for a proof (we are measuring shape + speed, not live data).
- **Knex learning curve** — first SQL port; budget time, keep the 3 reports small.

## Unresolved questions

- Backup/PITR tier — picked later at the paid-upgrade (Phase 5), not now.
- Which Mongo snapshot source — live read-only export vs a backup dump (decide
  when taking the snapshot).
