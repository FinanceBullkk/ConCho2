---
change: english-adopted-meeting-commands
status: applied
target_specs: [english-training]
milestone: English Training — live convergence
created: 2026-07-21
---

# Proposal: Operate an adopted imported Meeting

## Why

Once migration 050 explicitly hands an eligible Meeting to operations, the
normal authorized reschedule and durable-cancel commands must recognize that
handoff without weakening protection for imported history.

## Delivery Contract

- **User outcome:** an authorized Admin or Coordinator can open, move, or
  durably cancel an adopted future Meeting and can see that its imported
  baseline remains retained.
- **In scope:** read classification, command eligibility, provenance message,
  and focused command/read tests.
- **Non-goals:** migration eligibility, new command routes, Teacher scope,
  responsive drawer composition, and provider-delivery changes.
- **Domain authority:** `docs/decisions/english-domain-authority.md` and the
  existing English Meeting command/audit contract.
- **Data impact:** no new schema. Commands update only operational Meeting and
  Session Unit fields through existing transactions; source baseline columns
  from migration 050 remain immutable.
- **Feedback loop:** canonical command unit tests plus the read SQL test. The
  real HTTP → command → PostgreSQL success/denial/audit path remains Gate 3.
- **UI reference and states:** existing English Schedule editor; adopted state
  adds a source-baseline notice while retaining normal move/cancel feedback.

### Acceptance Examples

- **Happy path:** Given an adopted planned Meeting, when an authorized operator
  reschedules or cancels it, then the command succeeds and audit/history remain.
- **Permission denial:** Given an unauthorized actor, when they call the same
  mutation route, then the existing capability middleware denies the request.
- **Core edge case:** Given an unadopted imported, started, completed,
  attendance-bearing, or cancelled Meeting, when mutation is attempted, then it
  remains read-only.

## Tasks

- [x] Classify adopted imported rows as operational reads.
- [x] Permit command handling only when `operational_at` proves handoff.
- [x] Preserve source provenance in the editor message.
- [x] Add focused unit coverage.
- [x] Add real PostgreSQL HTTP integration for denial, reschedule, durable
  cancel, both audit trails, and immutable source baseline.
- [ ] Add persisted UI flows (Gate 3).

## Verification

- `server/tests/unit/english-canonical-live-operations.test.js`
- `server/tests/unit/english-training-reads-sql.test.js`
- `server/tests/integration/englishLiveOperations.test.js` — real auth/CSRF/
  capability/controller/transaction/repository/PostgreSQL path; two suites
  including the audit-enum ratchet pass 8/8.
- Playwright persistence remains required before Verified.

## Stop / Re-plan Checkpoint

Re-baseline if command authorization, imported eligibility, immutable baseline,
or audit semantics change. Do not add responsive layout work to this slice.
