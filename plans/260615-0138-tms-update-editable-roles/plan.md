# TMS.update — Phase 3: Editable roles + custom roles (gap #2)

**Branch:** `feat/tms-update-editable-roles` (stacked on Phase 2).
**Security-critical** — two-layer authz must stay intact; behavior-preserving until grants are edited.

## Today
`policy/capabilities.js` derives capabilities from role via a **static** `ROLE_CAPABILITIES` map.
`roleHasCapability(role, cap)` is **sync**, used by `middleware/requireCapability` (every domain
route) + `domains/assessment`. `GET /access/capability-matrix` serves a **read-only** view;
`RolesAccessPage` is a viewer. No `Role` model, no `role.manage` capability.

## Approach — keep authz sync, back it by a live in-memory store
`roleHasCapability` stays sync. Introduce a module-level **`liveGrants`** (`{ role: Set<cap> }`)
initialised from the static map (so nothing changes until edited). DB `Role` docs load into
`liveGrants` at boot; role edits update DB **and** `liveGrants`. **Admin is always superuser**
(`roleHasCapability('Admin', …) → true`) so the matrix can never lock Admin out.

## Slices
- **P3-S1 — Foundation (behavior-preserving).** `CAPABILITIES.ROLE_MANAGE='role.manage'` (Admin-only).
  Refactor `capabilities.js`: `liveGrants` + `setLiveGrants/getLiveGrants`; `roleHasCapability` +
  `capabilitiesForRole` read it; Admin always-true. New `Role` model `{key,name,system,capabilities[]}`.
  Grants loader (seed 4 system roles from the static map if absent; load all into `liveGrants`) wired
  at boot. Tests: existing `capabilities.test.js` still green (static default); seed + load populate
  `liveGrants`.
- **P3-S2 — Role CRUD API.** `GET/POST /access/roles`, `PUT/DELETE /access/roles/:key`
  (`role.manage`, Admin, audited). System roles: editable grants, not deletable; **Admin grants
  immutable** (always all). Each write refreshes `liveGrants`. Tests: edit a role's grants →
  `roleHasCapability` reflects it; custom role; can't delete system; can't strip Admin; 403 non-admin.
- **P3-S3 — Editable matrix UI.** `RolesAccessPage` → editable (checkbox per role×capability) +
  **New role** + Save (PUT). `useAccess` gains role mutations. Tests.

> **Deferred (noted):** assigning a USER to a *custom* role (touches `User.role` enum + user-mgmt UI)
> is out of scope — Phase 3 delivers DB-backed grants for the 4 system roles + custom-role
> *definitions*. The capability layer is the value; user→custom-role assignment is a follow-up.

## Progress
- ✅ **Phase 3 — editable roles + custom roles** (2026-06-15). `roleHasCapability` stays sync, now reads a live in-memory grants store seeded from the static map (behaviour-preserving) + loaded from a new `Role` collection at boot. **Admin grants immutable** (superuser, lockout-proof). New `role.manage` capability. Domain `domains/access/` (repository/use-cases/controller/routes/schemas + grants-loader) replaces the legacy read-only `routes/accessRoutes.js`: `GET /access/roles`, `POST/PUT/DELETE /access/roles/:key` (`role.manage`, audited, refresh grants on every write); matrix read kept for back-compat. UI: `RolesAccessPage` now **editable** (toggle cells + Save) + **custom roles** (New role dialog, delete) — Admin column locked. Tests: server unit (live store: edit/immutable-Admin/custom/getLiveGrants) + integration (grants loader; roles CRUD: edit→authz, Admin-immutable, custom create/archive, system-undeletable 400, unknown-cap 400, non-admin 403); client 5 (editable matrix). Gates: server access suites 32 ✓, full suite green, client 349 ✓, lint 63, build clean. **Deferred:** assigning a User to a custom role (User.role enum + user-mgmt UI).

## DoD per slice
Two-layer authz intact · capability + audit on writes · full server authz suites green (no regression)
· client test:run + lint(≤63) + build · tracker + capability-authz spec updated · committed.
