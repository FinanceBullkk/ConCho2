# AGENTS.md

Guidance for Codex and other coding agents in this repo. Read `./README.md`
first for product context, then use the docs below as source of truth.

## Product Direction

TMS v2 is becoming an **Internal LTMS** for about **1000 internal employees**.
The target is training operations + compliance, not a commercial LMS clone.

Benchmark against the workflow it replaces: spreadsheets, email, manual HR/L&D
tracking, and monthly Excel reports. Do not benchmark against Cornerstone,
Docebo, SAP SuccessFactors, or other million-dollar enterprise LMS suites.

## Agent Reference Contract

- Prefer finishing incomplete loops over starting new capability.
- No feature factory. Build to a milestone, then review wiring, UX flow,
  permissions, data consistency, tests, and bugs before the next milestone.
- Do not add SCORM/xAPI, video hosting, native mobile, gamification,
  multi-tenant, billing, or commercial LMS breadth unless explicitly requested.
- Preserve load-bearing controls: auth, CSRF, rate limits, capability/role
  authorization, audit log, soft delete, validation, and i18n.
- New user-facing strings are English-only: add keys to
  `client/src/i18n/locales/en.json` and render via `t()`. There is no `vi.json`
  (the product is English-only; no language switcher).
- New mutations need audit behavior and soft-delete where applicable.
- Prefer `server/domains/<domain>/` modules when they exist. Do not pile new
  business logic into legacy controllers.

## Done Means Wired

Every milestone must satisfy this before moving to the next:

- Backend route/use-case works with real authz/capability rules.
- Frontend entrypoint exists when user value depends on UI.
- Reports, completion, certificates, or notifications consume the new data when
  relevant.
- Tests cover happy path, permission denial, and one core edge case.
- Manual smoke flow is documented or run.
- Roadmap/docs are updated if status or direction changed.

## Key References

- Strategy and 6-month direction: `docs/lms-roadmap.md`
- Living tracker and next work: `docs/development-roadmap.md`
- Current architecture and status: `docs/system-overview.md`
- Code-truth map: `docs/current-system-map.md`
- Route access: `docs/route-permission-matrix.md`
- Claude-specific rules: `CLAUDE.md` and `.claude/rules/`
