---
capability: audit-log
status: stable
owners: [services/auditService, controllers/* (callers), models/AuditLog]
last_updated: 2026-06-08
related_code:
  - server/services/auditService.js
  - server/models/AuditLog.js
related_plans: []
---

# Capability: Audit Log

> **Source of truth for BEHAVIOR.** Every mutation across the app records here —
> the cross-cutting audit obligation referenced by every other spec's NFR.

## Purpose

An append-only "who changed what" trail for compliance and forensics. Written
asynchronously so audit I/O never slows the hot path, with sensitive fields
redacted defensively, and retained for ~2 years via a TTL index.

## Business Requirements (BR)

- **BR-1:** Every create/update/delete/restore/auth event is recorded with actor,
  entity, and a field-level diff.
- **BR-2:** System jobs (cron, migrations) can write audit lines too.
- **BR-3:** Secrets must never land in an audit row.
- **BR-4:** Audit writes must never break a user request.
- **BR-5:** Records are queryable by entity and by actor; auto-expire on
  retention.

## Actors & Use Cases (UC)

- **UC-1 (Any mutation path):** records an entry via
  `auditService.record({req, action, entity, entityId, diff})`.
- **UC-2 (Admin):** queries the audit trail (`/api/admin/audit`).
- **UC-3 (System job):** writes an entry with `actorRole='System'`, `actorId=null`.

## Entities

- **AuditLog** (`server/models/AuditLog.js`): `actorId` (nullable), `actorRole`
  (Admin/Teacher/Participant/**System**), `actorEmpCode`, `action` (past-tense
  verb), `entity` (enum allowlist), `entityId`, `diff` (Mixed, redacted),
  `requestId`/`ip`/`userAgent`, `note`. `createdAt` only (no update). **TTL
  index** = `AUDIT_RETENTION_DAYS` (default 730). Indexes
  `{entity,entityId,createdAt}` and `{actorId,createdAt}`.

## Functional Requirements (FR)

### Requirement: Record every mutation [BR-1, UC-1]

The system SHALL record an audit entry for each mutation with actor + request
context (from `req`) and, for updates, a `{before, after}` diff of only changed
fields.

#### Scenario: User update
- **GIVEN** an Admin edits a user's role
- **WHEN** the update commits
- **THEN** an AuditLog row exists with action `updated`, entity `User`, and a diff
  showing only the role change

### Requirement: Redact secrets [BR-3, UC-1]

The system SHALL redact `password`, `passwordChangedAt`, `mfaSecret`,
`mfaBackupCodes`, `token`, `refreshToken`, `jwtSecret` to `[REDACTED]` before
writing (recursively), even if a caller forgets to strip them.

#### Scenario: Password in diff
- **GIVEN** an update whose before/after includes a password
- **WHEN** the audit row is built
- **THEN** the password value is `[REDACTED]`

### Requirement: Non-blocking writes [BR-4, UC-1]

The system SHALL fire-and-forget audit writes; a failed audit write logs an error
and never throws into the caller's request.

### Requirement: System-actor entries [BR-2, UC-3]

The system SHALL accept entries with no `req` (background jobs), defaulting
`actorRole='System'`, `actorId=null`.

### Requirement: Query & retention [BR-5, UC-2]

The system SHALL let an Admin query the trail by entity/actor (newest first) and
SHALL auto-expire rows past the retention window (TTL).

## Non-Functional Requirements (NFR)

- **Authz:** `/api/admin/audit` Admin read-only; no write endpoint (only the
  service writes).
- **Performance:** async writes; compound indexes for the two hot query paths.
- **Integrity:** append-only (`updatedAt` disabled); entity enum is a one-way
  ratchet (never remove a value).

## Acceptance Criteria (AC)

- [ ] Each mutation produces an entry with actor + diff of changed fields.
- [ ] Sensitive fields redacted recursively before write.
- [ ] Audit write failure never breaks the request.
- [ ] System jobs can write with actorRole=System.
- [ ] Admin can query by entity/actor; rows TTL-expire at retention.

## Error & Edge Cases

| Trigger | Behavior | Recovery |
|---|---|---|
| Audit DB write fails | logged, request unaffected | retry of primary op |
| Unknown entity value | rejected (enum) | add to allowlist (ratchet) |
| Non-admin reads audit | 403 | use Admin |

## Out of Scope / Deferred

- Tamper-evident hashing / WORM storage.
- Exporting the audit trail to a SIEM.
