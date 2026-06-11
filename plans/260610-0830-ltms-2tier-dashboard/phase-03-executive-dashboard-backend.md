---
phase: 3
title: Executive dashboard — backend + cost config + trends
status: done (2026-06-10) — trend = recorded events (enrollments + certificates issued); mobility = certificate-based proxy; no writeLimiter exists so PUT relies on global limiter + CSRF
priority: high
effort: 2.5–3.5 dev-days
depends_on: [1]
---

# Phase 3 — Executive dashboard backend (ROI tier)

## Context Links
- Plan: [`plan.md`](./plan.md) · ROI KPIs + framework: [`260610-0811`](../260610-0811-business-case-ltms-vs-excel.md) §5.1–5.5
- Reuse: `domains/learning/dashboard/` (Phase 1), `reports/completion-rollup-use-case.js`,
  `reports/compliance-certificate-state.js`, `models/{Feedback,Certificate,LearningPath,Setting}.js`.
- Cost store: `models/Setting.js` (key/value/description) — key `LND_COST_CONFIG`.

## Overview
- **Priority:** high · **Status:** pending.
- Add `GET /api/learning/dashboard/executive` (**Admin-only**, mirrors compliance gating) returning
  the strategic ROI bundle: training coverage, completion **trend** (time-bucketed), Kirkpatrick
  **L1+L2** rollup, path/mobility counts, org-wide certificate validity, and **financial KPIs**
  (cost/employee, cost/completion) computed **only when `LND_COST_CONFIG` is set** — else flagged
  "configure to enable". Plus Admin read/write of the cost config (backed by `Setting`).

## Key Insights (grounded)
- Executive financials need cost inputs that **do not exist** in the system (business case §9). Store
  them in the existing `Setting` model (`LND_COST_CONFIG` = `{ annualBudgetMinor, currency,
  avgLoadedHourlyCostMinor }`) — **no new model**. Compute `$` KPIs only when present; never fabricate.
- L1 = Feedback averages (exists), L2 = assessment pass rate (passing attempts exist). **L3/L4/L5 are
  out of scope** — return them as `{ measured: false, reason }` so the UI labels them honestly.
- The completion **trend** is the one genuinely new aggregation: bucket completions/certificates by
  month over a 6-month window (`$dateTrunc`/`$group` on issue/completion timestamps).
- Path/mobility = count of learners who reached the final step of a `LearningPath` (reuse the path
  progress engine signal, batched — not per-learner).

## Requirements
**Functional**
- FR1 — `GET /api/learning/dashboard/executive` (cap `report.read` coarse + **Admin-only** inside the
  use-case, mirroring `compliance` Admin-only) returns: coverage % (org + by department), completion
  trend (last 6 months), Kirkpatrick `{L1: feedbackAvg, L2: passRate, L3..L5: {measured:false}}`,
  path-completion/mobility count, certificate validity rollup (valid/expiring/expired), and financial
  KPIs (`costPerEmployee`, `costPerCompletion`) **or** `financials:{configured:false}`.
- FR2 — `GET /api/learning/dashboard/cost-config` (Admin) returns current `LND_COST_CONFIG` (or null);
  `PUT /api/learning/dashboard/cost-config` (Admin) upserts it — **audited** (mutation).
- FR3 — Financial KPIs MUST be null/omitted (not 0, not guessed) when cost config is absent.
- FR4 — Fail-soft per metric (`Promise.allSettled` + `errors[]`), like Phase 1.

**Non-functional**
- NF1 — Admin-only enforced **server-side** in the use-case (not just route role) — defense in depth.
- NF2 — Trend aggregation batched/indexed; 6-month window capped. English-only labels.
- NF3 — Cost values stored as **integer minor units** + currency to avoid float drift.

## Architecture
**Extend** `server/domains/learning/dashboard/`
```
use-cases.js   → + buildExecutiveDashboard(actor) (Admin-guard), getCostConfig, setCostConfig
repository.js  → + completion/cert trend buckets, path-completion count, feedback/passrate rollups,
                 Setting get/upsert for LND_COST_CONFIG
schemas.js     → + costConfigBody (annualBudgetMinor int, currency, avgLoadedHourlyCostMinor int)
controller.js  → + getExecutiveDashboard, getCostConfig, putCostConfig (audit on put)
```
**Financial compute (only when configured)**
```
costPerEmployee  = annualBudget / activeEmployeeCount
costPerCompletion = annualBudget / completionsInWindow
(efficiencyDividend is a business-case model input, NOT auto-measured → not emitted here)
```

## Related Code Files
**Create**
- `server/tests/integration/learningDashboardExecutive.test.js` (Admin-only + financial-gating + trend)
- `server/tests/integration/lndCostConfig.test.js` (get/put audit + validation)
**Modify**
- `server/domains/learning/dashboard/{use-cases,repository,schemas,controller}.js`
- `server/domains/learning/routes.js` — mount `/dashboard/executive` + `/dashboard/cost-config` (GET/PUT),
  `requireCapability('report.read')`; PUT also `writeLimiter` + CSRF (already global)
- `docs/route-permission-matrix.md`, `docs/development-roadmap.md`, capability spec

## Implementation Steps
1. Add `LND_COST_CONFIG` get/upsert in repository over `Setting`; zod `costConfigBody` (integer minor units).
2. `getCostConfig`/`setCostConfig` use-cases (Admin-only; audit on set with diff redaction as usual).
3. `buildExecutiveDashboard(actor)`: Admin-guard; `Promise.allSettled` of coverage, trend buckets,
   Kirkpatrick L1/L2, path-completion count, cert validity rollup, financials (only if config present).
4. Controller envelopes + `handleError`; PUT cost-config records audit.
5. Mount routes; route-matrix + spec + roadmap.
6. Tests: Admin happy, non-Admin denied (403 even with `report.read`), financials omitted when unconfigured
   then present after PUT, trend bucket correctness, cost-config audit. DoD green; commit.

## Todo
- [x] `LND_COST_CONFIG` get/upsert over `Setting` + zod (integer minor units + currency)
- [x] `getCostConfig`/`setCostConfig` (Admin, audited with before/after diff)
- [x] `buildExecutiveDashboard` (Admin-guard, fail-soft via shared `compose-fail-soft.js`): coverage, trend, Kirkpatrick L1/L2 (+L3–L5 honest), mobility (cert proxy), cert validity, financials
- [x] Financials `{configured:false}` when unconfigured (never fabricated; test-pinned)
- [x] Mounted executive + cost-config routes; route-matrix + spec + roadmap updated
- [x] 6/6 integration tests (Admin-only deny, financial gating, trend, audit, validation) + commit

## Success Criteria
- **Happy:** Admin GET executive → full bundle; L3–L5 marked `measured:false`; financials present iff config set.
- **Authz:** Teacher with `report.read` is **denied** the executive endpoint (Admin-only inside) → 403.
- **Honesty:** with no `LND_COST_CONFIG`, `financials.configured=false` and no numeric cost fields emitted.
- **Audit:** PUT cost-config writes an audit entry; invalid (negative/float) body → 400.

## Risk Assessment
| Risk | L×I | Mitigation |
|---|---|---|
| Fabricated/0 financial numbers mislead leadership | Low×High | Hard rule: omit financials unless config present; test asserts omission |
| Admin-only enforced only at route layer | Low×High | Guard inside the use-case too (defense in depth); deny test for Teacher w/ report.read |
| Trend aggregation wrong timezone bucket | Med×Med | Bucket on UTC `$dateTrunc`; unit-test boundary; document VN offset note |
| Float currency drift | Low×Med | Integer minor units + currency code only |

## Security Considerations
- Executive bundle Admin-only (route cap + in-use-case guard). Cost config Admin-only, audited, CSRF +
  write-limited. No sensitive learner PII beyond what reports already expose.

## Next Steps / Dependencies
- Reuses **Phase 1** module. Feeds **Phase 4** (executive frontend). May run parallel to Phase 2.
- Per-Office ROI breakdown lands when Office ships (re-center Phase 1).

## Unresolved questions
- Who owns entering `LND_COST_CONFIG` — Admin via this endpoint, or surface in the general Settings UI?
- Active-employee denominator for cost/employee: all active Users, or active Participants only?
- Trend metric: completions, certificates issued, or both series? (default: both, two lines.)
