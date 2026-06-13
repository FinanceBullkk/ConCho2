# Phase 03 — PR template DoD checklist + rule sync

## Overview
Priority: medium · Status: 🔴 not started
The update mechanism (Definition of Done) is procedural — it lives in agent
rules and works when the agent/dev follows them. Add the one cheap backstop
that surfaces it on EVERY pull request, human or AI authored.

## Key insights
- QA-012: gates are procedural on this repo (no branch protection on Free
  plan) — a template checklist matches the house style: visible discipline,
  zero CI noise.
- The checklist must mirror the EXISTING DoD wording, not invent a new one,
  or the two will drift.

## Related code files
Create:
- `.github/PULL_REQUEST_TEMPLATE.md`:
  - Summary / What changed (1–3 lines)
  - **Definition of Done** checklist:
    - [ ] Tests + lint green locally (server `npm test`, client
      `test:run` + `lint` ≤ cap)
    - [ ] `docs/development-roadmap.md` status/changelog updated (rolled
      old entries to archive if > ~15 inline)
    - [ ] Capability spec updated if behavior changed (`docs/specs/` +
      registry) — or "pure refactor, no behavior change"
    - [ ] `docs/current-system-map.md` / `route-permission-matrix.md`
      updated if files/routes moved
    - [ ] No secrets; lockfiles regenerated with `npx npm@10` if deps moved
  - Merge reminder line: "Do NOT merge until `gh pr checks` is fully green
    (QA-012 — gates are not machine-enforced)."
Modify:
- `.claude/rules/implementation-workflow.md` — note that the PR template
  mirrors DoD; keep both in sync when DoD changes.
- `docs/README.md` (from Phase 02) — mention the template as the backstop.

## Implementation steps
1. Write the template (≤ ~30 lines — checklists die when long).
2. Cross-check each checklist line against `implementation-workflow.md`
   wording; adjust the rule to reference the template.
3. Open a trivial test PR (or fold into this plan's own PR) to confirm
   GitHub renders the template.

## Success criteria
- Every new PR auto-fills with the DoD checklist.
- Checklist text matches the rule file (single source: rule; template
  references it by path).

## Risk
- Checklist fatigue → keep to the 5 items above, no more.
