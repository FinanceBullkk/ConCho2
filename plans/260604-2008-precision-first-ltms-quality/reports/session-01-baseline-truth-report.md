se# Session 01 Report - Baseline Truth

**Date:** 2026-06-04  
**Verdict:** Risk  
**Action:** create focused follow-up sessions; do not start new major feature work

## Goal

Answer what is true now across docs, code, dirty tree, and quality gates before
auditing individual LTMS journeys.

## Evidence

- Read: `README.md`, `AGENTS.md`, `.claude/rules/primary-workflow.md`,
  `.claude/rules/documentation-management.md`, `docs/development-roadmap.md`.
- Inspected: `docs/audit/*`, `.github/workflows/ci.yml`, package scripts,
  current model/domain/i18n files, dirty worktree.
- Commands used: `git status --short`, `git diff --name-only`,
  `git ls-files --others --exclude-standard`, targeted `rg`, `find`.

## Fixed / Current

- Cron self-monitoring code exists in current tree: `CronRun`, `cronMonitor`,
  `/api/admin/cron/health`, `CronHealthPanel`, and focused cron tests are present.
- English-only locale state is true in files: `client/src/i18n/locales/en.json`
  exists and no `vi.json` exists under `client/src/i18n/locales/`.
- Org model code exists in the worktree: `Department`, `server/domains/org/*`,
  `managerId`/`departmentId` fields in `User`, My Team UI, and org tests exist.
- CI has required gates defined: server Jest, client Vitest, client build,
  client lint, npm audit high+, gitleaks, Playwright e2e.

## Stale / Conflicting

- `AGENTS.md` still says new user-facing strings need both `en.json` and
  `vi.json`, while `docs/development-roadmap.md` says the UI is English-only and
  `vi.json` was removed.
- `docs/current-system-map.md` still describes EN/VI locale files and browser
  language detection, which conflicts with the current one-locale file state.
- Audit docs still contain historical enterprise gaps such as missing
  Department/org hierarchy. Treat them as historical until re-verified.
- Some audit docs say older CI/test counts; current roadmap says newer counts.
  Session reports should cite command output from the current tree, not old counts.

## Open / Risk

- The roadmap says Wave D3 org model is live, but many org files are still
  untracked/modified in the dirty worktree. Until committed and re-verified,
  treat Wave D3 as implemented-in-worktree, not release-baselined.
- The working tree is dirty across server, client, docs, and agent files.
  Quality sessions must preserve those changes and avoid broad refactors.
- Full gates were not run in this session; current test truth is unknown.

## Regressed

- No direct regression proven in this session.

## Verification

Docs/plan artifact only. Run before closing this implementation:

- `git diff --check`

Full CI-equivalent gates belong to Session 10 or a focused fix session, not this
baseline setup.

## Backlog Promoted

- QB-001: resolve i18n rule conflict.
- QB-002: finish/verify/commit org model or downgrade roadmap wording.
- QB-003: update current system map i18n section.
- QB-004: mark audit docs historical/stale where superseded by Wave D work.

## Unresolved Questions

- None.

