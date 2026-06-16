# Phase 01 — Architecture & Wiring Integrity

**Priority:** P1 (owner-prioritized) · **Status:** 🔴 todo
**Anchor:** modular-monolith boundaries · dependency direction · 12-factor · contract integrity

## Objective
Prove the modular-monolith boundaries hold and every wire connects: no orphan
modules, no boundary violations, no broken publish/subscribe or layer contracts,
no client leakage of internal model shapes.

## Industry checks (each → evidence)
- **Dependency direction.** `domains/<x>` must not import another domain's
  *internals* (only its public surface / shared `_shared`). Legacy
  `controllers/`/`services/` must not be deepened where a `domains/` module
  exists. No `domains/` → `routes/`(legacy) imports. Evidence: import-grep + madge.
- **Circular dependencies.** Zero cycles (madge from phase-00). Each cycle = finding.
- **Repository encapsulation.** In domains that have a `repository.js`
  (learning/schedule/attendance/groups/…), **no Mongoose model call** (`Model.find/`
  `.create/.aggregate/.updateX`) appears outside `repository.js`. Grep each domain.
- **Layering.** `routes → controller → use-cases → repository`. Controllers stay
  thin (envelope + audit only); business logic not in routes/controllers.
- **Event-bus contract.** Every `EVENTS.*` published has ≥1 subscriber OR a
  documented-deferred note; payload shape consumed == published shape; no
  subscriber listening for an event never published. (Already partly verified;
  re-confirm + check payload field drift.)
- **DTO boundary.** Client responses go through `dto.js`/shaping — no raw Mongoose
  doc with internal fields (`__v`, `isDeleted`, `select:false` fields) leaking.
  Grep responses returning raw models.
- **4-way route consistency.** route ↔ capability ↔ nav ↔ spec agree for every
  surface (extend `audit-route-permission-diff`; add capability+nav cross-check).
- **Orphans / dead modules.** knip orphans (phase-00) triaged: truly dead vs
  entrypoint false-positive.
- **Config/12-factor.** All config from env w/ safe defaults (no hardcoded hosts/
  secrets); boot-required env validated; no env read scattered un-defaulted.
- **Module size as boundary smell.** Files >300 LOC (ClassDetailPage 913, UsersPage
  840, TeamsPage 755, scheduleService 699): sanctioned-legacy vs genuine
  god-object needing extraction — classify each.

## Method (multi-agent workflow)
Fan out read-only agents, one per subsystem cluster (auth/users, learning,
schedule, attendance, groups, assessment, org/room, finance/vendor/trainer/
planning, notification/automation/mobile, access/branding/custom-field), each
returning structured findings against the checks above. Then an adversarial
verify pass per finding (refute or confirm) + a dedup/synthesis agent.

## Success criteria
- Every check has a verdict + evidence; violations are P-rated with a fix sketch.
- A dependency-direction + boundary report; circular-dep list (target: 0).

## Todo
- [ ] dep-direction + cross-domain import scan
- [ ] circular-dep list (madge)
- [ ] repository-encapsulation grep per domain
- [ ] layering / thin-controller check
- [ ] event-bus contract + payload-shape check
- [ ] DTO leakage scan (select:false / internal fields)
- [ ] route↔capability↔nav↔spec 4-way consistency
- [ ] orphan/dead-module triage
- [ ] 12-factor config scan
- [ ] god-object classification (>300 LOC)
