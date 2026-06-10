# Phase 1 — Office + Training-coordinator role

## Context Links
- ADR: [`coordinator-scheduled-offline-model.md`](../../docs/decisions/coordinator-scheduled-offline-model.md)
- Glossary: [`server/CONTEXT.md`](../../server/CONTEXT.md) (Office, Department, Training coordinator)
- Plan overview: [`plan.md`](./plan.md) · Grounding: `server/policy/capabilities.js`, `server/models/User.js`, `server/domains/org/`
- Builds the foundation Phase 2 (scheduling flow) and Phase 3 (Office-scoped rooms) depend on.

## Overview
- **Priority:** high (foundation) · **Status:** pending
- Add **Office** as a first-class, additive concept (employees + Rooms belong to an Office) and a
  **Training-coordinator** authorization that can run training ops without full Admin. Pure additive — no
  behavior change to existing flows.

## Key Insights (grounded)
- The capability layer resolves caps **from role only**: `requireCapability.js` → `roleHasCapability(req.user.role, cap)`;
  `policy/capabilities.js:60-90` has a static `ROLE_CAPABILITIES` map for `Admin/Teacher/Participant`; its header
  (`:18-21`) states "no per-user/db-stored grants yet". `User.role` enum (`models/User.js:47`) = `Admin/Teacher/Participant`.
  → "Coordinator capability set" is **not** a free additive declaration; it needs a real mechanism decision.
- **Decision (B2):** add a **`Coordinator` role** to the enum + `ROLE_CAPABILITIES`. Rationale: fits the existing
  role→capability scaffold exactly; the owner said "some Admin, some coordinator" → a role expresses that cleanly;
  per-user DB grants is more flexible but the scaffold deliberately defers it (YAGNI). Admin stays superuser.
- `departmentId`/`managerId` were added to `User` **non-destructively, nullable** (`models/User.js:65-70`, indexes
  `:269-270`, "open until populated" fed by Directory sync). **`officeId` follows the exact same pattern.**
- `domains/org/` (controller/use-cases/repository/dto/schemas/routes) is the module shape to mirror; Office can live
  **inside `domains/org`** (it is org data) rather than a new domain — DRY.

## Requirements
**Functional**
- FR1 — MUST add an `Office` entity: `name`, `code` (unique), optional `address`, optional `timezone`; soft-delete
  (`isDeleted`/`deletedAt`); every mutation audited. Admin/Coordinator CRUD via `office.manage`; read via `office.read`.
- FR2 — MUST add nullable `User.officeId` (ref `Office`), additive alongside `departmentId`; settable via the existing
  org-assignment action (`org.manage`); indexed.
- FR3 — MUST add a `Coordinator` role holding a **management bundle** (program/cohort/session/enrollment/report/
  assignment/path/department/office caps) but **NOT** user-account/security capabilities. Admin unchanged (superuser).
- FR4 — MUST add capabilities `OFFICE_READ` / `OFFICE_MANAGE` and map them (Admin + Coordinator manage; Teacher read).
- FR5 — Archiving an Office MUST refuse while Users or Rooms still reference it (mirror Department archive guard).

**Non-functional**
- NF1 — Additive + nullable; zero change to existing booking/attendance/enrollment behavior (regression suite green).
- NF2 — `Office` count is small (2–3); no scale concerns; simple unique `code` index.
- NF3 — English-only strings (`en.json` + `t()`); audit + soft-delete consistent with the rest of the platform.

## Architecture
**Data model**
- `Office` (new, `server/models/Office.js`): `{ name: String!, code: String! unique, address?: String, timezone?: String,
  isDeleted: Boolean=false, deletedAt?: Date }` + `timestamps`.
- `User` (`models/User.js`): add `officeId: { type: ObjectId, ref: 'Office', default: null }` next to `departmentId`
  (`:70`); add `userSchema.index({ officeId: 1 })` next to `:270`.
- `policy/capabilities.js`: add `OFFICE_READ`/`OFFICE_MANAGE` to `CAPABILITIES`; add a `Coordinator` key to
  `ROLE_CAPABILITIES` = management bundle (reuse `PROGRAM_MANAGE, COHORT_MANAGE, SESSION_BOOK, ENROLLMENT_READ/MANAGE,
  COMPLETION_READ, CERTIFICATE_READ/MANAGE, REPORT_READ, ASSIGNMENT_READ/MANAGE, PATH_READ/MANAGE, DEPARTMENT_READ,
  OFFICE_READ/MANAGE`) — **excludes** any future user/security cap; add the 2 office caps to Admin (auto via ALL) + Teacher (read).

**Interactions / flow**
- `domains/org` gains Office CRUD (`routes → controller → use-cases → repository`, `dto` shaping); office assignment
  reuses the org-assignment path that already sets `managerId`/`departmentId`.
- `Coordinator` role flows through `auth.js` (token carries role), `roleGuard`, and `requireCapability` with **no code
  change** — adding the role to the map is enough for capability gating.

## Related Code Files
**Create**
- `server/models/Office.js` · `server/domains/org/office-*.js` (or extend `office` use-cases/repository/dto/schemas in `domains/org/`)
- client: `OfficesTab`/`OfficeFormModal` under People; `officeAPI` + `useOffice` hooks + `qk.org.offices`
- tests: `server/tests/integration/officeRoutes.test.js`; capability unit test for `Coordinator`
**Modify**
- `server/models/User.js` (add `officeId` ~`:70` + index ~`:270`; **add `Coordinator` to role enum ~`:47`**)
- `server/policy/capabilities.js` (`:27-52` add caps; `:60-90` add `Coordinator` bundle + office caps)
- `server/domains/org/routes.js`+`controller.js`+`use-cases.js`+`repository.js`+`dto.js`+`schemas.js` (office CRUD + office on assignment)
- `server/scripts/seed.js` (seed 2–3 Offices + a sample Coordinator user)
- client People page + org-assignment modal (add Office picker); `useRole` perms (`read/manage:office`, recognize Coordinator)
- docs: `server/CONTEXT.md` (done), `docs/route-permission-matrix.md`, `docs/specs/org-and-departments/spec.md`

## Implementation Steps
1. Add `Office` model (soft-delete, unique `code`, audited).
2. Extend `domains/org`: office CRUD use-cases/repository/dto/schemas/routes behind `office.manage`/`office.read`; archive guard.
3. Add `User.officeId` (nullable) + index; extend the org-assignment use-case + schema to set `officeId`.
4. Add `OFFICE_READ`/`OFFICE_MANAGE` caps; add `Coordinator` role to enum + `ROLE_CAPABILITIES` (management bundle, no user/security).
5. Client: People → Offices tab + Office picker on the org-assignment modal; teach `useRole` about Coordinator + office perms.
6. Seed updates; integration tests (CRUD, archive-guard, capability deny for Participant, Coordinator-can/Admin-can).
7. DoD: tests + lint green; update route-permission-matrix + org spec + roadmap changelog; commit.

## Todo
- [ ] `Office` model + soft-delete + audit
- [ ] Office CRUD in `domains/org` (manage/read caps) + archive guard
- [ ] `User.officeId` nullable + index + org-assignment wiring
- [ ] `OFFICE_*` caps + `Coordinator` role (enum + map, no user/security)
- [ ] Client Offices tab + Office picker + `useRole` updates
- [ ] Seed + integration/capability tests
- [ ] Docs: route-matrix, org spec, roadmap; commit

## Success Criteria
- Admin & Coordinator can CRUD Offices and set a User's Office; Participant is denied (403).
- A `Coordinator` user can manage programs/cohorts/sessions/enrollment/reports but **cannot** touch user accounts/security.
- Archiving an Office with assigned Users/Rooms is refused.
- Full regression suite green (additive — nothing else changes). New tests: happy + permission-deny + archive-guard edge.

## Risk Assessment
| Risk | L×I | Mitigation |
|---|---|---|
| Adding `Coordinator` to role enum breaks existing role checks/seed/auth | Med×High | grep all `role ===`/`roleGuard(` sites; Coordinator only ADDS caps; test login + existing suites |
| Coordinator accidentally granted a sensitive cap | Low×High | explicit allow-list bundle (never `ALL`); unit test asserts Coordinator lacks user/security caps |
| Office archive leaves dangling refs | Low×Med | archive guard (refuse while referenced), mirror Department |

## Security Considerations
- Coordinator bundle is an **explicit allow-list**, never `ALL_CAPABILITIES` — no privilege creep toward Admin.
- No new sensitive surface; office assignment stays behind `org.manage`; all mutations audited + soft-delete.

## Next Steps / Dependencies
- Unblocks **Phase 2** (coordinator opens sessions with an Office) and **Phase 3** (Rooms scoped to Office).
- `officeId` population from Google Directory lands with **Track A** (Wave D2 SSO) — until then it is set manually.
