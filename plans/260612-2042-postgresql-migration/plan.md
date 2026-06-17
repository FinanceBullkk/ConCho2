# PostgreSQL Migration Plan (MongoDB → PostgreSQL)

> Executes the ADR `docs/decisions/mongo-now-postgres-later.md`. The ADR's gate
> stays in force: **Phases 1+ start only when the gate opens (post-launch,
> pain demonstrated or owner decision). Phase 0 runs now** — it is pure
> readiness hardening with zero PostgreSQL footprint.
> Status: `planned` · Owner: anhha · Created: 2026-06-12

## Why (vision recap)

System is becoming a system-of-record (certificates, compliance, audit).
PostgreSQL gives: DB-enforced integrity (FKs/CHECK/exclusion constraints —
retires most of the 12-check reconcile patrol), native SQL reporting/BI,
vendor freedom (Render managed PG; on-prem possible), jsonb staged-migration
path, pgvector for future AI features.

## Current readiness (assessed 2026-06-12)

- ✅ 7 `domains/*` behind repositories; DTO vocabulary layer; 900+ black-box tests
- ✅ Domain relationships stabilized (vocabulary closed audit r7; Wave E done)
- ❌ Legacy controllers/services call Mongoose directly
- ❌ Mongo-specific features in use: soft-delete hooks, TTL indexes (AuditLog
  730d / NotificationLog 180d / ReconcileReport 30d), partial unique indexes,
  14-aggregation dashboard batch, mongodb-memory-server test harness

## Phases

| # | Phase | File | Trigger | Est. | Status |
|---|-------|------|---------|------|--------|
| 0 | Readiness hardening (no PG) | [phase-00](phase-00-readiness-hardening.md) | NOW — alongside normal work | continuous | 🟡 in progress (detail + audit written 2026-06-17) |
| 1 | Gate prototype (read-only proof) | [phase-01](phase-01-gate-prototype.md) | gate opens | ~1 wk | ⚪ gated |
| 2 | Foundation & dual infrastructure | [phase-02](phase-02-foundation-dual-infra.md) | after go decision | ~1 wk | ⚪ gated |
| 3 | Repository ports (domain by domain) | [phase-03](phase-03-repository-ports.md) | after P2 | ~4–6 wk | ⚪ gated |
| 4 | Test parity (full suite on PG) | [phase-04](phase-04-test-parity.md) | overlaps P3 | ~1–2 wk | ⚪ gated |
| 5 | Cutover & decommission | [phase-05](phase-05-cutover-decommission.md) | P3+P4 green | ~1 wk + 30d bake | ⚪ gated |

Total elapsed estimate at gate-open: **~2–2.5 months** (single dev + agent),
prod stays on MongoDB until the Phase 5 cutover weekend.

## Strategy decisions (locked for this plan)

- **Code migrates incrementally, data cuts over once.** All repositories are
  ported and CI-proven against PG while prod runs Mongo; ONE rehearsed
  cutover weekend flips `DB_BACKEND`. No dual-write, no cross-store joins.
- **jsonb staging** — flexible subdocs (externalTrainer, policy blobs, audit
  diffs) land as jsonb first; normalize later only if queried relationally.
- **IDs:** keep Mongo ObjectId hex as `text` PK on migrated rows; new rows
  use `uuid`. Avoids rewriting every FK reference in exports/audit history.
- **Tooling (recommendation, confirm in P1):** Knex (CJS-native query builder
  + migrations) over Prisma/Drizzle — server is CommonJS, repository pattern
  already owns query shape; an ORM adds a second model layer we don't need.
- **Hosting (recommendation, confirm in P2):** Render managed PostgreSQL
  (same platform as the app; Neon as fallback for branch databases).

## Key risks

Booking transaction chokepoint (scheduleService) port — highest complexity;
soft-delete query discipline (hooks → explicit predicates); ETL fidelity for
730d audit history; test-harness swap throughput in CI.

## Unresolved questions

1. Tooling final call (Knex vs Prisma) — decide with P1 prototype evidence.
2. Hosting final call (Render PG vs Neon) + backup/PITR tier.
3. Cutover window: which weekend; who owns the freeze comms to 1000 users.
