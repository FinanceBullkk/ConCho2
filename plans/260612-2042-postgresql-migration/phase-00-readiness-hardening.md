# Phase 0 — Readiness Hardening (no PostgreSQL)

> Parent: [`plan.md`](plan.md) · ADR: `docs/decisions/mongo-now-postgres-later.md`
> Status: `in progress` · Trigger: **NOW** (runs alongside normal work) ·
> Created: 2026-06-17 · Owner: anhha

## Goal

Make a future Mongo→Postgres port **cheap and mechanical** without writing a
single line of PostgreSQL. Two levers only:

1. **Shrink Mongo coupling** — every data access goes through a `repository.js`,
   so the eventual port swaps repository internals, not business logic.
2. **Document the Mongo-specific features** that have NO 1:1 Postgres analog, with
   the chosen Postgres equivalent — so Phase 3 is lookup, not research.

**Hard boundary:** zero `pg`/Knex/Prisma dependency, zero schema, zero dual-write.
Anything touching an actual Postgres connection is Phase 1+ (gated). This phase is
pure refactor + documentation that *also* improves the Mongo codebase today.

## Why this is safe to do now (vs. the gate)

The ADR gate blocks Phases 1–5 until post-launch / demonstrated pain. Phase 0 is
exempt because none of it is Postgres-specific: tighter repository boundaries and
a feature-equivalence doc are good hygiene regardless of whether the migration
ever happens. We therefore prioritise the **zero-risk** items and treat the
load-bearing refactors (auth, scheduleService) as *optional* until the gate opens.

---

## Readiness assessment (audited 2026-06-17)

Most data access is already clean: **all 8 `domains/*` go through
`repository.js`** (model consolidation closed 2026-06-15 for the last 3 —
schedule/attendance/groups). The remaining coupling is concentrated and known.

### WS-A — Legacy direct-Mongoose surface (the repository-boundary backlog)

Files that still `require('../models/...')` and call Mongoose directly *outside* a
repository (excludes models, scripts, tests — those legitimately touch models):

| Area | Files | Risk | Notes |
|------|-------|------|-------|
| Dashboard | `controllers/dashboard/dashboard-stats.js` (**10 aggregations**), `dashboard-alerts.js` | Med | Heaviest aggregation cluster; pairs with WS-B aggregation mapping |
| Class (legacy) | `controllers/class/class-mutations.js`, `class-queries.js` (aggregate) | Med | Not yet a domain; `Class` is the Cohort spine |
| User (legacy) | `controllers/user/user-mutations.js` | Med | Touches `User.pre('save')` password hook |
| Auth | `controllers/auth/{auth-session,auth-admin,auth-mfa,auth-password-reset}.js`, `services/auth/auth-tokens.js`, `middleware/auth.js` | **High** | Load-bearing security path — defer unless gate opens |
| Reconcile | `controllers/reconcileController.js`, `services/reconcile/{schedule,team,enrollment}-checks.js`, `healers.js` | Med | Reads across collections by design (drift patrol) |
| Booking | `services/scheduleService.js` | **High** | Transaction chokepoint — the plan's #1 risk; defer |
| Search | `services/searchService.js` | Low | Self-contained read |
| Metrics/analytics | `services/metricSnapshotService.js`, `analyticsSeriesService.js` | Low-Med | Nightly snapshot writers |
| Push | `services/pushService.js` | Low | Small, isolated |
| Export | `services/export/{attendance,evaluation}-export.js` (aggregate) | Low-Med | Read-only ETL-ish |
| Misc | `lib/branding.js`, `lib/cronMonitor.js`, `routes/auditRoutes.js` | Low | Tiny reads |

> Direction: when a legacy area is touched anyway, extract its data access into a
> `repository.js` (or fold the area into its `domains/<x>/` per the migration
> convention) rather than growing the legacy file. Don't refactor the High-risk
> auth/booking paths *speculatively* — they carry the most regression risk for the
> least Phase-0 value while the gate is closed.

### WS-B — Mongo-specific features → Postgres equivalents (documentation)

These have no Mongoose-portable shim; each needs a deliberate Postgres design.
Captured here so Phase 3 implements, not researches.

| Mongo feature | Where (audited) | Postgres equivalent (proposed, confirm in P1) |
|---|---|---|
| **TTL index** `expireAfterSeconds` | `AuditLog` (730d), `NotificationLog` (180d), `ReconcileReport` (30d), `MetricSnapshot`, `TokenBlocklist` (expire-at) | `pg_cron` nightly `DELETE WHERE created_at < now() - interval` (or partitioned drop). No native TTL. |
| **Partial unique index** `partialFilterExpression` | ~16 models — soft-delete-aware uniqueness (`User.email`, `Schedule {classId,startTime} status:scheduled`, `Certificate`, `Enrollment` ×2, `Role`, `Skill`, `Office`, `Department`, `Room`, `WaitlistEntry`, `Class`, `AutomationRule`, `CustomFieldDefinition`, `Assignment`, `AuditLog.seq`) | `CREATE UNIQUE INDEX ... WHERE <predicate>` — Postgres partial indexes map almost 1:1. The Schedule double-booking guard can also become an **exclusion constraint**. |
| **Soft-delete `pre('aggregate')` hooks** | `User`, `Class`, `Team`, `Evaluation`, `CostEntry`, `TrainingRequest` (auto-inject `isDeleted:false`) | No hook layer in SQL → soft-delete predicate must be **explicit in every query** (or a `WHERE is_deleted=false` view per table). Audit query discipline before porting. |
| **`pre('validate'/'save'/'findOneAndUpdate')` hooks** | `User` (password hash), `Schedule` (validate), `Assignment` (single-target) | Move invariants into the repository/use-case layer or DB `CHECK`/triggers. Password hashing already belongs in app code. |
| **Aggregation pipelines** | 24 files (dashboards heaviest) | Rewrite as SQL `GROUP BY`/CTEs/window fns. The 14-aggregation dashboard batch is the largest single rewrite. |
| **Multi-doc transactions** (sessions) | `scheduleService` booking, admin-create, soft-delete cascade | Native Postgres transactions (simpler than Mongo) — but the booking chokepoint port is the #1 risk item. |
| **ObjectId PKs** | every collection | Keep Mongo hex as `text` PK on migrated rows; `uuid` for new rows (per plan strategy). |
| **`express-mongo-sanitize`** | global middleware | Irrelevant under parameterised SQL — drop at cutover. |

---

## Prioritised backlog (lowest risk first)

| # | Task | Stream | Type | Risk | Worth doing pre-gate? |
|---|------|--------|------|------|----------------------|
| 0.1 | This doc — feature inventory + mapping | WS-B | docs | none | ✅ done |
| 0.2 | ADR-style "soft-delete query discipline" note + grep guard for aggregations missing `isDeleted` | WS-B | docs | none | ✅ yes |
| 0.3 | Extract `searchService` model access → `repository` | WS-A | refactor | Low | ✅ **done 2026-06-17** (`services/search/search-repository.js`) |
| 0.4 | Extract `lib/branding.js` + `routes/auditRoutes.js` reads → repository | WS-A | refactor | Low | ✅ **done 2026-06-17** (branding reuses `domains/branding/repository`; new `services/audit/audit-query-repository.js`) |
| 0.5 | Extract `services/export/*` aggregations → repository | WS-A | refactor | Low-Med | ✅ **done 2026-06-17** (new `attendance-export-repository.js` + `evaluation-export-repository.js`; pipeline builders kept) |
| 0.6 | Repository for `metricSnapshotService` + `analyticsSeriesService` | WS-A | refactor | Low-Med | ◻ optional |
| 0.7 | Dashboard aggregations → `repository` (10+ pipelines) | WS-A | refactor | Med | ✅ **done 2026-06-17** (`controllers/dashboard/dashboard-stats-repository.js`; added the endpoint's first integration test) |
| 0.8 | Class/User legacy → repository (or fold into domains) | WS-A | refactor | Med | 🟡 **user done 2026-06-17** (`controllers/user/user-mutations-repository.js`; security logic kept in controller); **class part pending** |
| 0.9 | Auth + scheduleService boundary | WS-A | refactor | **High** | ⛔ defer to gate-open |

> **Phase 0 paused 2026-06-17** after the low/med-risk slices (0.3–0.7 + 0.8-user)
> to run a **quality-consolidation round** first (owner direction): green the test
> suites, stabilise the server harness, cut lint warnings, clean `npm audit`,
> smoke-test the core flow. Resume 0.8-class / 0.9 + the gated Phases 1+ after.

## Success criteria (Phase 0 "ready")

- WS-B mapping covers every Mongo-specific feature in `models/` (audited list above).
- No NEW direct-Mongoose call added outside a `repository.js` (enforced by review).
- Low/Med-risk WS-A items extracted; High-risk auth/booking documented but untouched.
- All 7 CI gates stay green after each refactor slice; behaviour unchanged (pure refactor → no spec change).

## Out of scope (explicitly)

- Any `pg`/Knex/Prisma code, schema, connection, or dependency (Phase 1+).
- Refactoring auth/scheduleService speculatively while the gate is closed.
- Data ETL, dual-write, cutover (Phases 2–5).

## Unresolved questions

1. How far to take WS-A pre-gate? Recommendation: do **0.2–0.5** (zero/low risk,
   real hygiene wins) now; hold 0.6–0.9 until the gate opens so we don't churn
   load-bearing code for a migration that may stay gated.
2. Should the soft-delete predicate become per-table SQL **views** or inline
   `WHERE` everywhere? (Decide in P1 with prototype evidence.)
3. Confirm `MetricSnapshot` retention window (RETENTION_DAYS value) for the TTL row.
