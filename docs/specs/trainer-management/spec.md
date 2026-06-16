---
capability: trainer-management
status: stable
owners: [domains/trainer, models/TrainerProfile]
last_updated: 2026-06-16
related_code:
  - server/models/TrainerProfile.js
  - server/domains/trainer/
  - server/domains/trainer/use-cases.js
  - server/domains/trainer/dto.js
  - server/domains/schedule/use-cases.js
  - server/domains/schedule/repository.js
  - server/policy/capabilities.js
  - client/src/features/trainer/TrainersPage.jsx
related_plans: []
---

# Capability: Trainer-Management Depth

> **Source of truth for BEHAVIOR.** Modernization Horizon 2 (A6). A qualification
> + availability layer over the Teacher/Admin users who deliver sessions: who can
> teach what, their upcoming load, post-session ratings, and a double-booking
> guard so a trainer is never on two overlapping live sessions.

## Purpose

Make scheduling offer only qualified, free trainers and stop a trainer being
booked twice at once. `TrainerProfile` carries each trainer's deliverable
programs + weekly availability + ratings; `Schedule.sessionInstructorIds` (the
existing internal-trainer link) is the source for load + the double-booking
overlap check.

## Business Requirements (BR)

- **BR-1:** Admins/Coordinators set a `TrainerProfile` (qualifications +
  availability) for a Teacher/Admin user; mutations audited; archive soft-deletes.
- **BR-2:** The trainer list can be filtered to those **qualified** for a program
  and **free** at a given time window — the data a scheduling picker needs to
  offer only qualified, free trainers.
- **BR-3:** A trainer **cannot** hold two LIVE (`scheduled`) sessions at
  overlapping times — rejected `409` at the assign chokepoint, mirroring the
  room-lock guarantee.
- **BR-4:** A per-trainer **load** view shows upcoming sessions + total hours in a
  window.
- **BR-5:** Post-session **ratings** aggregate to a trainer score (derived).
- **BR-6:** Reuses the existing `session.assign-trainer` capability (Admin +
  Coordinator) — trainer qualification is the same management surface as naming a
  session's trainers.

## Actors & Use Cases (UC)

- **UC-1 (`session.assign-trainer`):** list trainers
  (`GET /api/trainers?qualifiedFor=&at=&atEnd=&includeCandidates=`).
- **UC-2 (`session.assign-trainer`):** upsert a trainer profile
  (`PUT /api/trainers/:userId`).
- **UC-3 (`session.assign-trainer`):** view a trainer's load
  (`GET /api/trainers/:userId/load?from=&to=`).
- **UC-4 (`session.assign-trainer`):** record a post-session rating
  (`POST /api/trainers/:userId/ratings`).
- **UC-5 (`session.assign-trainer`):** assign session trainers
  (`PUT /api/schedules/:id/trainers`) — now also enforces the double-booking 409.

## Entities

- **TrainerProfile** (`server/models/TrainerProfile.js`): `userId` (unique, 1:1
  with a Teacher/Admin User), `canDeliver[LearningProgram]`,
  `availability[{weekday 0-6, from 'HH:MM', to 'HH:MM'}]`, `ratings[{value,note,
  by,at}]`, `note`, `status` (`active|archived`), soft-delete. Rating aggregate
  is DERIVED in the DTO.
- **Schedule.sessionInstructorIds** (existing): the internal-trainer link the
  load view + double-booking overlap query read.

## Functional Requirements (FR)

### Requirement: Profile upsert (audited) [BR-1, BR-6, UC-2]

`PUT /api/trainers/:userId` upserts the profile (201 on create, 200 on update);
the user MUST be a live Teacher/Admin (else 400). Requires
`session.assign-trainer`. Audited (`entity:'TrainerProfile'`).

#### Scenario: Only Teacher/Admin get a profile
- **GIVEN** a Participant user
- **WHEN** a profile upsert is attempted for them
- **THEN** the request is rejected `400`

### Requirement: Qualified + free listing [BR-2, UC-1]

`GET /api/trainers` returns each trainer with `canDeliver`, `availability`,
rating aggregate, and (when `at`/`atEnd` given) a `free` flag (no overlapping
live session). `qualifiedFor=<programId>` filters to trainers who can deliver it;
`includeCandidates=true` also surfaces Teacher/Admin users with no profile yet.

#### Scenario: Busy trainer is not free
- **GIVEN** a trainer assigned to a 10:00–12:00 session
- **WHEN** the list is requested with `at=10:30&atEnd=11:00`
- **THEN** that trainer's row reports `free:false`; a 16:00–17:00 window → `free:true`

### Requirement: Double-booking guard [BR-3, UC-5]

`PUT /api/schedules/:id/trainers` rejects (`409`) assigning an internal trainer
who already has a LIVE session overlapping this session's time. Only `scheduled`
sessions conflict (a cancelled row frees the slot). App-level overlap query on
`sessionInstructorIds` + time range (not a transaction ledger — assignment is an
admin action, off the booking chokepoint).

#### Scenario: Overlapping assignment rejected
- **GIVEN** a trainer assigned to a 10:00–12:00 session
- **WHEN** the same trainer is assigned to an overlapping 11:00–13:00 session
- **THEN** the request is rejected `409`; a non-overlapping 14:00–15:00 session succeeds

### Requirement: Load + ratings [BR-4, BR-5, UC-3, UC-4]

`GET /api/trainers/:userId/load` returns `{ sessionCount, totalHours, sessions }`
for the window (default: next 90 days). `POST /api/trainers/:userId/ratings`
appends a 1–5 rating; the DTO derives `ratingAvg` + `ratingCount`.

#### Scenario: Two ratings average
- **GIVEN** a trainer rated 4 then 5
- **WHEN** the trainer is read
- **THEN** `ratingAvg:4.5, ratingCount:2`

## Non-Functional Requirements (NFR)

- **Authz:** all routes = `session.assign-trainer` (Admin + Coordinator); mutations audited.
- **Conflict scope:** only LIVE sessions conflict; the guard mirrors the
  collision query's time-overlap + `status:'scheduled'` scoping.
- **Derived, not stored:** rating aggregate + load recompute on read.

## Acceptance Criteria (AC)

- [ ] Booking offers only trainers qualified for the program and free at the time
      (`qualifiedFor` + `at` filters).
- [ ] Double-booking a trainer is rejected (409), mirroring the room-lock guarantee.
- [ ] Load view shows upcoming sessions/hours; ratings aggregate per trainer.
- [ ] Reuses `session.assign-trainer`; audited.

## Error & Edge Cases

| Trigger | Behavior | Recovery |
|---|---|---|
| Any route without `session.assign-trainer` | 403 | Admin/Coordinator |
| Profile for a non-Teacher/Admin user | 400 | pick a Teacher/Admin |
| Rating `value` outside 1–5 | 400 (zod) | 1–5 integer |
| Assign a trainer to an overlapping live session | 409 | pick a free trainer / time |
| Rate a user with no profile | 404 | create a profile first |

## Out of Scope / Deferred

- **Picker hard-enforcement of qualification** — `qualifiedFor` filters the
  *offered* list (UX); `setTrainers` does NOT hard-block assigning an
  unqualified trainer (admin override allowed). Only double-booking is a hard
  guarantee.
- **Concurrency ledger** — the double-booking guard is an app-level overlap
  check, not a DB unique index (unlike room-lock); sufficient for the
  admin-driven assign path.
- **A2 Vendor co-delivery** — an external `Vendor` and an internal trainer can
  co-deliver a session; matching vendor qualification is A2's `delivers`, not here.
