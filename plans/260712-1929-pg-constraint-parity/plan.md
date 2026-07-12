# PG constraint parity — post-Wave-K follow-up

**Status:** 🔴 not started (execute AFTER Wave K D2d completes)
**Trigger:** source-code FK/CHECK audit 2026-07-12 (see `[[project_pg_fk_check_036_ci_gap]]`).
**Owner-gated bits:** the NOT NULL / semantic-consistency work needs a prod-data audit (no Neon query access yet) + HR/product lifecycle confirmation.

## Why
Prod (Neon) runs migrations 001–**036** (30 FK + 35 CHECK). CI + local tests run
`knex migrate:latest` → **001–035 only** (036 lives in `db/pg/migrations-cutover/`,
outside the knexfile chain). So **CI schema ≠ prod schema**: an integration test can
be green in CI yet violate an FK on prod, and delete-ordering / constraint bugs are
invisible to the gate. This is the top finding — not "missing FKs" (the core spine is
well-covered), but that the existing FKs/CHECKs are **untested in CI**.

Audit confirmed accurate against source. Doc typo already fixed (roadmap "323 CHECK" → 35).

## Phases

### Phase 1 (P1) — close the CI≠prod schema gap  ← highest value
- Make CI run **001–036**. Options: (a) move `036_*.js` into `migrations/` (knex records by
  filename — the copy-then-migrate is the whole apply); or (b) point a CI step at
  `migrations-cutover/` too. Prefer (a) once test cleanup is FK-safe.
- **Make test cleanup FK-safe** — the blocker. Current per-test `afterEach`
  `deleteActiveRowsWhere('X', {})` = `DELETE FROM x`, which violates NO ACTION FKs if a
  child still references the row (Wave K D2d is *adding* these per-table deletes). Fix by
  either: switch afterEach to one `TRUNCATE <all> RESTART IDENTITY CASCADE` (the file-level
  `resetPgDatabase` already does this — FK-safe), OR order deletes child-before-parent, OR
  transaction-per-test rollback. **Recommend TRUNCATE-CASCADE** (simplest, already proven).
- Add a **schema-assertion test**: query `pg_constraint` and assert the 30 FK + 35 CHECK
  exist by name (`fk_*` / `chk_*`) — so a fresh env / dropped constraint fails loudly.

### Phase 2 (P2) — migration 037: the cheap high-value constraints
- **7 assessment FKs** (deferred by 036 EOF): `assessments.{cohort_id,program_id}`,
  `assessment_attempts.{assessment_id,user_id,cohort_id}`, `assessment_questions.{program_id,cohort_id}`.
- **Room/Office FKs**: `rooms.office_id`, `schedules.office_id`.
- **Numeric/temporal CHECKs** (none exist today; Zod only guards HTTP, not scripts/repos):
  score 0–10, rating 1–5, pct 0–100, `score ≤ max_score`, points/score ≥ 0, `room.seats > 0`,
  `schedule.capacity > 0`, `end_time > start_time`, `certificate.valid_until ≥ valid_from`,
  compliance `due_within_days > 0`. **Prioritise score/rating/time** (bad data flows into
  completion + reports).
- Pre-req: audit existing prod rows for violations before adding (needs Neon access).

### Phase 3 (P2, owner/business decision) — semantics & NOT NULL
- Certificate `user_id/program_id/cohort_id/status` NOT NULL (audit data first; maybe new-rows-only).
- Enrollment cross-column: `class_id` = `team.class_id`; team-mode ⇒ cohort present; direct ⇒ no team_id;
  `transferred_to` only when `status='Transferred'`. **Needs HR/product lifecycle sign-off** (some
  states are intentional, e.g. team created before cohort assignment).
- Denormalised `class_id` consistency (`waitlist_entries`, `room_bookings`): drop the derived column
  + join via `schedule_id`, OR composite FK `(schedule_id, class_id) → schedules(id, class_id)`.
- Assessment derived-column consistency (`assessment.program_id` = its cohort's program;
  `attempt.cohort_id` = assessment's cohort): composite FK or trigger, or don't store derived.

### Not doing (matches audit)
Array/polymorphic references (`teacher_ids`, `enrolled_users`, `target_id`, JSON items/programs) —
data-model debt, not worth normalising for purity at current scale. Actor stamps
(`created_by`/`issued_by`/…), `audit_log.actor_id`, notification refs — fail-soft by design, correct.

## Success criteria
- CI applies 001–036; a schema-assertion test guards all 30 FK + 35 CHECK.
- Test suite green with FKs live (no delete-ordering breakage).
- (Phase 2) mig 037 merged; assessment + room/office FK + priority range/time CHECKs live, prod-audited.

## Open questions
- Prod-data audit (can we get a read-only Neon query path for the pre-add violation scan?).
- Enrollment lifecycle: which state combinations are legal? (HR/product.)
- Certificate NOT NULL: apply to all rows or new/undeleted only?
