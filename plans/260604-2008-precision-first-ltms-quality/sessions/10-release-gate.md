# Session 10 - Release Gate

## Goal

Answer: is there any open P0/P1 blocking feature work?

## Scope

In: full CI-equivalent gates, accumulated quality backlog, session reports,
owner accepted risks.

Out: new feature implementation.

## Required Evidence

- All session reports.
- `quality-backlog.md`
- current `git status --short`
- CI-equivalent command output.
- staging/manual smoke notes if available.

## Required Commands

- `cd server && npm test`
- `cd client && npm run test:run`
- `cd client && npm run build`
- `cd client && npm run lint`
- `cd server && npm audit --omit=dev --audit-level=high`
- `cd client && npm audit --audit-level=high`
- Playwright e2e command for seeded/staging setup.
- gitleaks or CI secrets scan.

## Output

- Go/No-Go verdict.
- Open P0/P1 list must be empty for Go.
- P2/P3 accepted-risk list with owner/date.

## Unresolved Questions

- None.

