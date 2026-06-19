# Quality-First Program (Option B) — master plan

> Owner chose **B**: fix the foundation + remove duplication + tighten real
> smells — NOT a full rewrite (app code is good; rewrite would burn value).
> Source audit: [`../reports/audit-260620-0419-quality-weak-spots.md`](../reports/audit-260620-0419-quality-weak-spots.md).
> Started 2026-06-20.

## Hard constraint (locked ADRs — do not violate)
- `mongo-now-postgres-later.md`: **do NOT migrate to Postgres until pain is
  demonstrated + a read-only feasibility prototype exists.** Default at gate =
  stay on Mongo. ⇒ Postgres is a **gated evaluation**, not a blind rebuild.
- `repository-layer-where-separable.md`: partial repository coverage is **by
  design** (attendance/groups fuse data+logic). Not all "mongoose-direct" = debt.

## Phases (leverage-ordered, foundation-first within what's UNBLOCKED)

| # | Slice | Maps to | Risk | Status |
|---|---|---|---|---|
| 1 | **Correctness lint burndown** — fix 9 real react-hooks warnings (Date.now-in-render ×3, use-before-declare ×3, setState-in-effect ×3); lower ratchet | W4/W5 | low | 🟡 in progress |
| 2 | a11y burndown — keyboard handlers for clickable non-interactive els (28 warnings) → ratchet toward 0 | W6 | low | 🔴 todo |
| 3 | Finish convergence / retire dead legacy — fold Evaluation write-path + enrollment close-paths onto shared spines; delete superseded legacy routes/controllers as domains absorb them | W2 | med | 🔴 todo |
| 4 | classBinding → fail-closed (after confirming prod teacherIds are backfilled) | W3 | med (data) | 🔴 todo (needs prod check) |
| 5 | Error/edge-path test depth — server branch cov 65.8%↑, frontend 40→60% | W7 | low | 🔴 todo |
| 6 | Split god-files — api.js 528 (per-domain), ParticipantDashboard 564, DatabaseExplorer 541 | W8 | low | 🔴 todo |
| 7 | **Postgres gate evaluation** (ADR-gated) — measure reporting/integrity pain + read-only migration POC from a Mongo snapshot → decide | W1 | high | ⏸ gated (owner go) |

## Sequencing rationale
Slices 1–2 = safe measured-debt burndown (ship continuously). 3 = the real
architectural duplication removal (the "two ways to do everything" tax). 4 closes
the open-by-default authz. 5–6 = depth + maintainability. 7 = the foundation, but
ADR says prove-pain-first → it is a separate gated decision, not item-one.

## Definition of Done (per slice)
Tests + lint green (real pass) · ratchet only drops · spec/tracker updated if
behavior changed · conventional commit · PR (owner merges).

## Unresolved questions
- Postgres (7): does owner want the gate evaluation started now, or hold?
- classBinding (4): are `teacherIds` fully populated in prod (safe to fail-close)?
- Convergence (3): full legacy deletion in-scope, or converge-when-touched?
