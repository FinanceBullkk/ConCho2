---
phase: 1
title: Foundation — Session-Types, Additive Schedule Fields, Shared Seams
status: pending
priority: high
effort: 3.5–4.5 dev-days
depends_on: [E1, E2]
---

# Phase 1 — Scheduling Foundation (SPINE)

## Context Links
- Overview: `./plan.md`
- Source design: "Scheduling foundation" subsystem + its adversarial critique (B1–B3, M1–M5, Y1).
- Builds on E1 (`scheduling-window-policy.assertValidBookingWindow`) + E2
  (`session-booking-policy.assertBookable`, `effectiveSessionCapacity`).
- Spec to update: `docs/specs/scheduling-and-booking/spec.md`.

## Overview
- **Priority:** high (every other E3 phase plugs into the seams defined here).
- **Status:** pending.
- **Description:** Add the additive `Schedule` fields, the per-program `sessionPolicy`, the resolver
  + repository seams, and the **shared `releaseSchedule` contract** that Phases 2 & 4 depend on — WITHOUT
  changing the load-bearing booking path. Conflict-detection bodies and waitlist promotion are NOT
  implemented here; this phase reserves the seams + indexes they consume.

## Key Insights (from critique — folded in)
- **B1 (foundation):** `User.js:336-398` auto-release **hard-deletes** schedules + `$pull`s rosters inside
  its own transaction with zero waitlist awareness. The spine must NOT rely on "old code never reads new
  fields" — old code *mutates/deletes* the docs the new collections depend on. → Define the `releaseSchedule`
  contract now (implemented per-path in Phases 2/4); **drop denormalized `waitlistCount`** (it drifts on
  every `$pull`) and compute waitlist size on read.
- **B2 (foundation):** No existing function answers "is user Y a Teacher bound to THIS class"
  (`findTeacherScopedClassIds` is the inverse). Add `findClassTeacherBinding(classId)` and validate
  assigned instructors inside the write tx. (Consumed by Phase 3.)
- **B3 + Rooms-D5:** room exclusivity CAN have a durable guard because E1 forces exact-instant slots —
  `{roomId,startTime}` equality is sufficient. The foundation reserves the room seam but the **unique guard
  ships as a ledger in Phase 2** (a partial-unique on `Schedule.roomId` collides on `roomId:null`).
- **M3/M4/Y1:** **DROP `durationMinutes`** (no slot config satisfies it) and `Room.capacity`/`code`
  speculative consumers. Keep `sessionPolicy = {roomPolicy, instructorPolicy}` only.
- **M4 (foundation):** Mongoose defaults do NOT apply to `.lean()` reads → run the `status` backfill as a
  **required pre-read migration**, not lazy.

## Requirements
**Functional**
- F1: `Schedule` carries additive nullable `roomId`, `sessionInstructorIds`, `status` (default `scheduled`)
  — all legacy docs stay valid.
- F2: `LearningProgram.sessionPolicy = { roomPolicy, instructorPolicy }` (enums `none|optional|required`,
  default `none`); resolver falls back "open until populated" (mirrors `findClassCapacityPolicy`).
- F3: A single `releaseSchedule(scheduleIds, session)` repository contract exists (no-op stub in this
  phase) that ALL Schedule-removal paths will call; Phases 2 & 4 fill in ledger + waitlist cleanup.
- F4: `findClassTeacherBinding(classId)` returns `{ teacherIds }` for Phase 3 forward validation.
- F5: DTO carries `roomId`/`status` and (Phase 3) instructors; **no** denormalized `waitlistCount`.

**Non-functional**
- NF1: Booking chokepoint untouched — `bookSlot`/`bookCohortSlot`/`adminCreate` bodies & in-tx ordering
  unchanged; `{classId,startTime}` unique index NOT touched in this phase (Phase 4 migrates it).
- NF2: All new mutations audited (`auditService.record`); diffs clean after backfill.
- NF3: Files kept ~<200 lines; new code under `domains/<domain>/`.

## Architecture
**Data model (`server/models/Schedule.js`, additive after `meetLink` ~:86):**
```js
roomId: { type: ObjectId, ref: 'Room', default: null },
sessionInstructorIds: { type: [{ type: ObjectId, ref: 'User' }], default: [] },
status: { type: String, enum: ['scheduled','cancelled','completed'], default: 'scheduled', index: true },
```
> NOTE: `waitlistCount` is intentionally **NOT** added (critique D3/B1). `status` enum includes
> `completed` reserved but only `scheduled`/`cancelled` are used through Phase 4.

**Indexes (additive — DO NOT touch `{classId,startTime}` here):**
```js
scheduleSchema.index({ sessionInstructorIds: 1, startTime: 1 }); // Phase 3 reverse lookup
// Phase 2 owns the room indexes (on the RoomBooking ledger, not Schedule).
```

**`LearningProgram.sessionPolicy`** (after `facilitatorPolicy` ~:78): `{ roomPolicy, instructorPolicy }` only.

**Resolver** (`domains/schedule/repository.js`): `findClassSessionPolicy(classId)` mirroring
`findClassCapacityPolicy:159` (program-less class → `{roomPolicy:'none', instructorPolicy:'none'}`).

**Release-helper contract** (`domains/schedule/repository.js`):
`releaseSchedule(scheduleIds, session)` — Phase-1 stub returns `{}`; Phase 2 adds
`RoomBooking.deleteMany({scheduleId:{$in}}, {session})`; Phase 4 adds
`WaitlistEntry.updateMany({scheduleId:{$in}, status:'waiting'}, {$set:{status:'cancelled'}}, {session})`.

**Data flow:** booking path unchanged. New read paths surface `roomId`/`status` via DTO. Resolver feeds
Phase 2 (roomPolicy) and Phase 3 (instructorPolicy) enforcement points.

## Related Code Files
**Modify**
- `server/models/Schedule.js:86` — add `roomId`, `sessionInstructorIds`, `status` (nullable/defaulted).
- `server/models/Schedule.js:139` — add `{sessionInstructorIds,startTime}` index.
- `server/models/LearningProgram.js:78` — add `sessionPolicy {roomPolicy,instructorPolicy}`.
- `server/domains/schedule/repository.js:159` — add `findClassSessionPolicy`, `findClassTeacherBinding`,
  `releaseSchedule` (stub).
- `server/domains/learning/session/dto.js:40` — add `roomId`, `status` to `sessionDto` (instructors in P3).
  Honor existing field names (`enrolledLearners`/`enrolledLearnerCount`, not `enrolledUsers`).
- `client/src/hooks/queryKeys.js`, `client/src/api/api.js` — reserve `rooms`/`waitlist` key blocks (P2/P4).
**Create**
- `server/scripts/backfill-schedule-status.js` — idempotent `updateMany({status:{$exists:false}}, {$set:{status:'scheduled'}})`.
**Delete** — none.

## Implementation Steps
1. Add the three additive `Schedule` fields + `{sessionInstructorIds,startTime}` index. Compile + boot.
2. Add `LearningProgram.sessionPolicy` (roomPolicy/instructorPolicy only — **no** durationMinutes).
3. Add resolvers `findClassSessionPolicy`, `findClassTeacherBinding` + unit tests (open-until-populated
   fallback). Mirror `findClassCapacityPolicy`.
4. Add the `releaseSchedule(ids, session)` stub + export; document the contract Phases 2/4 will fill.
5. Extend `sessionDto` with `roomId`/`status`; ensure legacy `.lean()` reads don't surface `undefined`.
6. Write + run `backfill-schedule-status.js` as a **required pre-read migration**.
7. Reserve `rooms`/`waitlist` query-key blocks + API stubs (no UI yet).
8. Regression sweep: `booking.test.js`, `bookingRace.test.js`, `schedulingModeLegacy.test.js`,
   `scheduleReassign.test.js`, `scheduleAuthz.test.js` — all green unchanged.

## Todo
- [ ] Additive Schedule fields + index (no `waitlistCount`)
- [ ] `LearningProgram.sessionPolicy` (no `durationMinutes`)
- [ ] `findClassSessionPolicy` + `findClassTeacherBinding` + unit tests
- [ ] `releaseSchedule` stub + contract doc
- [ ] DTO additions (roomId/status); lean-read safe
- [ ] Backfill script (required, idempotent) + run
- [ ] Reserve query-key/API blocks
- [ ] Regression suite green unchanged
- [ ] Tracker (`development-roadmap.md` changelog) + spec note (`scheduling-and-booking`)

## Success Criteria
- New fields read back with defaults on legacy schedules; booking response shape identical minus new keys.
- Resolvers return correct open-until-populated fallback (unit-tested).
- Backfill idempotent (re-run is a no-op); no `undefined` status in `.lean()` reads.
- Full regression suite green; `{classId,startTime}` unique untouched this phase.

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Lean reads surface `undefined` status | Med | Med | Required backfill before any reader/audit-diff (M4). |
| Spine fields tempt premature enforcement | Med | Low | roomPolicy/instructorPolicy stored-not-enforced until P2/P3. |
| `releaseSchedule` contract drifts across phases | Med | High | Single repository fn; Phases 2/4 EXTEND it, never fork. |
| Adding `waitlistCount` by habit | Low | Med | Explicitly forbidden in plan + DTO computes on read. |

## Security Considerations
- New readable fields = `roomId` (location-ish), `status` (enum) — non-sensitive. Instructors deferred to P3
  (name-only DTO). No roster/email widening. Participant scoping (`enrolledUsers: me`) unchanged.
- All new mutations audited; no secrets in diffs.

## Next Steps / Dependencies
- Unblocks **Phase 2** (consumes `roomId` seam + `releaseSchedule`) and **Phase 3** (consumes
  `sessionInstructorIds` + `findClassTeacherBinding`). Phase 4 consumes `status` + `releaseSchedule`.
- **Definition of Done:** code + tests/lint green + `development-roadmap.md` changelog line +
  `scheduling-and-booking/spec.md` note (additive fields; behavior unchanged) + commit.
