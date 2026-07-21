# Docs index

Entry point for `docs/`. Reach the right doc in one hop. The content layers are
healthy and distinct — this index is pure **routing**.

- **Behavior** (what the system does today) → [`specs/`](specs/) (registry: [`specs/README.md`](specs/README.md))
- **Location** (which file/route implements it) → [`current-system-map.md`](current-system-map.md) · [`route-permission-matrix.md`](route-permission-matrix.md)
- **Progress** (status now / next) → [`development-roadmap.md`](development-roadmap.md)
- **Why** (locked decisions) → [`decisions/`](decisions/)
- **Delivery process** (how work becomes verified) → [`../.claude/rules/implementation-workflow.md`](../.claude/rules/implementation-workflow.md) · [`../.claude/rules/testing-and-ci.md`](../.claude/rules/testing-and-ci.md)

## Start here by role

| You are… | Read, in order |
|---|---|
| **AI agent / Claude Code** | [`../CLAUDE.md`](../CLAUDE.md) → [`../.claude/rules/implementation-workflow.md`](../.claude/rules/implementation-workflow.md) → [`development-roadmap.md`](development-roadmap.md) → [`specs/README.md`](specs/README.md) → the `.claude/rules/*` for the area you touch |
| **New developer** | [`../README.md`](../README.md) → [`system-overview.md`](system-overview.md) → [`../.claude/rules/implementation-workflow.md`](../.claude/rules/implementation-workflow.md) → [`current-system-map.md`](current-system-map.md) → conventions in [`../.claude/rules/`](../.claude/rules/) |
| **Checking progress** | [`development-roadmap.md`](development-roadmap.md) — Status board (Now / Next) is the first screen; full history in [`changelog-archive/`](changelog-archive/) |
| **Ops / on-call** | [`runbook-5xx-spike.md`](runbook-5xx-spike.md) · [`runbook-cron-failure.md`](runbook-cron-failure.md) · [`runbook-english-archive-cutover.md`](runbook-english-archive-cutover.md) · [`backup-dr.md`](backup-dr.md) · [`cron-pinger-setup.md`](cron-pinger-setup.md) · [`google-calendar-setup.md`](google-calendar-setup.md) |

## Living docs (root)

| File | Purpose |
|---|---|
| [`development-roadmap.md`](development-roadmap.md) | Canonical progress tracker — status board, milestone/wave tables, recent changelog |
| [`lms-roadmap.md`](lms-roadmap.md) | Internal-LTMS strategy + 6-month direction (the *why*) |
| [`ltms-gap-analysis.md`](ltms-gap-analysis.md) | Gap analysis + locked priority order (decision doc) |
| [`system-overview.md`](system-overview.md) | Architecture overview, you-are-here, source-of-truth index |
| [`current-system-map.md`](current-system-map.md) | Exhaustive code-truth map (routes, models, services) |
| [`route-permission-matrix.md`](route-permission-matrix.md) | Per-route read/write access (full route truth) |
| [`backup-dr.md`](backup-dr.md) | Backup / disaster-recovery runbook + drill log |
| [`cron-pinger-setup.md`](cron-pinger-setup.md) | External pinger setup for the sleeping free-tier crons |
| [`google-calendar-setup.md`](google-calendar-setup.md) | Google Workspace / Calendar service-account integration |
| [`runbook-5xx-spike.md`](runbook-5xx-spike.md) | Incident runbook — 5xx error spike |
| [`runbook-cron-failure.md`](runbook-cron-failure.md) | Incident runbook — cron job failed / stale |
| [`runbook-english-archive-cutover.md`](runbook-english-archive-cutover.md) | English live cutover, smoke, monitoring, rollback boundary, and Archive DR |

## Living docs (subdirs)

| Dir | Purpose |
|---|---|
| [`specs/`](specs/) | Capability specs — behavior source of truth (BR/UC/FR/NFR/AC); registry in `specs/README.md` |
| [`decisions/`](decisions/) | Locked architecture decisions (ADRs) |
| [`agents/`](agents/) | Agent-facing guides (issue tracker, triage labels, domain notes) |
| [`audit/`](audit/) | Full-system-audit artifacts (findings, matrices, backlog) — referenced by the audit backlog |
| [`changelog-archive/`](changelog-archive/) | Roadmap changelog history, rolled out of the tracker (verbatim, per quarter) |
| [`screenshots/`](screenshots/) | Image assets referenced by docs |

## Archive

[`archive/`](archive/) holds **finished one-off and superseded docs** — history, not
live truth. Do not treat as current direction.

| File | Why archived |
|---|---|
| [`archive/handoff-2026-06-01.md`](archive/handoff-2026-06-01.md) | Dated task snapshot (2026-06-09); the live tracker is `development-roadmap.md` |
| [`archive/phase-5-i18n-discovery.md`](archive/phase-5-i18n-discovery.md) | i18n discovery; superseded by the English-only decision |
| [`archive/phase-6-member-friction-survey.md`](archive/phase-6-member-friction-survey.md) | Draft survey from the i18n discovery thread |
| [`archive/phase-6-server-message-audit.md`](archive/phase-6-server-message-audit.md) | Server-message audit from the i18n discovery thread |
| [`archive/architecture-map.{md,html}`](archive/architecture-map.md) | Generated architecture snapshot; `current-system-map.md` is the live map |
| [`archive/lms-roi-strategy-report-2026-05-23.md`](archive/lms-roi-strategy-report-2026-05-23.md) | Commercial-LMS strategy exploration; rejected by the 2026-06-04 internal-LTMS direction lock |

## Keeping docs current

Updating the tracker + spec + system map is part of the **Definition of Done**
(see [`../.claude/rules/implementation-workflow.md`](../.claude/rules/implementation-workflow.md)).
Every PR also carries a DoD checklist via [`../.github/PULL_REQUEST_TEMPLATE.md`](../.github/PULL_REQUEST_TEMPLATE.md).
