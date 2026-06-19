# Phase 4 — Grading-UI Unification (Evaluations ⊕ Assessments)  ·  "slice C"

**Created:** 2026-06-19 · **Status:** ✅ COMPLETE (2026-06-19) — C1 (#165), C2 (#166), C3+C4 (#167)
shipped. The grading UI is unified; the English Evaluations tab is retired.
(All 3 open questions resolved by owner 2026-06-19; see *Resolved decisions*.)
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
- **C1 ✅ (shipped #165) — server: unified "to-grade" read.** `GET /api/assessment/grading-queue`
  (capability `assessment.manage`) returns gradable **units** across both modes —
  quiz = published `short_text` assessments + attempt counts (teacher-cohort-scoped);
  rubric = team-world (English) classes + evaluation counts (Admin/Teacher only,
  cohort-world excluded). Additive read in `domains/assessment` (reuses the `Evaluation`
  repo + the `_shared/scheduling-modes` SSOT for team/cohort classification); no writes.
  4 integration tests; full server suite green (1177). Spec `grading` updated.
  *(Design note: "gradable units" — an assessment for quiz, a class for rubric — not
  individual pending items, because the native entry modals are already per-unit.)*
- **C2 ✅ (shipped #166) — client: Grading workspace page.** `features/grading/GradingPage.jsx`
  + `useGrading` hook (`assessmentAPI.getGradingQueue` + `qk.assessment.gradingQueue`) consume
  C1 and group by mode. Quiz row → fetches the full assessment (`useAssessment`) and opens the
  native `ManualGradingModal` in place; rubric row → opens the existing `EvaluationPage` scoped
  to the class (added an optional `classId` prop — backward-compatible: hides the picker, keeps
  status + Admin "show all") behind a Back link. Route `/grading` (Admin/Coordinator/Teacher).
  4 component tests; client suite 409 + lint (cap 41) + build green. *(No new server behaviour →
  no spec delta; the grading-queue contract was spec'd in C1.)*
- **C3 ✅ (shipped #167) — IA/nav: surface it + retire the English Evaluations tab.** Added a
  **Grading** leaf to the **Learning** nav group (owner Q1; standalone `/grading` route, leaf-in-
  group like Operations' mobile-attendance) + `nav.sections.grading` label. **Retired** the English
  **Evaluations** tab (nav + `EnglishPage`, dropping the `EvaluationPage`/`ClipboardEdit` imports)
  (owner Q2). English section is now **Teams** (admin) + the leader booking grid; a Teacher's
  English section is now "not available" (they grade from `/grading`). EnglishPage + Sidebar tests
  updated; client suite 408 + lint (cap 41) + build green.
- **C4 ✅ (shipped #167) — spec + docs.** Folded the delta into `docs/specs/evaluations` (grading-UI
  surface is now the unified `/grading` workspace; English tab retired) + bumped registry;
  `grading` spec already carried the grading-queue requirement (C1). Roadmap changelog updated; this
  plan marked COMPLETE.

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

## Resolved decisions (owner, 2026-06-19)
1. **Home = the Learning nav group**, near Assessments. The Grading workspace is a
   Learning-domain surface (capability-gated), not Reports.
2. **Retire the English Evaluations tab** after C3 (owner: "you decide" → retire, for
   consistency with A1b/A2b). End state: English section = **Teams + leader booking
   grid** only — at that point it may drop its tab chrome entirely (single surface).
3. **Authz (owner: "you decide"):** keep rubric's **existing** write-authz on the entry
   path — do NOT move rubric writes under `grade:assessment` in this phase (that would
   change who can grade English rubrics = an authz regression risk). Instead:
   - the **workspace ACCESS** is gated by the UNION — a user sees it if they can grade
     **either** mode (rubric's current gate OR `grade:assessment`);
   - each row's entry modal still enforces **its own** server-side authz unchanged.
   A single unified `grade` capability can be revisited later (Phase 5/6) if wanted — out
   of scope here to preserve behaviour parity.

> All three open questions are now resolved → C is ready to build slice-by-slice (C1→C4)
> when scheduled. No further owner input needed before C1.
