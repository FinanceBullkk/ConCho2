---
capability: teams-and-groups
status: stable
owners: [domains/groups, models/Team]
last_updated: 2026-06-12
related_code:
  - server/domains/groups
  - server/models/Team.js
related_plans: []
---

# Capability: Teams & Groups

> **Source of truth for BEHAVIOR.** File/route locations: `docs/current-system-map.md`.
> Vocabulary: the Team → LearningGroup rename was **DROPPED** (owner 2026-06-12,
> audit round 7) — `domains/groups` is the module, but the `Team` model name and
> `/api/teams` URL are permanent.

## Purpose

A Team is a group of learners assigned to a Class, with one member designated
leader. Teams are the unit that books sessions (see `scheduling-and-booking`) and
whose membership defines the session roster. Membership changes must stay
consistent with already-booked future sessions.

## Business Requirements (BR)

- **BR-1:** Admins group learners under a Class with a responsible leader (PIC).
- **BR-2:** Multiple teams may share a Class (they compete for booking slots).
- **BR-3:** Changing a team's membership must keep future session rosters
  consistent — atomically, never half-applied.
- **BR-4:** Participants can see their own teams.

## Actors & Use Cases (UC)

- **UC-1 (Admin):** creates a team, assigns a Class, sets a leader and members.
- **UC-2 (Admin):** adds/removes members → future schedules for the team are
  re-synced in the same transaction.
- **UC-3 (Participant):** reads their own teams via `/my-teams`.

## Entities

- **Team** (`server/models/Team.js`): `name` (PIC, not unique), `classId`
  (nullable = unassigned), `leaderId` (a Participant), `members[]`, soft-delete
  fields. Indexes on `leaderId`, `classId`, and multikey `members`.
- Helper `syncSchedulesForTeamUpdate({teamId, oldMembers, newMembers, session})`
  — session-aware, called by the controller inside the team-update transaction.

## Functional Requirements (FR)

### Requirement: Team composition [BR-1, BR-2, UC-1]

The system SHALL let an Admin create a team with a name, optional `classId`, a
`leaderId`, and `members[]`. Multiple teams may reference the same `classId`.

### Requirement: Membership change syncs future rosters atomically [BR-3, UC-2]

On a member change the system SHALL, within one MongoDB transaction, update
future `Schedule.enrolledUsers` for the team: `$pull` removed members, `$push`
added members, and **delete** any future schedule that would drop to 0 enrolled.
A crash rolls the whole transaction back (Team + Schedules stay consistent).

#### Scenario: Remove a member
- **GIVEN** a team with 3 future sessions and member X enrolled in them
- **WHEN** X is removed from the team
- **THEN** X is pulled from those 3 sessions in the same transaction; any session
  left empty is deleted

#### Scenario: Add a member
- **GIVEN** a team with future sessions
- **WHEN** member Y is added
- **THEN** Y is pushed into those future sessions' rosters

#### Scenario: Crash mid-sync
- **GIVEN** a member change that fails partway
- **WHEN** the transaction aborts
- **THEN** neither Team.members nor Schedule.enrolledUsers reflect the partial
  change

### Requirement: Participant self-read [BR-4, UC-3]

The system SHALL expose `/api/teams/my-teams` to authenticated participants,
scoped to teams they belong to or lead; full `/api/teams` is Admin-only.

## Non-Functional Requirements (NFR)

Inherits `security-platform`. Specifics:
- **Authz:** `/api/teams` Admin-only writes/reads; `/my-teams` authenticated self.
- **Audit:** team create/update/delete recorded with member diffs.
- **Data:** soft-delete auto-filter on `find*` and `aggregate` (analytics never
  count deleted teams).
- **Consistency:** membership↔roster sync is transactional.
- **Performance:** `{members}` multikey index supports the frequent
  `Team.find({members: userId})` lookups (booking, dashboard, search, cascade).

## Acceptance Criteria (AC)

- [ ] Admin can create a team; multiple teams can share a class.
- [ ] Removing a member pulls them from future sessions; empty ones deleted.
- [ ] Adding a member pushes them into future sessions.
- [ ] Partial failure rolls back fully (no drift).
- [ ] Participant sees own teams via `/my-teams`; non-admins can't list all.

## Error & Edge Cases

| Trigger | Behavior | Recovery |
|---|---|---|
| Missing team name | validation error | supply name |
| Member change crash | transaction rollback | retry |
| Non-admin lists `/api/teams` | 403 | use `/my-teams` |

## Out of Scope / Deferred

- Self-service team join/leave (membership is Admin-managed).
- ~~LearningGroup vocabulary migration~~ — rename DROPPED permanently (audit
  round 7): pure churn, zero behavior value.
