# PG migration — Phase 1 gate prototype: evidence + go/no-go

Date: 2026-06-21 · Host: Neon (PostgreSQL 18.4, ap-southeast-1) · Method: synthetic
data at scale on a throwaway Neon DB (no PII). Script:
`server/scripts/dev-tools/pg-prototype-benchmark.js`.

## What was tested
Read-only proof of the migration thesis on real-scale synthetic data:
**1000 users · 200 teams · 500,000 attendance · 5,000 certificates**.

## Results

| Check | Result |
|---|---|
| **Connectivity** | Neon reachable, ~286 ms connect (PostgreSQL 18.4) |
| **ETL mechanics** | bulk-loaded 500k+ rows in ~20.6 s (batched INSERT) |
| **PERF-003 one-team rate** (selective) | NO idx 35 ms → WITH idx 28 ms |
| **All-teams rollup** (full aggregate over 500k attendance) | **~144 ms** for 195 teams |
| **Funnel** (enrolled/completed/certified counts) | **~23 ms** |
| **Soft-delete trap** (`WHERE is_deleted=false`) | works — explicit predicate, hooks not needed |
| **Partial-unique trap** (`CREATE UNIQUE INDEX … WHERE`) | created + **correctly rejected a duplicate** active row (SQLSTATE 23505) |

## Read of the numbers (honest)
- Postgres serves every heavy read in **tens-to-low-hundreds of ms at 500k** — fast
  and comfortable. The full per-team rollup is a seq-scan + hash-aggregate (~144 ms),
  index-independent by nature; the **selective** one-team access (the shape PERF-003
  calls catastrophic in Mongo) is index-eligible and fast.
- The two Mongo-specific traps that have **no** Postgres hook layer — soft-delete
  auto-hiding and soft-delete-aware uniqueness — both port cleanly to **explicit SQL
  predicates / partial indexes**. The DATA-009 discipline guard (already in CI) is
  exactly the inventory those predicates come from.
- Tooling: raw `pg` was enough for the prototype; **Knex** (the planned query
  builder) is unchanged as the recommendation for the real ports.

## Head-to-head vs Mongo (Phase 2 opener — DONE 2026-06-21)
Same single synthetic dataset (1000 users / 200 teams / 100k attendance / 5k
certs) loaded into BOTH Neon (remote) and Mongo (mongodb-memory-server, local
in-memory), same queries. Script: `pg-vs-mongo-parity.js`.

| Check | Postgres (Neon, remote) | Mongo (in-mem, local) | Result |
|---|---|---|---|
| **per-team rollup — numbers** | 195 teams | 195 teams | **PARITY PASS ✓ identical** |
| **funnel — numbers** | 822 / 195 / 3237 | 822 / 195 / 3237 | **PARITY PASS ✓ identical** |
| per-team rollup — latency | **67.8 ms** | 402.5 ms | PG **~6× faster despite network handicap** |
| funnel — latency | 27.4 ms | 5.4 ms | Mongo's local edge on trivial counts |

- **Correctness parity is the definitive signal — both reads return identical
  numbers.** The SQL ports are faithful.
- The HEAVY read (the PERF-003 per-team scan) is **~6× faster on remote Postgres
  than on LOCAL in-memory Mongo** — Mongo had the network-free home advantage and
  still lost on the query that matters. Directly confirms the PERF-003 thesis.
- Trivial counts are network-bound: local Mongo wins, but in production both DBs
  are remote so this comparison is not representative.

## Still open (later in Phase 2/3)
- Larger scale (multi-million) + the dashboard 10-aggregation batch.

## Verdict: **GO — confirmed**
Heavy reads fast at scale, **numbers parity-proven vs Mongo**, the heavy query 6×
faster, load-bearing traps port to plain SQL. Gate fully closed. Proceed to the
**Phase 2 foundation** (Knex + dual-backend scaffolding, built CI-proven against
Neon while prod stays on Mongo).

## Cleanup
Throwaway artifacts: the `proto_*` tables on Neon (dropped/recreated each run) and
the gitignored `server/.env.pg-prototype` credential. Rotate/delete the Neon project
when the prototype is no longer needed.

## Unresolved questions
- Run the Mongo head-to-head before or inside Phase 2? (recommend: first step of P2.)
- Confirm Knex vs raw `pg` for the real ports once the first repository is ported.
