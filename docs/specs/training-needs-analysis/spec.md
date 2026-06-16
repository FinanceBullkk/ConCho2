---
capability: training-needs-analysis
status: stable
owners: [domains/planning, models/TrainingRequest, models/TrainingPlan]
last_updated: 2026-06-16
related_code:
  - server/models/TrainingRequest.js
  - server/models/TrainingPlan.js
  - server/domains/planning/
  - server/domains/planning/use-cases.js
  - server/policy/capabilities.js
  - client/src/features/planning/PlanningPage.jsx
related_plans:
  - plans/260616-1310-a4-training-needs-analysis/
---

# Capability: Training Needs Analysis → Annual Plan

> **Source of truth for BEHAVIOR.** Modernization Horizon 2 (A4). A demand-intake
> pipeline: collect training requests across the org → aggregate demand → turn
> approved demand into a costed annual plan + scheduled cohorts (carrying the
> estimate into the A1 budget).

## Purpose

Replace ad-hoc training requests with a tracked pipeline. Each `TrainingRequest`
captures "department D needs N people trained on <program|skill> by <quarter>".
L&D sees demand aggregated by program/skill/quarter/department, approves it, and
a planner turns approved demand into `TrainingPlan` items that schedule into
cohorts — closing the loop into A1 budgets.

## Business Requirements (BR)

- **BR-1:** Admins/Coordinators submit/edit training requests; mutations audited;
  archive soft-deletes.
- **BR-2:** A request moves through a status machine
  (`submitted → in-review → approved → planned`, or `→ rejected`); illegal
  transitions are rejected.
- **BR-3:** Demand aggregates by program / skill / quarter / department (Σ
  headcount + request count), scoped to a fiscal year.
- **BR-4:** A `TrainingPlan` (one per fiscal year) holds costed items; a program
  item can be **scheduled** into a cohort (`Class`), which links the cohort, marks
  the matching approved requests `planned`, and carries the item's est cost into
  an A1 `Budget`.
- **BR-5:** All routes require the `training.plan` capability (Admin +
  Coordinator).

## Actors & Use Cases (UC)

- **UC-1 (`training.plan`):** submit / list / archive training requests.
- **UC-2 (`training.plan`):** transition a request's status.
- **UC-3 (`training.plan`):** view aggregated demand
  (`GET /api/planning/demand?by=&fiscalYear=`).
- **UC-4 (`training.plan`):** read/upsert the annual plan
  (`GET|PUT /api/planning/plan/:fy`).
- **UC-5 (`training.plan`):** schedule a plan item into a cohort
  (`POST /api/planning/plan/:fy/items/:itemId/schedule`).

## Entities

- **TrainingRequest** (`server/models/TrainingRequest.js`): `requestedBy`,
  `departmentId`, `target {kind:'program'|'skill', id}`, `headcount`,
  `rationale`, `priority`, `targetQuarter` (`YYYY-Qn`), `status`, soft-delete.
- **TrainingPlan** (`server/models/TrainingPlan.js`): `fiscalYear` (unique),
  `items [{ target, quarter, demand, estCostMinor, cohortIds[] }]`, soft-delete.

## Functional Requirements (FR)

### Requirement: Request intake + status machine [BR-1, BR-2, UC-1, UC-2]

`POST /api/planning/requests` creates a `submitted` request (audited).
`PATCH /api/planning/requests/:id/status` enforces the transition map; an illegal
move is rejected `400`. `DELETE` soft-deletes.

#### Scenario: Illegal transition rejected
- **GIVEN** an `approved` request
- **WHEN** a transition to `submitted` is attempted
- **THEN** the request is rejected `400`

### Requirement: Demand aggregation [BR-3, UC-3]

`GET /api/planning/demand?by=program|skill|quarter|department&fiscalYear=` returns
`{ by, totalDemand, rows:[{ key, label, demand, count }] }` over non-rejected
requests, summing headcount.

#### Scenario: Demand by program
- **GIVEN** two requests on program A (5 + 3 headcount) and one on B (4)
- **WHEN** demand is requested `by=program`
- **THEN** A reports `demand:8, count:2`, B `demand:4`, and `totalDemand:12`

### Requirement: Plan item → cohort (+ budget carry) [BR-4, UC-4, UC-5]

`PUT /api/planning/plan/:fy` upserts the plan items.
`POST /api/planning/plan/:fy/items/:itemId/schedule` (program items only) creates
a `Class` cohort from the program, links its id onto the item, marks the matching
`approved` requests `planned`, and — when `estCostMinor > 0` — creates an A1
`Budget` (tenant currency). A skill item, or a duplicate class code, is rejected
(`400`/`409`).

#### Scenario: Schedule creates a cohort and a budget
- **GIVEN** a 2026 plan item for a program (`estCostMinor: 500000`) and two
  approved requests for it
- **WHEN** the item is scheduled with a class code
- **THEN** a `Class` cohort is created and linked, the two requests become
  `planned`, and a `Budget {fiscalYear:'2026', programId, amountMinor:500000}` exists

## Non-Functional Requirements (NFR)

- **Authz:** every route = `training.plan` (Admin + Coordinator); mutations audited.
- **Money:** est cost is integer minor units; the budget carry uses the tenant currency.
- **Derived, not stored:** demand recomputes on read from `TrainingRequest`.

## Acceptance Criteria (AC)

- [ ] Requests submit; demand aggregates by program/skill/quarter/department.
- [ ] Approved demand converts into cohorts via the program/cohort builder,
      carrying an estimated cost into A1's budget.
- [ ] Plan view shows demand vs planned vs scheduled (cohort count per item).
- [ ] Status machine governs the request lifecycle; audited.

## Error & Edge Cases

| Trigger | Behavior | Recovery |
|---|---|---|
| Any route without `training.plan` | 403 | Admin/Coordinator |
| Illegal status transition | 400 | follow the machine |
| Schedule a skill plan item | 400 | schedule program items |
| Duplicate cohort class code | 409 | use a unique code |
| `targetQuarter` not `YYYY-Qn` | 400 (zod) | e.g. `2026-Q1` |

## Out of Scope / Deferred

- **Manager self-service intake** — submit is gated to `training.plan` (Admin +
  Coordinator); opening intake to any line-manager needs a manager-identity gate
  (org hierarchy) → follow-up.
- **A7 approval engine** (Horizon 3) — the status *machine* exists; A7 will later
  DRIVE transitions (and plug into B8 chat approvals).
- **Skill → cohort scheduling** — only program plan items schedule into cohorts;
  skill demand informs planning but maps to a program before scheduling.
- **Deep cohort generation** — `schedule` creates a minimal `Class` (admin
  supplies class code + session count); full session generation stays in the
  scheduling tools.
