---
capability: security-platform
status: stable
owners: [middleware (csrfProtection, rateLimiters, validate, requestId), helmet, models (soft-delete)]
last_updated: 2026-06-08
related_code:
  - server/middleware/csrfProtection.js
  - server/middleware/rateLimiters.js
  - server/middleware/validate.js
  - server/server.js
  - server/schemas
related_plans: []
---

# Capability: Security Platform (cross-cutting)

> **Source of truth for BEHAVIOR.** These are the load-bearing protections every
> other capability inherits via its NFR section. They are golden rules — never
> removed or bypassed to make a feature work. See `.claude/rules/security-and-auth.md`.

## Purpose

The baseline protections applied across the whole API: CSRF, rate limiting, input
sanitisation + validation, security headers, soft-delete, audit, and secret
hygiene. Individual capability specs reference this rather than restating it.

## Business Requirements (BR)

- **BR-1:** State-changing requests must carry CSRF protection.
- **BR-2:** Abuse-prone endpoints must be rate-limited; the whole API has a global
  cap.
- **BR-3:** All input is validated and sanitised before use.
- **BR-4:** Security headers (CSP, etc.) are set on every response.
- **BR-5:** User/attendance/evaluation data is soft-deleted, never hard-deleted.
- **BR-6:** Every mutation is audited (see `audit-log`).
- **BR-7:** Secrets are never committed; sensitive fields never leave the server.

## Actors & Use Cases (UC)

- **UC-1 (Any client write):** must present a valid CSRF token.
- **UC-2 (Any client):** subject to per-route + global rate limits.
- **UC-3 (Any request body):** validated by a zod schema + Mongo-sanitised.

## Entities

- Middleware: `csrfProtection`, `rateLimiters` (login, forgot-password, booking,
  export, global), `validate` (zod), `express-mongo-sanitize`, `helmet`,
  `requestId`. Soft-delete fields (`isDeleted`/`deletedAt`) + query hooks on
  models.

## Functional Requirements (FR)

### Requirement: CSRF on state changes [BR-1, UC-1]

The system SHALL require a server-issued CSRF token on every state-changing
request; the client axios instance attaches it automatically.

#### Scenario: Missing CSRF token
- **GIVEN** a POST/PUT/DELETE without a valid CSRF token
- **WHEN** it reaches the server
- **THEN** it is rejected

### Requirement: Rate limiting [BR-2, UC-2]

The system SHALL apply per-route limiters (login, forgot-password, booking,
export) plus a global cap. New routes must keep limiters; dropping a limiter is
not allowed.

#### Scenario: Login flood
- **GIVEN** rapid repeated login attempts
- **WHEN** the limiter threshold is crossed
- **THEN** further attempts are throttled

### Requirement: Validation + sanitisation [BR-3, UC-3]

The system SHALL validate request bodies with zod (`server/schemas`) via the
`validate` middleware and sanitise inputs with `express-mongo-sanitize`. Untrusted
input is never used directly.

#### Scenario: Operator-injection attempt
- **GIVEN** a body containing Mongo operators (e.g. `$gt`)
- **WHEN** processed
- **THEN** it is sanitised/rejected, not executed

### Requirement: Security headers [BR-4]

The system SHALL set Helmet security headers (incl. CSP) on responses; they are
not loosened without reason.

### Requirement: Soft-delete everywhere [BR-5]

The system SHALL soft-delete user/attendance/evaluation (and related) data
(`isDeleted`/`deletedAt`), with query + aggregate hooks auto-excluding deleted
rows; deleted records are recoverable ("trash").

### Requirement: Audit + secret hygiene [BR-6, BR-7]

The system SHALL audit every mutation (`audit-log`), keep secrets out of git
(`.env` gitignored, gitleaks CI gate), and never return `select:false` sensitive
fields (password, mfaSecret, …) in responses.

## Non-Functional Requirements (NFR)

- **Defense-in-depth:** layered (network limiter + app + DB constraints).
- **Boot safety:** required env (`JWT_SECRET`, `MONGO_URI`, `CRON_TOKEN`,
  `CORS_ORIGINS`, …) enforced at startup.
- **Observability:** request-id traced structured logging (pino); Sentry on 5xx.

## Acceptance Criteria (AC)

- [ ] Writes without CSRF are rejected.
- [ ] Login/forgot-password/booking/export limiters + global cap active.
- [ ] Bodies zod-validated and Mongo-sanitised.
- [ ] Helmet/CSP headers present.
- [ ] User/attendance/evaluation data soft-deleted + auto-excluded; recoverable.
- [ ] Every mutation audited; no secret in responses; `.env` never committed.

## Error & Edge Cases

| Trigger | Behavior | Recovery |
|---|---|---|
| Missing CSRF | rejected | client re-attaches token |
| Over rate limit | 429/throttle | back off |
| Injection in body | sanitised/rejected | clean input |
| Hard-delete attempt | not supported | use soft-delete |

## Out of Scope / Deferred

- WAF / DDoS protection at the edge (infra concern).
- Field-level encryption at rest beyond hashing.
- PostgreSQL row-level security (Phase 6 datastore migration).
