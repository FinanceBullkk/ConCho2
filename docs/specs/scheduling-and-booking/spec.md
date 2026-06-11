---
capability: scheduling-and-booking
status: stable
owners: [services/scheduleService, controllers/scheduleController, domains/schedule, domains/learning/session]
last_updated: 2026-06-11
related_plans:
  - plans/260602-2247-m1-self-enroll-nomination-session-modes
  - plans/260606-1356-wave-e-generic-scheduling
  - plans/260609-2215-ltms-recenter-coordinator-offline
related_code:
  - server/services/scheduleService.js
  - server/models/Schedule.js
  - server/routes/scheduleRoutes.js
  - server/controllers/scheduleController.js
  - server/domains/schedule/scheduling-window-policy.js
  - server/domains/schedule/session-booking-policy.js
  - server/domains/schedule/scheduling-mode-policy.js
  - server/domains/schedule/use-cases.js
  - server/domains/schedule/room-lock-policy.js
  - server/domains/learning/session/use-cases.js
  - server/controllers/settingController.js
  - server/models/Room.js
  - server/models/RoomBooking.js
  - server/domains/room/use-cases.js
  - server/policy/sessionInstructors.js
  - client/src/pages/BookClassPage.jsx
  - client/src/components/CalendarGrid.jsx
  - client/src/features/learning/CohortSessionsPanel.jsx
  - client/src/features/learning/AssignTrainersModal.jsx
  - server/models/WaitlistEntry.js
  - server/domains/schedule/waitlist
  - server/domains/schedule/release-resources.js
  - client/src/features/learner/MySessionsPage.jsx
---

# Capability: Scheduling & Booking

> **Source of truth for BEHAVIOR.** What the system does today. For file/route
> locations see `docs/current-system-map.md`. To change: open a `plans/`
> proposal (delta) → implement → fold back here.

## Purpose

The core, counter-intuitive booking model of TMS v2. Admins do **not** pre-create
sessions for groups to book into — the inverse. An Admin creates a Class and a
Team (group) with a leader; the **team leader self-creates sessions** by clicking
an empty cell on the booking time grid, which creates the `Schedule` and
auto-enrolls the whole team. Sessions are constrained to fixed slots so a shared
room/calendar never double-books.

## Business Requirements (BR)

- **BR-1:** Training delivery must be scheduled by the people who run it (team
  leaders), not centrally pre-provisioned, to reduce admin overhead.
- **BR-2:** A shared resource (class slot) must never be double-booked, even
  under concurrent requests.
- **BR-3:** Booking volume per team must be bounded so no team monopolises slots.
- **BR-4:** Sessions must land on standard, calendar-friendly windows.
- **BR-5:** Leaders must see which slots are already taken (by any team) to pick
  free ones, without being able to take them.
- **BR-6:** Admins retain full override (create/edit/delete any session).

## Actors & Use Cases (UC)

- **UC-1 (Team Leader):** opens `/book` grid → clicks an empty allowed slot →
  system creates a `Schedule` for the leader's team's class and auto-enrolls the
  team's active members.
- **UC-2 (Team Leader):** cancels a session their team owns → the `Schedule`
  flips to `cancelled` (durable history) and the slot frees up.
- **UC-3 (Admin):** creates, edits the time of, or deletes **any** session,
  bypassing leader-only restrictions (but not the collision/time guards).
- **UC-4 (Participant/Teacher):** reads sessions scoped to them (own team /
  enrolled sessions / assigned cohorts) and sees other teams' taken slots as
  non-bookable.

## Entities

- **Schedule** (`server/models/Schedule.js`): the session.
  - `classId` (ref Class, **required**), `bookedTeamId` (ref Team, nullable —
    null for team-less cohort sessions), `startTime`/`endTime` (Date, required),
    `enrolledUsers[]` (flattened roster for attendance), `capacity` (default 9),
    `roomLink`, `googleEventId`/`meetLink`, `remindersSentAt`.
  - **Invariants:** `endTime > startTime` enforced at schema `pre('validate')`
    (defence-in-depth beyond the service). **UNIQUE index `{classId, startTime}`**
    — the final guard against double-booking. `enrolledCount`/`availableSpots`
    are virtuals derived from `enrolledUsers`.
- **Setting `ALLOWED_TIME_SLOTS`**: the authoritative slot windows, stored as
  exact VN wall-clock windows `[{sh,sm,eh,em}, ...]` (any start/end minute and
  duration — not just whole hours). Default = five one-hour slots (10–11, 11–12,
  13–14, 14–15, 15–16) in `Asia/Ho_Chi_Minh`. Parsing/validation/exposure is
  centralized in `server/domains/schedule/scheduling-window-policy.js` (Wave E1);
  empty/malformed config is fail-closed (no new/moved bookings).
- **Team** (`server/models/Team.js`): supplies `classId`, `leaderId`, and active
  `members` snapshotted into `enrolledUsers` at booking time.

## Functional Requirements (FR)

### Requirement: Leader-created sessions [BR-1, UC-1]

The system SHALL let a team's leader (or an Admin) create a `Schedule` by
selecting an empty allowed slot; it MUST snapshot the team's **Active** members
into `enrolledUsers` and bind the session to the team's `classId`.

#### Scenario: Leader books an empty slot
- **GIVEN** a leader whose team has an assigned class and 4 active members
- **WHEN** they book a free allowed slot
- **THEN** a `Schedule` is created with `bookedTeamId` = their team,
  `enrolledUsers` = the 4 active members, and `startTime`/`endTime` = the slot

#### Scenario: Non-leader, non-admin is rejected
- **GIVEN** an authenticated user who is neither Admin nor the team's leader
- **WHEN** they attempt to book for that team
- **THEN** the request is rejected with **403** ("Only Admin or the Team Leader
  can book for this team")

#### Scenario: Team has no class
- **GIVEN** a team with no `classId`
- **WHEN** booking is attempted
- **THEN** it is rejected (team must be assigned a class first)

### Requirement: Sessions land on allowed slots only [BR-4, UC-1]

The system SHALL validate **every** new/moved session against
`ALLOWED_TIME_SLOTS` via the shared scheduling-window policy
(`assertValidBookingWindow`): leader booking, cohort booking, Admin create, and
**Admin time-edit** all enforce the same windows. A session window must exactly
match one configured window (start hour+minute and end hour+minute, in VN time).
Off-policy windows are rejected for new/moved bookings; historically imported
off-policy rows remain visible but read-only.

> Wave E1 closed a gap where the Admin schedule-update path checked only
> `end > start` and let Admins move sessions to arbitrary off-policy times.

#### Scenario: Off-policy time rejected
- **GIVEN** a slot not in `ALLOWED_TIME_SLOTS`
- **WHEN** a booking/move targets it (including an Admin time-edit)
- **THEN** it is rejected as an invalid slot (**400**, "Please select an allowed time slot.")

### Requirement: Scheduling config is readable by all roles [BR-4, BR-5, UC-4]

The system SHALL expose a safe, read-only scheduling config at
`GET /api/learning/sessions/config` to **all authenticated roles** — returning
ONLY `{ timezone, utcOffsetMinutes, weeklyTeamLimit, slots[] }` (each slot
`{ id, label, startHour, startMinute, endHour, endMinute, durationMinutes }`,
ordered by start time). General `/api/settings` stays Admin-only. This lets
Participant/Teacher booking grids render the real configured windows instead of
falling back to a hard-coded fixed-hour list.

#### Scenario: Participant reads config
- **GIVEN** an authenticated Participant
- **WHEN** they GET `/api/learning/sessions/config`
- **THEN** they receive the ordered slot DTOs (not the raw Setting doc)

#### Scenario: Anonymous denied
- **GIVEN** no auth
- **WHEN** the config is requested
- **THEN** **401**

### Requirement: Booking grid renders exact configured slots (client) [BR-4, UC-1, UC-4]

The booking / schedule / attendance grids SHALL render rows from the config's
exact slot descriptors (supporting non-60-min and minute-offset windows), keyed
by the exact `HH:mm-HH:mm` window — not integer hours. A leader booking submits
the exact configured start/end (no `hour + 1`); the booking grid scopes
availability to the selected team's Class (per-class collision). Sessions whose
window matches no configured slot render as read-only **off-policy** rows
(visible, not newly bookable). An empty/malformed config yields no bookable rows
(fail-closed) while historical sessions still render. This is a presentation
layer over the server's authoritative window enforcement.

#### Scenario: Minute-offset window books exactly
- **GIVEN** a configured slot `09:15-10:45`
- **WHEN** a leader books that cell
- **THEN** the submitted start/end equal 09:15/10:45 VN (no `hour + 1`) and the
  server accepts it as an allowed slot

#### Scenario: Off-policy session is visible but not bookable
- **GIVEN** a stored session whose window matches no configured slot
- **WHEN** the grid renders that week
- **THEN** the session shows on its own read-only row; its empty cells offer no
  "+ Book"

#### Scenario: Cross-class slot does not block
- **GIVEN** another class booked the same slot/day
- **WHEN** the leader views their team's grid (scoped to their Class)
- **THEN** the slot is still bookable for their Class (collision is per-class)

### Requirement: Config is validated on write [BR-2, BR-4, UC-3]

The system SHALL validate `ALLOWED_TIME_SLOTS` when an Admin saves it via
`PUT /api/settings`: malformed entries (non-integer, out-of-range, non-positive
window) and overlapping/duplicate windows are rejected with **400**. An **empty**
array is allowed (disables booking; history stays visible).

#### Scenario: Overlapping config rejected
- **GIVEN** an Admin saving two overlapping windows
- **WHEN** the settings PUT runs
- **THEN** **400** ("Invalid ALLOWED_TIME_SLOTS …"); the stored config is unchanged

### Requirement: No double-booking a class slot [BR-2, UC-1]

The system SHALL prevent two sessions for the same `classId` from overlapping. A
transactional collision check rejects overlaps; the UNIQUE index
`{classId, startTime}` is the final guard for races (E11000 → 409).

#### Scenario: Overlapping slot, same class
- **GIVEN** an existing session for class C at 10:00–11:00
- **WHEN** another booking for class C overlaps that window
- **THEN** it is rejected with **409** ("This time slot is already taken")

#### Scenario: Concurrent identical bookings race
- **GIVEN** two requests booking the exact same `{classId, startTime}` at once
- **WHEN** both pass the in-transaction collision check
- **THEN** exactly one succeeds; the other gets **409** from the unique-index
  E11000 path

#### Scenario: Same slot, different class allowed
- **GIVEN** class C booked at 10:00–11:00
- **WHEN** class D books 10:00–11:00
- **THEN** it succeeds (collision is class-scoped)

### Requirement: Weekly cap of 2 sessions per team [BR-3, UC-1]

The system SHALL reject a booking when the team already owns 2 sessions in the
target Mon–Sun week (`countDocuments({bookedTeamId, startTime in week}) >= 2`).

#### Scenario: Third booking in one week
- **GIVEN** a team with 2 sessions this week
- **WHEN** they book a third
- **THEN** it is rejected ("max 2 sessions/week")

### Requirement: Per-session capacity (Wave E2) [BR-2, UC-1]

The system SHALL reject (**422**) any session create whose roster would exceed
the effective per-session cap, **in the booking transaction before the session
is written**. The effective cap = the program's
`capacityPolicy.maxParticipantsPerSession` when set, else the per-session
`Schedule.capacity` (default 9). It is enforced at the shared `assertBookable`
chokepoint, so all create paths (leader book, Admin create, cohort book) are
covered. An Admin capacity **edit** that would drop below the final roster is
likewise rejected (422), as is **adding a team member** that would overflow a
future session. Order at the chokepoint: weekly (400) → collision (409) →
capacity (422). Existing over-capacity sessions are grandfathered (never
auto-trimmed).

#### Scenario: Roster exceeds the session cap
- **GIVEN** a team of N active members and an effective cap < N
- **WHEN** the leader books a slot
- **THEN** **422** and no Schedule is written (the gate runs before create)

#### Scenario: Program raises the per-session cap
- **GIVEN** a program with `maxParticipantsPerSession` ≥ N
- **WHEN** the team books
- **THEN** it succeeds (the program cap overrides the field default)

#### Scenario: Capacity edit below the roster
- **GIVEN** a session with E enrolled
- **WHEN** an Admin sets capacity < E (even while reassigning teams)
- **THEN** **422**; the capacity is unchanged

### Requirement: Scheduling-mode gating [BR-1, BR-6, UC-1, UC-3]

The system SHALL enforce a program's `schedulingMode` (resolved
`Team → Class.programId → LearningProgram`, falling back to `leader_booking`
when no program is linked) on **every** session-creation path — the leader route
(`POST /api/schedules/book-slot`), Admin create (`POST /api/schedules`), the
Admin reassign (`PUT /api/schedules/:id` with a new `bookedTeamId`), and the
learning/session adapter — via one shared policy
(`domains/schedule/scheduling-mode-policy`). Team modes (`leader_booking`,
`admin_scheduled`) book against a team; cohort modes (`self_enroll`, `nomination`)
book against a cohort. A team session for a cohort-mode program is rejected
(**400**); an `admin_scheduled` program may be team-booked only by a **scheduler**
(Admin or Coordinator — re-center Phase 2), never a self-booking team leader
(**403**); an unknown/future mode fails closed (**501**).

> Closes the gap where the legacy `/api/schedules/book-slot` route (reachable by
> team leaders) and Admin create/reassign had no mode check, letting a leader
> self-book an `admin_scheduled` program or an Admin team-book a cohort program.

#### Scenario: Leader self-books an admin_scheduled program (legacy route)
- **GIVEN** a team whose program is `admin_scheduled`
- **WHEN** the team leader books via `POST /api/schedules/book-slot`
- **THEN** it is rejected with **403** ("admin-scheduled — only a coordinator or admin…")

### Requirement: Coordinator-scheduled cohort session at an Office [BR-1, UC-1]

The coordinator-scheduled offline flow (re-center Phase 2): a **scheduler**
(Admin or Coordinator) opens a team-less session against a cohort
(`self_enroll`/`nomination`) via `POST /api/learning/sessions/book-slot` with a
`cohortId`. The session MUST carry an `officeId` (the physical site) — required
for this flow even though `Schedule.officeId` is nullable for legacy/online
rows. The roster is NOT a team: the cohort's active cohort-based enrollments
(self-enrol + coordinator-assign) are snapshotted at create. The session DTO
exposes `officeId` + a populated `office { _id, name, code }`.

#### Scenario: Coordinator opens a cohort session
- **GIVEN** a Coordinator and a `self_enroll` cohort
- **WHEN** they POST `book-slot` with `cohortId` + `officeId` + a configured slot
- **THEN** **201**, the session is team-less (`groupId` null), carries the Office,
  and enrolls the cohort's active learners

#### Scenario: Cohort session without an Office
- **GIVEN** a scheduler booking a cohort session
- **WHEN** `officeId` is omitted
- **THEN** **400** ("officeId is required — … must pick an Office")

#### Scenario: Cohort session with an unknown Office
- **GIVEN** a scheduler booking a cohort session
- **WHEN** `officeId` does not match a live Office
- **THEN** **422** ("Office not found")

#### Scenario: Team-booking a cohort-based program
- **GIVEN** a team whose program is `self_enroll`/`nomination`
- **WHEN** anyone (leader or Admin) team-books it (book-slot, create, or reassign)
- **THEN** it is rejected with **400** ("cohort-based — schedule against the cohort")

#### Scenario: Program-less class still books
- **GIVEN** a class with no linked program (`programId` null)
- **WHEN** the leader books
- **THEN** it succeeds (mode falls back to `leader_booking` — graceful migration)

### Requirement: Office-scoped Room assignment + per-room lock (re-center Phase 3) [BR-2, UC-1]

A session MAY occupy a physical **Room** (`Schedule.roomId`, nullable). A `Room`
belongs to exactly one **Office** (`Room.officeId`, required). Room CRUD lives at
`/api/rooms` (Admin/Coordinator via `room.read`/`room.manage`); a Room MUST NOT be
archived while a future session references it (**409**). Assigning a Room to a
session is guarded, in the booking transaction after the Schedule is created, by:
(1) `assertSameOffice` — the Room's Office MUST equal the session's `officeId`,
else **422**; it also hard-fails **422** when the session has no Office (never a
silent no-op); and (2) a `RoomBooking` lock ledger whose **unique
`{roomId,startTime}`** index is the DB-final per-room double-book guard. The
ledger row is written atomically with `Schedule.roomId` (never drift) and released
on every Schedule-removal path (cancel/delete/auto-release/team-sync); a read-only
reconcile check (`orphan_room_booking`) surfaces any leftover row. The per-room
lock is per-Office automatically (a physical room is in one Office). The existing
class-slot `{classId,startTime}` 409, weekly cap, and capacity checks are
unchanged and still run first.

#### Scenario: Room in the session's Office
- **GIVEN** a cohort session at Office H and a Room in Office H
- **WHEN** the scheduler books with that `roomId`
- **THEN** **201**, a `RoomBooking` row is written, the DTO exposes `room {name,code}`

#### Scenario: Room in a different Office
- **GIVEN** a session at Office H and a Room in Office N
- **WHEN** the scheduler books with that `roomId`
- **THEN** **422** ("different Office") and the whole booking rolls back (no schedule, no ledger row)

#### Scenario: Same room + slot for two different cohorts
- **GIVEN** a Room already booked for a slot by cohort A
- **WHEN** cohort B is booked into the same room + slot (different class → no class-slot collision)
- **THEN** exactly one **201** and one **409** ("already booked") — the per-room lock holds

#### Scenario: Cancelling frees the room
- **GIVEN** a roomed upcoming session
- **WHEN** it is cancelled/deleted
- **THEN** the ledger row is dropped and the room + slot are re-bookable

### Requirement: Per-session Trainers — internal (authz UNION) or external (re-center Phase 3) [BR-5, UC-1, UC-4]

A session MAY carry per-session **internal trainers**
(`Schedule.sessionInstructorIds`, User refs) and/or **one external trainer**
(`externalTrainer` subdoc: `name`, optional `email`/`phone`/`org`; no User, no
login). Both are set in one mutation `PUT /api/schedules/:id/trainers`
(`session.assign-trainer` + `roleGuard('Admin','Coordinator')`); internal ids are
deduped and identity-validated (active Teacher/Admin only, else **400**), and the
change is audit-logged as one before/after diff. An internal trainer joins the
attendance/visibility authz **UNION** — they MAY mark/read attendance and view
**their** session even when not the cohort's class teacher (the cohort teacher is
never revoked; the restrictive session-read is preserved). An external trainer is
NEVER a User, never in `enrolledUsers`, never an actor; it only receives a
best-effort calendar invite (when it has an email) and appears in display. The
external trainer's `email`/`phone` are hidden from learner-facing session DTOs
(name + org only); Admin/Coordinator see the full contact.

**UI (shipped 2026-06-10):** the Learning → Cohorts tab gains a per-cohort
**Sessions** action (`assign:trainer`, Admin/Coordinator; shown only for
cohort-scheduled cohorts — `self_enroll`/`nomination`, the same gate as the
Create-session action) opening `CohortSessionsPanel` — a list of the cohort's
sessions (time / office·room / current trainer chips) via
`GET /api/learning/sessions?cohortId=`. A **Trainers**
action per session opens `AssignTrainersModal`: internal trainers are picked from
the active-Teacher list (needs `read:users` → Admin; a Coordinator keeps the
existing internal trainers read-only until a coordinator-safe user picker ships)
and an optional external trainer is a `{name, email?, phone?, org?}` form. One
save posts both shapes to `PUT /api/schedules/:id/trainers`.

#### Scenario: Internal trainer marks their session via the UNION
- **GIVEN** a Teacher NOT bound to a cohort's class, named as a session instructor
- **WHEN** they mark attendance for that (past) session
- **THEN** **200** — and the cohort's class teacher can still mark too (UNION not revoked)

#### Scenario: Stranger teacher stays denied
- **GIVEN** a Teacher neither bound to the class nor named on the session
- **WHEN** they mark attendance
- **THEN** **403** (`teacher-not-bound-to-class`)

#### Scenario: External trainer is invite-only with no access
- **GIVEN** a session with an external trainer (with email)
- **WHEN** the trainers are saved
- **THEN** **200**, no User is created, a calendar invite is queued, and a learner
  DTO shows `{ name, org }` only (no email/phone)

#### Scenario: Non-scheduler cannot assign trainers
- **GIVEN** a Teacher or Participant
- **WHEN** they call `PUT /:id/trainers`
- **THEN** **403** (capability/roleGuard deny)

### Requirement: Booking UI surfaces scheduling mode pre-submit [BR-6, UC-3]

The leader booking grid SHALL surface the selected team's effective
`schedulingMode` (from `GET /teams/my-teams`, using the same `leader_booking`
fallback as the server) and gate booking affordances **before** submission:
empty future cells are bookable only for `leader_booking`; other modes render
read-only "locked" cells plus a banner stating why (Admin-scheduled vs
cohort-based). This is a UX pre-check only — the server policy remains the
security boundary. Existing-session visibility (own sessions, other teams' taken
slots) is never gated.

#### Scenario: Leader opens an admin_scheduled team's grid
- **GIVEN** a leader whose selected team's program is `admin_scheduled`
- **WHEN** the booking grid renders
- **THEN** no "+ Book" cell is offered (cells are locked) and a banner explains
  only an Admin can schedule — no booking request is sent (no post-submit 403)

#### Scenario: Leader switches to a leader_booking team
- **GIVEN** the same leader selects a `leader_booking` team
- **THEN** the grid offers bookable "+ Book" cells as normal

### Requirement: Cancellation is durable (status flip, never delete) [BR-1, UC-2]

*(MODIFIED 2026-06-11 — Wave E3 phase-04 slice A; replaces the former
"cancellation deletes the session" rule.)*

The system SHALL cancel a session by flipping the `Schedule` to
`status:'cancelled'` with `cancelledAt`/`cancelledBy`/`cancelReason` (optional
free-text ≤500, zod-validated on the cancel/delete DELETE bodies) — the document
is NEVER hard-deleted. Both the leader cancel (`DELETE /api/schedules/:id/cancel`),
the learning cancel (`DELETE /api/learning/sessions/:id/cancel`), and the admin
delete (`DELETE /api/schedules/:id`) perform this flip; the flip is an atomic
conditional update, so concurrent cancels resolve as one **200** / one **409**
(`already cancelled`). Attendance rows are PRESERVED; the roster snapshot is
frozen (Team-sync / Dropped auto-release / enrollment pulls skip cancelled rows);
the RoomBooking ledger row is released in the same transaction with `roomId`
nulled (B3 — field and ledger never drift); any linked calendar event is removed
and enrolled learners are emailed (unchanged).

The freed `{classId,startTime}` slot becomes re-bookable: the unique index is
**partial (`status:'scheduled'`)** and the collision/weekly-cap checks count
live rows only. Cancelled rows are EXCLUDED from every operational read
(availability, my-class, attendance calendar, learner/teacher session lists,
reminders, reconcile checks 1+4, session numbering, dashboards, reports,
completion denominators, Sheets sync); reconcile CHECK 11 additionally flags a
ledger row pointing at a cancelled session. Staff history access: legacy list
`GET /api/schedules?status=cancelled|all` (Participants are force-scoped to
live) and the Admin/Coordinator learning session list, which keeps cancelled
rows and renders a **Cancelled** chip (read-only — trainer assignment hidden) in
the cohort Sessions panel. Editing a cancelled session → **409**. Existing
deployments run `scripts/migrate-schedule-partial-unique-index.js` (idempotent
backfill + index swap) before deploying.

#### Scenario: Leader cancels own session
- **GIVEN** a future session owned by the leader's team
- **WHEN** the leader cancels it (optionally with a reason)
- **THEN** **200**; the doc persists as `cancelled` (who/when/why recorded), the
  roster + attendance survive, and the slot becomes bookable again

#### Scenario: Freed slot re-books
- **GIVEN** a cancelled session at `{classId, T}`
- **WHEN** a leader books the same class at `T`
- **THEN** **201** — one live row and the cancelled history row share the slot

#### Scenario: Double cancel
- **GIVEN** a session cancelled a moment ago
- **WHEN** it is cancelled again (or edited)
- **THEN** **409** (`already cancelled` / cannot edit)

#### Scenario: Cancelled rows leave operations
- **GIVEN** a cancelled future session
- **WHEN** the availability grid, learner lists, reminder cron, weekly cap, or
  reconcile run
- **THEN** none of them count or surface it (the reminder never emails it; the
  team's weekly quota is freed)

### Requirement: Session waitlist + FIFO auto-promotion (phase-04 slice B) [BR-1, UC-1, UC-4]

*(ADDED 2026-06-11.)* A learner MAY self-join the FIFO queue of a session they
belong to (a member of the session's Team, or an active cohort-based enrollee
of its Class) — but ONLY when the session is live, future, and at its
**effective capacity** (program override > `Schedule.capacity` > default 9);
free seats → **409** (owner decision: the waitlist never instant-seats), not in
the audience → **403**, already enrolled → **409**, double-join → **409** (the
partial-unique `{scheduleId,userId} where status:'waiting'` index is the
concurrent guard). `WaitlistEntry` rows are status-lifecycle
(`waiting`/`promoted`/`withdrawn`/`cancelled`) and never hard-deleted.

When a seat frees — a capacity raise, a Team-sync member removal, or a Dropped
auto-release — the OLDEST waiter is promoted **inside the freeing
transaction**: a guarded `$push` (`$ne` + roster-size `$expr` < cap) seats
them; the roster can never exceed the cap (post-loop assert aborts the tx). A
promotion that empties-rescues a session prevents the empty-placeholder sweep.
Post-commit (fail-soft) the promoted learner gets an idempotent
`NotificationLog` (`waitlist_promoted`, cadenceKey `<scheduleId>:<userId>`), a
promotion email, and a calendar refresh. Cancelling/removing the session
dissolves its queue in the same tx (entries → `cancelled`) and the dissolved
waiters are emailed the cancellation notice (owner decision 2026-06-11).

Routes (`/api/schedules`): `POST /:id/waitlist` (join, self,
Admin/Participant + bookingLimiter), `DELETE /:id/waitlist` (leave, self),
`GET /waitlist/mine` (my live entries + position), `GET /:id/waitlist` (staff:
Admin all; Teacher class-scoped, open-until-populated; Participant 403 — no
roster leak). Join/leave are audited (`WaitlistEntry`). **Learner visibility
widening:** the learning session list now shows a Participant the sessions of
cohorts they are actively cohort-enrolled in (not only rostered sessions) and
carries `effectiveCapacity` per row, so a late enrollee can see a full session
to queue for. **UI:** `/me/sessions` (Participant) lists upcoming sessions with
Enrolled / Waiting #N + Leave / Join-waitlist states; linked from the
Participant dashboard.

#### Scenario: Join a full session
- **GIVEN** a cohort-enrolled learner and a full live future session of that cohort
- **WHEN** they `POST /:id/waitlist`
- **THEN** **201** with their FIFO position; a session with free seats → **409**

#### Scenario: Freed seat promotes FIFO atomically
- **GIVEN** two waiters (A older than B) on a full session
- **WHEN** an Admin raises `capacity` by one (or a roster member is removed/Dropped)
- **THEN** in the same transaction A is enrolled and `promoted` (B keeps
  waiting), the roster never exceeds the effective cap, and post-commit A gets
  one idempotent `waitlist_promoted` notification + email + calendar refresh

#### Scenario: Queue dissolves with the session
- **GIVEN** a waiting learner on a session
- **WHEN** the session is durably cancelled (or swept as an empty placeholder)
- **THEN** the entry flips to `cancelled` in the same tx — and on cancel the
  waiter receives the cancellation email

#### Scenario: No roster leak
- **GIVEN** a Participant
- **WHEN** they call `GET /:id/waitlist`
- **THEN** **403** (own entries only via `/waitlist/mine`)

### Requirement: Admin override [BR-6, UC-3]

The system SHALL allow an Admin to create, time-edit, or delete any session,
bypassing leader-only restrictions, but NOT the slot-validity / collision /
unique-index guards nor the cohort-vs-team scheduling-mode structural rule (an
Admin still cannot team-book a cohort-based program).

#### Scenario: Reassigning a session to another team rebuilds the roster
- **GIVEN** a future session owned by Team A, and Team B (same class) whose
  members include a `Dropped` member
- **WHEN** an Admin reassigns the session to Team B (no attendance recorded yet)
- **THEN** `enrolledUsers` is rebuilt from **Team B's Active members only**
  (the `Dropped` member is excluded), matching the booking-time snapshot rule

### Requirement: Visibility scoping [BR-5, UC-4]

The system SHALL scope reads: Admin sees all; Teacher sees attendance calendar
for class bindings (legacy) / assigned cohorts (learning API); Participant sees
own/my-class/enrolled sessions. Other teams' taken slots are visible but
non-bookable.

## Non-Functional Requirements (NFR)

Inherits `docs/specs/security-platform/spec.md`. Specifics:

- **Security:** `protect` on all routes; booking writes allowed for Admin or
  Participant team-leader; CSRF + global + booking rate limits on writes.
- **Concurrency:** atomic Mongoose transaction with a Team write-lock
  (`findByIdAndUpdate updatedAt`) serialises same-team requests; DB unique index
  is the authoritative guard, not app logic alone.
- **Audit:** calendar-event creation records an audit entry; booking mutation is
  audited via the controller.
- **Integrations are fail-soft:** Google Calendar event + confirmation email are
  created **after** commit; their failure never rolls back a booking.
- **Performance:** indexes `{classId,startTime}` (partial-unique where
  `status:'scheduled'` — durable cancel), `{classId,startTime,
  endTime}` (collision), `{bookedTeamId,startTime}` (weekly count),
  `{enrolledUsers,startTime}` (roster sync), `{endTime}` (reconcile),
  `{remindersSentAt,startTime}` (reminder cron).
- **Timezone:** windows normalised in `Asia/Ho_Chi_Minh`; stored as UTC.

## Acceptance Criteria (AC)

- [ ] Leader can book a free allowed slot; whole active team is enrolled.
- [ ] Non-leader/non-admin booking → 403.
- [ ] Off-policy slot → rejected for new/moved bookings, **including Admin moves**.
- [ ] Overlapping same-class slot → 409; concurrent race → exactly one wins.
- [ ] Same slot for a different class → allowed.
- [ ] 3rd booking in a Mon–Sun week → rejected.
- [ ] Cancel flips the Schedule to `cancelled` (doc + attendance preserved, room released) and frees the slot for re-booking; double-cancel/edit-cancelled → 409; cancelled rows excluded from operational reads (incl. reminders + weekly cap); `?status=cancelled|all` is the staff history view (Participant force-live).
- [ ] Waitlist: join only when FULL (audience-scoped: team member / cohort enrollee; free seats → 409, non-member → 403, double-join → 409); freed seat (capacity raise / member removal / Dropped release) promotes the OLDEST waiter in the freeing tx (roster ≤ cap always) + idempotent notification; cancel/empty-sweep dissolves the queue (entries `cancelled`, waiters emailed on cancel); Participant cannot read another learner's queue; `/me/sessions` shows Enrolled / Waiting #N / Join states.
- [ ] Admin can create/move/delete any session within the guards.
- [ ] Reassigning a session to another team rebuilds `enrolledUsers` from the new team's **Active** members (Dropped excluded).
- [ ] Leader self-booking an `admin_scheduled` program via the legacy `/book-slot` route → 403 (bypass closed); a Coordinator (scheduler) is allowed.
- [ ] Coordinator schedules a cohort session with `cohortId` + `officeId` → 201 (team-less, Office set, cohort learners enrolled); missing officeId → 400; unknown officeId → 422.
- [ ] Team-booking a `self_enroll`/`nomination` program (book-slot, admin create, or reassign) → 400; program-less class still books (leader_booking fallback).
- [ ] Leader booking grid hides "+ Book" and shows a banner for non-`leader_booking` modes; existing-session visibility unaffected.
- [ ] Calendar/email failure does not roll back the booking.
- [ ] Scheduling config readable by all roles (401 anonymous); Settings stays Admin-only.
- [ ] Booking grid renders exact configured windows (incl. non-60-min/minute-offset); leader booking submits the exact start/end (no `hour + 1`).
- [ ] Off-policy sessions render read-only (not newly bookable); availability scoped per Class (no cross-class false blocks); empty config → no bookable rows, history still visible.
- [ ] Session roster over the effective cap → 422 on all create paths (no Schedule written); `maxParticipantsPerSession` overrides the field; program-less → default 9.
- [ ] Capacity edit below the final roster → 422 (incl. reassign+shrink); team-member add that overflows a future session → 422; weekly/collision order unchanged.
- [ ] Settings PUT rejects malformed/overlapping config (400); empty array allowed.

## Error & Edge Cases

| Trigger | Behavior | Recovery |
|---|---|---|
| Not Admin/leader | 403 | book via leader/admin |
| Team has no class | error | Admin assigns class |
| Off-policy slot | rejected | choose an allowed slot |
| Overlapping class slot | 409 | pick a free slot |
| Concurrent identical booking | one 409 (E11000) | retry a free slot |
| Weekly cap reached | rejected | next week or cancel one |
| `endTime <= startTime` | schema validation error | fix the window |
| Calendar/email down | booking succeeds, integration skipped (logged) | none required |

## Out of Scope / Deferred

- **Client mode-awareness — SHIPPED (2026-06-09, booking-ui-loop Phase 2).** The
  leader booking grid now surfaces the selected team's mode and gates cells
  pre-submit (locked cells + banner for non-`leader_booking` modes) — see the
  "Booking UI surfaces scheduling mode pre-submit" requirement above. Remaining:
  the **Admin** create/reassign forms still reveal a mode mismatch only via the
  post-submit 400/403 (admin-facing, lower priority). Broader capability-based
  authz: see `docs/specs/capability-authz/spec.md` (evolving).
- **Client exact-slot rendering — SHIPPED (2026-06-09, booking-ui-loop Phase 3).**
  The booking / schedule / attendance grids now render exact configured slot
  descriptors (via `useSchedulingConfig` + `client/src/lib/scheduling-slots.js`),
  submit the exact window (no `hour + 1`), scope availability by Class, and show
  off-policy sessions read-only — see the "Booking grid renders exact configured
  slots" requirement above. Admin create/move uses the same configured slots on
  cell-click; the schedule drawer's free-form datetime entry stays
  server-validated (off-policy → 400).
- Per-session **capacity enforcement shipped (Wave E2, 2026-06-09)** — see
  "Per-session capacity". Still deferred: rooms, instructors, waitlists /
  partial-fit; the original wording follows. Rooms, instructors, waitlists: Wave E2+ (gated on
  product decisions — see the Wave E plan).
- Recurring sessions, room/resource booking beyond the class slot.
