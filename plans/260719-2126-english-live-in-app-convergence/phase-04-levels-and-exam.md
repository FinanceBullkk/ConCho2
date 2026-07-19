# P4 — Levels & exam on evaluation/assessment

**Priority:** Medium (parallel to P2/P3) · **Status:** 🔴 proposed
**Context:** [plan.md](plan.md) · [fit-gap §8](fit-gap-analysis.md)

## Objective

Record English exam levels live on the `evaluation`/`assessment` path (already
partly converged) — 13 ordered levels, one active result per learner, gated by
the ≤2-absence sit rule — instead of the `eng_exam_results` write path.

## Key changes

- Levels = a program-scoped ordered scale on the evaluation/assessment path;
  exam result = one active instructor-scored result per enrollment (soft-delete on
  clear, audited) — the semantics the archive already has, on the generic model.
- Sit-gate (≤2 absences over live attendance) enforced server-side before write
  (mirror the archive rule).
- Feeds the unified learner read (`GET /api/assessment/results/mine`) so live
  English levels appear in the same shape as other assessments.

## Open question (resolve here)

Keep the 13-level scale as **program config** (fidelity, less churn — leaning) vs.
**normalise** onto the generic assessment rubric. Plan open question 1.

## Files

- `domains/assessment` / `evaluation` (level scale + gated result write), reuse the
  existing Evaluation UI folded into the live English cohort view.
- Tests: eligible learner gets a level; 3-absence learner blocked (422); unknown
  level rejected (400); re-record updates in place; clear soft-deletes; audited.

## Dependencies

P1 (program), P3 (attendance drives the gate).

## Success / DoD

- Live English level entry gated + audited; appears in the unified assessment
  read. Tests + lint green. Spec: `english-training` + `assessment`/`evaluation`
  MODIFIED.
