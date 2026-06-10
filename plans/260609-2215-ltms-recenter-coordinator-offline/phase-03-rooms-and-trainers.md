---
phase: 3
title: Rooms (Office-scoped) + Trainers (internal/external)
status: done  # shipped 2026-06-10; waitlists + durable-cancellation (Wave E3 phase-04) deferred
priority: high
effort: 5–7 dev-days (delta over Wave E3 Phases 2–4)
depends_on: [1, 2]
refines: ../260609-2053-wave-e3-generic-scheduling/
---

# Phase 3 — Rooms (Office-scoped) + Trainers (internal/external)

> **Review corrections (folded in 2026-06-09):**
> - **M1 — code-truth vs plan-truth:** every seam cited from the Wave E3 plan
>   (`sessionInstructorIds`, `externalTrainer`, `room-lock-policy.js`,
>   `effectiveAttendeesForSchedule`, `RoomBooking`, `Schedule.officeId`,
>   `policy/sessionInstructors`) is **TO BE CREATED** by Wave E3 / this phase — it does
>   **not** exist in `server/` yet. Only refs like `Schedule.js:133` (unique index),
>   `policy/attendance.js`, and `calendarService.js` are existing code-truth. Read any
>   Wave-E3 citation as a design seam, not shipped code.
> - **M2 — Office-null guard:** a Room may be assigned to a Session **only after
>   `Schedule.officeId` is set** (Phase 2 requires it at coordinator create).
>   `assertSameOffice` MUST hard-fail **422** when `schedule.officeId` is null — never
>   silently no-op.
> - **M3 — Room authz supersedes Wave E3:** Room CRUD + availability are **Admin +
>   Coordinator** here (capability-gated via Phase 1), superseding Wave E3 phase-02's
>   "Admin-only v1". This phase owns the Room capability declaration.

> This phase **REFINES the existing Wave E3 plan** — it does NOT restate it. The
> Wave E3 plan owns the full Room/RoomBooking ledger, conflict lock, session
> instructors, durable cancellation, and waitlists design. Here we land **two
> grill deltas** on top of it and wire them into Phase 1 (Office) + Phase 2
> (coordinator-scheduled flow):
> - **Delta A — Rooms are OFFICE-SCOPED**: a Room belongs to an Office; the
>   per-room double-book guard is unchanged but a Session's Room MUST live in the
>   Session's Office.
> - **Delta B — Trainer = internal User OR external lightweight record**: per
>   Session; internal trainers join the attendance/visibility authz UNION;
>   external trainers get a calendar invite but **no system access**.
>
> Waitlists + durable cancellation are inherited from Wave E3 **unchanged** —
> only their Office/Trainer touchpoints (release helper, calendar attendees) are
> noted.

## Context Links
- **ADR (source of truth):** `docs/decisions/coordinator-scheduled-offline-model.md`
  — §Decision (Office first-class; Trainer internal-or-external; coordinator role);
  §Consequences ("Rooms must be Office-scoped"; "instructor design must support
  external trainers").
- **Glossary:** `server/CONTEXT.md` — **Office** (`:38`), **Trainer** (`:50`),
  **Training coordinator** (`:46`), legacy **LearningGroup/Team** (`:56`).
- **Parent plan:** `./plan.md` (Phase 3 row, `depends_on [1,2]`).
- **Phase 1 (dependency):** `./phase-01-office-and-coordinator-role.md` — supplies
  the `Office` model, `user.officeId`, `domains/office/*`, and the
  **Training-coordinator capability set** (`SCHEDULE_MANAGE` / `ROOM_MANAGE` etc.).
- **Phase 2 (dependency):** `./phase-02-coordinator-scheduling-flow.md` — supplies
  the coordinator session-create form (course + Office + Room + time + Trainer)
  that this phase fills the Room/Trainer fields of.
- **Wave E3 (refined):**
  - `../260609-2053-wave-e3-generic-scheduling/plan.md` (D4/D5/D6/D9 decisions).
  - `.../phase-02-rooms-and-conflict-lock.md` (Room + RoomBooking ledger, atomic
    `roomId`, `releaseSchedule`, Admin-only availability).
  - `.../phase-03-session-instructors.md` (override-or-inherit, UNION authz,
    `effectiveAttendeesForSchedule`).
  - `.../phase-04-cancellation-states-and-waitlists.md` (durable cancel, waitlists,
    unified `releaseSchedule`).
- **Specs:** `docs/specs/scheduling-and-booking/spec.md`,
  `docs/specs/attendance/spec.md` (UNION delta).

## Overview
- **Priority:** high.
- **Status:** pending.
- **Description:** Make Wave E3's Room **Office-scoped** (`Room.officeId` required;
  `Session.officeId` derived from the Room; cross-Office room assignment → 422) and
  make the Wave E3 session-instructor a **Trainer** that is either an internal
  `User` (joins the UNION authz) **or** an external `{name, email?, phone?, org?}`
  record (calendar invite only, zero system access). The room double-book ledger,
  waitlists, and durable cancellation from Wave E3 are preserved verbatim.

## Key Insights (from grill + code grounding)
- **Office is NEW and first-class, ≠ Department** (`CONTEXT.md:38`). "Every Room
  belongs to exactly one Office; a Session is delivered at one Office." Wave E3's
  Room model (`phase-02:67`) had `location` as a free-string — **that string is
  replaced by a required `officeId` ref** so rooms can never drift between sites.
  Wave E3 open-question **Q2 ("does a room block globally or per-site?")** is now
  ANSWERED by the owner: the room-lock key stays per-room `{roomId,startTime}` (a
  physical room is in exactly one Office, so per-room == per-site automatically) —
  **no index change to RoomBooking**; the Office constraint is a *validation*
  layer, not a new lock key.
- **The room double-book guard is per-room and is NOT weakened.** Wave E3 D5
  (`plan.md:32`) — `RoomBooking` unique `{roomId,startTime}`, hard-delete lock,
  `Schedule.roomId` written atomically with the ledger row — is **load-bearing and
  inherited unchanged.** Delta A adds a same-Office assertion *before* lock acquire;
  it never touches the lock itself.
- **A Session needs its own `officeId`** even though it could be derived from the
  Room, because (a) cohort/team sessions may be scheduled before a Room is picked
  and (b) reporting/filtering by Office must work for room-less sessions. Decision:
  `Schedule.officeId` is the source of truth for "where"; when a Room is assigned,
  `room.officeId` MUST equal `schedule.officeId` (422 otherwise). Setting/clearing
  a Room never silently mutates `schedule.officeId`.
- **Trainer ≠ legacy `sessionInstructorIds` semantics, but REUSES its authz spine.**
  Wave E3 phase-03 modelled instructors as `Schedule.sessionInstructorIds` (User
  refs) with UNION authz over `policy/classBinding.isTeacherOfClass`
  (`classBinding.js:19`) and `policy/attendance.js:20` (`canMark = isTeacherOfClass`).
  The grill widens "instructor" → **Trainer** = internal User **OR** external. The
  internal branch maps 1:1 onto Wave E3's `sessionInstructorIds` and inherits the
  UNION authz untouched. The external branch is a **new lightweight embedded
  subdoc** that feeds calendar + display ONLY.
- **External trainers must get an invite but NO access.** Calendar attendees come
  from `scheduleService.js:82` (`attendees: schedule.enrolledUsers`) via
  `calendarService.buildEventPayload` (`calendarService.js:55`), which already
  **filters to valid emails** (`:56` `validEmails`). So an external trainer with an
  email is appended to the attendee list and gets the invite; one without an email
  is silently skipped (fail-soft) — exactly the desired "invite-only, no account"
  behavior. **An external trainer is never a `User`, never in `enrolledUsers`,
  never consulted by any authz check** → no privilege path exists.
- **Authz UNION is internal-only.** `policy/attendance.js` and `classBinding.js`
  operate on actors with `actor.role`/`actor._id` — an external trainer has no
  actor, so it can never be granted attendance/visibility. The UNION
  (cohort-teacher OR named-internal-trainer) from Wave E3 phase-03 is reused
  **verbatim for the internal branch**; the external branch is invisible to authz.
- **Coordinator (not just Admin) owns these mutations.** Phase 1 introduces a
  Training-coordinator capability set. Room CRUD + Trainer-assign were Admin-only in
  Wave E3 (D6, phase-02 B4). Here they become **capability-gated** (`ROOM_MANAGE`,
  `SESSION_MANAGE`/`SESSION_ASSIGN_TRAINER`) so a coordinator — who is NOT a full
  Admin — can perform them, **without** gaining user-account/security powers.

## Requirements

### Functional
- **F1 (Room→Office):** A `Room` MUST reference exactly one `officeId` (required,
  non-null). Room CRUD MUST validate the Office exists and is live. *(refines Wave
  E3 phase-02 F1: `location` string → `officeId` ref.)*
- **F2 (Session Office):** Every `Schedule` SHALL carry a nullable `officeId`. The
  coordinator create flow (Phase 2) SHALL set it. Legacy/team sessions MAY leave it
  null.
- **F3 (Same-Office room guard):** Assigning a Room to a Session MUST reject (422
  `room-office-mismatch`) when `room.officeId !== schedule.officeId`. This check
  runs **before** `acquireRoomLock` (Wave E3 phase-02). The per-room
  `{roomId,startTime}` 409 guard is UNCHANGED.
- **F4 (Room list scoped by Office):** `GET /api/rooms?officeId=` and
  `GET /api/rooms/availability?officeId=&startTime=` SHALL filter to one Office
  (the picker only offers rooms in the chosen Office). Availability stays
  capability-gated (not learner-facing).
- **F5 (Trainer per Session):** A `Schedule` MAY carry **either** internal trainer
  refs (`sessionInstructorIds`, Wave E3) **or/and** an external trainer subdoc
  (`externalTrainer`). Assigning trainers is one mutation
  (`PUT /api/schedules/:id/trainers`) carrying both shapes.
- **F6 (Internal trainer authz UNION):** Internal trainers inherit Wave E3
  phase-03 UNION — they MAY mark/read attendance and see the session; the cohort
  teacher is never revoked. *(No change to Wave E3 logic; only renamed in UI.)*
- **F7 (External trainer = invite only):** An external trainer with an email SHALL
  be added to the Session's calendar attendees and receive the invite; one without
  an email is skipped. An external trainer SHALL NEVER receive a login, appear in
  `enrolledUsers`, or be consulted by any authz check.
- **F8 (Capability gating):** Room CRUD and Trainer-assign SHALL be gated by
  capabilities (`ROOM_MANAGE`, `SESSION_ASSIGN_TRAINER`) held by **both** Admin and
  Training-coordinator (Phase 1), NOT `roleGuard('Admin')` alone.

### Non-functional
- **NF1 (load-bearing preserved):** The `{roomId,startTime}` room lock, the atomic
  `Schedule.roomId`+ledger write (Wave E3 D5/B3), the `{classId,startTime}`
  partial-unique session guard (Wave E3 D7), transactions, and post-commit
  fail-soft Calendar/email MUST NOT be weakened. The Office check is additive and
  runs OUTSIDE the lock.
- **NF2 (additive + nullable):** `Room.officeId` is required for **new** rooms; a
  data migration backfills existing rooms (none at launch — Wave E3 not yet
  shipped, so no backfill needed). `Schedule.officeId`, `externalTrainer` are
  nullable; legacy reads unaffected.
- **NF3 (no leak):** External-trainer `email`/`phone` MUST NOT appear in
  learner-facing session DTOs (name + org only). Internal-trainer DTO stays
  name+empCode (Wave E3 phase-03 F4 — no email).
- **NF4 (audit + soft-delete):** Room CRUD audits + soft-deletes (Wave E3). Trainer
  assignment audits a before/after diff (Wave E3 phase-03 M2). `externalTrainer`
  edits are part of that diff.

## Architecture

### Data model (exact field names + types)

**`Room`** (refines Wave E3 `models/Room.js`):
```
{
  name:      String (required, trim),
  code:      String (required, uppercase, unique-among-live),  // Wave E3 partial-unique
  officeId:  ObjectId ref 'Office' (required),   // ← DELTA A: replaces `location:String`
  isActive:  Boolean (default true),
  isDeleted: Boolean (default false),  deletedAt: Date | null   // soft-delete (Wave E3)
}
// Indexes (Wave E3, unchanged): partial-unique {code} where isDeleted:false
//                               + NEW {officeId, isDeleted} (scoped list/picker)
```

**`RoomBooking`** (Wave E3 `models/RoomBooking.js`) — **UNCHANGED**:
```
{ roomId, scheduleId, classId, startTime }
// unique {roomId, startTime}  (per-room == per-Office, no Office field needed)
// hard-delete lock lifecycle — NOT soft-delete (Wave E3 D5/M5)
```

**`Schedule`** additive fields (`models/Schedule.js`; Wave E3 already adds
`roomId`, `sessionInstructorIds`, `status` in its Phase 1):
```
officeId: ObjectId ref 'Office' (default null),   // ← DELTA A: where the session is delivered
externalTrainer: {                                 // ← DELTA B: lightweight, no User
  name:  String (required-if-present, trim),
  email: String (trim, lowercase) | null,          // present → gets calendar invite
  phone: String (trim) | null,
  org:   String (trim) | null
} (default null)
// sessionInstructorIds: [ObjectId ref 'User']  ← Wave E3 (internal trainers); UNCHANGED
// Index: NEW { officeId: 1, startTime: 1 }  (Office calendar / reports filter)
```
> An empty/absent `externalTrainer` is `null`, not `{}`. A Session may have both
> internal trainers AND an external trainer (e.g. a vendor co-delivering with an
> internal SME).

### Component interactions
```
Phase 2 coordinator create form
        │  course + Office + Room + time + Trainer
        ▼
domains/schedule (adminCreate / use-cases.updateSchedule)   ← Wave E3 chokepoint
        │
        ├─ assertSameOffice(room, schedule)  ── DELTA A (422 before lock)
        │
        ├─ acquireRoomLock(...)              ── Wave E3 D5 (per-room 409) UNCHANGED
        │
        ├─ setTrainers({ internalIds, externalTrainer })  ── DELTA B
        │       internal → sessionInstructorIds (Wave E3 UNION authz)
        │       external → Schedule.externalTrainer subdoc (display + invite only)
        │
        └─ post-commit: effectiveAttendeesForSchedule()  ── Wave E3 phase-03 helper,
                EXTENDED to append externalTrainer.email (deduped)  ── DELTA B
                → calendarService (fail-soft invite to external trainer)
```

### Authz model (no privilege escalation)
- **Internal trainer:** UNION via `policy/sessionInstructors.canAccessSession`
  (Wave E3 phase-03) wrapping `classBinding.isTeacherOfClass` /
  `policy/attendance.canMark`. **Reused verbatim.**
- **External trainer:** has no `actor` → cannot reach any `canX(actor, …)` →
  structurally incapable of access. No code path grants it anything.
- **Mutations:** `requireCapability(ROOM_MANAGE)` / `requireCapability(SESSION_ASSIGN_TRAINER)`
  — held by Admin **and** Coordinator (Phase 1). Availability oracle stays gated
  (Wave E3 phase-02 B4) — coordinators yes, learners no.

### Data flow (Office-scoped room pick)
1. Coordinator picks Office on the session form (Phase 2).
2. Room picker calls `GET /api/rooms?officeId=<chosen>` → only same-Office rooms.
3. `GET /api/rooms/availability?officeId=&startTime=` greys taken rooms (per-room
   ledger, Wave E3).
4. Save → `assertSameOffice` (defence-in-depth even though the picker pre-filtered)
   → `acquireRoomLock` → atomic `roomId`+ledger row.
5. Cancel/delete/reassign → Wave E3 `releaseSchedule` drops the ledger row
   (UNCHANGED). External-trainer subdoc travels with the Schedule; no extra cleanup.

## Related Code Files

### MODIFY (Wave E3 deliverables — refine, don't re-create)
- `server/models/Room.js` *(Wave E3 phase-02:67 — create there)* — **replace
  `location:String` with `officeId: ObjectId ref 'Office' (required)`**; add
  `{officeId, isDeleted}` index. Validate Office live in `domains/room` use-cases.
- `server/models/Schedule.js` — add `officeId` (`default null`) + `externalTrainer`
  subdoc + `{officeId,startTime}` index. *(Wave E3 already adds `roomId`,
  `sessionInstructorIds`, `status` here — extend, don't duplicate.)* Current
  unique index at `Schedule.js:133` and validators at `:109` are UNCHANGED.
- `server/domains/room/{use-cases,schemas,dto,repository}.js` *(Wave E3 phase-02)* —
  require + validate `officeId`; `findRoomsByOffice`; DTO exposes `office`
  (name/id), drops free `location`.
- `server/domains/schedule/room-lock-policy.js` *(Wave E3 phase-02:75)* — add
  `assertSameOffice(room, schedule)` → throw `ServiceError(422, 'room-office-mismatch')`
  **before** the ledger insert. Lock body UNCHANGED.
- `server/policy/sessionInstructors.js` *(Wave E3 phase-03:71)* — rename-only in
  comments to "internal trainer"; logic UNCHANGED (UNION still internal-only).
- `server/domains/schedule/use-cases.js` *(Wave E3 phase-03 `setSessionInstructors`)*
  — generalise to `setTrainers({ internalIds, externalTrainer })`: dedupe + validate
  internal ids (Wave E3 B2), set/clear `externalTrainer` subdoc, single before/after
  audit diff (Wave E3 M2).
- `server/services/scheduleService.js:82` (+ Wave E3 `effectiveAttendeesForSchedule`,
  phase-03 B3) — append `externalTrainer.email` to attendees (deduped by email).
- `server/calendarService.js:55` — no change needed (`validEmails` filter at `:56`
  already drops external trainers without an email).
- `server/domains/learning/session/dto.js` — emit `office` + `externalTrainer`
  (name+org ONLY in learner-facing DTO; email/phone in admin/coordinator DTO only).
- `server/schemas/schedule.js` — `setTrainersBody` (`internalIds: array.max(3)`
  `.refine` unique (Wave E3 B2) + `externalTrainer: object.nullable`); session-create
  body gains `officeId`.
- `server/policy/capabilities.js:27` — add `ROOM_MANAGE`, `ROOM_READ`,
  `SESSION_ASSIGN_TRAINER`. *(The capability→Coordinator grant is added in Phase 1;
  this phase only declares the identifiers + Admin grant if Phase 1 hasn't landed
  them.)*
- `server/routes/scheduleRoutes.js` — `PUT /:id/trainers` (replaces Wave E3
  `/:id/instructors`), `requireCapability(SESSION_ASSIGN_TRAINER)` before `/:id`.
- `client/src/components/ScheduleDrawer.jsx` / Phase-2 create form — Office-filtered
  room picker; Trainer field = internal-user multiselect **+** "External trainer"
  toggle (name/email/phone/org). `client/src/i18n/locales/en.json` — trainer/office
  strings (English-only).

### CREATE
- `server/tests/integration/roomOfficeScope.test.js` — same-Office happy + cross-Office
  422 + Office-scoped list.
- `server/tests/integration/externalTrainer.test.js` — external invite appended,
  no User created, no authz granted, learner DTO hides email.
- `server/tests/unit/setTrainers.test.js` — dedupe, both-shapes, clear, audit diff.

### DELETE
- None. (Wave E3 `Room.location` field never ships — it's replaced before launch,
  not deleted from a live schema.)

## Implementation Steps
*(domains/<domain>/ layering; audit every mutation; soft-delete rooms; capability
authz, not bare roleGuard.)*

1. **Office wiring guard.** Confirm Phase 1 landed `Office` model + `domains/office`
   + `ROOM_MANAGE`/`SESSION_ASSIGN_TRAINER` granted to Coordinator. If not, BLOCK on
   Phase 1 (do not stub an Office).
2. **Room→Office (Delta A, model + domain).** Change `Room.officeId` (required ref);
   add `{officeId,isDeleted}` index. In `domains/room/use-cases`, validate Office is
   live on create/update (404 `office-not-found`). DTO swaps `location`→`office`.
   `findRoomsByOffice` in `repository`.
3. **Session Office field.** Add `Schedule.officeId` + `{officeId,startTime}` index.
   Phase-2 create flow sets it; `setOffice` is part of the create body schema.
4. **Same-Office room guard (Delta A, lock-adjacent).** Add `assertSameOffice` in
   `room-lock-policy.js`, called **before** `acquireRoomLock` in
   `bookSlot`/`bookCohortSlot`/`adminCreate`/`updateSchedule` reassign. 422 on
   mismatch. Lock body & E11000 detector (Wave E3 B2) UNCHANGED.
5. **Trainer model (Delta B).** Add `Schedule.externalTrainer` subdoc; keep
   `sessionInstructorIds` (internal). zod `externalTrainer` (trim, optional email
   lowercase, nullable).
6. **`setTrainers` use-case (Delta B).** Generalise Wave E3 `setSessionInstructors`:
   dedupe + validate internal ids (active Teacher/Admin, Wave E3 B2), set/clear
   external subdoc, **one** before/after audit diff (Wave E3 M2). Route
   `PUT /:id/trainers` + `requireCapability(SESSION_ASSIGN_TRAINER)`.
7. **Calendar invite for external trainer (Delta B).** Extend Wave E3
   `effectiveAttendeesForSchedule` (phase-03 B3) to append `externalTrainer.email`,
   dedupe by email; post-commit, fail-soft (`calendarService` `validEmails` already
   skips no-email). Skip past sessions (Wave E3 m4).
8. **DTO split.** Learner-facing session DTO: `externalTrainer` = `{name, org}` only;
   admin/coordinator DTO: full subdoc. Internal trainers stay name+empCode (Wave E3).
9. **Frontend.** Office-scoped room picker (`?officeId=`), Trainer field
   (internal multiselect + external toggle), en.json. Availability greying reuses
   Wave E3 picker; now `?officeId=`-scoped.
10. **Inherit Wave E3 unchanged.** Room lock 409, durable cancellation, waitlists,
    `releaseSchedule` cleanup — no edits beyond the `assertSameOffice` call site.
11. **Tests** (step §Success Criteria). **Tracker + specs + CONTEXT sync** per DoD.

## Todo
- [ ] Phase-1 dependency confirmed (Office model + Coordinator caps) or BLOCK
- [ ] `Room.officeId` required ref (replaces `location`) + `{officeId,isDeleted}` index + Office-live validation
- [ ] `Schedule.officeId` + `{officeId,startTime}` index; Phase-2 create sets it
- [ ] `assertSameOffice` before `acquireRoomLock` (422); room lock body UNCHANGED
- [ ] `Schedule.externalTrainer` subdoc + zod; internal `sessionInstructorIds` kept
- [ ] `setTrainers` (internal dedupe/validate + external set/clear, one audit diff)
- [ ] `PUT /:id/trainers` + `requireCapability(SESSION_ASSIGN_TRAINER)` (Admin+Coordinator)
- [ ] External trainer email appended to calendar attendees (deduped, fail-soft, skip past)
- [ ] DTO: learner sees external name+org only; internal name+empCode (no email)
- [ ] Office-scoped room/availability list (`?officeId=`); availability stays capability-gated
- [ ] Frontend: Office-filtered room picker + internal/external trainer field + en.json
- [ ] Tests: same-Office happy + cross-Office 422 + external-invite-no-access + 1 edge
- [ ] Tracker (`development-roadmap.md`) + scheduling/attendance specs + `CONTEXT.md` synced + commit

## Success Criteria
**Happy:** Coordinator (not Admin) creates a Session at Office H, picks a Room in
Office H + an internal trainer + an external trainer with email → 201; room ledger
row written atomically; internal trainer can mark attendance (UNION); external
trainer receives a calendar invite.
**Permission-deny:**
- A learner (Participant) cannot hit `GET /api/rooms/availability` → 403 (Wave E3
  B4 preserved).
- A non-Admin/non-Coordinator cannot `PUT /:id/trainers` → 403 (capability deny).
- External trainer has **no User**, cannot authenticate, cannot mark/read
  attendance — asserted by "no User created + authz check returns deny for any
  external identity."
**Edge:** Assigning a Room whose `officeId` ≠ the Session's `officeId` → **422
`room-office-mismatch`**, and the **per-room lock is still enforced** for two
different sessions in the SAME Office at the same room+time → exactly one 201 / one
409 (concurrent `Promise.all`, proves Delta A didn't weaken Wave E3 D5).
**No-leak:** Learner-facing session DTO carries external trainer `name`+`org` only
(no email/phone); internal trainer DTO carries no email.
**Regression:** Wave E3 room-lock, waitlist, and durable-cancel suites stay green
unchanged (proves additive).

## Risk Assessment
| Risk | Likelihood × Impact | Mitigation |
|---|---|---|
| Office check weakens / reorders the load-bearing room lock | Low × High | `assertSameOffice` is a separate 422 **before** `acquireRoomLock`; lock body + E11000 detector byte-for-byte unchanged; regression suite gates it. |
| External trainer accidentally treated as a User (privilege escalation) | Low × High | External trainer is an embedded subdoc, never a `User`, never in `enrolledUsers`; all authz takes an `actor` it can never be. Test asserts no User + authz deny. |
| External-trainer email leaks to learners | Med × Med | Learner DTO emits `{name, org}` only; email/phone live in admin/coordinator DTO. Test pins it. |
| `Schedule.officeId` drifts from `room.officeId` | Med × Med | `officeId` is source-of-truth; assigning a Room asserts equality (422), never mutates `officeId`; clearing a Room leaves `officeId` intact. |
| Coordinator capability not yet wired (Phase 1 slip) | Med × Med | Step 1 BLOCK gate; capability identifiers declared here, grant owned by Phase 1 — fail loud, don't stub Office. |
| Both-shape trainer payload mishandled (internal+external) | Low × Med | `setTrainers` handles both independently; unit test covers internal-only, external-only, both, and clear. |

## Security Considerations
- **Capability authz, no privilege escalation:** Room CRUD + Trainer-assign gated by
  `ROOM_MANAGE` / `SESSION_ASSIGN_TRAINER` (Admin + Coordinator, Phase 1). Coordinator
  gains scheduling power but **no** user-account/MFA/security capability (those stay
  Admin-only — `CONTEXT.md:46`). The availability oracle stays capability-gated
  (Wave E3 B4) — never learner-facing.
- **External trainer = zero trust surface:** no account, no password, no session, no
  `enrolledUsers` membership, never an `actor`. The only thing it can receive is a
  best-effort calendar invite (fail-soft, no-email → skipped). There is no code path
  by which it can read a roster, mark attendance, or authenticate.
- **Data protection:** external `email`/`phone` are admin/coordinator-only in DTOs;
  learner DTO shows name+org. Internal-trainer DTO carries no email (Wave E3). Audit
  diff redaction (Wave E3) applies to the `externalTrainer` subdoc. Rooms soft-delete
  (history preserved); `RoomBooking` stays a hard-delete lock (Wave E3 M5).
- **Load-bearing guarantees untouched:** `{roomId,startTime}` + `{classId,startTime}`
  partial-unique + transactions + post-commit fail-soft Calendar/email all preserved;
  CSRF + write/booking rate limiters on every new mutating route (confirm mount after
  `csrfProtection`).

## Next Steps / Dependencies
- **Depends on Phase 1** (Office model, `user.officeId`, `domains/office`,
  Coordinator capability grants) — hard block; do not stub.
- **Depends on Phase 2** (coordinator session-create form that sets Office + picks
  Room + Trainer) — this phase fills its Room/Trainer/Office fields.
- **Refines Wave E3 Phases 2–4** — must land *after or alongside* the Wave E3 Room
  ledger + instructor + waitlist/cancellation work (this phase mutates those exact
  files). Coordinate file ownership on `domains/schedule/use-cases.js`,
  `room-lock-policy.js`, `models/{Room,Schedule}.js`.
- **Definition of Done:** tests/lint green (real pass) · `docs/development-roadmap.md`
  changelog + status · scheduling spec MODIFIED (Office-scoped room + Trainer
  internal/external delta) + attendance spec note (UNION still internal-only) ·
  `server/CONTEXT.md` already carries Office/Trainer — verify in sync ·
  `route-permission-matrix.md` (`/api/schedules/:id/trainers`, `room.*` caps) · commit.

## Unresolved questions (for the owner)
1. **External-trainer attendance/timesheet** (ADR §Unresolved Q4): does an external
   trainer need their delivery recorded for HR/timesheet, or is the calendar invite
   enough? This phase ships invite-only; recording delivery is deferred.
2. **Room-less session Office** — if a coordinator schedules at an Office but picks
   no Room yet, is `officeId` mandatory at create, or may it be set later? Plan
   assumes set-at-create (Phase 2 form) but nullable in the schema for legacy.
3. **Cross-Office trainer** — may an internal trainer based at Office A deliver a
   Session at Office B? Plan imposes **no** Office constraint on trainers (only Rooms
   are Office-scoped); confirm.
