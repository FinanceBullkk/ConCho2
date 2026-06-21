# PostgreSQL Migration — Master Execution Plan ("one big plan, run in waves")

> Consolidates the drip-feed per-read-slice ports into **one end-to-end plan** the
> agent executes wave-by-wave (approve once, run to cutover). Supersedes the
> ad-hoc "port domain tiếp theo" cadence. Parent: [`plan.md`](plan.md) ·
> Detail phases: [`phase-03`](phase-03-repository-ports.md)..[`phase-05`](phase-05-cutover-decommission.md)
> · Owner: anhha · Created: 2026-06-21 · Host: Neon · Tooling: Knex

## 0. Decision — why NOT a literal big-bang single PR

The ask is "làm 1 lần". The **safe** reading of that is **one plan, few large waves**
— NOT one giant PR that rewrites 43 models' queries to SQL and cuts over at once.

| Approach | Pros | Cons | Verdict |
|---|---|---|---|
| **Big-bang** (one PR, port everything + cut over) | feels "done once"; no stacking | unreviewable diff; one red test blocks all; no incremental parity proof; long-lived branch rots/conflicts; rollback = revert weeks of work; **prod risk very high** | ❌ reject |
| **Batched waves, one plan** (recommended) | each wave parity-proven + reversible; reviewable PRs; prod stays on Mongo until the single cutover; agent runs waves back-to-back so YOU approve once | still several PRs (but you don't drive each) | ✅ **adopt** |
| Keep per-read-slice (status quo) | tiny PRs | far too granular — 28 repos × slices = many sessions; you drive each | ❌ stop |

**Locked strategy (from `plan.md`, unchanged):** code migrates incrementally, **data
cuts over ONCE**; no dual-write; `DB_BACKEND=mongo` is prod default the whole way;
ObjectId hex as `text` PK; jsonb staging for flexible subdocs; soft-delete +
partial-unique + TTL encoded as explicit SQL.

**Granularity change (the real fix):** stop porting read-slices. Port **whole
`repository.js` interfaces** per domain, one domain = one PR, grouped into waves.

## 1. Scope (what's actually left)

- **43 models**, **20 domain `repository.js`**, **8 `*-repository.js`**, ~45 files
  still calling Mongoose directly (legacy controllers/services).
- **Done (Wave A, read-only slices):** metrics-funnel · metric-series (metrics
  surface complete) · attendance rollups by team/employee/class. PRs #184–#188.
- **Schema so far:** migrations `001` (core spine: programs/users/classes/teams/
  team_members/enrollments/schedules/attendances/certificates) + `002`
  (metric_snapshots). ~30 collections still need tables.

## 2. The waves (execution order, low→high risk)

Each wave = **its Knex migration(s) for that cluster's tables + every repository in
it ported to a `.pg.js` behind the same interface + a parity test suite proving
Mongo==PG on Neon**. Exit = wave's parity tests green on Neon + `DB_BACKEND=mongo`
suite unchanged. One PR per domain (or per tight cluster).

| Wave | Domains / repos | New tables (beyond 001/002) | Key traps to replicate | Risk |
|---|---|---|---|---|
| **B — Catalog & people CRUD** | learning (paths/completion), org, room, session-type, skill, vendor, trainer, groups | learning_paths, departments, offices, rooms, session_types, skills, vendors, trainer_profiles, learning_program extras | soft-delete predicates; partial-unique (codes); manager hierarchy; prereq/path arrays (jsonb) | low |
| **C — Assessment, compliance, finance, ops** | assessment, compliance, finance, planning, custom-field, branding, automation, notification, access, mobile | assessments, questions, attempts, required_training, cost_entries, budgets, training_requests/plans, custom_fields, tenant_config, automation_rules, notification_log (TTL 180d), role_grants, push_subscriptions | grading rules; capability grants; **NotificationLog TTL**; jsonb policy/template blobs; event-bus publish parity | medium |
| **D — Booking chokepoint** | schedule + `scheduleService` (book/cancel/waitlist/capacity) | waitlist_entries (+ schedule extras) | **multi-doc transactions** (Mongo session → PG BEGIN/COMMIT); **partial-unique double-booking** `{class_id,start_time} WHERE scheduled` (already in 001); FIFO waitlist promotion; capacity/2-per-week guards | **high** |
| **E — Auth & audit (security)** | auth, user mutations, sessions/token, audit log | audit_log (TTL 730d), reconcile_report (TTL 30d), user security fields | `passwordChangedAt` session-kill; lockout counters; **AuditLog hash-chain + 730d TTL**; mfa/select:false fields never leak; soft-delete | **highest — port last** |
| **F — Legacy tail** | the 8 `*-repository.js` + ~45 direct-Mongoose files: audit-query, exports (attendance/evaluation), search, class, dashboard-stats (14-query bundle), user-mutations | (reuse wave B–E tables) | route legacy DB access through the now-dual repositories; the dashboard 14-aggregation batch → SQL; export `$lookup` soft-delete (DATA-009) | medium |

## 3. ETL + cutover (after B–F parity-green)

| Phase | Step | Detail |
|---|---|---|
| **G — Full-suite parity** | Run the WHOLE Jest suite with `DB_BACKEND=postgres` | add a CI lane (server-tests-pg) mirroring server-tests; fix every divergence; both lanes must stay green ([`phase-04`](phase-04-test-parity.md)) |
| **H — ETL script** | One-time `scripts/etl-mongo-to-pg.js` | stream each collection → PG rows (ObjectId→text PK, subdocs→jsonb, dates→timestamptz); **fidelity check** = row counts + per-collection checksums Mongo vs PG; rehearse on a Neon branch |
| **I — Add FK constraints** | post-ETL hardening migration | the FK *columns* are indexed already (001); add the actual `REFERENCES` after ETL cleans dangling refs; add CHECK/exclusion constraints (retire reconcile patrol checks) |
| **J — Cutover weekend** | freeze → final ETL → flip `DB_BACKEND=postgres` → smoke | maintenance window; freeze writes; run ETL on prod snapshot; verify checksums; flip env on Render; `/ready` + smoke; **30-day bake** with Mongo retained read-only ([`phase-05`](phase-05-cutover-decommission.md)) |
| **K — Decommission** | after 30d bake | drop Mongoose models + mongo-memory test harness; drop `DB_BACKEND` switch (PG-only); cancel Atlas; update all docs/specs |

## 4. Estimate & sequencing

- Wave B ~1–1.5wk · C ~1.5–2wk · D ~1wk (hard) · E ~1wk (careful) · F ~1wk ·
  G ~1wk · H–I ~3–5d · J cutover weekend + 30d bake · K ~2d.
- **~6–8 weeks of focused work** (single dev + agent), prod on Mongo throughout.
- Agent runs waves **back-to-back autonomously**, one PR per domain, reporting at
  each wave boundary — you approve this plan once, not each port.

## 5. Definition of Done (per wave) & guardrails

- ☑ Migration(s) for the cluster's tables (traps encoded: soft-delete, partial-
  unique, TTL, jsonb) applied on Neon.
- ☑ Every repo in the wave has a `.pg.js` behind the SAME interface + `DB_BACKEND`
  factory; Mongo side reuses the existing repository.
- ☑ Parity test suite (Mongo==PG on real Neon, incl. the wave's traps) green in the
  CI pg-parity lane.
- ☑ `DB_BACKEND=mongo` full suite + lint unchanged (prod behaviour identical).
- ☑ Tracker (`development-roadmap.md`) + this plan's wave row updated; commit.
- **Never** weaken a parity assertion to pass; **never** flip prod default off mongo
  before phase J; security layers (CSRF/rate-limit/authz/audit/soft-delete) preserved.

## 6. Unresolved questions

1. **Execution intent** — start running Wave B now autonomously (port marathon,
   high token use), or land this plan + the 2 open PRs (#187/#188) first?
2. **Cutover window** — which weekend; who owns the freeze comms to ~1000 users.
3. **ETL ownership** — agent writes `etl-mongo-to-pg.js`; owner provisions the prod
   Mongo snapshot + the paid Neon tier (PITR/backups) before phase J.
4. Tooling final call (Knex confirmed by P1 evidence) — assumed **Knex**, locked.
