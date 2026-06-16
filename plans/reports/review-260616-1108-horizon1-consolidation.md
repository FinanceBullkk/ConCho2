# Consolidation review — Investment Build Plan + Modernization Horizon 1

Date: 2026-06-16 · Scope: the 8 features shipped this session (PRs #108–#116) + docs sync (#117).
Goal (repo "No feature factory" rule): verify wiring, permissions, UX flow, data
consistency, incomplete loops — before adding more capability.

## Verdict
**No bugs found.** Wiring + authz are consistent across all 8 features. The only real
gap was a set of **incomplete loops** (server API built, no client UI). The highest-impact
one is now **closed**; the rest are low-value and logged below as follow-ups.

## ✅ Confirmed good
- **Nav → route → page** intact for all new surfaces: `/budget`, `/compliance`,
  `/scheduling`, `/cost-roi` (nav item ↔ `App.jsx` route ↔ lazy import ↔ page file all present).
- **Route guards match nav access:** `/budget` + `/compliance` = `{Admin,Coordinator}`;
  `/scheduling` + `/cost-roi` = `{Admin}` on BOTH the nav `access` map and the `ProtectedRoute roles`.
- **Client perm keys exist + match server caps:** `manage:budget` (=`budget.manage`) and
  `manage:compliance` (=`compliance.manage`), both `[Admin,Coordinator]`. No `can()` call
  references an undefined permission.
- **Coordinator** correctly sees Configure ▸ Compliance + Budget (other Configure items stay Admin-only).
- Server suites **116/1109** + client **391** green; lint 63 (cap); build clean.

## Incomplete loops (API built, no UI)
| # | Loop | Severity | Action |
|---|---|---|---|
| 1 | **Cost entries: create-only** — `listCostEntries`/`archiveCostEntry` had 0 client consumers. A mis-keyed cost permanently skewed the roll-up/variance with no UI to view or undo it (DB-only fix). | **Real UX hole** | **CLOSED** — added a "Recent cost entries" panel (list + remove) to the Budget dashboard + `useCostEntries`/`useArchiveCostEntry` hooks. |
| 2 | **Skills taxonomy tree** — `GET /api/skills/taxonomy` + `useTaxonomy` built/tested, but no component renders the tree (the parent picker uses the flat skill list). | Low | Follow-up — optional tree view on the Studio Skills page. |
| 3 | **Per-user compliance** — `GET /api/compliance/user/:id` + client API method, no UI (matrix drill-down lists names but doesn't open one person). | Low | Follow-up — drawer on a non-compliant person. |
| 4 | **Edit requirement** — `PUT /api/compliance/requirements/:id` exists; matrix only creates + archives. | Low | Follow-up — create+archive covers the loop (delete→recreate to edit). |
| 5 | **Edit budget** — `PUT /api/finance/budgets/:id` exists; dashboard only creates + archives. | Low | Same as #4. |

> #2–#5 are NOT bugs: the endpoints are tested + secure; they're just not surfaced. Create+archive
> covers the core loop for #4/#5. None block a user flow now that #1 is closed.

## Notes
- `/compliance` + `/budget` pages are UI-gated to `{Admin,Coordinator}` even though the server
  *read* for compliance is the broader `report.read` (Teacher holds it). Intentional: matrix/budget
  are management surfaces; server still enforces, so no security gap — just a stricter UI.
- Finance reads use `budget.manage` (not `report.read`) by design — budget figures are
  management-sensitive (documented in the `budget-and-cost` spec).

## Unresolved questions
- Worth surfacing the skills taxonomy tree (loop #2), or is the flat list + parent picker enough?
- Do compliance officers need a per-person compliance drawer (loop #3), or is the matrix drill-down enough?
