---
capability: capability-authz
status: evolving
owners: [middleware/requireCapability, middleware/roleGuard, policy]
last_updated: 2026-06-09
related_code:
  - server/middleware/requireCapability.js
  - server/policy/capabilities.js
  - server/middleware/roleGuard.js
  - server/policy
  - server/models/LearningProgram.js
related_plans:
  - plans/260603-0945-m4-capability-authz-scaffold
---

# Capability: Authorization (Roles → Capabilities)

> **Source of truth for BEHAVIOR.** `status: evolving` — the capability layer
> IS enforced on the new domain routes, but capabilities are still derived from
> role (no per-user/DB-stored grants yet) and legacy routes still use
> `roleGuard`. This spec states exactly what is enforced.

## Purpose

Decide who may do what. Two coarse mechanisms coexist today, plus a resource
layer:
1. **`roleGuard`** — coarse role allowlist (legacy routes).
2. **`requireCapability`** (M4) backed by `policy/capabilities.js` — coarse
   *capability* check on the new domain routes (learning, assessment, org). A
   route declares WHAT it needs (`program.manage`, `session.book`) instead of
   WHO is allowed.
3. **`policy/*`** — resource-level ("can THIS actor touch THIS doc?").

The capability map is the migration target's spine; today capabilities are
derived from role (Admin = superuser), behavior-preserving vs the old
`roleGuard` sets.

## Business Requirements (BR)

- **BR-1:** Every route is gated coarsely (role or capability) AND every
  sensitive resource is gated by ownership/binding.
- **BR-2:** New L&D routes declare a capability, not a role list, so new flows
  map to existing capabilities.
- **BR-3:** UI gating is UX only; the server is the security boundary.
- **BR-4:** Migration must be behavior-preserving; legacy data stays accessible
  ("open until populated").

## Actors & Use Cases (UC)

- **UC-1 (Any request to a domain route):** passes `requireCapability(...)` then,
  where applicable, a resource policy.
- **UC-2 (Teacher):** access scoped by class binding (`Class.teacherIds`).
- **UC-3 (Participant):** self/own-team/enrollment-scoped capabilities
  (`enrollment.self`, `session.book`, …).

## Entities

- **requireCapability** (`server/middleware/requireCapability.js`): variadic
  ANY-OF capability guard; runs after `protect`; 401 if unauthenticated, 403 if
  the role lacks the capability.
- **policy/capabilities.js**: canonical capability ids (`<resource>.<action>`) +
  static `ROLE_CAPABILITIES` map (Admin = all; Teacher read-oriented;
  Participant booking + self-enroll); `roleHasCapability(role, cap)`.
- **roleGuard** (`server/middleware/roleGuard.js`): coarse role allowlist
  (legacy routes).
- **policy/***: pure resource fns `canDoX(actor, doc, opts) → {allowed, reason}`.
- **LearningProgram policy fields:** `schedulingMode`, `capacityPolicy`,
  `facilitatorPolicy` — persisted, **not enforced** yet.

## Functional Requirements (FR)

### Requirement: Capability guard on domain routes [BR-1, BR-2, UC-1]

The system SHALL gate learning/assessment/org routes with
`requireCapability(...caps)` (ANY-OF), resolving the actor's role → capabilities
via the static map; missing capability → **403**, unauthenticated → **401**.

#### Scenario: Teacher lacks a manage capability
- **GIVEN** a Teacher (no `program.manage`)
- **WHEN** they POST `/api/learning/programs`
- **THEN** **403** ("Role 'Teacher' lacks the required capability: program.manage")

#### Scenario: Any-of capability
- **GIVEN** a route `requireCapability('enrollment.manage','enrollment.self')`
- **WHEN** a learner self-enrolls (has `enrollment.self`)
- **THEN** the coarse check passes (resource layer still applies)

### Requirement: Resource-level enforcement still applies [BR-1, UC-2]

The system SHALL also run a resource policy for ownership/binding-sensitive ops;
passing the coarse capability is not sufficient.

#### Scenario: Right capability, wrong resource
- **GIVEN** a Teacher with `report.read` targeting a class they aren't bound to
- **WHEN** they read its report
- **THEN** the resource policy denies it (`isTeacherOfClass` → 403)

### Requirement: Server is the boundary [BR-3, UC-1]

The system SHALL enforce the same checks server-side regardless of UI state.

### Requirement: Graceful migration ("open until populated") [BR-4, UC-2]

The system SHALL keep some resource policies permissive while their backing
fields are empty (e.g. empty `Class.teacherIds` → any Teacher allowed) and
tighten once populated.

## Non-Functional Requirements (NFR)

Inherits `security-platform`. Specifics:
- **Defense-in-depth:** coarse (role/capability) + resource layers; never one
  alone for sensitive ops.
- **Pure & testable:** `roleHasCapability` and policy fns are side-effect-free.
- **Behavior-preserving:** capability map kept in lockstep with the prior
  roleGuard sets.

## Acceptance Criteria (AC)

- [ ] Domain routes enforce `requireCapability` (403 missing, 401 anon).
- [ ] Capabilities resolve from role via the static map (Admin = all).
- [ ] Sensitive ops also pass a resource policy (coarse pass insufficient).
- [ ] Client hiding is never the security boundary.
- [ ] "Open until populated" policies stay permissive on empty legacy fields.

## Error & Edge Cases

| Trigger | Behavior | Recovery |
|---|---|---|
| Unauthenticated | 401 | log in |
| Role lacks capability | 403 | use authorised role |
| Right capability, wrong resource | policyDeny (403) | correct resource |
| Empty binding field | permissive (migration) | backfill to tighten |

## Out of Scope / Deferred (evolving)

- **Per-user / DB-stored capability grants:** today capabilities are derived
  from role via a static map (no custom per-user grants).
- **Migrating legacy routes** (`roleGuard`) onto `requireCapability`.
- **`schedulingMode` gating** is now enforced on all session-create paths
  (`leader_booking` + `admin_scheduled` + cohort-vs-team structural) via
  `domains/schedule/scheduling-mode-policy` — see `scheduling-and-booking`.
  Still deferred: `capacityPolicy` / `facilitatorPolicy` enforcement (persisted,
  not enforced — see `enrollment`).
- A generic `requirePolicy` middleware wrapper (sketched in `policy/README.md`,
  not implemented — resource policies are called directly in controllers).
