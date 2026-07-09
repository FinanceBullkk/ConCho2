# ADR: Trim speculative capability domains (delete 9 of 13)

- **Status:** Accepted — 2026-07-09
- **Deciders:** Owner (HR/L&D value-decider) + grill-with-docs session
- **Related:** [`../../plans/260709-2342-scope-trim-delete-domains/`](../../plans/260709-2342-scope-trim-delete-domains/plan.md) · scope-trim hide commit `refactor(nav): trim sidebar` (#281) · Wave K migration (`plans/260709-1808-wave-k-mongo-decommission-cleanup/`)

## Context

TMS→LTMS shipped **13 "capability" domains** speculatively through Horizon 1/2 +
TMS.update (finance, vendor, planning, trainer, skill, automation, custom-field,
access, branding, mobile, notification, session-type, compliance) — breadth the
repo's own **"no feature factory / don't chase commercial LMS breadth"** rule
warned against. The product is an **internal LTMS for ~1000 employees**, pre-launch
(**0 real users/data**), whose core is the **6-step operating loop**:
schedule → attendance → assessment → completion → certificate → report.

Two events forced the keep/delete decision now:
1. **Wave K** (Mongo→PostgreSQL) is about to collapse **58 dual-backend repo seams**
   to PG-only. Collapsing a domain that will later be deleted is **double waste** —
   and deleting a domain (`rm` the folder) is *less* work than collapsing it.
2. Pre-launch means the earlier *"defer delete until modules stay dark through real
   HR usage"* bar can produce **no signal** any time soon.

A grill-with-docs session evaluated each domain against the codebase (cross-domain
dependency graph, boot hooks, event bus) and a criterion: **delete unless there is
a concrete near-term (~6-month) L&D need.** Deletion is **git-recoverable** (the code
stays in history), so the bar is "no near-term need," not "certain it never returns."

## Decision

**DELETE 9** (no concrete near-term need; `rm` before Wave K Phase 2):
`access` · `automation` · `finance` · `mobile` · `planning` · `session-type` ·
`skill` · `trainer` · `vendor`.

**KEEP 4:**
- Core-coupled (deleting breaks core): `notification` (booking/enrollment side-effects
  + event bus), `custom-field` (field values woven into user + learning),
  `branding` (cert/email pipeline at boot).
- On-mission: `compliance` (required-training-by-role matrix — the "compliance" half
  of the product's stated purpose).

## Consequences

- **Wave K shrinks:** 20→11 live domains before Phase 2; collapse scope ~58→~30 seams;
  Phases 3–4 shrink too.
- **Capabilities lost (all git-recoverable):** training budgets/cost, external-vendor
  management, TNA→annual planning, trainer qualification depth, skills/competency
  framework, custom RBAC roles, no-code automation rules, session-type catalog, and
  the mobile **Web Push + Today-feed** surface (email reminders + web app remain).
- **Authz:** with `access` gone, capability grants fall back to the **static role→capability
  map** (`policy/capabilities.js`) — the 4 fixed roles still work; only grant-*editing* is lost.
- **Recovery path:** if HR formalizes any of these, `git revert`/`git show` restores the
  domain, then re-collapse it to PG-only.

## Alternatives considered

- **Keep hidden, defer delete** (the prior call) — rejected now: carries full Wave K cost
  with no near-term usage signal to justify it.
- **Keep everything** — rejected: over-engineering for an internal 1000-person LTMS;
  ongoing maintenance + migration weight with no owner.
