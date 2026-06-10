---
title: LTMS 2-tier Dashboard — operational (L&D) + executive (C-level) on existing data
status: pending
priority: high (quick win — proves value before the long scheduling track)
effort_total: ~10–14 dev-days (Phase 1+2 = MVP quick win ~5–7d; Phase 3+4 = ROI layer ~5–7d)
created: 2026-06-10
based_on:
  - plans/260610-0811-business-case-ltms-vs-excel.md (§5.4 ops KPIs, §5.5 ROI KPIs, §7.1 recommendation)
  - server/domains/learning/reports/ (existing aggregations — DRY reuse)
  - docs/development-roadmap.md (Wave B/C/D data already captured)
---

# LTMS 2-tier Dashboard

## Why this first
The business case ([260610-0811](../260610-0811-business-case-ltms-vs-excel.md)) names this the
**#1 recommendation**: the system already captures completion, certificates, attendance,
assessments, feedback, assignments, and org data — but leadership has **no screen** to see it.
Per the repo's own agent contract: *"latent value is debt if reports cannot consume it."* This
plan turns already-captured data into two screens — an **operational** dashboard (L&D head /
coordinator) and an **executive** dashboard (C-level ROI) — mostly a **compose + visualize**
layer over existing aggregations. It is the cheapest, highest-visibility next step.

## Core insight (code-grounded)
Most aggregation already exists and is reused, not rebuilt:
- `domains/learning/reports/completion-rollup-use-case.buildCompletionRollup(actor)` →
  `{ summary, programs[], departments[] }` (completionRate, certificatesIssued). **Backbone.**
- `reports/compliance-use-cases` joins assignment + org + certificate state.
- `reports/compliance-certificate-state.js` → certificate expiry state helper.
- legacy `controllers/dashboard/dashboard-stats.js` → attendance rate + at-risk pattern.
- D4 assignment status resolver (`domains/learning/assignment/`) → overdue derivation.
The dashboard **composes** these and adds a few genuinely-new aggregations (overdue counts,
expiring-cert counts, feedback averages, training coverage %, time-bucketed trends).

## Locked decisions
| # | Decision | Rationale |
|---|---|---|
| D1 | New module `domains/learning/dashboard/` (sibling to `reports/`) that **composes** report use-cases | DRY; keeps export-focused `reports/` separate from tile/trend-focused dashboard |
| D2 | Endpoints `GET /api/learning/dashboard/operational` (`report.read`) + `/executive` (`report.read` coarse + **Admin-only** inside, mirrors compliance) | Reuse existing cap; executive financials are leadership-only |
| D3 | **Dependency-free charts v1** (summary tiles + CSS/SVG bars + tiny SVG sparkline); defer `recharts` | Avoid npm-audit/bundle risk; ship the quick win; charts are a thin swappable layer |
| D4 | L&D cost inputs stored as a `Setting` key `LND_COST_CONFIG` (annual budget, currency, avg loaded hourly cost); financial KPIs compute **only when present**, else "set budget to enable" — **never fake numbers** | Reuse `Setting` model; keeps ROI tier honest (business case §9) |
| D5 | Surface as a **Dashboard tab** in the existing Learning workspace (`/learning`) with an **Operational \| Executive** toggle (Executive Admin-only) — mirror the Reports Completion/Compliance toggle | DRY with existing tab + toggle pattern; no new app area |
| D6 | Kirkpatrick rollup shows **L1 (feedback avg) + L2 (assessment pass rate) only**, honestly labels L3–L5 "not yet measured" | L3 needs a behavior survey = separate future item; no aspirational metrics |

## Phases
| Phase | Title | Depends on | Status | Effort |
|---|---|---|---|---|
| 1 | [Operational dashboard — backend aggregation](./phase-01-operational-dashboard-backend.md) | — (existing data) | 🟢 done 2026-06-10 | 2.5–3.5d |
| 2 | [Operational dashboard — frontend (L&D/coordinator)](./phase-02-operational-dashboard-frontend.md) | 1 | pending | 2.5–3.5d |
| 3 | [Executive dashboard — backend + cost config + trends](./phase-03-executive-dashboard-backend.md) | 1 | pending | 2.5–3.5d |
| 4 | [Executive dashboard — frontend (C-level ROI)](./phase-04-executive-dashboard-frontend.md) | 2, 3 | pending | 2.5–3.5d |

**MVP quick win = Phase 1 + 2** (operational tier ships value immediately). Phase 3 + 4 (ROI
persuasion layer) follow fast. Phases 2 and 3 may run in parallel after Phase 1 (frontend-ops
vs backend-exec touch different files).

## Out of scope (YAGNI)
Kirkpatrick L3/L4/L5 measurement (behavior survey = separate item), recharts/heavy charting,
real-time websockets, per-Office breakdowns (land when Office ships — re-center Phase 1),
saved dashboard presets, scheduled email digests of dashboards, predictive analytics.

## Definition of Done (per phase)
Code + tests + lint (≤ cap 81) green · tracker (`docs/development-roadmap.md`) updated ·
capability spec (`docs/specs/reporting-and-rollups/` or new `dashboard` spec) updated ·
`route-permission-matrix.md` synced if routes/caps added · committed.

## Open questions (resolve as phases start)
- Cost config ownership: who enters `LND_COST_CONFIG` (Admin-only Settings UI here, or HR via a form)?
- Training-coverage denominator: all active employees, or only Participants? (default: active Participants).
- Trend window: 6 months default — confirm acceptable vs 12.
- Should the operational tier be the **default landing** for a Coordinator login (vs Learning catalog)?
