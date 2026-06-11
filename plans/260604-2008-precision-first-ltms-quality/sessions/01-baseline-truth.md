# Session 01 - Baseline Truth

**Status:** completed  
**Report:** [reports/session-01-baseline-truth-report.md](../reports/session-01-baseline-truth-report.md)

## Goal

Answer: what is true now across roadmap, audit docs, current code, dirty tree,
and available quality gates?

## Scope

In: `README.md`, `AGENTS.md`, roadmap docs, audit docs, package/CI/test surface,
current file map, dirty worktree.

Out: detailed business-logic proof for any one journey; code fixes.

Stop conditions: any P0 secret/security exposure found in tracked files.

## Evidence Checklist

- Read product context and agent contract.
- Compare current roadmap vs audit docs.
- Check current test/gate scripts.
- Check dirty worktree and untracked files.
- Probe key claimed areas: cron health, org model, i18n locale state.

## Verification Commands

- `git status --short`
- `git diff --name-only`
- `git ls-files --others --exclude-standard`
- `rg -n "CronRun|runMonitored|cron/health|Department|managerId|vi.json|i18next" server client docs`
- `find client/src/i18n -maxdepth 3 -type f -print`
- `git diff --check`

## Output

Report: [reports/session-01-baseline-truth-report.md](../reports/session-01-baseline-truth-report.md)

## Unresolved Questions

- None.
