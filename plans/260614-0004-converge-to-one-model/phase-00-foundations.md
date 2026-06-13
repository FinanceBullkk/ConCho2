# Phase 0 — Foundations (event bus + finish authz)

**Priority:** High · **Status:** 🔴 not started · **Behaviour change:** none (parity)
**Why first:** safe, high-leverage, independent of the convergence direction; sets the
decoupling backbone every later phase rides on.

## Part A — In-process domain-event bus

**Today:** mutations hand-wire their side effects inline — each controller calls
`auditService.record(...)`, then maybe `recordInApp(...)` (notifications), then
completion rollups. Cross-cutting concerns are tangled into business code.

**Target:** publishers emit a domain event; platform concerns subscribe. Same effects,
decoupled. In-process only (no broker) — modular-monolith appropriate.

**Files:**
- New `server/lib/event-bus.js` — tiny synchronous-ish pub/sub:
  `publish(event, payload)` / `subscribe(event, handler)`; handlers run after the
  mutation's transaction commits; a throwing subscriber is logged (pino) and isolated
  (never breaks the request) — mirrors today's fail-soft notification behaviour.
- New `server/domains/_shared/events.js` — the event-name catalogue + payload shapes:
  `ENROLLMENT_CREATED`, `SESSION_BOOKED`, `ATTENDANCE_MARKED`, `COMPLETION_ACHIEVED`,
  `CERTIFICATE_ISSUED`, … (start with the ones a reference flow needs).
- New `server/domains/notification/subscribers.js` + (audit) subscriber registration
  wired at boot (`server.js` / a `registerSubscribers()`).

**Reference slice (do ONE end-to-end, prove the pattern):** pick **enrollment create**
— `domains/learning/enrollment` emits `ENROLLMENT_CREATED` after commit; the audit
subscriber writes the same `auditService.record(...)` it writes today, and the
notification subscriber writes the same `cohort_enrolled` in-app row. Remove the inline
calls from the controller. **Assert byte-parity** (same audit entry, same
NotificationLog row) via the existing integration tests + new ones.

**Acceptance:** enrollment-create produces identical audit + notification rows via
subscribers; a thrown subscriber doesn't fail the request; other flows untouched
(migrated in later slices).

## Part B — Finish authz migration (legacy roleGuard → capability)

**Today:** domain routers use `requireCapability` + `policy/capabilities.js`; **17
legacy `routes/` still use `roleGuard(...)`** → two boundaries.

**Approach (mechanical, batchable):** for each legacy router, map its `roleGuard(...)`
to the equivalent capability (extend `policy/capabilities.js` if a capability is
missing — keep capabilities role-derived, no per-user grants), swap to
`requireCapability(...)`, keep `policy/*` resource checks. Update
`docs/route-permission-matrix.md`. Do it a few routers per slice; the route-permission
matrix is the parity oracle (same role → same allow/deny).

**Order (low-risk first):** read-only routes (search, dashboard, audit read) →
mutation routes (user, class, enrollment, evaluation) → ops (sync, export, import,
reconcile, admin-db). `auth*`/`cron*`/`health*` stay as-is (special).

**Acceptance:** no `roleGuard` left on feature routes; route-permission matrix shows
identical role→permission outcomes pre/post; integration tests for denial paths green.

## Tests
- Event bus unit (publish/subscribe, isolation of throwing handler, post-commit order).
- Enrollment-create integration: audit + notification parity via subscribers.
- Authz: per migrated router, a 403-denial test for a role that lost/keeps access
  (should be unchanged).

## Risks / mitigation
- **Audit/notification drift** — parity tests + migrate ONE flow at a time.
- **Subscriber ordering / transactions** — publish AFTER commit; handlers idempotent
  + fail-soft (reuse the existing `recordInApp` idempotency keys).
- **Authz regressions** — the route-permission matrix is the oracle; migrate in small
  batches with denial tests.

## Done
One reference flow on the event bus with parity + the bus documented; legacy authz
migrated to capability (matrix parity); tests + lint + build green; spec/system-map +
roadmap updated.
