---
capability: audit-log
status: stable
owners: [services/auditService, controllers/* (callers), models/AuditLog]
last_updated: 2026-07-09
related_code:
  - server/services/auditService.js
  - server/services/audit-chain.js
  - server/models/AuditLog.js
  - server/routes/auditRoutes.js
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
- **BR-6:** The trail is **tamper-evident** — entries form a hash chain so that
  any later alteration, reordering, or deletion of a row is detectable.

## Actors & Use Cases (UC)

- **UC-1 (Any mutation path):** records an entry via
  `auditService.record({req, action, entity, entityId, diff})`.
- **UC-2 (Admin):** queries the audit trail (`/api/admin/audit`) and verifies
  chain integrity (`POST /api/admin/audit/verify`).
- **UC-3 (System job):** writes an entry with `actorRole='System'`, `actorId=null`.

## Entities

- **AuditLog** (`server/models/AuditLog.js`): `actorId` (nullable), `actorRole`
  (Admin/Teacher/Participant/**System**), `actorEmpCode`, `action` (past-tense
  verb), `entity` (enum allowlist), `entityId`, `diff` (Mixed, redacted),
  `requestId`/`ip`/`userAgent`, `note`. `createdAt` only (no update). **TTL
  index** = `AUDIT_RETENTION_DAYS` (default 730). Indexes
  `{entity,entityId,createdAt}` and `{actorId,createdAt}`.
  **Hash-chain fields** (`server/services/audit-chain.js`): `seq` (monotonic
  chain position, partial-**unique** index; absent on pre-migration rows),
  `prevHash` (prior row's hash; genesis seed `0`×64 for row 1), `hash` =
  sha256 of the row's immutable content (seq + actor + action + entity +
  entityId + diff + note + prevHash, deterministic key order).

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

### Requirement: Tamper-evident hash chain [BR-6, UC-1, UC-2]

The system SHALL link every audit entry to the previous one by hash. Writes are
SERIALIZED (in-process append queue) so each entry's `seq` and `prevHash` derive
from a stable chain head; `hash` = sha256 of the entry's content + `prevHash`,
with the genesis row seeded by a fixed value. An Admin SHALL be able to verify a
seq window via `POST /api/admin/audit/verify`, which re-derives the chain and
returns either `ok:true` or the `firstBrokenSeq`. Because seq order, createdAt
order, and TTL-expiry order coincide, the TTL only truncates the oldest prefix —
so verification of a window never false-positives on expired rows, and any gap
*after* the window's first surviving row is a deletion, not expiry.

#### Scenario: Intact chain verifies
- **GIVEN** a chain of N entries written by the service
- **WHEN** an Admin calls `POST /api/admin/audit/verify`
- **THEN** the response is `ok:true` with `checked:N` and `firstBrokenSeq:null`

#### Scenario: Altered row is detected
- **GIVEN** a stored entry whose `diff`/`note` was edited directly in the DB
  without recomputing its hash
- **WHEN** the chain is verified
- **THEN** `ok:false` and `firstBrokenSeq` equals that entry's `seq`
  (reason `hash-mismatch`); a deleted middle row yields reason `missing-rows`

## Non-Functional Requirements (NFR)

- **Authz:** `/api/admin/audit` (read) and `/api/admin/audit/verify` both gated
  by `AUDIT_READ`; no mutate/delete endpoint (only the service writes).
- **Performance:** writes are non-blocking to the caller but SERIALIZED through an
  append queue (single-writer assumption — one Node process); compound indexes
  for the two hot query paths; verify scans a bounded window (≤ 5000 rows).
- **Integrity:** append-only (`updatedAt` disabled); entity enum is a one-way
  ratchet (never remove a value); **tamper-evident hash chain** with a
  partial-unique `seq` index as the final guard against a forked chain.

## Acceptance Criteria (AC)

- [ ] Each mutation produces an entry with actor + diff of changed fields.
- [ ] Sensitive fields redacted recursively before write.
- [ ] Audit write failure never breaks the request.
- [ ] System jobs can write with actorRole=System.
- [ ] Admin can query by entity/actor; rows TTL-expire at retention.
- [ ] Entries form a verifiable hash chain; verify returns ok or the first
  broken seq; tampering (field edit or row deletion) is detected.

## Error & Edge Cases

| Trigger | Behavior | Recovery |
|---|---|---|
| Audit DB write fails | logged, request unaffected; head re-syncs from DB next write | retry of primary op |
| Unknown entity value | rejected (enum) | add to allowlist (ratchet) |
| Non-admin reads/verifies audit | 403 | use Admin |
| Pre-chain (legacy) rows | N/A on PostgreSQL — the fresh-start chain is hashed from the first write (the Mongo-era `backfill-audit-hash-chain.js` helper was removed at Wave K safe-cleanup) | none |

## Out of Scope / Deferred

- WORM storage / external notarization of the chain root.
- Exporting the audit trail to a SIEM.
