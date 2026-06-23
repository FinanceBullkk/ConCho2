# PG Dual-Backend Port — Remaining Marathon Sequencing & Trap Catalog

> Source: parallel scouting workflow (13 read-only scope agents + synthesis, 2026-06-23).
> Migrations 001–020 shipped (latest = 020). 13 repos remain unported: **8 port-now**
> (no transactions), **5 defer** (transaction-heavy). Each port = `repository.js` selector
> + `repository.mongo.js` + `repository.pg.js` + Knex migration (if new tables) + a
> `tests/pg-parity/<domain>-repository.pg.test.js` (Mongo==PG on real Neon) + a CI-safe
> selector test. `DB_BACKEND=mongo` stays the prod default throughout.

## 1. Port-now set — low→high risk (execute SEQUENTIALLY; migrations serialize)

| # | Repo | Methods | Risk | New migration |
|---|---|---|---|---|
| 1 | `org/office-repository.js` | 6 | lowest | **none** — offices(003)+users.office_id(018)+`uq_offices_code_active`(003) all exist |
| 2 | `assessment/question-bank-repository.js` | 5 | low | **021** `assessment_questions` (arrays→text[], explicit soft-delete, idx (type,is_deleted),(tags)) |
| 3 | `learning/reports/presets-repository.js` | 5 | low | **022** `report_presets` (filters→jsonb, program_ids text[]) |
| 4 | `learning/dashboard/executive-repository.js` | 9 | low | **none** (settings 016, paths 012, costs 008 exist) |
| 5 | `learning/dashboard/repository.js` | 11 | low | **none** (all tables exist; mechanical agg→SQL) |
| 6 | `learning/assignment/repository.js` | 12 | low | **023** `assignments` (target_type/program_id XOR path_id, source_certificate_id partial-unique WHERE NOT NULL) |
| 7 | `attendance/repository.js` | 14 | medium | **024** `attendances` indexes (unique (user_id,schedule_id), (user_id,status), (created_at,user_id), sparse export_batch_id) |
| 8 | `learning/reports/repository.js` | 18 | medium | reuses **022**+**023**; verify schedule enrichment cols present |
| + | `assessment/repository.js` | 18 | medium | `assessments` table — ships AFTER #2 (references assessment_questions) |

**Order rationale:** 1–3 = trivial confidence-builders introducing the 2 simplest new tables. 4–5 = zero-new-table read ports (de-risk the agg→SQL pattern reused by reports). 6 builds `assignments` (consumed by 8). 7 = most index/marshalling work, no txn. 8 last (widest read surface, **depends on `assignments` from #6**).

## 2. DEFER set — blocked on a dual-backend transaction abstraction

| Repo | Methods | Blocker |
|---|---|---|
| `learning/session/repository.js` | 9 | reads clean, but use-cases call `scheduleService` (4× `startSession.withTransaction`) + `Team.syncSchedulesForTeamUpdate(session)` |
| `groups/repository.js` | 26 | `deleteTeam`/`updateTeam` txns; `saveEnrollment(doc,session)` live-doc `.save()`; `findTeamDocById` non-lean for caller `.save()`; needs `enrollments.transferred_to` |
| `planning/repository.js` | 15 | `scheduleItem`: createCohortClass + plan `.save({session})` + markRequestsPlanned + finance.createBudget(session); needs `training_requests`+`training_plans` |
| `schedule/repository.js` | 39 | TWO `startSession` blocks across Schedule+WaitlistEntry+RoomBooking; room-lock ledger atomicity; FIFO waitlist promotion in-txn; needs `waitlist_entries`+`room_bookings` |

**Tail order once abstraction exists:** planning (smallest linear txn) → groups → learning/session → schedule.

### Transaction-abstraction spec (build before the tail)
1. **`withTx(fn)`** — mongo→`session.withTransaction`; pg→`BEGIN…COMMIT/ROLLBACK` on a checked-out pooled client; returns a backend-neutral `tx` handle.
2. **`tx` threads through every repo write** — replace the `session` param; mongo binds `{session: tx.mongoSession}`, pg runs on `tx.pgClient` (one connection/snapshot).
3. **Live-doc semantics** — replace mongo mutate-then-`.save({session})` with `findForUpdate(id, tx)` (`SELECT … FOR UPDATE`) + explicit `updateRow(id, patch, tx)`; no ORM dirty-tracking on PG.
4. **bulkWrite translation** — `$pull/$push` on `enrolled_users text[]` → `array_remove/array_append` batched in `tx`.
5. **Error-code unification** — mongo `11000` ↔ pg `23505` → one app error so partial-unique guards roll back identically.
6. **Rollback parity harness** — force mid-txn failure on both backends; assert zero partial writes.

## 3. Trap catalog (raw-SQL replication) — the recurring ones

- **T1 soft-delete pre-hooks** (find/findOne/count/distinct auto-filter `isDeleted`) → explicit `WHERE is_deleted=false` on EVERY read.
- **T2 `pre('aggregate')`** auto-prepends `{$match:{isDeleted:{$ne:true}}}` → inject `is_deleted=false` before GROUP BY.
- **T3 populate/`$lookup` → LEFT JOIN … AND joined.is_deleted=false** (deleted refs collapse to NULL, matching lean()).
- **T4 `select:false`** (User password/mfa*/isDeleted/_softDeletedEmail; Office/Dept isDeleted/deletedAt) → default SELECT excludes them.
- **T5 subdoc → jsonb** (attendance.meta, externalTrainer, assessment items/answers, materials[], report filters, training target) — preserve exact shape incl. `_id:false`.
- **T6 array ref → text[]** (enrolled_users, session_instructor_ids, teacher_ids, qbank arrays, assignment user/dept ids, preset programIds, path programs) — `= ANY(col)` / `unnest()`.
- **T7 partial-unique indexes** — `CREATE UNIQUE INDEX … WHERE <pred>`; source_certificate_id uses `WHERE col IS NOT NULL`.
- **T8 bulkWrite upsert → `ON CONFLICT (...) DO UPDATE`**.
- **T9 lastActiveAt `GREATEST(last_active_at,$1)`** (never moves backward).
- **T11 endTime>startTime `pre('validate')` → PG `CHECK`.**
- **T12 virtuals computed in SELECT** (`cardinality(enrolled_users)`, AVG/CASE) — not stored.
- **T13 `11000`→`23505` dup-key mapping** (same user-facing message).
- **T14 aggregation translation** ($group/$sum/$avg/$cond/$dateToString → GROUP BY/SUM/AVG/CASE/`to_char`); match output `_id`/count key names.
- **T15 `ATTENDED_STATUSES=['P','L']`** → `WHERE status IN ('P','L')`.
- **T16 NO soft-delete on Attendance; NO hook on Schedule.aggregate** — do NOT add `is_deleted` there (mirror Mongo including all rows).
- **T17 status-lifecycle not soft-delete** — LearningProgram `status='archived'`, Enrollment status enum → never add `is_deleted` to programs/enrollments.
- **T18 raw `collection.updateOne()` bypasses hooks** (markTeamDeleted/Restored) — plain UPDATE, no soft-delete predicate.
- **T20 AssessmentAttempt.cohortId denormalized** — keep in sync on attempt create.
- **T22 Feedback upsert-on-resubmit** {cohortId,userId} → `ON CONFLICT … DO UPDATE`; test the update path.

## 4. Cross-cutting tables (build ONCE)

- **`assignments`** — needed by learning/assignment (#6) AND learning/reports (#8); create in 023, reports reuses.
- **`report_presets`** — presets-repo (#3) AND reports (#8); single migration 022.
- **`assessment_questions`** — question-bank (#2) AND assessment domain; create once in 021.
- **Schedule enrichment columns** (room_id/office_id/topic/vendor_id/external_trainer/capacity/session_type_id/materials/links/cancellation*) — partly present (001/003/007); **audit before reports/schedule ports**, add missing in the schedule-port migration.
- **`enrollments.transferred_to`** — groups only (deferred); add in groups-port migration.

## 5. Unresolved questions

1. `assessment/repository.js` (18 methods, needs `assessments` table) — ship same wave as question-bank (021) or a follow-up? Assumed: qbank first (021), assessment domain after.
2. When the deferred tail unblocks, do planning's label-lookups (`findProgramsByIds`/`findDepartmentsByIds`/`findSkillsByIds`) read PG via the ported domains' `repo.impls.pg`, or stay Mongo-only at the use-case layer? Decide before starting the tail.
3. `schedule` 39-method split — give WaitlistEntry/RoomBooking their own sub-domain repos (cleaner) or fold into `schedule/repository.pg.js`? Affects the 4 new tables' migration structure.

## Resolved (during this session)
- `offices.code` partial-unique → **already in migration 003** (`uq_offices_code_active`) → office port needs no migration.
- Existing `attendance-*.pg.test.js` cover the Wave-A `analyticsByTeam` slice (not `attendance/repository.js`) → no conflict when attendance ports.
