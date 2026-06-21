# Phase 3 — Repository Ports (domain by domain)

> Parent: [`plan.md`](plan.md) · Trigger: Phase 2 foundation complete (2026-06-21) ·
> Host: Neon · Tooling: Knex · Owner: anhha · Est: ~4–6 weeks

## Goal

Port every repository to dual-backend behind its existing interface, CI-proven
against Postgres, **while production keeps running on MongoDB** (`DB_BACKEND=mongo`
default). No behaviour change; each port is a pure internals swap (Mongo ↔ SQL)
validated by a parity test. The data cuts over once, later (Phase 5).

## Step 3.0 — merge the foundation to main (first real PR)

The Phase-1/2 work lives on `spike/pg-prototype`. The first Phase-3 PR brings the
**inert** foundation to main:
- `knex` + `pg` as **real deps** (regenerate the lockfile in the same PR — the
  `npm ci` + audit gates must stay green).
- `db/pg/` (knexfile + `001_core_training_schema`), `config/pg.js`,
  `config/db-backend.js`, `services/metrics-funnel/` (the reference port).
- A **parity test** under `tests/` that runs the reference funnel through BOTH
  impls on identical data (the `pg-reference-repo-proof` logic, as a Jest test).
- Default `DB_BACKEND=mongo` → the running app is 100% unchanged.
- Keep the throwaway dev-tools scripts (benchmark/parity) — they are local-only.

> This is the moment the migration stops being a spike. After it merges, every
> subsequent port is a small PR following the same template.

## Port template (repeat per domain)

1. Define/confirm the **semantic** repository interface (not Mongo-query-shaped).
2. Add a `*.pg.js` impl + a factory selecting by `DB_BACKEND` (like
   `services/metrics-funnel/`). Reuse the Phase-0 Mongo repository for the `mongo`
   side.
3. Add a Knex migration for that domain's tables (+ trap-equivalents: soft-delete
   predicates, partial unique indexes, any TTL/exclusion constraints).
4. Add a **parity Jest test**: same data → identical results via Mongo and PG.
5. Tests green on both backends; `DB_BACKEND=mongo` default unchanged. Small PR.

## Suggested order (low-risk → high-risk)

| Wave | Domains | Why this order |
|------|---------|----------------|
| A | metrics/analytics (**reference done**), reports, dashboard reads | read-only, no writes — safest first |
| B | learning (programs/cohorts), org, room, session-type, skill, vendor, trainer | CRUD, few cross-doc invariants |
| C | groups, enrollment, attendance, compliance, finance, planning | writes + some transactions |
| D | schedule / `scheduleService` booking chokepoint | **highest risk** — multi-doc transactions, double-booking guard, waitlists |
| E | auth + session/token paths | load-bearing security — port last, most scrutiny |

## Ports landed (running log — newest first)

| # | Service | Interface | Tables | Traps proven | PR |
|---|---------|-----------|--------|--------------|----|
| 8 | `domains/session-type/repository` (**whole-repo, metadata catalog**) | `create`/`list`/`findByIdLean`/`updateById`/`softDelete`/`maxOrder` | session_types (**new — migration 005**; `order`→`display_order`, reserved word) | create defaults (color/duration/capacity/order) · list in display order · soft-delete hides + drops maxOrder · update normalizes | (this) |
| 7 | `domains/org/repository` (**whole-repo, 13 methods**) | dept CRUD + `countUsersInDepartment` + manager hierarchy (`findUserById(Lean)`/`updateUserAssignment`/`listDirectReports`) + rollups (`aggregateActiveEnrollments`/`aggregateIssuedCertificates`) | departments (**new — migration 004**) + users.{department_id,manager_id,position,status} | dept code UPPER/partial-unique/reuse · soft-delete hides · `listDirectReports` manager-scope + populate (soft-deleted dept → null, legacy string kept) + excludes other-mgr/soft-deleted reports · aggregates filter status/isDeleted, distinct programs | #190 |
| 6 | `domains/room/repository` (**whole-repo, first WRITE port**) | full CRUD: `createRoom`/`findRoomByIdLean`/`listRooms`/`updateRoomById`/`softDeleteRoom`/`findLiveOffice`/`countFutureSessionsForRoom` | offices, rooms (**new — migration 003**) + `schedules.room_id` | setters (code UPPER/name trim) · populate excludes soft-deleted office · partial-unique `code` (reusable after soft-delete) · office-scope + literal search + order · soft-delete hides row · future-session count | #189 |
| 5 | `services/metric-series` | `getMetricSeries({key,scope,scopeId,since})` → `[{date,value}]` | metric_snapshots (**new — migration 002**) | scope+scopeId filter (global null-scope ≠ program/office) · key filter · `since` lower-bound · ascending order · empty→`[]` | #188 |
| 4 | `services/attendance-by-class` | `getClassAttendance(classId)` → `{schedules, roster}` | schedules, attendances, users | soft-delete (DATA-009) · cancelled session (`status='scheduled'`) · other-class (`class_id` JOIN) | #187 |
| 3 | `services/attendance-by-employee` | `getEmployeeAttendanceRollup()` | attendances, users | soft-delete · banker's-round (`$round`⇔`round(double)`) | #185/#186 |
| 2 | `services/attendance-rollup` | `getTeamAttendanceRollup()` | teams, team_members, attendances | soft-delete (team) · LEFT JOIN zero-attendance | #184 |
| 1 | `services/metrics-funnel` | `getFunnelCounts({programId})` | classes, enrollments, certificates | soft-delete (cert) | #184 |

**Metrics/analytics Wave-A surface COMPLETE** (funnel #1 + series #5). **Wave-A still open (read-only):** admin dashboard reads (`controllers/dashboard/dashboard-stats-repository.js` — large 14-query bundle; many User cols live in `meta` jsonb → needs schema columns or jsonb extraction first), `learning/dashboard/executive-repository.js` (exec KPIs; cert expiry buckets need a `valid_until` column + `settings`/`learning_paths` tables → bigger PR). **Wave B IN PROGRESS** (whole-repository CRUD ports — the real granularity, per `master-execution-plan.md`): **room (#6)** + **org (#7)** + **session-type (#8)** done. Write-port pattern established (setter fidelity, populate-soft-delete, partial-unique, soft-delete reads, manager-scope + batched rollups, `repository.{mongo,pg}.js` + selector). **Parity-test lesson:** seed rows must satisfy ALL Mongoose unique indexes + force `Model.init()` — else the autoIndex race passes locally but fails on CI. **Next Wave B:** `skill` (similar catalog), then vendor/trainer/groups, then `learning` (biggest — programs/cohorts/sessions/enrollment/completion).

## Success criteria

- Every repository has a PG impl behind the same interface + a green parity test.
- Full server suite passes with `DB_BACKEND=postgres` (Phase 4 overlaps here).
- `DB_BACKEND=mongo` (prod default) behaviour identical throughout.

## Out of scope

- Data ETL + cutover (Phase 5). No dual-write — code switches, data cuts once.
- Dropping Mongoose models — kept until the Phase 5 cutover bakes.

## Risks

- Lockfile/dep gate on the 3.0 PR — regenerate with the CI npm version.
- Booking chokepoint (Wave D) — transaction semantics + the partial-unique
  double-booking guard must match exactly (already prototyped in Phase 2).
- Interface leakage — some Phase-0 repos expose Mongo-query shapes (e.g.
  `countEnrollments(match)`); make them semantic as they are ported.

## Unresolved questions

- Per-table soft-delete **views** vs inline `WHERE` — decide on the first Wave-A port.
- `pg_cron` vs app-scheduled TTL deletes — decide with the AuditLog migration.
