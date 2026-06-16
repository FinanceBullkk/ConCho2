# Phase 05 — Synthesis & Remediation Roadmap

**Priority:** P1 · **Status:** 🔴 todo · **Depends on:** phases 00–04

## Objective
Turn four dimension reports into ONE truth: deduped, severity-sorted, evidence-
backed findings + a remediation roadmap that says exactly what gets fixed now vs
ticketed.

## Steps
1. **Consolidate.** Merge the four dimension findings into a single list; dedupe
   findings that surface from multiple angles (e.g. a god-object that's both an
   architecture and a cleanliness finding → one entry, cross-tagged).
2. **Re-verify survivors.** Spot-check the top findings against the actual code
   once more (the assessment ran on a snapshot; confirm still true on HEAD).
3. **Severity + effort.** Each finding: **P0/P1/P2/P3** (rubric in plan.md) +
   effort (S/M/L) + blast-radius + a concrete fix. Sort P0→P3, then by effort.
4. **Roadmap split.**
   - **This pass (phase-06):** all P0/P1 + quick-win P2 (S effort, high value).
   - **Ticketed:** remaining P2/P3 → GitHub issues (label `ready-for-agent`/
     `ready-for-human`), grouped (e.g. "lint burndown", "file-size extraction",
     "i18n cleanup"), each with evidence + fix sketch.
5. **No-silent-cap.** If anything is deliberately out of scope, say so explicitly
   with the reason (don't let omission read as "all clean").

## Deliverable
`plans/reports/industry-audit-findings.md` — the consolidated, severity-sorted
report. Sections per dimension + a top-level P0/P1 table. Unresolved questions at end.

## Success criteria
- Single source of truth; every finding has evidence + severity + fix + owner
  (this-pass vs ticket). No duplicate/contradictory findings. Honest scope note.

## Todo
- [ ] consolidate + dedupe (cross-tag)
- [ ] re-verify top findings on HEAD
- [ ] severity + effort + fix per finding
- [ ] roadmap split (now vs ticket)
- [ ] write `industry-audit-findings.md`
- [ ] open issues for ticketed items
