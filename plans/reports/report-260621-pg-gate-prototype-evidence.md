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

## Not yet proven (carry into Phase 2)
- **Head-to-head vs Mongo** — same data loaded in Mongo, same queries, correctness
  parity (identical numbers) + side-by-side latency. The prototype proves Postgres
  is *capable + fast*; it does not yet show the *delta* vs Mongo (PERF-003's Mongo
  cost is documented, not re-measured here).
- Larger scale (multi-million rows) + the dashboard 10-aggregation batch.

## Verdict: **GO (provisional)**
Postgres handles the heavy reads fast at scale and the load-bearing Mongo traps
port to plain SQL. No blocker surfaced. Recommend proceeding to **Phase 2
(foundation & dual infrastructure)**, and folding the Mongo head-to-head parity
check into Phase 2's first step to fully close the gate.

## Cleanup
Throwaway artifacts: the `proto_*` tables on Neon (dropped/recreated each run) and
the gitignored `server/.env.pg-prototype` credential. Rotate/delete the Neon project
when the prototype is no longer needed.

## Unresolved questions
- Run the Mongo head-to-head before or inside Phase 2? (recommend: first step of P2.)
- Confirm Knex vs raw `pg` for the real ports once the first repository is ported.
