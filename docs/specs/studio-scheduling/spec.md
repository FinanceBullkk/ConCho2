---
capability: studio-scheduling
status: stable
owners: [domains/session-type, domains/room]
last_updated: 2026-06-16
related_code:
  - server/models/SessionType.js
  - server/domains/session-type/
  - server/domains/room/utilization.js
  - server/domains/room/routes.js
  - server/models/Schedule.js
  - client/src/features/scheduling/StudioSchedulingPage.jsx
  - client/src/features/scheduling/useScheduling.js
related_plans: []
---

# Capability: Studio ▸ Scheduling

> **Source of truth for BEHAVIOR.** A session-type taxonomy + room-utilization
> analytics (Investment Build Plan #5). Sits beside `scheduling-and-booking` —
> this layer is **metadata + reporting only** and never participates in the
> booking decision.

## Purpose

Let admins define a taxonomy of session kinds (display + default hints) and see
how heavily each room is used. The taxonomy prefills the booking form; it never
changes slot/room/conflict logic. Utilization is derived from existing data — no
new ledger.

## Business Requirements (BR)

- **BR-1:** Admins manage a list of session types (name, colour, default
  duration, default capacity), ordered, soft-deletable.
- **BR-2:** A session type is **metadata only** — it NEVER gates the bookable
  window, room lock, or conflict checks (those remain `scheduling-and-booking`).
- **BR-3:** Admins see room utilization (booked vs available hours) per room and
  per office for a date range.

## Actors & Use Cases (UC)

- **UC-1 (Admin/Coordinator, `room.manage`):** create / edit / archive session
  types.
- **UC-2 (any `session.book` holder):** lists session types (to prefill a
  session on booking).
- **UC-3 (Admin/Coordinator, `room.read`):** views room utilization.

## Entities

- **SessionType** (`server/models/SessionType.js`): `name`, `color` (hex),
  `defaultDurationMin`, `defaultCapacity` (nullable), `order`, soft-delete
  (`isDeleted`/`deletedAt`, `select:false`).
- **Schedule.sessionTypeId** (`ObjectId|null`, additive): optional reference;
  prefill hint only. Never read by any booking/slot/room policy.
- Utilization is **derived** from roomed `scheduled` Schedules (1:1 with the
  `RoomBooking` ledger) — no new store.

## Functional Requirements (FR)

### Requirement: Manage session types [BR-1, BR-2, UC-1, UC-2]

`GET /api/session-types` (`session.book`) lists live types in `order`.
`POST /api/session-types` (`room.manage`) creates (auto-appends `order`);
`PUT /api/session-types/:id` edits; `DELETE /api/session-types/:id` soft-deletes.
All mutations are audited (`entity:'SessionType'`). A type's existence and edits
SHALL NOT change any booking outcome.

#### Scenario: Archive keeps history
- **GIVEN** a session type referenced by past sessions
- **WHEN** an admin archives it
- **THEN** it is soft-deleted (gone from the list) but still resolvable on the
  historical sessions that referenced it

#### Scenario: Read vs manage
- **GIVEN** a Participant (holds `session.book`, not `room.manage`)
- **WHEN** they GET the list / POST a new type
- **THEN** the list returns 200; the create returns 403

### Requirement: Room utilization [BR-3, UC-3]

`GET /api/rooms/utilization?range=&officeId=` (`room.read`) SHALL return, per room
and per office for the range, booked hours (sum of roomed scheduled-session
durations), session count, available hours (sum of configured `ALLOWED_TIME_SLOTS`
durations/day × range days), and utilization %. A malformed `officeId` is ignored
rather than erroring.

#### Scenario: Booked hours reflect real sessions
- **GIVEN** one 2-hour scheduled session in a room within the range
- **WHEN** utilization is requested
- **THEN** that room reports `bookedHours: 2`, `sessions: 1`; its office rolls up

## Non-Functional Requirements (NFR)

- **Authz:** read types = `session.book`; manage types = `room.manage`;
  utilization = `room.read`. All mutations audited.
- **Booking invariant:** type is metadata — no booking/slot/room/conflict path
  reads `sessionTypeId`. The slot window + `{roomId,startTime}` lock stay the
  source of truth.
- **Derived analytics:** utilization adds no store; reads are bounded by range.

## Acceptance Criteria (AC)

- [ ] Session-type CRUD + soft-delete + ordering; audited; read/manage split.
- [ ] Type never alters a booking outcome (metadata only).
- [ ] Utilization returns booked vs available hours per room + per office for a
  range, derived from existing bookings.

## Error & Edge Cases

| Trigger | Behavior | Recovery |
|---|---|---|
| Manage a type without `room.manage` | 403 | use Admin/Coordinator |
| Empty name / bad hex colour | 400 (zod) | fix the field |
| Malformed `officeId` on utilization | ignored (all rooms) | pass a valid id |
| No bookable slots configured | utilization `%` = null (booked hours still shown) | configure `ALLOWED_TIME_SLOTS` |

## Out of Scope / Deferred

- Wiring `sessionTypeId` INTO the booking form (prefill duration/capacity +
  persist on create) — the field is additive/ready, but threading it through the
  transaction-heavy booking chokepoint is a deliberate follow-up so the
  "type never gates booking" invariant stays trivially true.
- Per-room operating-hours model (availability uses the global slot config).
- Drag-reorder of types (manual `order` field supported; UI uses add/edit).
