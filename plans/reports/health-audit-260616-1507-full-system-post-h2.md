# Health Audit — Full System (post Horizon 1 + Horizon 2)

**Date:** 2026-06-16 · **Branch:** docs/h2-finalize-status · **Trigger:** owner concern that the many recent changes (H1+H2, model convergence, mobile push) left the codebase buggy/messy.

## Scope
Whole system after the H1/H2 build-out: 23 backend domains, 44 models, full client. Audit = run every automated gate + static wiring/security/consistency sweep. Goal: a truthful health verdict, not a feature add.

## Verdict
**Structurally healthy.** All gates green; wiring, security, routing, and event-bus consistency hold. **One real defect found** (silent audit-trail loss on 5 entities) — **fixed + regression-guarded** in this pass. No data-loss, crash, or auth-bypass class found.

## Gate results (all green)
| Gate | Result |
|---|---|
| server jest | **120 suites / 1132 tests pass** |
| client vitest | **89 files / 391 tests pass** |
| client eslint | **63 warnings = cap, 0 errors** |
| client build | **clean** (vite build OK) |
| server full suite (post-fix) | **121 suites / 1138 tests pass** (re-run after enum change) |
| e2e (Playwright) | **30/30 pass** against an ephemeral in-memory replica set (see below) |

Not run: **smoke/load (artillery)** — perf, not correctness.

### e2e run detail
No local Mongo/Docker; `MONGO_URI` points at Atlas (real data). Ran e2e safely against a throwaway **in-memory replica set** (mongodb-memory-server, seeded), server on :5000, vite on :3000 — Atlas untouched (verified the :5000 listener's only DB connection was 127.0.0.1, no Atlas IP). First pass: 7 failed — all root-caused to the seeded admin's `mustChangePassword: true` (SEC-04 force-change gate, working as designed): the modal blocks the UI + the API returns 403 "Password change is required". After clearing that flag (simulating an admin who already changed their password), **all 30 pass**. So zero product-bug failures.

### Operational finding (not a code bug)
A **stale TMS API server from a previous session was holding :5000, connected to the Atlas (production) DB** (remote :27017). Left running, any local e2e/dev work hits real data. Killed it for this run (owner-approved). Restart your dev server with `cd server && npm run dev` when needed.

## Static wiring/security sweep (all consistent)
- **Domains mounted:** 23/23 in `server.js`. No orphan domain. `_shared` = utils (not a router) — correct.
- **Capabilities:** every new domain has a declared capability in `policy/capabilities.js` (compliance/budget/vendor/training.plan/skill/branding/automation/role) + role grants (Admin superuser; Coordinator/Teacher/Participant allow-lists coherent).
- **Route guards:** every new domain route applies `protect` (auth) → `requireCapability(...)`. `/api/me` (mobile) is `protect`-only by design (self-scoped). No unguarded mutation route.
- **Frontend routes vs nav:** every nav leaf (`/access`,`/automation`,`/skills`,`/branding`,`/scheduling`,`/compliance`,`/cost-roi`,`/budget`,`/vendors`,`/trainers`,`/planning`,`/mobile-attendance`,`/me/today`) maps to a real `<Route>` in `App.jsx`. No dead link; route `roles` vs nav `access`/`perm` agree.
- **Event bus:** 3 catalogued events (ENROLLMENT_CREATED, CERTIFICATE_ISSUED, REQUIREMENT_CHANGED) all published; automation runner subscribes to all, notification subscribes to 2. REQUIREMENT_CHANGED has no dedicated functional subscriber yet (awaits A8, documented) — harmless no-op publish, not a bug.
- **AuditLog enum:** see finding below.

## Finding 1 — Silent audit-trail loss on 5 entities (FIXED)
**Severity:** Medium-High (compliance/security audit-trail hole; no functional break). **Status:** fixed in this pass.

**Root cause:** `auditService.record()` is fire-and-forget (`appendChained` → `AuditLog.create()` inside a `.catch()` that only logs). The `AuditLog.entity` enum lagged behind controllers, so a mutation whose `entity:` string is not in the enum throws a Mongoose ValidationError that is swallowed — **mutation succeeds, audit row silently dropped.** The enum's own comment (AuditLog.js:65-68) already documents this exact failure mode from a prior occurrence.

**Affected (entity literal used in production controller, missing from enum):**
| Entity | Source | What goes unrecorded |
|---|---|---|
| `Role` | `domains/access/controller.js` | capability-grant edits / custom-role CRUD — **security-sensitive** |
| `AutomationRule` | `domains/automation/controller.js` | no-code rule create/edit/delete |
| `Skill` | `domains/skill/controller.js` | skill CRUD |
| `TenantConfig` | `domains/branding/controller.js` | branding update |
| `Notification` | `domains/learning/controller.js` (nudgeCohort) | coordinator "Nudge cohort" |

Violates golden rule "audit every mutation." `Role` is the most serious — *who changed permissions* is exactly what the audit log exists to answer. Survived because no test asserted these audit rows persist (the blind spot).

**Fix applied:**
1. `models/AuditLog.js` — added the 5 values to the `entity` enum (additive; one-way ratchet, cannot break existing tests).
2. `tests/unit/auditEntityEnumCoverage.test.js` (new) — scans `domains/controllers/services/jobs/middleware` for every `entity: '<X>'` literal and asserts each is in the enum (auto-catches future drift) + explicit regression case per the 5. Verified: **offenders = [] across the whole codebase** (no other missing entity). + `auditWriteSide` re-run → 16/16 pass.

## Notes / non-issues confirmed
- `customField.test.js` `entity: 'Program'` = the CustomFieldDefinition's own target-entity field, **not** an AuditLog entity. Not a bug.
- Models `MetricSnapshot`, `PushSubscription`, `CronRun`, `TokenBlocklist` are not audited by design (telemetry/ephemeral) — correctly absent from the enum.
- Server-test `--forceExit` SIGKILL line is teardown noise (exit 0), not a failure.

## Recommended follow-ups (not done)
1. Consider folding the team transfer/drop enrollment close-paths onto the unified spine (already a documented Phase-2 follow-up) — not a bug, convergence debt.
2. Investigate why the seeded-admin `mustChangePassword` gate isn't handled by the e2e fixtures (CI either seeds without it or the e2e gate is effectively not exercised). Worth confirming the CI e2e job is genuinely green.

## Decisions taken (owner)
- Fix committed to a focused branch `fix/audit-entity-enum` (off `main`) → PR.
- e2e run now, locally, against an ephemeral in-memory replica set — done, 30/30 green.

## Unresolved questions
- None blocking. (Open: is the CI e2e job actually green given the `mustChangePassword` seed gate? — follow-up #2.)
