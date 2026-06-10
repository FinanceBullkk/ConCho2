---
phase: 4
title: Executive dashboard — frontend (C-level ROI)
status: done (2026-06-10) — components flat in pages/learning/ (Dashboard* prefix) per codebase convention; controlled-state form (matches AssignmentFormModal precedent, not RHF)
priority: high
effort: 2.5–3.5 dev-days
depends_on: [2, 3]
---

# Phase 4 — Executive dashboard frontend (ROI tier)

## Context Links
- Plan: [`plan.md`](./plan.md) · Backend contract: [`phase-03`](./phase-03-executive-dashboard-backend.md) ·
  Shell: [`phase-02`](./phase-02-operational-dashboard-frontend.md) (`LdDashboardTab` toggle).
- Audience framing: business case §1 (C-level ROI language), §5.5 (exec KPIs).

## Overview
- **Priority:** high (the persuasion layer for leadership) · **Status:** pending.
- Fill the **Executive** half of the Dashboard tab toggle (Admin-only): a low-density, narrative
  ROI view — coverage, a 6-month completion **trend** (dependency-free SVG sparkline), Kirkpatrick
  L1+L2 rollup (with honest "L3–L5 not yet measured" labels), path/mobility, certificate validity,
  and financial tiles (or a "Set L&D budget" call-to-action when unconfigured) + a cost-config form.

## Key Insights (grounded)
- Phase 2 already built the tab shell + Operational|Executive toggle; this phase only adds the
  Executive panel + an Admin-only cost-config form. DRY.
- Executive tier = **few numbers, trends, story** (business case design note) — opposite of the dense
  operational grid. Use large tiles + one sparkline, not a table wall.
- Still **dependency-free** (D3): a small inline-SVG `Sparkline` + `DonutStat` (stroke-dasharray) —
  no recharts. Keep them thin/swappable.
- Honesty rule (D6): render L3–L5 as muted "Not yet measured" chips; render financials only when the
  backend says `configured:true`, else a CTA to set the budget.

## Requirements
**Functional**
- FR1 — Executive panel (Admin-only) renders: coverage % (org + top departments), completion trend
  sparkline (6 months), Kirkpatrick rollup (L1 feedback avg, L2 pass rate; L3–L5 "Not yet measured"),
  path/mobility count, certificate validity donut (valid/expiring/expired), financial tiles
  (cost/employee, cost/completion) **or** a "Set L&D budget to unlock ROI" CTA.
- FR2 — An Admin-only **cost-config form** (annual budget + currency + avg loaded hourly cost) that
  GET/PUTs `/dashboard/cost-config`; on save, financial tiles populate.
- FR3 — Non-Admin never sees the Executive panel (toggle hidden) AND the endpoint is Admin-only
  server-side — UI hiding is not the boundary.
- FR4 — Loading/empty/error + `errors[]` handling; English-only via `t()` + `en.json`.

**Non-functional**
- NF1 — No new dependency (inline-SVG `Sparkline`/`DonutStat`). Lint ≤ cap 81; build clean.
- NF2 — React Query (`qk.learning.dashboardExecutive`, `qk.learning.costConfig`); theme tokens; a11y labels on SVG.

## Architecture
**Components (new, under `components/learning/dashboard/`)**
```
ExecutiveDashboard.jsx   → coverage + trend + Kirkpatrick + mobility + cert donut + financials
Sparkline.jsx            → inline-SVG line (6 points), no dep
DonutStat.jsx            → SVG stroke-dasharray donut, no dep
KirkpatrickRollup.jsx    → L1/L2 values + L3–L5 "Not yet measured" chips
CostConfigForm.jsx       → react-hook-form + zod; GET/PUT cost-config (Admin)
FinancialTiles.jsx       → cost/employee + cost/completion OR "Set budget" CTA
```
**Data**
```
api.js: learningAPI.getExecutiveDashboard(), getCostConfig(), setCostConfig(body)
hooks/useLearningDashboard.js: + useExecutiveDashboard(), useCostConfig(), useSetCostConfig()
queryKeys.js: qk.learning.dashboardExecutive, qk.learning.costConfig
```

## Related Code Files
**Create**
- `client/src/components/learning/dashboard/{ExecutiveDashboard,Sparkline,DonutStat,KirkpatrickRollup,CostConfigForm,FinancialTiles}.jsx`
- tests: `__tests__/ExecutiveDashboard.test.jsx`, `CostConfigForm.test.jsx`
**Modify**
- `client/src/components/learning/dashboard/LdDashboardTab.jsx` (mount Executive panel in the toggle)
- `client/src/api/api.js`, `client/src/hooks/useLearningDashboard.js`, `client/src/hooks/queryKeys.js`
- `client/src/i18n/locales/en.json`

## Implementation Steps
1. API methods + query keys + hooks (`useExecutiveDashboard`, `useCostConfig`, `useSetCostConfig`).
2. `Sparkline` + `DonutStat` inline-SVG primitives (dependency-free, a11y-labelled).
3. `ExecutiveDashboard` panel: coverage tiles + trend sparkline + `KirkpatrickRollup` + mobility + cert donut.
4. `FinancialTiles` (configured → numbers; unconfigured → CTA) + `CostConfigForm` (RHF+zod, Admin).
5. Wire into `LdDashboardTab` Executive toggle (Admin-only); loading/empty/`errors[]` states.
6. en.json; component tests (Admin renders panel; non-Admin can't; unconfigured shows CTA; config save populates).
7. DoD: client tests + lint (≤81) + build green; roadmap changelog; capability/reporting spec note; commit.

## Todo
- [x] API + query keys + hooks (executive, cost-config get/set + invalidation)
- [x] `Sparkline` + `DonutStat` in `DashboardCharts.jsx` (inline SVG, no dep, a11y-labelled)
- [x] `DashboardExecutivePanel` (financials/trend/Kirkpatrick/mobility/cert donut/coverage bars)
- [x] Financial tiles vs set-budget CTA + `DashboardCostConfigForm` (lazy-init + key-remount)
- [x] Mounted in `DashboardTab` Executive toggle (Admin-only) + loading/error/fail-soft states
- [x] en.json + 6 component tests + lint ≤ cap/build clean + roadmap + commit

## Success Criteria
- **Happy:** Admin → Dashboard tab → Executive → coverage/trend/Kirkpatrick/mobility/cert donut render;
  with cost config set, financial tiles show cost/employee + cost/completion.
- **Honesty:** L3–L5 show "Not yet measured"; with no budget, financials show the CTA (no fake numbers).
- **Authz:** non-Admin cannot open Executive (toggle hidden) and the endpoint 403s server-side.
- **Quality:** no new dependency; lint ≤ 81; build clean.

## Risk Assessment
| Risk | L×I | Mitigation |
|---|---|---|
| Inline-SVG charts look unpolished for C-level | Med×Med | Keep exec view sparse + clean tiles; sparkline/donut are enough; recharts remains an easy later swap |
| Cost-config form exposes financial data broadly | Low×High | Admin-only form + Admin-only endpoint; audited PUT |
| Misleading ROI if HR enters wrong budget | Med×Med | Form shows units/currency clearly; tiles label "based on entered budget"; values are transparent inputs |

## Security Considerations
- Executive panel + cost config Admin-only on **both** client (hidden toggle/form) and server (Admin guard,
  audited PUT, CSRF + write limiter). UI hiding never the sole boundary.

## Next Steps / Dependencies
- Needs **Phase 2** (tab shell/toggle) + **Phase 3** (executive + cost-config endpoints).
- Closes the 2-tier dashboard. Future: Kirkpatrick L3 behavior survey (separate item), per-Office ROI
  (after Office ships), recharts upgrade if leadership wants richer visuals.

## Unresolved questions
- Trend lines: completions only, or completions + certificates as two series? (matches Phase 3 decision.)
- Do we want a one-click "export executive snapshot" (PDF/xlsx) for board decks? (defer unless asked.)
