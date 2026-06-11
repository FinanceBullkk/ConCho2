---
phase: 2
title: Operational dashboard — frontend (L&D / coordinator)
status: done (2026-06-10) — components live in pages/learning/ (flat, Dashboard* prefix) per codebase convention, not components/learning/dashboard/ as drafted
priority: high
effort: 2.5–3.5 dev-days
depends_on: [1]
---

# Phase 2 — Operational dashboard frontend

## Context Links
- Plan: [`plan.md`](./plan.md) · Backend contract: [`phase-01`](./phase-01-operational-dashboard-backend.md) README
- Patterns to mirror: existing Learning **Reports** tab (Completion/Compliance toggle), `components/ui/`
  shadcn primitives, `hooks/queryKeys.js` (`qk.learning.*`), `api/api.js` (`learningAPI`), `useRole`.
- Decision D3 (dependency-free charts), D5 (Dashboard tab + Operational|Executive toggle).

## Overview
- **Priority:** high (this is the visible quick win) · **Status:** pending.
- Add a **Dashboard tab** to the Learning workspace (`/learning`) showing the operational KPI bundle
  as summary tiles + dense breakdown bars + drill-down links, built **dependency-free** (Tailwind +
  inline SVG/CSS bars), gated to Admin/Teacher (+ future Coordinator).

## Key Insights (grounded)
- The Reports tab already does "summary tiles + dense table + on-demand load + role gate" — reuse its
  structure and the Completion/Compliance toggle precedent for the Operational|Executive switch (D5).
- No chart library is installed (`client/package.json`). v1 uses small presentational components:
  `StatTile`, `BarRow` (CSS width %), `MiniBarList` — no new dependency.
- Query keys live in `queryKeys.js`; add `qk.learning.dashboardOperational`. API objects in `api.js`.

## Requirements
**Functional**
- FR1 — A **Dashboard** tab on `/learning` (gated `read:reports`) renders the operational bundle:
  completion tiles (overall %, by program, by department), attendance rate, overdue count + top-N
  list (link → assignment/compliance view), expiring certificates count + top-N, assessment pass
  rate, feedback average, training coverage %.
- FR2 — An **Operational | Executive** toggle heads the tab; Executive is Admin-only (Phase 4) and
  hidden/disabled for non-Admins. Operational is the default.
- FR3 — Drill-downs: overdue → existing Compliance report (status=overdue); expiring certs → a filtered
  view; by-program/department bars link to the matching cohort/report where one exists.
- FR4 — Loading/empty/error states per the bundle's `errors[]` (a failed metric shows "unavailable",
  not a blank screen). English-only strings via `t()` + `en.json`.

**Non-functional**
- NF1 — No new npm dependency (D3). Charts = Tailwind/SVG presentational components.
- NF2 — React Query for all fetches (no useEffect+fetch); reuse `qk` keys; lint ≤ cap 81; build clean.
- NF3 — Responsive + dark/light via theme tokens (no hardcoded colors); a11y (tiles are not buttons unless interactive).

## Architecture
**Components (new, presentational under `components/learning/dashboard/`)**
```
LdDashboardTab.jsx        → tab shell + Operational|Executive toggle (role-gated)
OperationalDashboard.jsx  → grid of tiles + breakdowns; consumes the bundle
StatTile.jsx              → label + value + delta/footnote (reusable)
BarRow.jsx / MiniBarList  → CSS-width horizontal bars for program/department breakdowns
OverdueList.jsx / ExpiringCertsList.jsx → top-N lists with drill-down links
```
**Data**
```
api.js: learningAPI.getOperationalDashboard(params) → GET /api/learning/dashboard/operational
hooks/useLearningDashboard.js: useOperationalDashboard(params) (React Query)
queryKeys.js: qk.learning.dashboardOperational = (params) => ['learning','dashboard','operational',params]
```

## Related Code Files
**Create**
- `client/src/components/learning/dashboard/{LdDashboardTab,OperationalDashboard,StatTile,BarRow,MiniBarList,OverdueList,ExpiringCertsList}.jsx`
- `client/src/hooks/useLearningDashboard.js`
- tests: `client/src/components/learning/dashboard/__tests__/OperationalDashboard.test.jsx` (+ tile/role tests)
**Modify**
- `client/src/api/api.js` (`learningAPI.getOperationalDashboard`)
- `client/src/hooks/queryKeys.js` (`qk.learning.dashboardOperational`)
- Learning workspace page — register the Dashboard tab; `useRole` (`read:reports` gate; recognize Coordinator later)
- `client/src/i18n/locales/en.json` (dashboard strings)

## Implementation Steps
1. Add `learningAPI.getOperationalDashboard` + `qk.learning.dashboardOperational` + `useOperationalDashboard`.
2. Build `StatTile`, `BarRow`, `MiniBarList` presentational primitives (dependency-free).
3. Build `OperationalDashboard` consuming the bundle → tiles + breakdown bars + top-N lists + drill-down links.
4. Add `LdDashboardTab` with the Operational|Executive toggle (Executive disabled for non-Admin; Phase 4 fills it).
5. Register the tab on `/learning` behind `read:reports`; wire loading/empty/`errors[]` states.
6. en.json strings; component tests (render tiles, role gate hides Executive, errors[] → "unavailable").
7. DoD: client tests + lint (≤81) + build green; roadmap changelog; commit.

## Todo
- [x] API method + query key + React Query hook (`useLearningDashboard.js` — useLearning.js at size cap)
- [x] `DashboardWidgets` StatTile/MetricBars/MetricUnavailable (no new dep)
- [x] `DashboardOperationalPanel` tiles + breakdowns + top-N lists + window select
- [x] `DashboardTab` Operational|Executive toggle (Executive Admin-only Phase-4 placeholder)
- [x] Registered first tab on `/learning` (`read:reports`); loading/error/fail-soft states
- [x] en.json + 6 component tests + suite 202/44 + lint at cap + build clean + commit

## Success Criteria
- **Happy:** Admin opens `/learning` → Dashboard tab → sees populated tiles/bars matching the backend bundle.
- **Role:** Teacher sees class-scoped operational data; Executive toggle hidden; Participant cannot reach the tab.
- **Resilience:** a metric in `errors[]` renders "unavailable" without breaking the page.
- **Quality:** lint ≤ cap 81, build clean, no new dependency added.

## Risk Assessment
| Risk | L×I | Mitigation |
|---|---|---|
| Dependency-free charts look weak for exec persuasion | Med×Med | Operational tier is functional (tiles/bars suffice); polish charts in Phase 4 if needed (still defer recharts) |
| Tab overcrowding | Med×Low | Group into sections (Completion · Obligations · Quality · Coverage); progressive disclosure |
| Drift from backend contract | Low×Med | Phase 1 README is the contract; test asserts shape |

## Security Considerations
- UI gating is UX only; server `report.read` is the boundary. Executive toggle hidden for non-Admin AND
  the executive endpoint is Admin-only server-side (Phase 3) — never rely on the hidden toggle.

## Next Steps / Dependencies
- Needs **Phase 1** bundle. The Operational|Executive toggle's Executive half is filled by **Phase 4**.
- May run in parallel with **Phase 3** (backend executive) — different files.

## Unresolved questions
- Should a Coordinator login land on this dashboard by default (vs catalog)? (Plan open question.)
