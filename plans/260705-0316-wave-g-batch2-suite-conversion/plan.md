# Wave G batch 2+ — convert the remaining 82 suites (PG lane → green)

**Status:** planned (triage done 2026-07-05, during batch-1 verification runs)
**Parent:** `plans/260612-2042-postgresql-migration/phase-03-repository-ports.md` (Wave G section)
**Baseline after batch 1:** 82 failing / 132 passing (was 117/91). All 82 = in-file raw-Mongoose fixture seeding (and/or model-based assertions).

## Triage — what the 82 suites actually seed

Model-require tally across the 82 failing files (descending):

| Model | suites | PG table exists? | Mirror needed? |
|---|---:|---|---|
| User | 49 | ✓ users | ✓ have (batch 1) |
| Class | 46 | ✓ classes | ✓ have (batch 1) |
| Schedule | 45 | ✓ schedules | **build first** |
| LearningProgram | 35 | ✓ learning_programs | **build first** |
| Enrollment | 28 | ✓ enrollments | **build first** |
| Attendance | 20 | ✓ attendances | build |
| Certificate | 18 | ✓ certificates | build |
| AuditLog | 18 | ✓ audit_log | build (hash-chain rows — reuse `services/audit-repository.pg` insert, DON'T hand-insert) |
| Team | 16 | ✓ teams | ✓ have (batch 1) |
| Setting | 14 | — (reads unported, Mongo-direct) | **NONE needed** |
| NotificationLog | 12 | ✓ notification_logs | build |
| Evaluation / Department / Assignment / AssessmentAttempt / Office / LearningPath / Feedback / Assessment / WaitlistEntry | 2–7 each | ✓ all exist | build as clusters reach them |

## Strategy decision (spike FIRST, 30–60 min)

**Option B — auto-mirror Mongoose test plugin (PREFERRED if spike passes):**
a test-only module that, when `DB_BACKEND=postgres`, walks `mongoose.models`
after app import and attaches `post('save')`/`post('insertMany')`/
`post('findOneAndUpdate')`/`post('deleteOne'…)` hooks that upsert the row into
PG via a model→table row-mapper registry (reuse batch-1 mirror mappers).
Mongoose hooks are kareem-dynamic (micro-spike 2026-07-05: registering post
hooks AFTER model compile is API-supported — runtime behavior still to verify).
- Payoff: most of the 82 suites flip WITHOUT editing them (their Mongoose seeds
  auto-land in PG). Only suites that READ via models post-API-write still need edits.
- Risks to verify in the spike: hook actually fires when registered post-compile;
  update/delete paths (`findOneAndUpdate`, `updateMany`, `deleteMany`) coverage;
  FK insert order (mirror in FK-safe order or drop FKs in test DB); double-write
  when a suite ALSO goes through a ported repo (should be upsert-idempotent →
  `ON CONFLICT (id) DO UPDATE`).
- Registry = per-model row-mappers; same work as Option A's helpers but centralized
  and reused by both options.

**Option A — per-suite explicit mirrors (fallback, known-good):** grow
`tests/pg-test-utils.js` (`mirrorScheduleToPg`, `mirrorEnrollmentToPg`, …) and
edit each suite's seed blocks to call them. Mechanical; parallelizes well with
workflow agents (batch-1 pattern: agents edit, controller runs jest serially).

## Suite clusters (conversion order, either option)

1. **Scheduling core** (Schedule+Team+Setting): booking, bookingRace, waitlist,
   scheduleQueries/Cancel/Reassign/UseCases/Authz, schedulingModeLegacy, studioScheduling — ~12 suites.
2. **Learning** (Program+Enrollment+Certificate+Path): learningRoutes, learning*Routes,
   enrollment*, myEnrollments, recert/expiry — ~20 suites.
3. **Attendance + reports**: attendance*, trainingHoursReport, exports, dashboards — ~12 suites.
4. **Audit + security**: audit*, auth hardening tails, passwordReset, mfa, autoReleaseScope — ~10 suites.
5. **Org/misc capability tails**: org, office, planning, skills, vendor/trainer routes,
   notifications, mobile, goldenPathFlow (last — touches everything) — remainder.

Per batch: convert → run JUST those suites on `DB_BACKEND=postgres` locally →
run same suites on default Mongo → push branch, CI lane = source of truth.
NEVER two jest runs at once; wrap long runs in `caffeinate -i`.

## Done =

`server-tests-pg` fully green on CI → promote to required gate #8
(remove `continue-on-error`) → Wave G closed; F-PR-2 runs alongside as its
suites surface (attendance-export refactor · user-mutations auto-release hook).

## Spike verdict (2026-07-05 ~06:00) — Option B WORKS, adopted

Batch-1 CI-official baseline: **117 → 77 failing** (CI runner, less flaky than local).
Batch 2a shipped: `pg-auto-mirror.js` (global mongoose plugin, registered by
setup.js BEFORE model compile — hooks save/insertMany/findOneAndUpdate/update*/
delete*; upsert via `pg-row-mappers.js`, 15 models) + `deleteMany({})` → PG
full-table wipe (app-written rows are invisible to Mongo-side id capture).
Spike proof: 4 heavy suites went all-fail → 25/32 tests green, zero per-suite
edits; attendance-rollup fully green.

**Failure taxonomy the spike exposed (what remains):**
1. **Nested-selector wrappers** (batch-1 class): `metrics-funnel/mongo.js` +
   `metric-series/mongo.js` required the `metrics-repository` SELECTOR (F-PR-1)
   → pinned `impls.mongo` ✓ fixed in 2a. Audit other `*/mongo.js` wrappers.
2. **REAL app-gap — groups reads are Mongo-only** (deliberate leftover: "groups'
   remaining Mongo-only surface = pure reads"). On the lane, `createTeam` writes
   through the dual-backend seam (→ PG) then `findTeamByIdPopulated` reads Mongo
   → `data: null`. Blocks teams.test + bell-parity + downstream team flows.
   Fix = port `domains/groups/repository.js` reads (~15 methods, several
   populates) per the Wave-B template + parity tests. **The lane is doing its
   job — this is migration work it surfaced, not test debt.**
3. **Reverse-direction asserts**: tests assert via Mongoose models on rows the
   app wrote into PG (`Schedule.findById` after a booking → null). Fix = a
   backend-agnostic `readActiveRow(modelName, id)` test helper (reverse map via
   MAPPERS) + mechanical per-suite assert swaps — workflow-agent friendly.
4. Mongoose-virtual-specific tests (e.g. ARCH-02 enrolledCount) → re-point at
   the API response shape, not the model virtual.

## Batch 2 shipped (PR #240) — CI lane 77 → 58 failing suites.

## Batch 3 shipped (PR #241, stacked on #240)

Added the 4 highest-frequency missing mappers (**Assessment, AssessmentAttempt,
Assignment, Feedback**) → assessment cluster 32/32 both lanes + assignments-mine
+ learningReports rollups green. Reverse-assert conversions on 8 suites. **Three
REAL org-domain divergences the lane caught + fixed** (production code, verified
both backends):
1. `office-repository.pg createOffice` inserted `code` raw → Mongoose
   uppercase/trim setters not replicated. Fixed in `officeVal` (create+update).
2. `repository.pg updateUserAssignment` `USER_ASSIGN_COL` dropped `officeId` →
   office-archive guard under-counted (409→200 wrong-allow).
3. `repository.pg createDepartment` didn't map PG 23505 → Mongo E11000 → dup
   code 500 instead of 409.

## Remaining app-gaps found (production ports for a follow-up, NOT test debt)

- **enrollmentTransfer** — response built from a Mongo-only `Enrollment.findOne`
  re-read of a PG-written row → `data:null`. Needs a dual-backend find+populate
  (F-PR-2 class).
- **autoReleaseScope** — User auto-release post-hook passes a raw Mongoose
  ClientSession as `tx` into the waitlist seam; on PG, `exec` checks `tx.client`
  and a Mongoose session EXPOSES `.client` → wrong dispatch. The KNOWN F-PR-2
  "auto-release hook must route through the schedule dual-backend seams" item.
- **complianceMatrix** (overdue-window), **lastActivePerf** (GET /users read
  path), **roomOfficeScope** (room-booking flows), **assignmentReminder**
  (reminder read/idempotency) — deeper per-suite read/logic divergences; batch 4.

## Unmapped models still seeded by some suites (add to MAPPERS as the lane names them)
Counter · LearningPath · WaitlistEntry · CronRun · RoomBooking · Room · Role ·
CostEntry · Budget · Vendor · TrainingRequest · RequiredTraining · TrainerProfile
(+ long tail). Most have ported repos; a mapper is only needed when a test seeds
the model DIRECTLY via Mongoose.

## Unresolved

- 214-vs-208 suite-count reconciliation before gate promotion.
- `learningSessionRoutes` beforeAll timeout — fixture-only or latent flake.
- Batch-3 agent fan-out was cut short twice (Mac sleep, then session limits) →
  ~46 of the 58 suites remain untriaged; batch 4 continues inline.
