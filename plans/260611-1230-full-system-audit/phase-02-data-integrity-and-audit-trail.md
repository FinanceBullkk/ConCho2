# Phase 02 — Data Integrity & Audit Trail

**Area prefix:** DATA- (continue past DATA-011).
**Why first-tier:** soft-delete + audit log + transactional consistency ARE the
product promise (compliance). A silent hole here is a P0 by default.

## A. Soft-delete coverage
- [ ] **Hook coverage per model:** which of the 13+ models have soft-delete
      pre-hooks, and for WHICH ops? Known gap class: hooks cover
      find/findOne/countDocuments/findOneAndUpdate/findOneAndDelete (+aggregate
      on User/Team) but NOT `distinct`, `updateMany`, `bulkWrite`, `exists`.
      (Fresh precedent: Team `distinct` gap found 2026-06-11 in waitlist work.)
      → Grep every `.distinct(`, `.updateMany(`, `.bulkWrite(`, `.exists(` and
      verify explicit `isDeleted` filtering where the model is soft-deletable.
- [ ] Trash/restore flows: every soft-deleted entity recoverable? Cascades
      (user → teams → enrollments) consistent both directions?
- [ ] Hard-delete inventory: list every `deleteMany`/`findOneAndDelete`/`remove`
      — each must be a sanctioned cleanup (empty placeholder sweep, RoomBooking
      ledger) with a code comment saying why.

## B. Transactions & atomicity
- [ ] Multi-doc mutation inventory → which run in `session.withTransaction`?
      Known-good: booking, group transfer, schedule edit/cancel, roster rebuild,
      waitlist promotion. Sweep for NEW multi-doc paths without sessions.
- [ ] Post-commit side effects (email, calendar, NotificationLog) are fail-soft
      and never inside the tx; nothing critical is post-commit-only.

## C. Race guards = DB, not app logic
- [ ] Unique-index inventory vs app guard pairs:
      `Schedule {classId,startTime} partial(status:scheduled)` ·
      `WaitlistEntry {scheduleId,userId} partial(waiting)` ·
      `RoomBooking {roomId,startTime}` · Class live-unique code · Room code ·
      NotificationLog idempotency tuple. Each: E11000 mapped to friendly 409?
- [ ] Guarded-update patterns ($ne + $expr size guards) still assert post-loop.

## D. Denormalized pairs (drift audit)
- [ ] `Schedule.roomId` ↔ RoomBooking ledger row (reconcile check 11 covers?)
- [ ] `WaitlistEntry.classId` ↔ `Schedule.classId` (stale after class move?)
- [ ] `Schedule.enrolledUsers` ↔ Team.members (team-sync invariants)
- [ ] `Class.programId` ↔ LearningProgram existence (backfill complete?)
- [ ] Enrollment (team vs cohort, `teamId:null`) ↔ roster reality.

## E. Audit log completeness
- [ ] **Mutation → audit matrix:** every create/update/delete/archive route calls
      `auditService.record`? Grep controllers for mutations missing it.
      (AuditLog entity enum was extended twice after silent failures — re-verify
      every `entity:` value is in the enum.)
- [ ] Diffs: before/after captured on updates (not just `after`).
- [ ] TTL 730d still set; AuditLog volume/growth sane.

## F. Reconcile (the nightly safety net)
- [ ] Walk all 11 checks: what invariant does each cover; which invariants from
      sections A–E have NO reconcile check → candidates to add.
- [ ] Reconcile is read-only/report-only where expected; fixes audited.

## Method
Grep-driven inventories + targeted mongo queries on dev data + reading reconcile.
Each gap gets a repro test before the fix (mongodb-memory-server).

## Output
`plans/reports/audit-data-{yymmdd-hhmm}-findings.md` + fix PRs.
