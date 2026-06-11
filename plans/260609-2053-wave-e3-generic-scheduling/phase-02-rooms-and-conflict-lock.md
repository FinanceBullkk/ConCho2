---
phase: 2
title: Rooms (physical) + Conflict Lock (RoomBooking ledger)
status: pending
priority: high
effort: 4–5 dev-days
depends_on: [1]
---

# Phase 2 — Rooms + Conflict Lock

> **Superseded note (2026-06-09):** the LTMS re-center makes Rooms **Office-scoped** and
> Room CRUD + availability **Admin + Coordinator** (not Admin-only v1). See
> `plans/260609-2215-ltms-recenter-coordinator-offline/phase-03-rooms-and-trainers.md`
> (Deltas A + M3). Apply that scoping/authz when this phase is implemented.

## Context Links
- Overview: `./plan.md`; foundation: `./phase-01-foundation-session-types-and-data-model.md`.
- Source design: "Rooms + Conflict Lock" subsystem + its critique (B1–B4, M1–M5, m1–m6).
- Template: `domains/org/*` (CRUD+soft-delete+audit), `models/Department.js` (soft-delete + partial-unique).

## Overview
- **Priority:** high.
- **Status:** pending.
- **Description:** A soft-deletable audited `Room` (**physical-only**) + a `RoomBooking` **lock ledger**
  whose unique `{roomId,startTime}` index is the DB-final guard against cross-class room double-booking at
  overlapping times. `Schedule.roomId` is written **atomically with** the ledger row. Legacy `roomLink`/
  `meetLink` (virtual) are untouched.

## Key Insights (from critique — folded in)
- **B1 (rooms):** the 5th Schedule-delete path — `User.js:385` auto-release `deleteMany` — orphans ledger
  rows and **permanently bricks a room slot**. → ALL Schedule-removal paths call the unified
  `releaseSchedule(ids, session)` (Phase-1 contract); Phase 2 fills in
  `RoomBooking.deleteMany({scheduleId:{$in}}, {session})`. Plus a reconcile orphan-sweep (delete ledger rows
  whose `scheduleId` no longer resolves).
- **B2 (rooms):** under a transaction, duplicate-key on `create([...],{session})` may surface as
  `MongoBulkWriteError` with the code nested. The E11000 detector MUST check
  `err.code===11000 || err.writeErrors?.some(e=>e.code===11000) || /E11000/.test(err.message)` — mirroring
  the existing defensive check at `scheduleService.js:179`.
- **B3 (rooms):** `Schedule.roomId` MUST be written **inside** the lock-acquire success path (or stripped
  from `...data` and set only after a successful lock), never independently — else `Schedule.roomId` and the
  ledger drift (phantom room claim).
- **B4 (rooms):** the `availability` endpoint is an occupancy oracle — **gate it Admin-only**
  (`room.manage`), since D6 makes room assignment Admin-only in v1. Do NOT grant Teacher `room.read` until a
  Teacher-facing room view exists (m3).
- **M1 (rooms):** reassign trigger is "the `(roomId,startTime)` ledger key would change", i.e. fire
  release+reacquire whenever **physical `finalRoomId` AND (roomId changed OR startTime changed OR classId
  changed)** — NOT merely "body.roomId present".
- **M3/M4/m1/m5 (rooms):** **DROP `kind:'online'`/`meetingUrl`** (Google Meet/`roomLink` already covers
  virtual; online room URL is shadowed by `meetLink` precedence) → Room is physical-only. **DROP** the
  forward-backfill script (impossible state at launch; replaced by reconcile orphan-sweep). **DROP**
  `endTime` + the speculative `{roomId,startTime,endTime}` index (YAGNI for fixed grid).
- **M5/D5:** `RoomBooking` is a **hard-deletable lock**, NOT soft-delete — a soft-deleted ledger row would
  permanently block the slot. State this explicitly so no future reviewer "fixes" it.

## Requirements
**Functional**
- F1: Admin CRUD on `Room` (name, code unique-among-live, location, isActive) + soft-delete; archive
  blocked (409) while a future session references the room (mirror `archiveDepartment`).
- F2: Assigning a physical room to a session inserts a `RoomBooking` ledger row in the **same tx** as the
  Schedule write; unique `{roomId,startTime}` is the final guard → cross-class double-book = **409**.
- F3: Cancel/delete/reassign/auto-release/team-sync release the ledger row via `releaseSchedule`.
- F4: `GET /api/rooms/availability` (Admin-only) returns `{roomId, busy}` for a slot (picker pre-flight).

**Non-functional**
- NF1: Conflict order at the booking/update tx: window(E1) → collision(E2 409) → weekly(E2 400) →
  capacity(E2 422) → **room(E3 409)**. Room check runs **last** (needs `scheduleId`); E1/E2 untouched.
- NF2: `Schedule.roomId` + ledger written/deleted **together, atomically, always** (B3).
- NF3: Requires replica-set Mongo (transactions already used by `bookSlot`).

## Architecture
**`server/models/Room.js`** (new, ~60 lines, mirrors `Department.js`): `{ name, code(uppercase),
location, isActive, isDeleted, deletedAt }`, soft-delete query hooks, **partial-unique `{code} where
isDeleted:false`** (reusable after archive — m5). NO `kind`, NO `capacity` enforcement, NO `meetingUrl`.

**`server/models/RoomBooking.js`** (new, ~45 lines, the lock ledger): `{ roomId, scheduleId, classId,
startTime }` + **`{roomId,startTime}` unique** + `{scheduleId}` reverse index. **Hard-delete** lifecycle
(NOT soft-delete). No `endTime`, no speculative compound index.

**`server/domains/schedule/room-lock-policy.js`** (new, ~70 lines): `acquireRoomLock({roomId, classId,
scheduleId, start}, {session})` — `if(!roomId) return; ` validate room live+active (404/409); insert ledger
row; on E11000 (robust detector) throw `ServiceError('This room is already booked for this time slot',409)`;
**set `Schedule.roomId` in the same tx success path**. `releaseRoomLock(scheduleIds, session)` = the Phase-2
body of `releaseSchedule`.

**Wire into the 4 write paths** (inside existing `withTransaction`, after `assertBookable`, after
`Schedule.create` so `scheduleId` exists):
- `scheduleService.bookSlot:165`, `bookCohortSlot:259`, `adminCreate:457` (strip `roomId` from `...data`
  spread; set it only via `acquireRoomLock`).
- `domains/schedule/use-cases.updateSchedule:159` — release+reacquire when the ledger key changes (M1).
- Release on `cancelSlot`, `deleteSchedule`, **`Team.js:237` deleteMany**, **`User.js:385` deleteMany** —
  all via `releaseSchedule`.

**Data flow:** Admin creates rooms → assigns room on session create/edit → ledger row guards the slot →
409 toast on race → cancel/delete frees the slot (ledger row dropped) → re-bookable.

## Related Code Files
**Create**
- `server/models/Room.js`, `server/models/RoomBooking.js`
- `server/domains/schedule/room-lock-policy.js`
- `server/domains/room/{routes,controller,use-cases,repository,dto,schemas}.js`
- `client/src/hooks/useRooms.js`, `client/src/pages/RoomsAdminPage.jsx`
- `server/tests/integration/rooms.test.js`
**Modify**
- `server/models/Schedule.js` — `roomId` already added in Phase 1 (no change here).
- `server/domains/schedule/repository.js` — `findRoomByIdRaw`, `createRoomBooking`,
  `deleteRoomBookingsBySchedule`; **extend `releaseSchedule`** with the ledger deleteMany.
- `server/services/scheduleService.js:165,259,457` + outer E11000 catch (B2 robust detector) `:179`.
- `server/domains/schedule/use-cases.js:13` (`ALLOWED_UPDATE_FIELDS += 'roomId'`), `:159` (release+reacquire).
- `server/schemas/schedule.js:5,14,34` + `domains/learning/session/schemas.js:16` — `roomId: objectId.optional()`.
- `server/domains/learning/session/dto.js` — populate `room` (location only) on scoped reads;
  **assert `getAvailability` does NOT populate room** (B4/M2-rooms scope).
- `server/policy/capabilities.js` — add `ROOM_MANAGE`,`ROOM_READ` (both **Admin-only** in v1).
- `server/server.js` — mount `/api/rooms`.
- `server/services/reconcile/*` — orphan-sweep: delete `RoomBooking` whose `scheduleId` is gone.
- `client/src/api/api.js`, `client/src/hooks/queryKeys.js`, `client/src/components/ScheduleDrawer.jsx`,
  `client/src/i18n/locales/en.json`.

## Implementation Steps
1. `Room` + `RoomBooking` models (+ unique partial code, + unique ledger). Indexes build.
2. `room-lock-policy.js` (acquire/release, robust E11000 detector, **roomId set in success path**) + unit.
3. `domains/room/*` CRUD (clone `org/*`), capabilities (Admin-only), route mount, archive-in-use 409.
4. **Extend `releaseSchedule`** with ledger cleanup; wire into cancel/delete/Team-sync/User-auto-release.
5. Wire acquire into bookSlot/bookCohortSlot/adminCreate (strip raw `roomId` spread) + updateSchedule
   (release+reacquire on ledger-key change).
6. Reconcile orphan-sweep for ledger rows with missing `scheduleId`.
7. `availability` endpoint (Admin-only).
8. Frontend: rooms admin page + ScheduleDrawer room select with availability greying; en.json.
9. Tests (CRUD, perms, lock, cross-class 409, concurrent race, move-into-taken, archive-in-use, orphan-sweep).

## Todo
- [ ] Room + RoomBooking models (physical-only; ledger hard-delete; no online/endTime/capacity)
- [ ] room-lock-policy with robust E11000 + atomic roomId write
- [ ] room domain CRUD + Admin-only capabilities + archive-in-use 409
- [ ] Extend releaseSchedule; wire ALL 5 removal paths (incl. User.js + Team.js)
- [ ] Acquire wired into 4 write paths (strip raw spread)
- [ ] updateSchedule release+reacquire on ledger-key change
- [ ] Reconcile orphan-sweep
- [ ] availability endpoint Admin-only
- [ ] Frontend rooms page + drawer + en.json
- [ ] Tests incl. cross-class + concurrent race + orphan-sweep
- [ ] Tracker + route-permission-matrix + spec (room-assignment+lock)

## Success Criteria
- Cross-class same-room/same-slot → exactly one 201, one 409 (concurrent `Promise.all` proves DB guard).
- Cancel/delete/team-sync/auto-release of a roomed session frees the slot (no orphan ledger row).
- `Schedule.roomId` and ledger never drift (B3); online rooms not introduced.
- Teacher/Participant cannot reach `availability` (B4); `room.manage` Admin-only.

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| 5th delete path orphans ledger → bricked slot | High | High | Unified `releaseSchedule` on ALL paths + reconcile sweep (B1). |
| E11000 wrong message under tx | Med | Med | Robust nested detector (B2). |
| `Schedule.roomId`/ledger drift | Med | High | roomId written only in lock success path (B3). |
| Availability occupancy oracle leak | Med | Low | Admin-only endpoint (B4). |
| Soft-deleting RoomBooking by mistake | Low | High | Documented hard-delete-by-design (M5). |

## Security Considerations
- `room.manage`/`room.read` Admin-only (v1). `RoomDto` exposes no roster/teacher/email. `availability`
  returns `{roomId,busy}` only, Admin-gated. CSRF + write limiter on all mutating room/assign routes
  (confirm mount order after `csrfProtection`). Soft-delete preserves historical `roomId` refs.

## Next Steps / Dependencies
- Depends on Phase 1 (`roomId` field, `releaseSchedule` contract, `findClassSessionPolicy`).
- Phase 4 EXTENDS the same `releaseSchedule` (adds waitlist transition) — coordinate so both bodies coexist.
- **Definition of Done:** tests/lint green + `development-roadmap.md` + `route-permission-matrix.md`
  (`/api/rooms` rows + `room.*` caps) + `current-system-map.md` (room domain) + capability spec + commit.
