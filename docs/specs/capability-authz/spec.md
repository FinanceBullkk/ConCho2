---
capability: capability-authz
status: evolving
owners: [middleware/requireCapability, middleware/roleGuard, policy]
last_updated: 2026-06-15
related_code:
  - server/middleware/requireCapability.js
  - server/policy/capabilities.js
  - server/middleware/roleGuard.js
  - server/policy
  - server/models/LearningProgram.js
  - server/models/Role.js
  - server/domains/access
related_plans:
  - plans/260603-0945-m4-capability-authz-scaffold
---

# Capability: Authorization (Roles → Capabilities)

> **Source of truth for BEHAVIOR.** `status: evolving` — the capability layer
> IS enforced on the new domain routes AND (Phase 0, 2026-06-14) on the
> Admin-only platform routes (`/api/users` `user.manage`, `/api/settings`
> `settings.manage`, `/api/import`+`/api/export`+`/api/sync` `data.transfer`,
> `/api/dashboard` `analytics.read`, `/api/admin/audit` `audit.read`,
> `/api/admin-db`+`/api/admin/reconcile` `system.ops`). Only `roleGuard` remains
> on `/api/auth` + `/api/admin/cron` (security/cron, by design) and the
> converging-legacy trio `/api/classes`, `/api/enrollments`, `/api/evaluations`
> (retired in their convergence phase). This spec states exactly what is enforced.
>
> **Editable grants (2026-06-15, TMS.update gap #2):** role→capability grants are
> now **DB-backed + editable**. `roleHasCapability` stays sync — it reads an
> in-memory `liveGrants` store seeded from the static `ROLE_CAPABILITIES` map and
> loaded from a `Role` collection at boot (so behaviour is identical until an admin
> edits). `domains/access` exposes `GET /api/access/roles` + `POST/PUT/DELETE
> /api/access/roles/:key` (`role.manage`, Admin, audited) to edit grants + define
> **custom roles**; every write refreshes `liveGrants`. **Admin grants are
> immutable** (superuser, lockout-proof). The read-only `GET
> /api/access/capability-matrix` (`settings.manage`) is retained, now reflecting the
> live DB grants. Assigning a *user* to a custom role (the `User.role` enum) is a
> deferred follow-up.

## Purpose

Decide who may do what. Two coarse mechanisms coexist today, plus a resource
layer:
1. **`roleGuard`** — coarse role allowlist (legacy routes).
2. **`requireCapability`** (M4) backed by `policy/capabilities.js` — coarse
   *capability* check on the new domain routes (learning, assessment, org,
   schedule, room). A route declares WHAT it needs (`program.manage`,
   `session.book`) instead of WHO is allowed.
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
  static `ROLE_CAPABILITIES` map (Admin = all; **Coordinator = explicit
  training-ops management allow-list** — program/cohort/session/enrollment/
  completion/certificate/report/assignment/path manage+read, `department.read`,
  `office.read`/`office.manage`; never `ALL_CAPABILITIES`, no user/security
  caps, no `org.manage` — re-center Phase 1; Teacher read-oriented; Participant
  booking + self-enroll); `roleHasCapability(role, cap)`. A Coordinator hits
  legacy `roleGuard('Admin', …)` routes (users, settings, audit, export…) as a
  plain deny — that boundary is the "no user/security" guarantee. **TMS.update
  gaps #4/#5** added `skill.read` (ALL roles — `GET /api/skills`,
  `GET /api/skills/learner/:userId` self-scoped in the controller), and the
  Admin-only `skill.manage` (skill CRUD + role profiles + any learner's skills)
  and `branding.manage` (`/api/branding` read/update) — both Admin-only via the
  superuser invariant (not added to any other role list).
- **roleGuard** (`server/middleware/roleGuard.js`): coarse role allowlist
  (legacy routes).
- **policy/***: pure resource fns `canDoX(actor, doc, opts) → {allowed, reason}`.
- **LearningProgram policy fields** (enforcement truth, audit round 8):
  `schedulingMode` **enforced** (all session-create paths), `capacityPolicy`
  **enforced** (`session-booking-policy.js` maxParticipantsPerSession +
  enrollment maxParticipants), `completionPolicy` **enforced** (completion
  engine + rollups); `deliveryMode` + `facilitatorPolicy` persisted, **not
  enforced**.

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

- **DB-backed role grants + custom roles:** DONE (2026-06-15, gap #2) — grants
  are editable per role and custom roles can be defined (`domains/access`,
  `Role` model, `liveGrants`). Still deferred: assigning a *user* to a custom role
  (the `User.role` enum is the 4 system roles) and per-*user* capability grants.
- **Migrating legacy routes** (`roleGuard`) onto `requireCapability`.
- **`schedulingMode` gating** is now enforced on all session-create paths
  (`leader_booking` + `admin_scheduled` + cohort-vs-team structural) via
  `domains/schedule/scheduling-mode-policy` — see `scheduling-and-booking`.
  `capacityPolicy` is enforced too (Wave E2 — see `enrollment`). Still
  deferred: `facilitatorPolicy` + `deliveryMode` enforcement (persisted only).
- A generic `requirePolicy` middleware wrapper (sketched in `policy/README.md`,
  not implemented — resource policies are called directly in controllers).
