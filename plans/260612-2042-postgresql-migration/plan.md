# PostgreSQL Migration Plan (MongoDB → PostgreSQL)

> Executes the ADR `docs/decisions/mongo-now-postgres-later.md`. **Gate OPENED by
> owner 2026-06-21** (commit to full migration; driver: future-proofing the
> relational L&D platform; convergence Phase 3+4 complete → model stable enough) —
> Phases 1+ unblocked. Sequence: finish the remaining safe Phase-0 slices, then the
> Phase 1 gate prototype (needs a real PG instance + Mongo snapshot).
> Status: `in progress` · Owner: anhha · Created: 2026-06-12 · Gate opened: 2026-06-21

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
| 0 | Readiness hardening (no PG) | [phase-00](phase-00-readiness-hardening.md) | NOW — alongside normal work | continuous | ✅ **COMPLETE 2026-06-21** (WS-A 0.2–0.8 extracted; 0.9 auth/booking deferred-by-design to Phase 3) |
| 1 | Gate prototype (read-only proof) | [phase-01](phase-01-gate-prototype.md) | gate OPEN 2026-06-21 | ~1 wk | ✅ **DONE 2026-06-21 → GO** — Neon parity PASS vs Mongo; heavy read ~6× faster |
| 2 | Foundation & dual infrastructure | [phase-02](phase-02-foundation-dual-infra.md) | go confirmed | ~1 wk | ✅ **CORE COMPLETE 2026-06-21** — Knex+migration+traps on Neon; config/pg + DB_BACKEND; reference repo port proven (PG==Mongo). 2.7 CI / 2.5b TTL+FK = follow-ups |
| 3 | Repository ports (domain by domain) | [phase-03](phase-03-repository-ports.md) | after P2 | ~4–6 wk | 🟡 **NEXT** — the marathon; merges the spike foundation to main + ports repos one by one |
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
- **Hosting (LOCKED 2026-06-21):** **Neon** (serverless managed Postgres).
  Chosen over Render PG for: persistent free tier (Render free PG is deleted
  ~90d), **database branching** (branch a snapshot for the P1 prototype + each
  migration rehearsal, then discard), and a clean free→paid path to production.
  Cross-provider latency vs the Render-hosted app is negligible at internal
  ~1000-user scale. App stays on Render; only the DB connection string differs.

## Key risks

Booking transaction chokepoint (scheduleService) port — highest complexity;
soft-delete query discipline (hooks → explicit predicates); ETL fidelity for
730d audit history; test-harness swap throughput in CI.

## Production cost (estimate, ~2026 — re-check at release)

For ~1000 internal users (moderate, bursty load). App stays on Render; Atlas is
dropped at cutover so net cost barely moves.

| Item | Start | Comfortable | Note |
|---|---|---|---|
| App (Render) | ~$7/mo | ~$25/mo | paid = no spin-down |
| Postgres (Neon) | $0 (free) | ~$19/mo | start free, upgrade when data/load grows |
| Domain | ~$1/mo | ~$1/mo | ~$12/yr |
| Email | $0 | $0 | reuse Google Workspace SMTP |
| Error tracking (Sentry) | $0 | $0 | free tier suffices |
| **Total** | **~$8/mo** | **~$45/mo** | |

Release checklist: upgrade app→paid, Neon→paid (backups/PITR), custom domain +
HTTPS, wire Workspace email, import the 1000-employee dataset, final test +
cutover weekend.

## Unresolved questions

1. Tooling final call (Knex vs Prisma) — decide with P1 prototype evidence.
2. ~~Hosting final call~~ **RESOLVED 2026-06-21 → Neon** (backup/PITR tier picked at the paid-upgrade step).
3. Cutover window: which weekend; who owns the freeze comms to 1000 users.
