# Plan: M4 — Capability-based authz scaffold

**Status:** ✅ DONE (2026-06-03) — server 483/483 green; Wave A complete · **Milestone:** M4 (Wave A — final foundation piece)

## Context
Authz today is **two-layer**: coarse `roleGuard('Admin', ...)` + resource `policy/*`. Role checks won't scale to many program types ([lms-roadmap §91-93](../../docs/lms-roadmap.md)). M4 introduces a **capability layer** (`program.manage`, `session.book`, …) behind the same two layers, and wires it into the **learning** routes as the reference implementation.

## Approach (KISS, behavior-preserving)
Capabilities are a thin **role → capability** map + a coarse `requireCapability(...caps)` middleware (any-of, analogous to `roleGuard`). Swap the `roleGuard(...)` calls on `domains/learning/routes.js` for capability gates whose role-sets are **identical to today** → zero behavior change, existing learning tests stay green. Resource-level checks (use-cases / `policy/`) are untouched — capability is only the coarse layer.

**Capability → roles (chosen to match current route guards exactly):**
| Capability | Roles | Wired route |
|---|---|---|
| `program.manage` | Admin | POST/PUT/DELETE `/learning/programs` |
| `cohort.manage` | Admin | POST `/learning/cohorts` |
| `session.book` | Admin, Participant | POST `/sessions/book-slot`, DELETE `/sessions/:id/cancel` |
| `enrollment.read` | Admin, Teacher, Participant | GET `/learning/enrollments` |
| `enrollment.manage` | Admin | POST/DELETE `/learning/enrollments` (any-of with self) |
| `enrollment.self` | Participant | POST/DELETE `/learning/enrollments` (self-enroll) |

Admin = superuser (holds all capabilities). Teacher keeps read-only; Participant keeps book + self-enroll. (Matches existing tests: teacher cannot create program/book; participant books/self-enrolls.)

## Changes
1. **server/policy/capabilities.js** (new) — `CAPABILITIES` constants, `ROLE_CAPABILITIES` map, `roleHasCapability(role, cap)`, `actorHasCapability(actor, cap)`, `capabilitiesForRole(role)`.
2. **server/middleware/requireCapability.js** (new) — `requireCapability(...caps)` → 401 (no user) / 403 (missing) / next. Any-of semantics.
3. **server/domains/learning/routes.js** — replace `roleGuard(...)` with `requireCapability(...)` per table; drop unused `roleGuard` import.
4. **server/tests/unit/capabilities.test.js** (new) — role→cap map + middleware (allow/deny/401/any-of).
5. **server/tests/integration/learningRoutes.test.js** — add "teacher cannot create a cohort" (403 via `cohort.manage`).
6. **server/policy/README.md** — document the capability layer (coarse capability vs resource policy).

## Out of scope
Migrating legacy (non-learning) routes off `roleGuard`; per-user/db-stored capabilities; surfacing capabilities to the client (client keeps `useRole`); capability for currently-ungated GET program/cohort/session reads (stay `protect`-only).

## Verify
`cd server && npm test` (new unit suite + all learning integration suites green — the wiring regression point) · `cd client && npm run lint` (no client change).

## DoD
Capability layer + middleware + learning wiring · server tests green · tracker updated (M4 → done; Phase % ; changelog; handoff sync) · committed.
