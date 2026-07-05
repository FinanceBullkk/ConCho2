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

## Unresolved

- Option B spike verdict (hook-after-compile runtime + update/delete fidelity).
- 214-vs-208 suite-count reconciliation before gate promotion.
- `learningSessionRoutes` beforeAll timeout — fixture-only or latent flake.
