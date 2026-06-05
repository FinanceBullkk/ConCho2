---
phase: 3
title: Certificate expiry and recertification
status: completed
priority: P1
effort: 1d
dependencies:
  - 1
  - 2
---

# Phase 3: Certificate expiry and recertification

## Overview

Add certificate validity windows and recertification signals. Keep v1.1 practical: expiry affects reports and reminders; automatic new-cycle assignment creation is deferred unless the owner explicitly approves it.

## Requirements

- Functional: add certificate validity fields without breaking existing certificates.
- Functional: derive certificate state from `issuedAt`, `validFrom`, `validUntil`, `status`, and `isDeleted`.
- Functional: expose expiry state in completion and compliance reports.
- Functional: add email templates/senders for certificate expiring/expired only if D5 reminder integration is included in the same implementation pass.
- Non-functional: non-destructive schema change; old certificates remain valid with no expiry.
- Non-functional: no hard delete; preserve Revoked lifecycle.
- Non-functional: indexes support expiring/expired scans.

## Architecture

Model changes:

- Modify: `server/models/Certificate.js`
  - add `validFrom` date, default `issuedAt`
  - add `validUntil` date, default `null`
  - add optional `validityDays` snapshot if program policy provides it
  - add index `{ status: 1, validUntil: 1, isDeleted: 1 }`

Optional program policy source:

- Modify: `server/models/LearningProgram.js`
- Add `certificateValidityDays`, default `null`, where null means no expiry.

Report integration:

- Modify: `server/domains/learning/reports/use-cases.js`
- Modify: `server/domains/learning/completion/dto.js` if certificate DTO needs validity fields.

Reminder integration:

- Modify: `server/domains/learning/assignment/reminder-service.js` only if cert expiry emails are part of D6 v1.1 implementation.
- Modify: `server/lib/emailTemplates.js`
- Keep `NotificationLog` idempotency tuple; add new types only when emails are added.

## Implementation Steps

1. Add certificate schema fields and defaults.
2. Add pure helper `deriveCertificateState(certificate, now)` in report/completion domain.
3. Backward compatibility:
   - existing Issued cert + `validUntil: null` => `issued`;
   - Revoked cert => `revoked`;
   - `validUntil` before end of today => `expired`;
   - `validUntil` within threshold, default 30 days => `expiring`.
4. Update certificate issue path to snapshot validity when a program policy exists.
5. Update report rows and export columns:
   - issuedAt
   - validUntil
   - certificateState
6. Add tests:
   - old certificate has no expiry and remains issued;
   - expired certificate appears expired;
   - expiring certificate appears expiring;
   - revoked wins over expiry.

## Success Criteria

- [x] Existing certificate tests pass without fixture rewrites.
- [x] New certificate fields are optional and non-destructive.
- [x] Reports show certificate validity status.
- [x] Expiry rules are pure and unit-tested.
- [x] Expiry emails were not included in this pass; `NotificationLog` duplicate prevention remains deferred.

## Risk Assessment

- Risk: certificate validity policy belongs to Program, but existing programs have no value.
  Mitigation: null means no expiry; allow per-program policy later.
- Risk: expired certificate might break prerequisite completion unexpectedly.
  Mitigation: do not change `hasCompletedProgram` semantics in D6 v1.1 unless explicitly required; reports can show expired while prerequisite behavior remains stable.
