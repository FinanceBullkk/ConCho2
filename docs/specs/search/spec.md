---
capability: search
status: stable
owners: [controllers/searchController, services/searchService]
last_updated: 2026-06-15
related_code:
  - server/controllers/searchController.js
  - server/services/searchService.js
related_plans: []
---

# Capability: Global Search

> **Source of truth for BEHAVIOR.** Cross-entity quick search, role-scoped in the
> service.

## Purpose

A single search box that returns matches across users, teams, and classes, scoped
to what the requesting actor is allowed to see.

## Business Requirements (BR)

- **BR-1:** Authenticated users search across users/teams/classes in one call.
- **BR-2:** Results are scoped by the actor's role/relationships.
- **BR-3:** Trivial queries are short-circuited (no expensive scans).

## Actors & Use Cases (UC)

- **UC-1 (Any authenticated user):** types a query → grouped matches per entity.

## Entities

- Reads `User`/`Team`/`Class` for everyone, plus `LearningProgram`/`Department`
  for staff (Admin/Teacher), via `searchService` (role scoping lives there).

## Functional Requirements (FR)

### Requirement: Cross-entity, role-scoped results [BR-1, BR-2, UC-1]

The system SHALL return up to `limit` matches per entity type (users, teams,
classes for everyone; programs, departments for Admin/Teacher), scoped by the
actor (e.g. a Participant only sees their own relationships, and never programs
or departments).

#### Scenario: Participant search scope
- **GIVEN** a participant searching a common term
- **WHEN** results return
- **THEN** they include only entities the participant is permitted to see, and
  `programs`/`departments` are empty

#### Scenario: Staff sees programs and departments
- **GIVEN** an Admin or Teacher searching a program/department name
- **WHEN** results return
- **THEN** matching `programs` and `departments` are included

### Requirement: Minimum query length [BR-3, UC-1]

The system SHALL return empty results for queries shorter than 2 characters
(after trim) without querying the DB.

#### Scenario: One-character query
- **GIVEN** query `a`
- **WHEN** searched
- **THEN** empty grouped results, no scan

## Non-Functional Requirements (NFR)

Inherits `security-platform`. Specifics:
- **Authz:** `/api/search` authenticated; scoping enforced server-side.
- **Safety:** search input is regex-escaped before use.
- **Performance:** per-entity result cap; min-length short-circuit.

## Acceptance Criteria (AC)

- [ ] Returns grouped users/teams/classes matches, capped per type.
- [ ] Staff (Admin/Teacher) additionally get programs/departments; others get none.
- [ ] Results scoped to the actor's permissions.
- [ ] Queries < 2 chars short-circuit to empty.

## Error & Edge Cases

| Trigger | Behavior | Recovery |
|---|---|---|
| Query < 2 chars | empty results | type more |
| Regex metachars | escaped | n/a |

## Out of Scope / Deferred

- Full-text relevance ranking / fuzzy matching.
- Searching learning/assessment entities.
