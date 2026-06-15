# TMS.update — Phase 4: Automation engine (gap #3)

**Branch:** `feat/tms-update-automation-engine` (stacked on Phase 3).

## Survey reality
`lib/event-bus` exists; in production only **2 events publish**: `enrollment.created`,
`certificate.issued` (notification subscribers react). The §9 flows overdue-escalation /
recert / unmarked-attendance are **cron-driven**, not events yet. The hardcoded
`recertifyPolicy.autoAssign` + completion-engine cert issue still own those side-effects.

## Design — opt-in, zero-regression
A generic `AutomationRule` engine. **Rules default `enabled:false`**; the runner only acts on
ENABLED rules → no behaviour change until an admin turns one on, and no double-firing with the
existing hardcoded paths. Runner actions are **additive + safe**: `notify` (in-app via the
existing writer, a new `automation_notice` type) + `log` (audit). Fail-soft per rule.

## Slices
- **P4-S1 — Backend.** `AutomationRule` model {name, trigger, conditions[], actions[], enabled,
  runCount, system}. New `automation.manage` capability (Admin). `domains/automation/`
  (repository/schemas/use-cases/controller/routes) — CRUD + toggle, audited. **Runner**:
  one subscriber over the catalogued events; for enabled rules with a matching trigger, eval
  conditions vs payload, run actions (notify/log), `runCount++`, audit. Registered at boot.
  Seed the §9 flows as **disabled** rules (documented, ready to enable). New `automation_notice`
  notification type + presenter. Tests: model/CRUD, runner (enabled fires + disabled skips +
  conditions + runCount), seed idempotent.
- **P4-S2 — Studio UI.** Automation page (`features/automation/`): rule list (name·trigger·
  enabled toggle·runCount), detail (WHEN→IF→THEN), trigger + action libraries, create/delete.
  Route + nav. Tests.

> **Deferred:** publishing the cron-flow events (overdue/recert/unmarked) so those seeded rules
> can fire; richer action types (issue-cert/assign/escalate) wired to services. The engine + the
> 2 live triggers ship now; the rest is additive.

## Progress
- ✅ **Phase 4 — automation engine** (2026-06-15). `AutomationRule` model + new `automation.manage` capability + `domains/automation/` (repository/schemas/use-cases/controller/routes + **runner** + seed). Runner subscribes to every catalogued event; for **enabled** rules with a matching trigger whose conditions hold, runs actions (`notify` via the in-app writer's new `automation_notice` type / `log`), `runCount++`. **Opt-in** (rules default disabled) + fail-soft → zero behaviour change until an admin enables one, no double-firing. §9 flows seeded **disabled** (idempotent; the 3 cron-flow ones reference not-yet-published triggers, documented). Studio **Automation page** (`/automation`, Admin, in the Configure nav group): rule list + enable toggle + runCount, when→if→then detail, trigger + action libraries, create/delete. Tests: server CRUD + runner (enabled fires/disabled skips/condition filter/runCount) + seed idempotent; client 5. Gates: server automation 10 ✓ + full suite green; client 354 ✓; lint 63; build clean. **Deferred:** publishing the cron-flow events + richer action types (issue-cert/assign/escalate).

## DoD per slice
Capability + audit on writes · runner fail-soft + opt-in (no default side-effects) · full server
suite green (no regression) · client test:run + lint(≤63) + build · tracker updated · committed.
