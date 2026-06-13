<!-- Mirrors the Definition of Done in .claude/rules/implementation-workflow.md.
     If the DoD changes there, update this checklist in the same PR. -->

## What changed
<!-- 1–3 lines: what and why -->

## Definition of Done
- [ ] Tests + lint green locally — server `npm test`, client `npm run test:run` + `npm run lint` (≤ cap)
- [ ] `docs/development-roadmap.md` status board + changelog updated (older entries rolled to `docs/changelog-archive/` if > ~15 inline)
- [ ] Capability spec updated if behavior changed (`docs/specs/` + registry) — or: pure refactor, no behavior change
- [ ] `docs/current-system-map.md` / `route-permission-matrix.md` updated if files/routes moved
- [ ] No secrets committed; lockfiles regenerated with `npx npm@10` if deps moved

> **Merge discipline (QA-012):** gates are NOT machine-enforced on this repo.
> Do NOT merge until `gh pr checks <n>` shows every gate green.
