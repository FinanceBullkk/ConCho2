---
phase: 1
title: Operational dashboard — backend aggregation
status: done (2026-06-10)
priority: high
effort: 2.5–3.5 dev-days
depends_on: []
---

# Phase 1 — Operational dashboard backend

## Context Links
- Plan: [`plan.md`](./plan.md) · Business case KPIs: [`260610-0811`](../260610-0811-business-case-ltms-vs-excel.md) §5.4
- Reuse (code-truth): `server/domains/learning/reports/completion-rollup-use-case.js`
  (`buildCompletionRollup(actor)`), `reports/compliance-certificate-state.js` (cert expiry helper),
  `domains/learning/assignment/` (D4 status resolver), `controllers/dashboard/dashboard-stats.js`
  (attendance-rate / at-risk pattern), `models/{Attendance,Feedback,Certificate,Enrollment,User}.js`.
- Mount precedent: `domains/learning/routes.js:148-184` (reports under `report.read`).

## Overview
- **Priority:** high (MVP quick-win backbone) · **Status:** pending.
- Add ONE read-only endpoint `GET /api/learning/dashboard/operational` that returns the L&D
  operational KPI bundle in a single round (batched, fail-soft per metric), **composing** the
  existing rollup/compliance/attendance aggregations and adding the few missing ones.

## Key Insights (grounded)
- `buildCompletionRollup(actor)` already returns `summary{cohorts,learners,complete,completionRate,
  certificatesIssued}` + `programs[]` + `departments[]` and respects teacher class-scope
  (`classScopeForActor`). → completion KPIs are a **direct reuse**, not a rebuild.
- Overdue is **derived, not stored** (D4). Reuse the assignment status resolver to count
  `overdue` learners org-wide; do not re-implement status logic.
- Certificate expiry state already has a helper (`compliance-certificate-state.js`); reuse it to
  count `expiring`/`expired` over `Certificate.validUntil`.
- Attendance "present" = `status ∈ {P,L}` (see `dashboard-stats.js:95`); reuse that definition so
  the dashboard rate matches the legacy dashboard.
- Module shape mirrors `domains/learning/reports/` (controller/use-cases/repository/schemas).

## Requirements
**Functional**
- FR1 — `GET /api/learning/dashboard/operational` (cap `report.read`; Admin/Teacher + future
  Coordinator) returns: completion (overall + by program + by department, from rollup), attendance
  rate, active cohorts + session counts (upcoming/past), **overdue assignments** count + top-N list,
  **expiring certificates** count (≤30 & ≤60 days) + top-N, assessment pass rate, feedback average
  (overall + by program), training coverage % (active Participants with ≥1 enrollment/completion in window).
- FR2 — Each metric MUST be fail-soft: one failing aggregation returns a null/0 stub with an
  `errors[]` note, never 500s the whole bundle (mirror `dashboard-stats.js` `Promise.allSettled`).
- FR3 — Respect actor scope: a Teacher sees only their class-scoped data (reuse `classScopeForActor`);
  Admin/Coordinator see org-wide.
- FR4 — Read-only; no audit entry needed (no mutation). Pure GET.

**Non-functional**
- NF1 — Single endpoint, batched (`Promise.allSettled`), zero N+1 (mirror rollup's batched evidence).
- NF2 — English-only labels in payload keys/enums; no behavior change to existing reports/booking.
- NF3 — Response shape stable + documented in module README for the frontend (Phase 2) contract.

## Architecture
**Module:** `server/domains/learning/dashboard/`
```
controller.js     → getOperationalDashboard (envelope; handleError)
use-cases.js      → buildOperationalDashboard(actor, { window }) — compose + batch
repository.js     → new aggregations: overdue count, expiring certs, attendance rate,
                    session counts, feedback averages, coverage denominator/numerator
schemas.js        → zod query (optional window=30|60|90 days, default 30)
README.md         → response contract for Phase 2
```
**Data flow**
```
controller → use-cases.buildOperationalDashboard(actor)
   ├─ reuse reports.buildCompletionRollup(actor)         → completion summary/programs/departments
   ├─ reuse assignment status resolver                   → overdue count + top-N
   ├─ reuse compliance-certificate-state + Certificate   → expiring (≤30/≤60), expired counts
   ├─ Attendance.aggregate (present = P|L)               → attendance rate
   ├─ Schedule.aggregate (now split)                     → sessions upcoming/past, active cohorts
   ├─ Feedback.aggregate                                 → avg rating overall + by program/cohort
   └─ Enrollment/Completion                              → coverage % (distinct learners / active Participants)
   → Promise.allSettled → compose bundle (fail-soft per key)
```

## Related Code Files
**Create**
- `server/domains/learning/dashboard/{controller,use-cases,repository,schemas}.js` + `README.md`
- `server/tests/integration/learningDashboardOperational.test.js`
**Modify**
- `server/domains/learning/routes.js` — mount `GET /dashboard/operational` (`requireCapability('report.read')`)
- `docs/route-permission-matrix.md` (+ row); `docs/development-roadmap.md` (changelog)
**Reuse (no change)**
- `reports/completion-rollup-use-case.js`, `reports/compliance-certificate-state.js`,
  `domains/learning/assignment/` resolver, `helpers/teacher-class-scope.js`

## Implementation Steps
1. Scaffold `domains/learning/dashboard/` mirroring `reports/` layering.
2. `repository.js`: write the new batched aggregations (overdue, expiring certs, attendance rate,
   session split, feedback avg, coverage) — all `.lean()`/aggregate, no N+1.
3. `use-cases.buildOperationalDashboard(actor, {window})`: `Promise.allSettled` of
   `buildCompletionRollup(actor)` + the repository aggregations; compose a stable bundle with
   `errors[]` for any rejected metric.
4. `controller.getOperationalDashboard` → envelope + `handleError`.
5. Mount route under `report.read`; add zod query schema (window).
6. README documents the exact response shape (Phase 2 contract).
7. Integration tests (below). DoD: tests + lint green; route-matrix + roadmap; commit.

## Todo
- [x] `domains/learning/dashboard/` scaffold (controller/use-cases/repository/schemas/README)
- [x] Reuse `buildCompletionRollup` for completion KPIs
- [x] New aggs: overdue, expiring certs, attendance rate, session split, feedback avg, coverage %
- [x] `Promise.allSettled` fail-soft compose + `errors[]`
- [x] Mount `GET /dashboard/operational` (`report.read`) + zod window
- [x] Teacher class-scope respected; Admin org-wide (7/7 integration tests green)
- [x] Integration tests + route-matrix + roadmap + spec folded + commit

## Success Criteria
- **Happy:** Admin GET returns a full bundle (completion/attendance/overdue/expiring/feedback/coverage)
  matching seeded fixtures; numbers reconcile with the existing rollup + compliance endpoints.
- **Scope:** a Teacher gets only class-scoped completion; a Participant is denied (403, no `report.read`).
- **Fail-soft:** forcing one aggregation to throw returns the rest of the bundle + an `errors[]` entry, not 500.
- **Parity:** dashboard completionRate == `/reports/completion/rollup` summary for the same actor.

## Risk Assessment
| Risk | L×I | Mitigation |
|---|---|---|
| Re-implementing completion logic (drift from rollup) | Med×High | **Compose** `buildCompletionRollup`, never re-derive; parity test pins equality |
| Heavy bundle = slow endpoint at 1000 users | Med×Med | Batched aggregates only, `.lean()`, indexes already exist; add window cap; measure |
| Overdue/expiring logic duplicated from D4/D6 | Med×Med | Reuse assignment resolver + cert-state helper; no copy |

## Security Considerations
- Read-only, capability-gated (`report.read`); Participant denied. No new mutation surface, no audit needed.
- Teacher scope via `classScopeForActor` — no cross-class leakage. Sensitive fields never selected.

## Next Steps / Dependencies
- Feeds **Phase 2** (frontend consumes this bundle). Independent of the scheduling track.
- Per-Office breakdown deferred until re-center Phase 1 (Office) ships — add an `officeId` group then.

## Unresolved questions
- Coverage denominator = active Participants only, or all active employees? (default: active Participants.)
- Window default 30d for "expiring"/"coverage" — confirm.
