---
change: english-future-meeting-handoff
status: applied
target_specs: [english-training]
milestone: English Training — live convergence
created: 2026-07-21
---

# Proposal: Hand future imported Meetings to live data control

## Why

Future planned Meetings imported from the owner workbook must become usable
operational data without rewriting or discarding the imported evidence.

## Delivery Contract

- **User outcome:** an operator's future planned, attendance-free imported
  Meeting has a correct Vietnam instant and is marked ready for live control,
  while its original start and duration remain queryable source evidence.
- **In scope:** migration 050, source-baseline projection, invariant verifier,
  and canonical English documentation.
- **Non-goals:** UI edit/cancel commands, responsive layout, past Meetings,
  Meetings with attendance, and production database mutation.
- **Domain authority:** `docs/decisions/english-domain-authority.md`, authority
  snapshot `ConMeoGauGau@4107cd52ee905e87254e099da23cb58dcbdd82a9`.
- **Data impact:** add five nullable `eng_meetings` control/baseline columns;
  preserve baseline for imported Meetings; adopt only future planned,
  attendance-free rows; move linked Session Unit time with the Meeting; write
  one domain-audit event per adoption. `down` restores imported times before
  dropping the new columns. Production execution is not authorized here.
- **Feedback loop:** migration rehearsal plus
  `server/scripts/dev-tools/eng-live-prototype-verify.js` invariants; DTO/read
  and adapter tests prove source provenance survives the projection.
- **UI reference and states:** N/A — this slice changes data ownership and read
  projection only.

### Acceptance Examples

- **Happy path:** Given a future planned imported Meeting with no attendance,
  when migration 050 runs, then its source baseline is retained, its operational
  instant is corrected, the Session Unit follows it, and an audit row exists.
- **Permission denial:** Given an application actor, when they try to bypass
  controlled Meeting commands, then this migration exposes no direct mutation
  route; existing authorization remains unchanged.
- **Core edge case:** Given a past imported Meeting or any imported Meeting with
  attendance, when migration 050 runs, then its operational time and lifecycle
  remain untouched.

## Tasks

- [x] Add migration schema, eligibility predicate, audit, and rollback boundary.
- [x] Project source baseline through reads/DTO/client adapter.
- [x] Extend the deterministic prototype verifier.
- [x] Add focused unit assertions for provenance projection.
- [ ] Rehearse migration up/down with recorded before/after invariants (Gate 3).

## Verification

- `server/tests/unit/english-training-dto.test.js`
- `server/tests/unit/english-training-reads-sql.test.js`
- `client/src/features/english-operations/__tests__/historical-session-adapter.test.js`
- Prototype migration rehearsal remains required before Verified.

## Stop / Re-plan Checkpoint

This slice stays data-only and below both review thresholds. Re-baseline if the
eligibility predicate, timezone authority, source-evidence meaning, or rollback
boundary changes.
