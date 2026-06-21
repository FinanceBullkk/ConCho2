# Soft-delete-in-aggregation audit — TMS v2

Date: 2026-06-21 · Trigger: expert-panel flagged "soft-delete `pre('aggregate')`
hooks don't fire inside `$lookup` → aggregations/reports may leak soft-deleted
records." Scope: every `.aggregate()` + `$lookup` in server code (read-only audit
+ targeted fix). Method: code-verified.

## TL;DR — mostly already protected; ONE real leak fixed
The codebase already handles this class of bug (the **DATA-009** audit added
guarded pipeline-form `$lookup`s in the hot paths). The panel's alarm was largely
already-addressed. The audit found exactly **one** remaining leak, now fixed +
regression-tested.

## How soft-delete + aggregation interact here
- Mongoose `pre('find')` / `pre('aggregate')` hooks auto-inject `isDeleted: {$ne:true}`.
- BUT those hooks do **not** fire inside a `$lookup` sub-pipeline, nor on a model
  that lacks the `pre('aggregate')` hook.
- Soft-deletable models: **28** carry `isDeleted`. Only **6** have the
  `pre('aggregate')` hook (Class, CostEntry, Evaluation, Team, TrainingRequest, User).

## Findings

### ✅ Primary-model aggregations — safe
Models aggregated that lack the hook AND could leak: **Certificate (7×),
AssessmentAttempt (2×), Feedback (2×)**. Verified: **none of these three is ever
soft-deleted** — no code path writes `isDeleted:true` to them (Certificate uses
`status:'Revoked'`; Feedback upsert sets `isDeleted:false`; AssessmentAttempt only
gets graded). Their `isDeleted` is defensive-only, and find/aggregate paths already
filter `isDeleted:false` in most spots. No deleted records exist ⇒ no leak. No fix
needed (adding filters would be speculative — YAGNI).
Aggregated models that are NOT soft-deletable at all (no leak): Attendance,
Schedule, Enrollment (these use `status`, not `isDeleted`).

### ✅ `$lookup` joins — already guarded (DATA-009)
`attendance-export.js`, `domains/attendance/repository.js`, and the user-join in
`evaluation-export.js` already use **pipeline-form `$lookup` with `isDeleted:{$ne:true}`**
+ explanatory comments. Joins into non-soft-deletable collections (attendances,
schedules) need no guard.

### ⚠️ ONE real leak — FIXED
`services/export/evaluation-export.js`: the **classes** `$lookup` used the plain
`localField/foreignField` form (no `isDeleted` guard) while **classes ARE
soft-deleted** (`domains/learning/repository.js softDeleteCohort`). So a deleted
cohort's `classCode`/`courseName` leaked into the HR evaluation export — and it was
inconsistent with the user-join two lines above (which IS guarded).
**Fix:** pipeline-form `$lookup` with `isDeleted:{$ne:true}` + `preserveNullAndEmptyArrays`
(keeps the evaluation row — a real record — but drops the deleted class label),
mirroring `attendance-export.js`.
**Regression test:** `exportRoutes.test.js` → seeds an evaluation, soft-deletes its
class, asserts the deleted `classCode` appears in **no** exported row. Verified it
**fails on the pre-fix code** (leaked `classCode`, `Received: true`) and passes after.

## Verification
- Export + evaluation suites green; regression test proven to catch the bug.
- (full server suite run pending at write time — see PR.)

## Unresolved questions
- None blocking. Optional future hardening: if any of the 22 hook-less soft-deletable
  models ever gains a soft-delete path AND an aggregation, add the same guard — but
  that's speculative today (none currently both soft-delete and aggregate unguarded).
