# Phase 1 — Converge Assessment (Evaluation → Assessment)

**Priority:** High · **Status:** 🔴 not started · **Depends on:** Phase 0 (uses events)
**Behaviour change:** Evaluation flows become Assessment flows (spec'd, with parity for
existing data).

## Why
Two assessment systems exist: legacy `Evaluation` (English-class scoring) and generic
`Assessment` (+`AssessmentAttempt`, `AssessmentQuestion`). Completion already "accepts
either". This is the smallest dual system → best first convergence; spec exists.

## Approach
1. **Map the models.** Define how an `Evaluation` (score per learner per class) maps to
   an `Assessment` + `AssessmentAttempt` (graded result). Capture the gaps (Evaluation
   has no question bank; it's a single score) — represent as a single-criterion
   assessment or a dedicated `assessmentType: 'evaluation'`.
2. **Read adapter first (no data move).** Expose Evaluation data THROUGH the assessment
   read surface (DTO), so the UI/reporting reads one shape. Completion already accepts
   either — point it at the unified read.
3. **Write path.** New scoring goes through `domains/assessment`; the legacy
   `/api/evaluations` write becomes a thin adapter onto assessment use-cases (or is
   deprecated behind it). Emit `ASSESSMENT_RECORDED` (Phase 0 bus) so completion +
   audit subscribe uniformly.
4. **Backfill (optional, late).** Only if needed: migrate historical `Evaluation` docs
   into `Assessment`/`AssessmentAttempt` via a `server/scripts/` migration with a
   dry-run + verify; otherwise keep reading legacy via the adapter (no physical move,
   per ADR).
5. **UI.** The English `Evaluations` surface and the L&D `Assessments` surface converge
   to one assessment experience (filtered by program type). Retire the duplicate.

## Tests
- Adapter: an Evaluation appears correctly through the assessment read DTO.
- Completion: a learner completing via the unified assessment path rolls up identically.
- Parity: existing evaluation integration tests still pass (read), new assessment-path
  write tests (happy + denial + edge).

## Risks
- Semantic gap (single score vs question-based) — model explicitly; don't lose data.
- Completion double-counting — ensure one source of truth post-convergence.
- Keep legacy read working until UI + reporting fully cut over.

## Done
One assessment read/write surface; completion consumes it; Evaluation UI retired or
adapter-backed; tests + lint + build green; `docs/specs/assessment` + `evaluation`
specs updated (deferral cleared); roadmap changelog.
