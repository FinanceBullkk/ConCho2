---
capability: scheduling-and-booking
status: stable
owners: [services/scheduleService, controllers/scheduleController, domains/schedule, domains/learning/session]
last_updated: 2026-06-09
related_plans:
  - plans/260602-2247-m1-self-enroll-nomination-session-modes
  - plans/260606-1356-wave-e-generic-scheduling
related_code:
  - server/services/scheduleService.js
  - server/models/Schedule.js
  - server/routes/scheduleRoutes.js
  - server/controllers/scheduleController.js
  - server/domains/schedule/scheduling-window-policy.js
  - server/domains/schedule/session-booking-policy.js
  - server/domains/schedule/scheduling-mode-policy.js
  - server/domains/schedule/use-cases.js
  - server/domains/learning/session/use-cases.js
  - server/controllers/settingController.js
  - client/src/pages/BookClassPage.jsx
  - client/src/components/CalendarGrid.jsx
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
- **UC-2 (Team Leader):** cancels a session their team owns → the `Schedule` is
  deleted and the slot frees up.
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
- **THEN** it is rejected as an invalid slot (**400**, "không hợp lệ")

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
(**400**); an `admin_scheduled` program may be team-booked only by an Admin
(**403**); an unknown/future mode fails closed (**501**).

> Closes the gap where the legacy `/api/schedules/book-slot` route (reachable by
> team leaders) and Admin create/reassign had no mode check, letting a leader
> self-book an `admin_scheduled` program or an Admin team-book a cohort program.

#### Scenario: Leader self-books an admin_scheduled program (legacy route)
- **GIVEN** a team whose program is `admin_scheduled`
- **WHEN** the team leader books via `POST /api/schedules/book-slot`
- **THEN** it is rejected with **403** ("admin-scheduled — only an Admin…")

#### Scenario: Team-booking a cohort-based program
- **GIVEN** a team whose program is `self_enroll`/`nomination`
- **WHEN** anyone (leader or Admin) team-books it (book-slot, create, or reassign)
- **THEN** it is rejected with **400** ("cohort-based — schedule against the cohort")

#### Scenario: Program-less class still books
- **GIVEN** a class with no linked program (`programId` null)
- **WHEN** the leader books
- **THEN** it succeeds (mode falls back to `leader_booking` — graceful migration)

### Requirement: Cancellation deletes the session [BR-1, UC-2]

The system SHALL delete the `Schedule` document on cancellation (no soft-delete
for sessions — they are future plans, not audited learner records), freeing the
slot and removing any linked calendar event.

#### Scenario: Leader cancels own session
- **GIVEN** a future session owned by the leader's team
- **WHEN** the leader cancels it
- **THEN** the `Schedule` is removed and the slot becomes bookable again

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
- **Performance:** indexes `{classId,startTime}` (unique), `{classId,startTime,
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
- [ ] Cancel deletes the Schedule and frees the slot.
- [ ] Admin can create/move/delete any session within the guards.
- [ ] Reassigning a session to another team rebuilds `enrolledUsers` from the new team's **Active** members (Dropped excluded).
- [ ] Leader self-booking an `admin_scheduled` program via the legacy `/book-slot` route → 403 (bypass closed).
- [ ] Team-booking a `self_enroll`/`nomination` program (book-slot, admin create, or reassign) → 400; program-less class still books (leader_booking fallback).
- [ ] Calendar/email failure does not roll back the booking.
- [ ] Scheduling config readable by all roles (401 anonymous); Settings stays Admin-only.
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

- **Client mode-awareness (UX follow-up).** `schedulingMode` is now enforced
  server-side on **every** create path (leader booking, Admin create, Admin
  reassign, and the learning adapter) via the shared `scheduling-mode-policy`.
  The booking UI does NOT yet surface mode, so an admin/leader can fill the form
  and only learn of a mode mismatch from the post-submit 400/403. Surfacing mode
  pre-submit (disable/annotate mode-incompatible teams; hide "+Book" for
  `admin_scheduled`) is the remaining slice. Broader capability-based authz: see
  `docs/specs/capability-authz/spec.md` (evolving).
- **Client exact-slot rendering (Wave E1 client slice — pending).** The server
  now validates + exposes exact (minute-offset, variable-duration) windows, but
  the booking UI grid (`CalendarGrid` + Book/Schedules/Attendance pages) still
  keys cells by integer hour and the participant booking page submits `hour + 1`.
  Migrating the grid to exact slot descriptors (via the new config endpoint +
  `useSchedulingConfig`) is the remaining E1 work — see
  `plans/260606-1356-wave-e-generic-scheduling/phase-01-exact-scheduling-windows.md`.
- Capacity enforcement, rooms, instructors, waitlists: Wave E2+ (gated on
  product decisions — see the Wave E plan).
- Recurring sessions, room/resource booking beyond the class slot.
