---
capability: learning-paths
status: stable
owners: [domains/learning/path]
last_updated: 2026-06-08
related_code:
  - server/domains/learning/path/use-cases.js
  - server/domains/learning/path/controller.js
  - server/domains/learning/path/repository.js
  - server/models/LearningPath.js
related_plans: []   # Wave C — sequenced learning paths v1 (see development-roadmap 2026-06-04)
---

# Capability: Learning Paths

> **Source of truth for BEHAVIOR.** A path is a curriculum + progress view over
> `learning-catalog` programs. Progress reuses `hasCompletedProgram`
> (`enrollment`/`completion`). Wave C v1.

## Purpose

A named, ordered curriculum of Programs a learner progresses through in sequence.
v1 is deliberately minimal: the array order **is** the sequence; per-learner
progress is **derived** from program completion (not stored); no enrollment side
effects and no transitive auto-prerequisites — a path is a curriculum + a
progress view, nothing more.

## Business Requirements (BR)

- **BR-1:** Admins define an ordered curriculum of programs under a unique code.
- **BR-2:** A learner's path progress is derived from program completion.
- **BR-3:** Paths are browsable by users; only Admins mutate them.
- **BR-4:** Paths can target Assignments (`targetType=path`) — see
  `assignments-and-reminders`.
- **BR-5:** Paths are soft-deleted (recoverable trash).

## Actors & Use Cases (UC)

- **UC-1 (Admin):** creates/edits/archives a path with an ordered program list.
- **UC-2 (Any user):** browses paths and views their own progress.

## Entities

- **LearningPath** (`server/models/LearningPath.js`): `code` (unique, uppercase,
  `^[A-Z0-9][A-Z0-9_-]*$`), `title`, `description`, `programs[]` (ordered refs;
  de-duplicated preserving order on save), `status` (active/inactive/archived),
  soft-delete. Index `{status,title}`.

## Functional Requirements (FR)

### Requirement: Ordered curriculum CRUD [BR-1, UC-1]

The system SHALL create/edit/archive paths with a unique `code` and an ordered
`programs[]`; the use-case de-duplicates while preserving order. Requires the
`path.manage` capability (Admin).

#### Scenario: Duplicate program in list
- **GIVEN** a path created with programs [A, B, A]
- **WHEN** saved
- **THEN** it persists [A, B] (de-duped, order preserved)

### Requirement: Derived progress [BR-2, UC-2]

The system SHALL compute a learner's path progress from program completion
(`hasCompletedProgram`) in sequence; progress is never stored. A path is
"complete" when every program is complete.

#### Scenario: View progress
- **GIVEN** a path of 3 programs where the learner completed the first 2
- **WHEN** they view `/paths/:id/progress`
- **THEN** the first 2 show complete, the 3rd not — computed live

### Requirement: Browse open, manage Admin-only [BR-3, UC-2]

The system SHALL allow `path.read` (browse + own progress) for users and
restrict mutations to `path.manage` (Admin).

## Non-Functional Requirements (NFR)

Inherits `security-platform` + `capability-authz`. Specifics:
- **Authz:** `requireCapability('path.read')` reads; `path.manage` writes.
- **Audit:** create/update/archive recorded.
- **Data:** soft-delete; reads filter `isDeleted:false`; unique code.
- **No side effects:** paths don't enroll or auto-apply prerequisites.

## Acceptance Criteria (AC)

- [ ] Path CRUD with unique code; program list de-duped, order preserved.
- [ ] Progress derived live from program completion; not stored.
- [ ] Path complete iff all programs complete.
- [ ] Browse = path.read; mutate = path.manage (Admin).
- [ ] Soft-delete recoverable.

## Error & Edge Cases

| Trigger | Behavior | Recovery |
|---|---|---|
| Duplicate/invalid code | unique/validation error | fix code |
| Non-admin mutate | 403 (capability) | use Admin |
| Empty programs | allowed (empty curriculum) | add programs |

## Out of Scope / Deferred

- Transitive auto-prerequisites / enrollment side effects.
- Per-step gating (can't start step N until N-1 done) — view-only progress.
- Path-level certificates (certificates are per cohort).
