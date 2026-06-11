# Audit Round — Phase 02: Data Integrity & Audit Trail

**Date:** 2026-06-11 · **Plan:** `plans/260611-1230-full-system-audit/phase-02-data-integrity-and-audit-trail.md`
**Verdict: 1×P1 (golden-rule violation), 2×P2, 2×P3.** Audit-trail layer itself verified clean.

## Verified CLEAN (evidence-backed)

| Area | Evidence |
|---|---|
| Audit-log completeness | `auditService.record` present across 18 domain controllers + all legacy mutation controllers (55 call sites in domains alone); every `entity:` value used in prod code exists in the AuditLog enum (28 values diffed — the historical "enum lag = silent fail" class is currently closed) |
| Soft-delete: hook-ed models | Class/User/Team carry find/findOne/countDocuments/findOneAndUpdate/findOneAndDelete + aggregate hooks; Department/Office/Room carry the find-family hooks (no aggregate usage exists for them) |
| Soft-delete: hook-less domain models | Assignment/Certificate/Assessment/AssessmentQuestion/AssessmentAttempt/Feedback/LearningPath repositories filter `isDeleted` explicitly at EVERY query incl. dynamic filter builders and `Feedback.aggregate` `$match` (sampled all) |
| Transactions | `withTransaction` present at all multi-doc paths: booking, schedule edit/cancel, user lifecycle, groups mutations/lifecycle/enrollment-sync, class mutations, enrollment transfer/status, cohort delete, import |
| Race guards | unique indexes + E11000 mappings intact: Schedule partial-unique, WaitlistEntry partial-unique, RoomBooking, NotificationLog tuple, Class live-unique, User empCode |
| Reconcile | 11 checks cover: ghost members, soft-deleted-in-team, empty placeholders, orphan schedule↔class, orphan enrollments, duplicate enrollments, unattached participants, counter drift, orphan room bookings, missing attendance, multi-team class |
| Sanctioned hard-deletes | RoomBooking ledger (by design), empty-placeholder sweeps in User.js/Team.js (owner Q4, commented), adminDb surgery tool (Admin-only + audited) |

## Findings

### DATA-014 (P1) — `deleteEvaluation` HARD-deletes; Evaluation has no soft-delete at all
- **Evidence:** `controllers/evaluationController.js:179` `findByIdAndDelete`; `models/Evaluation.js` has NO `isDeleted` field. Golden rule (CLAUDE.md + security-and-auth.md): "soft-delete, never hard-delete user/attendance/**evaluation** data".
- **Impact:** Admin delete permanently destroys assessment evidence; only recoverable from the AuditLog `before` snapshot (730-day TTL). Compliance posture breach.
- **Fix:** add `isDeleted`/`deletedAt` + SOFT_DELETE_HOOKS to the model; flip controller to soft-delete; upsert path revives a trashed (classId,userId) row instead of E11000 (compound unique); regression tests (delete → hidden from reads; re-upsert revives; unique index undisturbed).

### DATA-013 (P2) — bulk import writes THROUGH soft-deleted Users/Classes
- **Evidence:** `services/importService.js:96-99` pre-load `User.find({empCode:{$in}})` is hook-FILTERED (deleted excluded) → a trashed empCode classifies as "new"; `:143-145` `bulkWrite updateOne {filter:{empCode}, upsert:true}` BYPASSES hooks → matches and silently overwrites the trashed doc, `isDeleted` stays true. Same shape for Class import (`:230-232`).
- **Impact:** trash rows silently mutated; import result counts lie ("created" ≠ reality); admin confusion ("import OK but user invisible"). No login risk (login is hook-filtered).
- **Fix:** explicit trashed-lookup pre-import (`isDeleted:true` query) → report those rows as errors ("in trash — restore first"); + tests.

### DATA-012 (P2 class / P3 instance) — `distinct` bypasses soft-delete hooks
- **Evidence:** `controllers/dashboard/dashboard-stats.js:39-43` — 5× `User.distinct` with no `isDeleted` (hooks don't cover `distinct`). Same gap class as the Team `distinct` found 2026-06-11 in waitlist work.
- **Impact:** trashed participants' departments/positions/levels/statuses appear in Admin dashboard filter dropdowns (ghost options).
- **Fix (systemic):** add `'distinct'` to SOFT_DELETE_HOOKS on all 6 hook-ed models (same explicit-isDeleted escape hatch) — kills the whole class; dashboard fixed for free. + regression test.

### DATA-015 (P3) — dead hard-delete repo fns survived the durable-cancel migration
- **Evidence:** `domains/schedule/repository.js:105` `deleteScheduleById` (findByIdAndDelete) + `:130` `deleteAttendanceByScheduleId` (Attendance.deleteMany) — ZERO callers (grep).
- **Impact:** loaded footguns: future reuse would silently break durable cancellation / the attendance golden rule.
- **Fix:** delete both fns + exports.

### DATA-016 (P3) — no reconcile coverage for stale waitlist rows
- **Evidence:** 11 checks, none touch WaitlistEntry. A `waiting` row whose session slipped into the PAST without filling rots forever (promotion skips past sessions by design; cancel-path dissolution only fires on cancel).
- **Impact:** learner "mine" list can show waiting rows on finished sessions; queue data slowly accumulates lies.
- **Fix:** reconcile check #12: flag (or auto-expire to `cancelled`) waiting entries on past/cancelled sessions. **Candidate for backlog.**

## Notes (no finding)
- `attendance/marking.js:102` lastActiveAt `User.bulkWrite` — no session + touches trashed users: derived display cache only, harmless; deliberate fail-soft.
- Maintenance scripts (`scripts/*`) query with hooks active — some "audit" scripts undercount trashed docs; scripts hygiene belongs to phase-07.

## Triage outcome (owner, 2026-06-11)
- **DATA-014 → FIXED (minimal scope per owner):** Evaluation gains
  isDeleted/deletedAt + find-family/distinct/aggregate hooks; delete flips
  soft; re-upsert REVIVES the trashed row (full unique index kept;
  `$in:[true,false,null]` covers legacy rows missing the field). Trash/restore
  UI = backlog. Lifecycle regression test added.
- **DATA-012 → FIXED (systemic):** 'distinct' added to SOFT_DELETE_HOOKS on
  all 6 hook-ed models; escape hatch preserved; regression test.
- **DATA-013 → FIXED:** import refuses trashed empCodes / archived
  {classCode,courseName} pairs with a "restore first" 400; 2 tests.
- **DATA-015 → FIXED:** both dead fns + exports removed (tombstone comment).
- **DATA-016 → BACKLOG** (plan.md Backlog table).

Spec `evaluations` updated (delete-is-soft requirement + revive scenario,
last_updated 2026-06-11). Suites: evaluationRoutes + auditDataRound2 30/30.
