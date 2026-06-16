---
capability: budget-and-cost
status: stable
owners: [domains/finance, models/CostEntry, models/Budget]
last_updated: 2026-06-16
related_code:
  - server/models/CostEntry.js
  - server/models/Budget.js
  - server/domains/finance/
  - server/domains/finance/use-cases.js
  - server/policy/capabilities.js
  - server/domains/learning/dashboard/executive-use-cases.js
  - client/src/features/finance/BudgetDashboardPage.jsx
related_plans: []
---

# Capability: Budget & Cost Management

> **Source of truth for BEHAVIOR.** Modernization Horizon 1 (A1). Record actual
> training costs and planned budgets, roll up spend by any scope dimension, and
> see budget-vs-actual variance per fiscal year. Feeds the Executive ROI screen
> real numbers alongside the budgeted estimate.

## Purpose

Turn the Executive ROI screen's estimates into real money: log each cost line
(trainer / venue / material / vendor / travel / other) against a program /
cohort / session / department / vendor, set per-fiscal-year budgets, and derive
roll-ups + variance. Cost-per-completion is **derived** (Σ cost ÷ completions),
never stored.

## Business Requirements (BR)

- **BR-1:** Admins/Coordinators record cost entries (`CostEntry`) and budgets
  (`Budget`); both soft-delete, every mutation audited.
- **BR-2:** Cost entries roll up by program / department / cohort / vendor / type
  for any period (fiscal year or explicit window).
- **BR-3:** Budget-vs-actual variance per fiscal year flags over-budget; actual
  spend is **derived** by matching cost entries to a budget's scope.
- **BR-4:** Money is integer **minor currency units**; a **single tenant
  currency** is enforced on every write (from the executive cost-config → env
  `DEFAULT_CURRENCY` → `USD`).
- **BR-5:** Trailing-12-month actual spend + cost-per-completion (actual) surface
  on the Executive ROI screen next to the budgeted estimate.
- **BR-6:** Read AND write both require `budget.manage` (Admin + Coordinator);
  budget figures are management-sensitive and deliberately do NOT roll into the
  broader `report.read`.

## Actors & Use Cases (UC)

- **UC-1 (`budget.manage`):** create / edit / archive a cost entry.
- **UC-2 (`budget.manage`):** create / edit / archive a budget.
- **UC-3 (`budget.manage`):** view cost roll-up
  (`GET /api/finance/costs/rollup?by=&fiscalYear=`).
- **UC-4 (`budget.manage`):** view budget variance
  (`GET /api/finance/budgets/variance?fiscalYear=&departmentId=`).

## Entities

- **CostEntry** (`server/models/CostEntry.js`): `scope {programId?, cohortId?,
  sessionId?, departmentId?, vendorId?}`, `type`, `amountMinor`, `currency`,
  `incurredOn`, `poRef`, `note`, `createdBy`, soft-delete. `scope.departmentId`
  is a deliberate, minimal extension of the handoff model (programId/cohortId/
  sessionId/vendorId) so the department roll-up + budget variance match
  directly; `vendorId` is nullable until A2 (Vendor) lands in Horizon 2.
- **Budget** (`server/models/Budget.js`): `fiscalYear`, `departmentId?`,
  `programId?`, `amountMinor`, `currency`, `label`, soft-delete. A budget with
  neither department nor program is the org-wide allowance for that year.

## Functional Requirements (FR)

### Requirement: Cost & budget CRUD (audited, currency-enforced) [BR-1, BR-4, BR-6, UC-1, UC-2]

`/api/finance/costs` and `/api/finance/budgets` support list/create/update/
archive; all require `budget.manage`. A supplied `currency` MUST equal the
tenant currency (else 400); omitted currency defaults to it. Every mutation
audits (`entity:'CostEntry'` / `'Budget'`).

#### Scenario: Currency is single-tenant
- **GIVEN** the tenant currency is `VND`
- **WHEN** a cost entry is created with `currency:'USD'`
- **THEN** the request is rejected `400` naming the required currency
- **AND** a cost entry created with no currency is stored as `VND`

### Requirement: Cost roll-up [BR-2, UC-3]

`GET /api/finance/costs/rollup?by=program|department|cohort|vendor|type` returns
`{ by, grandTotalMinor, rows:[{ key, label, totalMinor, count }] }`, sorted by
spend desc, scoped to the fiscal year (or explicit `from`/`to`). Entries with no
value for the grouping dimension fall under `key:null, label:'Unallocated'`.

#### Scenario: Group by program
- **GIVEN** two cost entries on program A (300k + 200k) and one on program B (100k)
- **WHEN** the roll-up is requested `by=program` for the fiscal year
- **THEN** program A reports `totalMinor:500000, count:2` first (desc),
  program B `totalMinor:100000`, and `grandTotalMinor:600000`

### Requirement: Budget vs actual variance [BR-3, UC-4]

`GET /api/finance/budgets/variance?fiscalYear=&departmentId=` returns one row
per budget with `{ budgetMinor, actualMinor, varianceMinor, utilizationPct,
overBudget }` plus `totals`. A cost matches a budget when it satisfies ALL of the
budget's set scope constraints (department / program) within the fiscal year;
per-budget actuals can overlap, so `totals` is the sum of the rows (not a
deduplicated org figure).

#### Scenario: Over-budget flagged, other years ignored
- **GIVEN** a 1,000,000 budget for a department in FY2026 and matched cost
  entries summing 1,200,000 in 2026 (plus a 2025 entry)
- **WHEN** variance is computed for FY2026
- **THEN** the row reports `actualMinor:1200000, varianceMinor:-200000,
  utilizationPct:120, overBudget:true` and the 2025 entry is excluded

### Requirement: Executive ROI actuals [BR-5]

When the executive cost-config is set, the ROI `financials` block additionally
carries `actualSpendTrailing12MonthsMinor` (Σ logged `CostEntry` over the
trailing year) and `costPerCompletionActualMinor` — surfaced next to the
budget-derived estimates. Unconfigured financials are unchanged (`{configured:false}`).

## Non-Functional Requirements (NFR)

- **Authz:** read + write = `budget.manage` (Admin + Coordinator); all mutations audited.
- **Money:** integer minor units only; single tenant currency enforced on write.
- **Derived, not stored:** roll-ups, variance, and cost-per-completion recompute
  on read from `CostEntry` + `Budget`; no per-scope cached totals.

## Acceptance Criteria (AC)

- [ ] Cost + budget CRUD with soft-delete; `budget.manage` to read and write; mutations audited.
- [ ] Roll-up by program / department / cohort / vendor / type for a period.
- [ ] Variance per fiscal year with over-budget flagged; cross-year costs excluded.
- [ ] Single currency enforced per tenant; amounts are minor units.
- [ ] Trailing actual spend + cost-per-completion (actual) surface on Executive ROI.

## Error & Edge Cases

| Trigger | Behavior | Recovery |
|---|---|---|
| Manage/read without `budget.manage` | 403 | Admin/Coordinator |
| Currency ≠ tenant currency | 400 (names required currency) | omit, or match it |
| `amountMinor` negative / non-integer | 400 (zod) | provide ≥ 0 integer |
| `fiscalYear` not 4 digits | 400 (zod) | e.g. `"2026"` |
| Budget scope matches no costs | row `actualMinor:0`, `utilizationPct:0` | none |

## Out of Scope / Deferred

- **A2 Vendor** (Horizon 2) — `scope.vendorId` is nullable; vendor roll-up labels
  the raw id until the Vendor model lands.
- Multi-currency / FX conversion — single tenant currency only.
- Per-program cost-per-completion drill-down (org-level only on the Executive ROI today).
- PO/invoice attachments — `poRef` is a free-text reference, no document store.
