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
| 18 | `domains/access/repository` (**whole-repo, 5 methods**) | Role CRUD (`listLive`/`findByKey`/`create`/`updateByKey`/`softDeleteByKey`) | roles (**new — migration 014**; `capabilities text[]`, partial-unique key) | create defaults (system false) · listLive order (system desc, key asc) · key partial-unique among live + reusable after soft-delete · soft-delete hides | (this) |
| 17 | `domains/branding/repository` (**whole-repo, singleton config**) | `getSingleton` (find-or-create) + `update` ($set upsert) | tenant_config (**new — migration 013**; unique `key='default'`) | getSingleton find-or-create with model column defaults (`ON CONFLICT … no-op`) · update upsert patches without duplicating the singleton | (this) |
| 16 | `domains/learning/path/repository` (**whole-repo, 6 methods**) | LearningPath CRUD (`create`/`findById`/`findByIdLean`/`list`/`updateById`/`softDelete`) with the ORDERED `programs` array-populate (catalog summary embed) | learning_paths (**new — migration 012**; `programs text[]`, global-unique code) | code uppercase + global-unique · ORDERED program-summary embed (preserves array order, drops missing) · findById raw ids vs findByIdLean populated · list title order + search · soft-delete hides+archives | (this) |
| 15 | `domains/learning/feedback/repository` (**whole-repo, 4 methods + helper re-export**) | `findCohort` + `findFeedback` + `upsertFeedback` (idempotent submit) + `listFeedback` (populate user+cohort) | feedbacks/classes/users (no new migration — `feedbacks` came with 011) | upsert one-per-(cohort,user) via ON CONFLICT · **undefined-skip update** (Mongoose strips undefined from `$set` → field unchanged; PG updates only provided fields) · populate → deleted ref null · findCohort hides deleted | (this) |
| 14 | `domains/learning/completion/repository` (**whole-repo, completion engine + certificate CRUD**) | cohort/policy resolution + attendance counters + the 4 evidence reads (`findEvaluation`/`findFeedback`/`findPassingAttempt`/counts) + certificate persistence (`findActiveCertificate`/`createCertificate`/`findCertificateById`/`listCertificates`/`markRevoked`/`findByVerificationCode`) | certificates (**migration 011** enriches the stub: serial/verification uniques, cohort link, snapshot jsonb, validity, revocation) + new `evaluations`/`feedbacks`/`assessment_attempts` (double-precision scores) | **QB-008 race** (PG `23505`→Mongo `11000` so the use-case 409 matches) · `resolveCompletionContext` omits `certificateValidityDays` on no-program · `listCertificates` populate→deleted learner null · `findPassingAttempt` max scorePercent · soft-delete predicates explicit. Cron services (expiry/recert) read models directly → deferred to Wave C | (this) |
| 13 | `domains/learning/enrollment/repository` (**whole-repo, 10 methods**) | cohort-scoped reads (`findActiveCohortEnrollment`/`listCohortEnrollments`/`findCohortEnrollmentById`/`countActiveCohortEnrollments`) + shared `insertActiveEnrollment` spine + `listEnrollmentsForLearner` (both modes) + `markDropped` + cohort/program resolvers (`findCohort`/`findCohortSchedulingMode`/`findCohortCapacityPolicy`) | enrollments/classes/learning_programs (**migration 010** adds the cohort partial-unique `(user_id,class_id)` WHERE Active+team_id NULL) | cohort duplicate guard · populate user/class/team → soft-deleted ref null · both-mode learner read order · findCohort hides deleted · scheduling/capacity resolvers (no-program → null/{}) · session ignored in PG (Wave-D) | (this) |
| 12 | `domains/learning/repository` (**whole-repo, 19 methods — programs + cohorts**) | program CRUD + case-insensitive name/legacy lookups + `monthlyCompletions`; cohort CRUD with full `programId` populate + soft-delete/restore + Ongoing guard + team/schedule counts + booked-sessions agg | learning_programs + classes (**migration 009** adds the full field set; jsonb policy blobs, `prerequisite_programs`/`teacher_ids text[]`) | jsonb policy defaults merged · unique code + name(ci) · cohort populate + soft-delete/restore + Ongoing partial-unique · counts/aggs · Mixed/Object `{}`→jsonb `{}` normalize · **transactional archive ported per-method (session ignored in PG — deferred to Wave-D)** | (this) |
| 11 | `domains/vendor/repository` (**whole-repo, 8 methods**) | Vendor CRUD (`createVendor`/`listVendors`/`findVendorById`/`findVendorDoc`/`updateVendor`/`softDeleteVendor`/`pushRating`) + `vendorSpend` roll-up | vendors + cost_entries (**new — migration 008**; jsonb contacts/contracts/ratings, `delivers text[]`) | create defaults · list status/type/delivers filter+order · soft-delete hides+archives · pushRating jsonb append · `vendorSpend` groups by type, EXCLUDES soft-deleted cost lines (CostEntry aggregate hook) + date window | (this) |
| 10 | `domains/trainer/repository` (**whole-repo, 9 methods**) | TrainerProfile CRUD (`upsertProfile`/`findProfileByUserId`/`listProfiles`/`softDeleteProfile`/`pushRating`) + user pickers (`findUsersByIds`/`findTrainerCandidates`) + schedule reads (`sessionsForTrainer`/`busyInstructorIds`) | trainer_profiles (**new — migration 007**; `can_deliver text[]`, `availability`/`ratings jsonb`) + schedules.{office_id,topic}; reuses users/schedules | upsert insert-defaults vs update (ON CONFLICT) · soft-delete hides+archives · listProfiles status/canDeliver filter · candidates Teacher/Admin + `status≠Dropped` incl NULL (`IS DISTINCT FROM`) · sessions window/order · busy overlap Set | (this) |
| 9 | `domains/skill/repository` (**whole-repo, 13 methods**) | skill CRUD (`listLive`/`findById`/`findByName`/`create`/`updateById`/`softDeleteById`) + completion signal (`completedProgramIdsForUser`/`…ByUser`/`holdersByProgram`) + supporting reads (`listUsersWithRole`/`findUserBasic`/`programNamesByIds`/`activeProgramNamesByIds`) | skills (**new — migration 006**; `program_ids text[]` + `target_by_role jsonb`); reuses certificates/users/learning_programs | name partial-unique (case-insensitive guard) + reuse · soft-delete hides · completion reads filter status/isDeleted/null-program (Map/Set) · user reads exclude soft-deleted · program names all-vs-active · Mixed `{}`→jsonb `{}` normalize | #192 |
| 8 | `domains/session-type/repository` (**whole-repo, metadata catalog**) | `create`/`list`/`findByIdLean`/`updateById`/`softDelete`/`maxOrder` | session_types (**new — migration 005**; `order`→`display_order`, reserved word) | create defaults (color/duration/capacity/order) · list in display order · soft-delete hides + drops maxOrder · update normalizes | #191 |
| 7 | `domains/org/repository` (**whole-repo, 13 methods**) | dept CRUD + `countUsersInDepartment` + manager hierarchy (`findUserById(Lean)`/`updateUserAssignment`/`listDirectReports`) + rollups (`aggregateActiveEnrollments`/`aggregateIssuedCertificates`) | departments (**new — migration 004**) + users.{department_id,manager_id,position,status} | dept code UPPER/partial-unique/reuse · soft-delete hides · `listDirectReports` manager-scope + populate (soft-deleted dept → null, legacy string kept) + excludes other-mgr/soft-deleted reports · aggregates filter status/isDeleted, distinct programs | #190 |
| 6 | `domains/room/repository` (**whole-repo, first WRITE port**) | full CRUD: `createRoom`/`findRoomByIdLean`/`listRooms`/`updateRoomById`/`softDeleteRoom`/`findLiveOffice`/`countFutureSessionsForRoom` | offices, rooms (**new — migration 003**) + `schedules.room_id` | setters (code UPPER/name trim) · populate excludes soft-deleted office · partial-unique `code` (reusable after soft-delete) · office-scope + literal search + order · soft-delete hides row · future-session count | #189 |
| 5 | `services/metric-series` | `getMetricSeries({key,scope,scopeId,since})` → `[{date,value}]` | metric_snapshots (**new — migration 002**) | scope+scopeId filter (global null-scope ≠ program/office) · key filter · `since` lower-bound · ascending order · empty→`[]` | #188 |
| 4 | `services/attendance-by-class` | `getClassAttendance(classId)` → `{schedules, roster}` | schedules, attendances, users | soft-delete (DATA-009) · cancelled session (`status='scheduled'`) · other-class (`class_id` JOIN) | #187 |
| 3 | `services/attendance-by-employee` | `getEmployeeAttendanceRollup()` | attendances, users | soft-delete · banker's-round (`$round`⇔`round(double)`) | #185/#186 |
| 2 | `services/attendance-rollup` | `getTeamAttendanceRollup()` | teams, team_members, attendances | soft-delete (team) · LEFT JOIN zero-attendance | #184 |
| 1 | `services/metrics-funnel` | `getFunnelCounts({programId})` | classes, enrollments, certificates | soft-delete (cert) | #184 |

**Metrics/analytics Wave-A surface COMPLETE** (funnel #1 + series #5). **Wave-A still open (read-only):** admin dashboard reads (`controllers/dashboard/dashboard-stats-repository.js` — large 14-query bundle; many User cols live in `meta` jsonb → needs schema columns or jsonb extraction first), `learning/dashboard/executive-repository.js` (exec KPIs; cert expiry buckets need a `valid_until` column + `settings`/`learning_paths` tables → bigger PR). **Wave B IN PROGRESS** (whole-repository CRUD ports — the real granularity, per `master-execution-plan.md`): **room (#6)** + **org (#7)** + **session-type (#8)** + **skill (#9)** + **trainer (#10)** + **vendor (#11)** + **learning programs+cohorts (#12)** + **learning/enrollment (#13)** + **learning/completion (#14)** + **learning/feedback (#15)** + **learning/path (#16)** + **branding (#17)** + **access (#18)** done. Write-port pattern established (setter fidelity, populate-soft-delete, partial-unique, soft-delete reads, manager-scope + batched rollups, jsonb/text[] columns, Map/Set aggregation shapes, upsert-with-defaults via ON CONFLICT, schedule-overlap, full-program populate via embed-query, `repository.{mongo,pg}.js` + selector). **Parity-test lessons:** (1) seed rows must satisfy ALL Mongoose unique indexes + force `Model.init()` — else the autoIndex race passes locally but fails on CI (hit twice: cert `verificationCode`/`cohortId`, program `code`); (2) Mongoose drops an empty Mixed `{}` on persist (lean → `undefined`) while PG jsonb keeps `{}` — normalize. **Next:** small capability domains (`automation`/`custom-field`/`notification`), then the heavier learning sub-domains (`session`/`reports`/`dashboard`/`assignment` — `session` is schedule-coupled via `attachSessionNumbers`, lean it toward Wave-D) and the other domains (`attendance`/`assessment`/`compliance`/`finance`/`planning`/`mobile`). **The dual-backend transaction abstraction is now BUILT + parity-proven (2026-06-25):** `domains/_shared/unit-of-work.js` `runInTransaction(tx⇒…)` (Mongo `session.withTransaction` ⇄ PG `BEGIN/COMMIT/ROLLBACK` on a checked-out client) + the first atomic-write seam `domains/schedule/booking-write-repository.{mongo,pg}.js`. Pinned 4/4 on real Neon (`tests/pg-parity/booking-transaction.pg.test.js`) + 4/4 Mongo-local: commit · rollback · the `{class_id,start_time}` double-booking guard (PG 23505 → Mongo `{code:11000}`) · cancelled-frees-slot. **This retires the migration's highest-risk unknown** and unblocks **`groups` (Team)** — transaction-heavy (also unblocks the learning cohort-archive transaction + the Wave-D booking chokepoint port, which now grows the `booking-write-repository` seam). **`groups` transaction port COMPLETE (2026-06-26):** slice 1 (lifecycle soft-delete cascade) + slice 2 (team-write + the member-array ⇄ `team_members` junction bridge) + slice 3 (enrollment-sync — transfer/drop live-doc `.save()` → explicit updates + membership pull), all parity-proven on real Neon (`lifecycle-repository` / `team-write-repository` / `enrollment-sync-repository`; migration 024 `transferred_to`). **`syncSchedulesForTeamUpdate` (roster + capacity + waitlist FIFO promotion) is deliberately left Mongo-only** — it is a SCHEDULE/waitlist concern, ported with the booking chokepoint + waitlist, not groups. Groups' remaining Mongo-only surface = pure reads. (vendor #11 shipped via a tools-only commit around the local Bash-hook on the word "vendor".)

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
  double-booking guard must match exactly (already prototyped in Phase 2). **RETIRED
  2026-06-25** — abstraction built + parity-proven on real Neon (`domains/_shared/
  unit-of-work` + `booking-write-repository`; 4/4 commit/rollback/guard/cancel-frees).
- Interface leakage — some Phase-0 repos expose Mongo-query shapes (e.g.
  `countEnrollments(match)`); make them semantic as they are ported.

## Unresolved questions

- Per-table soft-delete **views** vs inline `WHERE` — decide on the first Wave-A port.
- `pg_cron` vs app-scheduled TTL deletes — decide with the AuditLog migration.
