---
phase: 2
title: "E2 Capacity Enforcement"
status: completed
priority: P1
effort: 2d
dependencies: [1]
---

# Phase 2: Capacity Enforcement

> **Decisions made 2026-06-09** (audit: `reports/capacity-audit-260609-1111.md`).
> Entry gate resolved — implementing the decided design below.

## Decided scope

- **D1 → BOTH** (per-session occupancy **and** program `capacityPolicy`).
- **D2 → hard reject 422** on overflow (all-or-nothing, no partial fit / waitlist).
- **D3 → guard the capacity edit** (reject lowering capacity below the final roster).
- **D4 → enforce default 9** (program-less / unset → cap 9; teams >9 must have capacity raised).
- **D5 → guard the team-member-add path** too (keep the invariant true everywhere).
- **Existing violations → grandfathered** (read-only; never auto-drop learners — golden rule).
- **Cohort roster → creation snapshot**; **team roster → live-sync growth, capacity-guarded**.

## Semantics (precedence)

- **Effective per-session cap** = `program.capacityPolicy.maxParticipantsPerSession`
  when set (non-null), else `Schedule.capacity` (default 9). Program is resolved
  `Class.programId → LearningProgram` (same graceful fallback as Pass C).
- **Per-cohort total cap** = `program.capacityPolicy.maxParticipants` (when set):
  caps Active cohort enrollments; enforced at the enrollment use-case.
- Overflow on either → **422** with a stable `CAPACITY_MESSAGE`.

## Increments (each: implement → test → green)

### Increment 1 — per-session cap at the create chokepoint
- `repository.findClassCapacityPolicy(classId, session)` → `{ maxParticipants, maxParticipantsPerSession }` (mirror `findClassSchedulingMode`).
- `session-booking-policy.js`: add `CAPACITY_MESSAGE` + `effectiveSessionCapacity({ scheduleCapacity, maxPerSession })`; extend `assertBookable` to take `{ incomingCount, capacity }` and throw 422 when `incomingCount > capacity`. **Order: weekly (400) → collision (409) → capacity (422)** (preserves existing weekly→collision tests).
- Wire the 3 create callers (`scheduleService.bookSlot` / `adminCreate` / `bookCohortSlot`): resolve effective cap, pass `incomingCount` (roster already in hand) + `capacity`. In-transaction, before `Schedule.create`.

### Increment 2 — capacity-edit guard (D3, with verdict correction)
- `domains/schedule/use-cases.updateSchedule`: compute the **final** roster being written
  (new-team `snapshotActiveMembers` when `bookedTeamId` changes, else `existing.enrolledUsers`)
  and final capacity (`body.capacity ?? existing.capacity`), resolve `maxPerSession` for the
  final class, reject (422) if `finalRoster > effectiveCap`. Read **inside** `session.withTransaction`.

### Increment 3 — team-add guard (D5, the 4th path the verdict found)
- `Team.syncSchedulesForTeamUpdate` add branch (`Team.js`): before `$push`-growing future
  sessions, reject (422) the team update if any affected future session would exceed its
  effective cap. In the same transaction as the team edit.

### Increment 4 — per-cohort total cap (Part B)
- `domains/learning/enrollment/use-cases` (admin enroll + self-enroll): when
  `program.capacityPolicy.maxParticipants` is set, count Active cohort enrollments;
  reject (422) if it would exceed.

## Test Matrix

| Layer | Cases |
|---|---|
| Unit | `effectiveSessionCapacity` precedence (program override vs field vs default 9); boundary (`==cap` ok, `+1` → 422); ordering weekly→collision→capacity |
| Integration | bookSlot / adminCreate / bookCohortSlot overflow → 422 + **no Schedule persisted** (tx rollback); happy path 201; program `maxParticipantsPerSession` raises the cap |
| Integration | updateSchedule lower-capacity-below-roster → 422 (incl. simultaneous reassign+shrink); team-add overflow → 422; cohort enroll past `maxParticipants` → 422 |
| Regression | weekly-cap (400) + collision (409) codes/messages/order unchanged; attendance/completion untouched |

## Out of scope / deferred

- Waitlists, partial-fit, roster auto-capping. Schema-layer defence-in-depth
  (`Schedule.pre('validate')`) for direct `Schedule.create` (import/admin-DB) — deferred.
- Backfilling/remediating existing over-capacity sessions (grandfathered).

## Success Criteria

- [x] Per-session overflow → 422 on all 3 create paths; gate runs before create (no orphan Schedule).
- [x] `maxParticipantsPerSession` overrides the field; program-less → default 9.
- [x] Capacity edit below final roster → 422 (incl. reassign+shrink).
- [x] Team-add overflow → 422; cohort enroll past `maxParticipants` → 422.
- [x] Weekly-cap / collision behavior unchanged (693 server tests green); existing violations still readable.
- [x] Spec folded into `scheduling-and-booking` (+ `enrollment` cohort cap + `learning-catalog` note);
      `capacityPolicy` flipped persisted→enforced. Tracker updated.
