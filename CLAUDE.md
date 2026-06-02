# CLAUDE.md

Guidance for Claude Code when working in this repo. Read `./README.md` for product context before large changes.

## What this is
**TMS v2** — internal Training Management System (English-class booking: scheduling, attendance, evaluation, HR reports). MERN monorepo, ~241 tests, deployed on Render. Currently being re-architected into a generic **L&D Training Platform** (migration in progress — most code is still TMS-shaped).

## Golden rules
- **Server = CommonJS, Client = ESM.** Don't mix module systems.
- **Security layers are load-bearing** — CSRF, rate limits, two-layer authz (`roleGuard` + `policy/`), soft delete, audit log. Never remove or bypass them to make something work.
- **Audit every mutation**; **soft-delete, never hard-delete** user/attendance/evaluation data.
- **i18n both locales** (`en.json` + `vi.json`) for any user-facing string.
- **Don't fight the migration** — when a `domains/<domain>/` module exists, extend it; don't pile new logic into the legacy controller.
- **Tests are gates, not suggestions** — never skip/weaken tests or fake a pass. 7 CI gates must stay green; the eslint ratchet cap only goes down.
- **Never commit secrets.** `server/.env` is gitignored; rotate immediately if leaked.
- **Implementing? Follow `.claude/rules/implementation-workflow.md`** — work from `docs/development-roadmap.md`; updating the tracker is part of Definition of Done (don't wait to be asked). Run `/next` to execute the next milestone.
- Follow **YAGNI / KISS / DRY**. Keep files focused (~200 line guideline → extract toward `domains/`).

## Detailed rules
@.claude/rules/tech-stack.md
@.claude/rules/project-structure.md
@.claude/rules/commands.md
@.claude/rules/backend-conventions.md
@.claude/rules/frontend-conventions.md
@.claude/rules/security-and-auth.md
@.claude/rules/testing-and-ci.md
@.claude/rules/domain-model-and-migration.md
@.claude/rules/implementation-workflow.md

## Key references
- Migration status & next tasks: `docs/handoff-2026-06-01.md`
- System map: `docs/current-system-map.md` · Route/permission matrix: `docs/route-permission-matrix.md`
- Architecture decisions: `docs/decisions/`
- Operational runbooks: `docs/backup-dr.md`, `docs/cron-pinger-setup.md`, `docs/google-calendar-setup.md`
- API: `/api/docs` (Swagger, when server running)
