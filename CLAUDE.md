# CLAUDE.md

Guidance for Claude Code when working in this repo. Read `./README.md` for product context before large changes.

## What this is
**TMS v2** — internal Training Management System becoming an **Internal LTMS**
for about **1000 internal employees**. The product target is training operations
and compliance: scheduling, attendance, assessments, certificates, audit, and
HR/L&D reports. It is not trying to become a commercial, million-dollar LMS
clone.

## Golden rules
- **Server = CommonJS, Client = ESM.** Don't mix module systems.
- **Security layers are load-bearing** — CSRF, rate limits, two-layer authz (`roleGuard` + `policy/`), soft delete, audit log. Never remove or bypass them to make something work.
- **Audit every mutation**; **soft-delete, never hard-delete** user/attendance/evaluation data.
- **English-only UI.** User-facing strings are English (single `en` locale via `t()` + `en.json`; `vi.json` removed). Never add Vietnamese strings.
- **Don't fight the migration** — when a `domains/<domain>/` module exists, extend it; don't pile new logic into the legacy controller.
- **Tests are gates, not suggestions** — never skip/weaken tests or fake a pass. 7 CI gates must stay green; the eslint ratchet cap only goes down.
- **Never commit secrets.** `server/.env` is gitignored; rotate immediately if leaked.
- **Implementing? Follow `.claude/rules/implementation-workflow.md`** — work from `docs/development-roadmap.md`; updating the tracker is part of Definition of Done (don't wait to be asked). Run `/next` to execute the next milestone.
- **No feature factory.** Build to a milestone, then review wiring, UX flow,
  permissions, data consistency, tests, and bugs before starting the next
  capability. Prefer closing incomplete loops over rolling out new functions.
- **Do not chase commercial LMS breadth** unless explicitly requested: SCORM/xAPI,
  video hosting, native mobile, gamification, multi-tenant, billing, and
  white-label are deferred.
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
@.claude/rules/spec-driven-development.md

## Key references
- Agent contract: `AGENTS.md`
- Strategy and 6-month direction: `docs/lms-roadmap.md`
- Living tracker and next tasks: `docs/development-roadmap.md`
- System overview: `docs/system-overview.md`
- Behavior source of truth: `docs/specs/README.md` (capability spec registry — BR/UC/FR/NFR/AC)
- Code-truth map: `docs/current-system-map.md` · Route/permission matrix: `docs/route-permission-matrix.md`
- Architecture decisions: `docs/decisions/`
- Operational runbooks: `docs/backup-dr.md`, `docs/cron-pinger-setup.md`, `docs/google-calendar-setup.md`
- API: `/api/docs` (Swagger, when server running)

## Agent skills

### Issue tracker

Issues live in `FinanceBullkk/ConCho2` GitHub Issues via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default canonical labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Multi-context monorepo (`client/` + `server/`); ADRs in `docs/decisions/`. See `docs/agents/domain.md`.
