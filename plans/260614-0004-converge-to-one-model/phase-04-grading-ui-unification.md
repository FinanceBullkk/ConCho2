# Phase 4 — Grading-UI Unification (Evaluations ⊕ Assessments)  ·  "slice C"

**Created:** 2026-06-19 · **Status:** 🔵 PLANNED (not started; owner approved planning-only).
**Parent:** [`plan.md`](plan.md) (Converge to One Training Model) · **ADR:**
`docs/decisions/converge-to-one-training-model.md` (Phase-1 note: *"grading-UI folds
into the unified assessment UX in Phase 4"*).

> Context: the parallel-world **surface** convergence is DONE (one catalog, calendar,
> attendance, schedules — slices 1,2,A1,A1b,A2a,A2b, PRs #157–#163). What remains in
> Phase 4 besides the persona-sidebar re-cut is the GRADING UX. This is NOT a
> display-fold — it is a small feature build. Hence its own plan.

## Problem
Staff enter scores in TWO disjoint surfaces with different models:
| Surface | Model | Entry UX | Where |
|---|---|---|---|
| **Evaluations** | `Evaluation` — 4 fixed rubric scores (grammar/vocab/pronunciation/fluency 0–10) per learner per class; instructor-entered; pass ≥ 6 | `EvaluationPage` + `EvalModal` + `ScoreInput` | `features/evaluations/`, English section |
| **Assessment grading** | `Assessment`/attempt — learner attempts a quiz; instructor manually grades free-text answers | `ManualGradingModal` | `features/learning/`, Learning |

The learner READ already converged (Phase 1: `GET /api/assessment/results/mine` returns
both modes in one shape; the transcript consumes it). The **staff WRITE/entry** UX did not.

## Key insight / guardrails (do NOT violate)
- **No destructive model merge.** ADR keeps the `Evaluation` model + write-path. Rubric
  (subjective, no learner attempt) and quiz (learner attempt + objective + manual grade)
  are genuinely different — converge at the **UX/navigation layer + a shared read DTO**,
  NOT by merging collections or rewriting the scoring engine. (Mongo→Postgres stays Phase 6.)
- **Security is load-bearing.** Grading is capability-gated (`grade:assessment` etc.) +
  audited. Every score write keeps its audit entry; rubric writes keep their authz.
- **Don't break the learner transcript** (it reads the unified results endpoint).
- English-only UI; tests are gates; eslint ≤ cap; behaviour parity per slice.

## Approach — two options
**Option 1 — "Grading workspace" (RECOMMENDED).** ONE staff surface that lists everything
needing a grade across both modes, each row opening its NATIVE entry modal (reuse
`EvalModal` / `ManualGradingModal`). Shared shell + list + a unified "to-grade" read;
native modals unchanged. Incremental, low-risk, no model/data change.
- *Pros:* fast, safe, reuses proven modals, no migration, reversible per slice.
- *Cons:* two entry modals still differ visually (acceptable — different data).

**Option 2 — Deep merge.** Make rubric a "rubric assessment type" inside the assessment
engine; `Evaluation` rows become `Assessment`+`Result` rows.
- *Pros:* one true model.
- *Cons:* data migration, violates the "no destructive merge" guardrail, high risk, large.
  **Defer (Phase 6 territory at the earliest).**

→ **Recommendation: Option 1.**

## Slices (Option 1 — each independently shippable, tests + lint + build green)
- **C1 — server: unified "to-grade" read.** One additive endpoint
  (`GET /api/assessment/grading-queue` or extend assessment results) returning pending
  gradable items across modes: rubric = enrolled-but-unevaluated per class; quiz =
  submitted-ungraded attempts. Each item tagged `{ mode: 'rubric'|'quiz', target, label }`.
  Reuses `domains/assessment` + `Evaluation` repos; no writes. Integration tests.
- **C2 — client: Grading workspace page.** New `features/grading/GradingPage.jsx` that
  consumes C1, groups by mode, and opens the existing `EvalModal` (rubric) /
  `ManualGradingModal` (quiz) in place. React-Query hook + tests.
- **C3 — IA/nav: surface it + retire the English Evaluations tab.** Add the Grading
  workspace to nav (Learning or Reports group, capability-gated). Once it covers rubric
  entry, retire the standalone English **Evaluations** tab (nav + `EnglishPage`) — the
  same unify→retire pattern as A1b/A2b. After this, the English section = **Teams +
  leader booking grid** only.
- **C4 — spec + docs.** Fold deltas into `docs/specs/evaluations` + `docs/specs/grading`
  (+ `assessments`); registry; roadmap changelog; this plan → archived.

## Related code
- Rubric: `client/src/features/evaluations/{EvaluationPage,EvalModal,ScoreInput,eval-columns,eval-helpers,useEvaluations}.jsx/js`; `server/models/Evaluation.js`; rubric routes/controller.
- Quiz grading: `client/src/features/learning/ManualGradingModal.jsx`; `server/domains/assessment/` (routes `/results/mine`, grading use-cases).
- Nav/shell: `client/src/components/nav/nav-config.js`; `client/src/features/english/EnglishPage.jsx`.
- Specs: `docs/specs/{evaluations,grading,assessments}/spec.md`.

## Success criteria
- Staff grade BOTH rubric + quiz items from ONE workspace; native modals reused; no model/data migration.
- English Evaluations tab retired; learner transcript unaffected; audit + authz intact.
- Each slice: tests cover happy + denial + edge; lint ≤ cap; build green; spec updated.

## Risks
- Assessment domain is capability-gated + audited — keep both on every path (highest-care).
- Rubric is English-class-specific in DATA — the workspace must not imply rubric applies to cohort programs.
- Scope creep toward Option 2 — resist; this plan is UX/read convergence only.

## Open questions (for owner before C1)
1. **Home for the Grading workspace** — Learning group, Reports group, or a new "Grading" nav item? (Recommend: Learning, near Assessments.)
2. **Retire the English Evaluations tab fully** after C3 (English → Teams + booking only), or keep a thin redirect? (Recommend: retire, matching A1b/A2b.)
3. **Capability gate** — should rubric entry move under `grade:assessment` (today it is role/teacher-of-record scoped), or keep its current gate? (Affects authz parity.)
