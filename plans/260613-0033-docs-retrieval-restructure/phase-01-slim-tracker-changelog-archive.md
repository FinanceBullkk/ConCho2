# Phase 01 — Slim the tracker + changelog archive

## Overview
Priority: high · Status: 🟢 done 2026-06-13

> **Done 2026-06-13.** `development-roadmap.md` 1,827 → **351 lines** (≤400
> target): `Current status` 160-line narrative → a tight **Status board
> (Now / Next)**; the verbose Wave-A `→` history rows dropped (kept M1–M4 +
> the migration/waves tables); 88 changelog entries (2026-06-01 → 06-11) cut
> verbatim, newest-first, to `docs/changelog-archive/2026-q2.md`; 13 entries
> (06-12 + 06-13) kept inline. Rolling-archive policy written into
> `.claude/rules/implementation-workflow.md` step 5. No live inbound link
> broken (only a historical `#L100` anchor in a completed Wave-E plan, left
> as-is). One quarter file (all current entries are Q2 — resolves plan Q1).
`docs/development-roadmap.md` (1,776 lines) is the "read me first for
progress" file, but ~75% of it is accumulated changelog. Split history out;
keep the live tracker lean and front-loaded with current status.

## Key insights
- The DoD mechanism WORKS — that's why the file grew. The fix is a rolling
  archive policy, not weaker discipline.
- AI retrieval cost: every `/next` run and every planning session reads this
  file; at 1.7k lines most of the context budget is spent on history.
- `docs.maxLoc` for this repo is 800; target ≤ ~400 so headroom lasts a year.

## Related code files
Modify:
- `docs/development-roadmap.md` — keep: status board ("Now / Next"),
  milestone table (M1–M4 + waves), recent changelog (~last 2 weeks);
  add a 3-line "how this file is maintained" note linking the archive.
- `.claude/rules/implementation-workflow.md` — step 5 gains the rolling
  rule: "changelog keeps ~2 weeks / ~15 entries inline; roll older entries
  to `docs/changelog-archive/<year>-q<q>.md` in the same commit".
- `.claude/rules/documentation-management.md` (global) — N/A (user-level);
  project rule carries the policy.
Create:
- `docs/changelog-archive/2026-q2.md` (+ `2026-q1.md` if entries reach back)
  — verbatim moves, newest-first, with a header linking back to the tracker.

## Implementation steps
1. Inventory changelog entries by date; pick the inline cutoff (~2 weeks).
2. `git mv`-style content split (cut/paste verbatim — NO rewording of
   history; entries are audit trail).
3. Restructure the top of the tracker: status board first, milestone table
   second, changelog third, links last.
4. Add maintenance note + archive links; update the implementation-workflow
   rule with the rolling policy.
5. Grep inbound references to `development-roadmap.md` anchors that may
   break (section headings) — fix.

## Success criteria
- Tracker ≤ ~400 lines; archive files hold the full history verbatim.
- Opening the tracker shows current phase status within the first screen.
- Rolling policy written into the rule so the file never regrows past cap.

## Risk
- Anchor links into old changelog sections break → grep `development-roadmap`
  across repo (docs, plans, rules) and fix links to point at archive.
