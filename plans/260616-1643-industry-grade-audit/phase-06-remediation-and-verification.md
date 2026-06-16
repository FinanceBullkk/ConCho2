# Phase 06 — Remediation & Verification

**Priority:** P1 · **Status:** 🔴 todo · **Depends on:** phase-05 roadmap

## Objective
Fix the P0/P1 (+ quick-win P2) findings for real, with every gate green and the
tracker/spec/docs updated per the repo's Definition of Done. Ticket the rest.

## Steps
1. **Branch per coherent group** (don't mix concerns): e.g.
   `fix/audit-security-<slice>`, `perf/index-coverage`, `refactor/extract-<file>`,
   `chore/lint-burndown`. Small, reviewable PRs beat one mega-PR.
2. **Fix following conventions** — extend `domains/` (don't grow legacy), audit
   mutations, soft-delete, English-only i18n via `t()`, zod validation. No
   security-layer weakening. No test weakened to pass.
3. **Add/repair tests** — every behavior fix ships happy + denial + edge tests;
   coverage gaps on critical paths get real tests; e2e made deterministic.
4. **Gates (all must pass, real):** `cd server && npm test` · `cd client && npm
   run test:run` · `npm run lint` (≤ cap, ideally lower) · `npm run build` ·
   `node server/scripts/audit-route-permission-diff.js` ·
   `node server/scripts/audit-env-doc-diff.js` · `npm run scripts:check`.
5. **DoD per change** — update `docs/development-roadmap.md` changelog; update the
   capability **spec** if behavior changed; update route-matrix/system-map/README
   if surfaces/env moved; lower the lint cap if warnings were burned down.
6. **PR(s)** — conventional commits, no AI refs, explicit paths, exclude
   `.claude/settings.local.json` + lockfiles unless intentionally regenerated
   (use `npx npm@10` for the server lockfile per the known CI-npm constraint).
7. **Ticket P2/P3** — GitHub issues with evidence + fix sketch, grouped.

## Autonomy
- Owner approved full autonomous execution: run steps 1–7 without checkpoints.
- **Pause only for:** a destructive/irreversible action, a genuinely owner-only
  decision (e.g. a breaking dependency major, a behavior change that alters a
  documented contract), or before `git push` only if a change looks risky.
- Never merge a PR until `gh pr checks` shows all gates green (merge stays owner's call).

## Success criteria
- All P0/P1 fixed + verified green; quick-win P2 done; rest ticketed.
- Tracker + affected specs + docs updated. PR(s) open with green CI.
- A closing report: what was fixed, what was ticketed, before/after metrics
  (coverage, lint cap, bundle, index coverage, vuln count).

## Todo
- [ ] branch-per-group set up
- [ ] P0 fixes (if any) + tests
- [ ] P1 fixes + tests
- [ ] quick-win P2 fixes
- [ ] all 7 gates green (real)
- [ ] DoD: tracker + specs + docs + lint cap
- [ ] PR(s) opened, CI green
- [ ] P2/P3 issues filed
- [ ] closing report w/ before/after metrics
