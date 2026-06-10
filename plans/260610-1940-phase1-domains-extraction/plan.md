---
title: Phase 1 modular-monolith — remaining domain extractions
status: in_progress
priority: medium
created: 2026-06-10
kind: refactor  # behavior-preserving — no spec change (spec-driven-development.md)
---

# Phase 1 — remaining domain extractions

Phase 1 (backend modular-monolith) is ~78%: every large legacy controller/service
is already split by concern. What remains is **architectural relocation** into the
`domains/<domain>/` convention (the `learning/` reference shape:
routes → controller → use-cases → repository → schemas → dto/policy). All slices are
**behavior-preserving** (verbatim moves; no route/response/authz change → no spec
change; update `current-system-map.md` only).

## Guardrails
- Keep a thin facade at any old path imported by tests (e.g. `services/attendanceService.js`)
  so test imports stay green; move logic, not the public surface.
- Run `cd server && npm test` after each slice — 776 tests must stay green.
- One slice = one commit. Stop and re-evaluate if a slice churns >12 files.

## Slices (by value/risk)
| # | Slice | Scope | Status |
|---|-------|-------|--------|
| 1 | **`domains/attendance`** | moved `controllers/attendanceController` + `routes/attendanceRoutes` + `services/attendance/*` + `schemas/attendance` → `domains/attendance/{routes,controller,use-cases,marking,analytics,scope,schemas}`; `services/attendanceService.js` now a compat facade (2 tests import it); `/api/attendance` mounted from the domain. Behavior-preserving; server suite green. | 🟢 done 2026-06-10 |
| 2 | `domains/groups` | extract `controllers/team/*` + `Team` sync helpers into `domains/groups/` (LearningGroup target); transaction-heavy — own careful pass | ⚪ pending |
| 3 | schedule domain routes | promote `domains/schedule` from adapter to its own `/api/schedules` router (currently via legacy `scheduleController`) | ⚪ pending |
| 4 | repository interfaces | formalize repo boundaries (thin) where missing | ⚪ pending |
| 5 | frontend `features/` | group client by feature (deferred — client churn, low risk/value) | ⚪ pending |

## Definition of Done (per slice)
Behavior-preserving (verbatim) · server tests green (real pass) · `current-system-map.md`
updated for moved locations · tracker changelog line · commit. No spec change unless
behavior changed (it should not).

## Coupling notes (slice 1, verified)
- `services/attendanceService.js` (facade) imported by `controllers/attendanceController`
  + `tests/integration/{analyticsPerf,phaseAHardening}.test.js` → keep facade.
- `attendance-scope` internal to `services/attendance/*` only (no external import).
- `attendanceController` imported only by `routes/attendanceRoutes`.
- Attendance authz (UNION via `policy/sessionInstructors`, Phase 3) must be preserved verbatim.
